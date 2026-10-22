import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db, workspaceSettings } from "./db";
import {
  memberships,
  officeAudit,
  officeSettings,
  sessions,
  users,
  workspaceOidc,
} from "./schema";
import { Office } from "./office";
import { Whiteboards } from "./whiteboard";
import { retireRoom, setPresenter, flushRetired } from "./media";
import { config, googleConfigured } from "./config";
import { rotateDailyMap } from "./daily-map";
import { DEFAULT_WORKSPACE_ID } from "../shared/workspaces";

export type WorkspaceRuntime = {
  office: Office;
  whiteboards: Whiteboards;
  workspaceId: string;
};
const pending = new Map<string, Promise<WorkspaceRuntime>>();
export const runtimes = new Map<string, WorkspaceRuntime>();
export function runtimeFor(workspaceId: string) {
  let result = pending.get(workspaceId);
  if (!result) {
    result = (async () => {
      await rotateDailyMap(new Date(), () => true, workspaceId);
      const settings = await workspaceSettings(workspaceId);
      const office = new Office(
        retireRoom,
        setPresenter,
        (event) => {
          void db
            .insert(officeAudit)
            .values({
              ...event,
              workspaceId,
              createdAt: new Date(event.createdAt),
            })
            .catch(() => console.error("Could not persist office activity."));
        },
        `${config.mediaNamespace}-${workspaceId}`,
      );
      office.configureWorkspace(settings);
      const runtime = {
        office,
        whiteboards: new Whiteboards(office, workspaceId),
        workspaceId,
      };
      runtimes.set(workspaceId, runtime);
      return runtime;
    })().catch((error) => {
      pending.delete(workspaceId);
      throw error;
    });
    pending.set(workspaceId, result);
  }
  return result;
}
export const defaultRuntime = await runtimeFor(DEFAULT_WORKSPACE_ID);
export function revokeSession(id: string) {
  for (const { office, whiteboards } of runtimes.values()) {
    office.revokeSession(id);
    whiteboards.prune();
  }
}
export async function revokeMember(workspaceId: string, userId: string) {
  const runtime = runtimes.get(workspaceId);
  if (runtime) {
    runtime.office.remove(userId);
    runtime.whiteboards.prune();
  }
  await flushRetired();
}
export function revokeUser(userId: string) {
  for (const { office, whiteboards } of runtimes.values()) {
    office.remove(userId);
    whiteboards.prune();
  }
}
export async function refreshWorkspace(id: string) {
  const runtime = runtimes.get(id);
  if (runtime) {
    runtime.office.configureWorkspace(await workspaceSettings(id));
    runtime.whiteboards.prune();
  }
}
export async function revalidateRuntimes() {
  for (const { office, whiteboards, workspaceId } of runtimes.values()) {
    const ids = [...office.members.values()].map((m) => m.sessionId);
    if (!ids.length) continue;
    try {
      const valid = await db
        .select({ id: sessions.id })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.userId, users.id),
            eq(memberships.workspaceId, workspaceId),
          ),
        )
        .innerJoin(officeSettings, eq(officeSettings.id, 1))
        .where(
          and(
            inArray(sessions.id, ids),
            gt(sessions.expiresAt, sql`now()`),
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
              sql`exists (select 1 from ${workspaceOidc} where
                ${workspaceOidc.workspaceId} = ${workspaceId}
                and ${workspaceOidc.enabled} = true and ${workspaceOidc.verifiedAt} is not null
                and ${sessions.method} = 'workspace-oidc:' || ${workspaceOidc.providerId}
                and ${sessions.policyVersion} = ${workspaceOidc.revision})`,
            ),
          ),
        );
      const keep = new Set(valid.map((row) => row.id));
      for (const m of [...office.members.values()])
        if (!keep.has(m.sessionId)) office.remove(m.id);
    } catch {
      for (const m of [...office.members.values()]) office.remove(m.id);
    }
    whiteboards.prune();
  }
}
export function startRuntimeTimers() {
  const timers = [
    setInterval(() => {
      for (const { office } of runtimes.values()) office.tick(0.05);
    }, 50),
    setInterval(() => {
      for (const { office } of runtimes.values())
        if (office.dirty) office.broadcast();
    }, 100),
    setInterval(() => {
      for (const { whiteboards } of runtimes.values()) whiteboards.prune();
    }, 1000),
  ];
  let checking = false,
    rotating = false;
  timers.push(
    setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        await revalidateRuntimes();
      } finally {
        checking = false;
      }
    }, 5000),
  );
  timers.push(
    setInterval(async () => {
      if (rotating) return;
      rotating = true;
      try {
        for (const { office, workspaceId } of runtimes.values())
          if (!office.members.size) {
            const next = await rotateDailyMap(
              new Date(),
              () => !office.members.size,
              workspaceId,
            );
            if (next) office.configureWorkspace(next);
          }
      } catch {
        console.error("Daily map rotation failed; will retry.");
      } finally {
        rotating = false;
      }
    }, 60000),
  );
  return () => timers.forEach(clearInterval);
}
