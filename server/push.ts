import { ExternalAccountClient, GoogleAuth } from "google-auth-library";
import { readFileSync } from "node:fs";
import { and, count, eq, gt, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  pushDevices,
  pushJobs,
  memberships,
  users,
  sessions,
  officeSettings,
  workspaceOidc,
  notifications,
} from "./schema";
import { googleConfigured } from "./config";
import {
  pushConfig,
  pushConfigured,
  pushProject,
  type PushPlatform,
} from "./push-config";
import { serverLog, errorKind } from "./diagnostics";
import { Problem } from "./workspace-access";
import type { NotificationKind } from "../shared/notifications";

type Device = {
  installationId: string;
  token: string;
  locale: "th" | "en";
  platform: PushPlatform;
};
export async function registerPush(
  workspaceId: string,
  userId: string,
  sessionId: string,
  device: Device,
) {
  if (!pushConfig(device.platform).enabled)
    throw new Problem(503, "System notifications are unavailable.");
  await db.transaction(async (tx) => {
    // Serialize token refreshes, multiple workspaces, and account changes for one installation.
    for (const lock of [
      `install:${device.installationId}`,
      `token:${device.token}`,
      `user:${workspaceId}:${userId}`,
    ].sort())
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${lock},0))`,
      );
    const sameInstall = eq(pushDevices.installationId, device.installationId);
    await tx
      .delete(pushDevices)
      .where(
        and(
          or(sameInstall, eq(pushDevices.token, device.token)),
          or(
            sql`${pushDevices.userId} != ${userId}`,
            sql`${pushDevices.installationId} != ${device.installationId}`,
          ),
        ),
      );
    const [capacity] = await tx
      .select({ total: count() })
      .from(pushDevices)
      .where(
        and(
          eq(pushDevices.workspaceId, workspaceId),
          eq(pushDevices.userId, userId),
          sql`${pushDevices.installationId} != ${device.installationId}`,
        ),
      );
    if (capacity.total >= 64)
      throw new Problem(409, "Device registration limit reached.");
    await tx
      .update(pushDevices)
      .set({ token: device.token })
      .where(and(sameInstall, eq(pushDevices.userId, userId)));
    await tx
      .insert(pushDevices)
      .values({ ...device, workspaceId, userId, sessionId })
      .onConflictDoUpdate({
        target: [pushDevices.workspaceId, pushDevices.installationId],
        set: {
          userId,
          sessionId,
          token: device.token,
          platform: device.platform,
          locale: device.locale,
        },
      });
  });
}
export function unregisterPush(
  workspaceId: string,
  userId: string,
  sessionId: string,
  installationId: string,
) {
  return db
    .delete(pushDevices)
    .where(
      and(
        eq(pushDevices.workspaceId, workspaceId),
        eq(pushDevices.userId, userId),
        eq(pushDevices.sessionId, sessionId),
        eq(pushDevices.installationId, installationId),
      ),
    );
}
const copy = {
  en: {
    nudge: "You received a nudge.",
    summon: "You were invited to join a teammate.",
    call: "You have a call invitation.",
    wave: "A teammate waved at you.",
  },
  th: {
    nudge: "มีคนสะกิดคุณ",
    summon: "เพื่อนร่วมงานเรียกคุณไปหา",
    call: "คุณได้รับคำเชิญให้เข้าร่วมสาย",
    wave: "เพื่อนร่วมงานโบกมือให้คุณ",
  },
};
type Target = {
  token: string;
  platform: PushPlatform;
  locale: "th" | "en";
  installationId: string;
  userId: string;
  workspaceId: string;
  notificationId: number;
  kind: NotificationKind;
};
export function fcmMessage(t: Target, ttl: number) {
  const title = "Little Office",
    body = copy[t.locale][t.kind];
  const data = {
    type: "office-notification",
    workspaceId: t.workspaceId,
    recipientId: t.userId,
    installationId: t.installationId,
    notificationId: String(t.notificationId),
    kind: t.kind,
    title,
    body,
  };
  return {
    token: t.token,
    data,
    ...(t.platform === "web"
      ? { webpush: { headers: { TTL: String(ttl), Urgency: "high" } } }
      : t.platform === "android"
        ? { android: { priority: "HIGH", ttl: ttl + "s" } }
        : {
            apns: {
              headers: {
                "apns-push-type": "alert",
                "apns-priority": "10",
                "apns-expiration": String(Math.floor(Date.now() / 1000) + ttl),
                "apns-collapse-id": "office-" + t.notificationId,
              },
              payload: { aps: { alert: { title, body }, sound: "default" } },
            },
          }),
  };
}
let auth: GoogleAuth | undefined;
async function sendMessage(t: Target, ttl: number) {
  if (!auth) {
    const scopes = ["https://www.googleapis.com/auth/firebase.messaging"];
    // This file is operator-provisioned and mounted read-only; requests cannot supply its path or contents.
    const file = process.env.FCM_CREDENTIALS_FILE;
    const external = file
      ? ExternalAccountClient.fromJSON({
          ...JSON.parse(readFileSync(file, "utf8")),
          scopes,
        })
      : undefined;
    if (file && !external) throw new Error("Invalid external FCM credentials");
    auth = new GoogleAuth({ authClient: external || undefined, scopes });
  }
  const access = await auth.getAccessToken();
  if (!access) throw new Error("FCM credential unavailable");
  const res = await fetch(
    "https://fcm.googleapis.com/v1/projects/" +
      encodeURIComponent(pushProject) +
      "/messages:send",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + access,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: fcmMessage(t, ttl) }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (res.ok) return "sent" as const;
  const error = (await res.json().catch(() => ({}))) as {
    error?: { details?: { errorCode?: string }[] };
  };
  if (error.error?.details?.some((e) => e.errorCode === "UNREGISTERED"))
    return "unregistered" as const;
  // Auth/configuration and transient FCM failures get bounded retries without logging tokens or payloads.
  throw new Error("FCM delivery failed");
}
export async function deliverPush(jobId: number, send = sendMessage) {
  const [t] = await db
    .select({
      deviceId: pushDevices.id,
      installationId: pushDevices.installationId,
      token: pushDevices.token,
      platform: pushDevices.platform,
      locale: pushDevices.locale,
      userId: pushDevices.userId,
      workspaceId: pushDevices.workspaceId,
      notificationId: notifications.id,
      kind: notifications.kind,
      createdAt: notifications.createdAt,
      attempts: pushJobs.attempts,
    })
    .from(pushJobs)
    .innerJoin(pushDevices, eq(pushDevices.id, pushJobs.deviceId))
    .innerJoin(notifications, eq(notifications.id, pushJobs.notificationId))
    .innerJoin(
      sessions,
      and(
        eq(sessions.id, pushDevices.sessionId),
        eq(sessions.userId, pushDevices.userId),
      ),
    )
    .innerJoin(users, eq(users.id, pushDevices.userId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, pushDevices.userId),
        eq(memberships.workspaceId, pushDevices.workspaceId),
      ),
    )
    .innerJoin(officeSettings, eq(officeSettings.id, 1))
    .where(
      and(
        eq(pushJobs.id, jobId),
        eq(pushJobs.sessionId, sessions.id),
        eq(notifications.workspaceId, pushDevices.workspaceId),
        eq(notifications.recipient, pushDevices.userId),
        sql`${notifications.readAt} is null`,
        gt(sessions.expiresAt, new Date()),
        eq(users.disabled, false),
        eq(users.mustChangePassword, false),
        eq(memberships.approved, true),
        or(
          and(
            eq(sessions.method, "password"),
            eq(officeSettings.password, true),
          ),
          and(eq(sessions.method, "sso"), eq(officeSettings.sso, true)),
          and(eq(sessions.method, "google"), sql`${googleConfigured}`),
          sql`exists(select 1 from ${workspaceOidc} where ${workspaceOidc.workspaceId}=${pushDevices.workspaceId} and ${workspaceOidc.enabled} and ${workspaceOidc.verifiedAt} is not null and ${sessions.method}='workspace-oidc:'||${workspaceOidc.providerId} and ${sessions.policyVersion}=${workspaceOidc.revision})`,
        ),
      ),
    );
  const ttl = t
    ? (t.kind === "summon" || t.kind === "call" ? 30 : 300) -
      Math.floor((Date.now() - t.createdAt.getTime()) / 1000)
    : 0;
  if (t && ttl > 0 && pushConfig(t.platform).enabled) {
    try {
      const result = await send(t, ttl);
      if (result === "unregistered")
        await db
          .delete(pushDevices)
          .where(
            and(eq(pushDevices.id, t.deviceId), eq(pushDevices.token, t.token)),
          );
    } catch (error) {
      serverLog(
        "push.delivery_failed",
        { errorKind: errorKind(error) },
        "warn",
      );
      const delay = Math.min(60, 2 ** t.attempts * 2);
      if (delay < ttl && t.attempts < 6) {
        await db
          .update(pushJobs)
          .set({ availableAt: new Date(Date.now() + delay * 1000) })
          .where(eq(pushJobs.id, jobId));
        return;
      }
    }
  }
  await db.delete(pushJobs).where(eq(pushJobs.id, jobId));
}

export async function dispatchPushBatch(send = sendMessage) {
  const jobs = await db.execute<{
    id: number;
  }>(sql`with ready as (select id from ${pushJobs} where available_at<=now() order by available_at,id for update skip locked limit 12)
          update ${pushJobs} as j set available_at=now()+interval '90 seconds', attempts=j.attempts+1 from ready where j.id=ready.id returning j.id`);
  await Promise.all(jobs.rows.map((j) => deliverPush(j.id, send)));
  return jobs.rows.length;
}
let active = false,
  requested = false,
  started = false;
export function wakePush() {
  if (!started) return;
  requested = true;
  if (active) return;
  active = true;
  void (async () => {
    try {
      do {
        requested = false;
        if ((await dispatchPushBatch()) === 12) requested = true;
      } while (requested);
    } catch (error) {
      serverLog(
        "push.delivery_failed",
        { errorKind: errorKind(error) },
        "warn",
      );
    } finally {
      active = false;
    }
  })();
}
export function startPushWorker() {
  if (!pushConfigured || started) return;
  started = true;
  wakePush();
  setInterval(wakePush, 10000).unref();
}
