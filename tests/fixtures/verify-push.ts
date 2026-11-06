import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { NotificationKind } from "../../shared/notifications";
import { db } from "../../server/db";
import {
  notifications,
  pushJobs,
  memberships,
  sessions,
  pushDevices,
} from "../../server/schema";
import { recordNotification } from "../../server/notifications";
import { deliverPush, dispatchPushBatch, fcmMessage } from "../../server/push";

type Account = { id: string; name: string; cookie: string };
export async function verifyPush(
  workspace: string,
  other: string,
  owner: Account,
  actor: Account,
  request: (
    cookie: string,
    path: string,
    method?: string,
    body?: unknown,
  ) => Promise<Response>,
) {
  const installationId = crypto.randomUUID();
  const device = {
    installationId,
    token: "fixture-android-registration-original",
    platform: "android",
    locale: "th",
  };
  const path = (w = workspace) =>
    "/api/workspaces/" + w + "/notifications/push-device";
  const add = async (
    cookie = owner.cookie,
    w = workspace,
    registration = device,
  ) =>
    assert.equal(
      (await request(cookie, path(w), "PUT", registration)).status,
      200,
    );
  const notice = async (kind: NotificationKind = "wave") => {
    await recordNotification(workspace, owner.id, kind, "Fixture name");
    return (await db.select().from(pushJobs).orderBy(pushJobs.id)).at(-1);
  };
  assert.equal((await request("", path(), "PUT", device)).status, 401);
  assert.equal(
    (await request(actor.cookie, path(other), "PUT", device)).status,
    404,
  );
  assert.equal(
    (
      await request(owner.cookie, path(), "PUT", {
        ...device,
        installationId: "bad",
      })
    ).status,
    400,
  );
  await add();
  await add();
  await add(owner.cookie, other);
  assert.equal((await db.select().from(pushDevices)).length, 2);
  let calls = 0;
  const mock = async (
    target: Parameters<typeof fcmMessage>[0],
    ttl: number,
  ) => {
    calls++;
    const message = fcmMessage(target, ttl);
    assert.equal(message.data.recipientId, owner.id);
    assert.equal(message.data.installationId, installationId);
    assert.equal(message.data.workspaceId, workspace);
    assert.ok(!JSON.stringify(message).includes("Fixture name"));
    assert.equal(message.data.body, "เพื่อนร่วมงานโบกมือให้คุณ");
    assert.ok("android" in message);
    return "sent" as const;
  };
  let job = (await notice())!;
  assert.ok(job);
  assert.equal(await dispatchPushBatch(mock), 1);
  assert.equal(calls, 1);
  job = (await notice())!;
  await request(
    owner.cookie,
    "/api/workspaces/" +
      workspace +
      "/notifications/" +
      job.notificationId +
      "/read",
    "POST",
    {},
  );
  await deliverPush(job.id, mock);
  assert.equal(calls, 1);
  job = (await notice())!;
  await db
    .update(memberships)
    .set({ approved: false })
    .where(eq(memberships.userId, owner.id));
  await deliverPush(job.id, mock);
  assert.equal(calls, 1);
  await db
    .update(memberships)
    .set({ approved: true })
    .where(eq(memberships.userId, owner.id));
  job = (await notice())!;
  await db
    .update(sessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(sessions.id, job.sessionId));
  await deliverPush(job.id, mock);
  assert.equal(calls, 1);
  await db
    .update(sessions)
    .set({ expiresAt: new Date(Date.now() + 3600000) })
    .where(eq(sessions.id, job.sessionId));
  // A delayed rejection for the old token cannot discard a renewed registration.
  job = (await notice())!;
  await deliverPush(job.id, async () => {
    await add(owner.cookie, workspace, {
      ...device,
      token: "new-fixture-token-123456789",
    });
    return "unregistered";
  });
  assert.equal((await db.select().from(pushDevices)).length, 2);
  job = (await notice())!;
  await deliverPush(job.id, async () => "unregistered");
  assert.equal(
    (
      await db
        .select()
        .from(pushDevices)
        .where(eq(pushDevices.workspaceId, workspace))
    ).length,
    0,
  );
  await add();
  job = (await notice())!;
  await add(actor.cookie);
  await deliverPush(job.id, mock);
  assert.equal(calls, 1);
  assert.equal(
    (
      await db
        .select()
        .from(pushDevices)
        .where(eq(pushDevices.userId, owner.id))
    ).length,
    0,
  );
  assert.equal(
    (await request(owner.cookie, path(), "DELETE", { installationId })).status,
    200,
  );
  assert.equal((await db.select().from(pushDevices)).length, 1);
  assert.equal(
    (await request(actor.cookie, path(), "DELETE", { installationId })).status,
    200,
  );
  assert.equal((await db.select().from(pushDevices)).length, 0);
}
