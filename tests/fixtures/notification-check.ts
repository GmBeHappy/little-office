import assert from "node:assert/strict";
import type { Office } from "../../server/office";
import type { NotificationPage } from "../../shared/notifications";

type Account = { id: string; name: string; role: string; cookie: string };
export async function verifyInbox(
  office: Office,
  workspace: string,
  other: string,
  recipient: Account,
  actor: Account,
  request: (cookie: string, url: string, method?: string) => Promise<Response>,
) {
  const url = (id = workspace) => "/api/workspaces/" + id + "/notifications";
  const list = async (cookie: string, path = url()) => {
    const res = await request(cookie, path);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    return (await res.json()) as NotificationPage;
  };
  const received: unknown[] = [];
  let notify: (() => void) | undefined;
  const target = office.add(
    recipient,
    "target",
    Date.now() + 3600000,
    (event: any) => {
      if (event.type === "notifications-changed") {
        received.push(event);
        notify?.();
      }
    },
    () => {},
  );
  const sender = office.add(
    actor,
    "actor",
    Date.now() + 3600000,
    () => {},
    () => {},
  );
  Object.assign(sender, { x: 700, y: 350, direction: "right" });
  Object.assign(target, { x: 715, y: 350 });
  assert.notEqual((await request("", url())).status, 200);
  assert.equal((await request(actor.cookie, url(other))).status, 404);
  const time = Date.now();
  for (const [i, kind] of (
    ["nudge", "wave", "call", "summon"] as const
  ).entries()) {
    const changed = new Promise<void>((resolve) => {
      notify = resolve;
    });
    if (kind === "call" || kind === "summon")
      office.handle(
        actor.id,
        { type: "invite", kind, target: target.id },
        time + 16000 * i,
      );
    else
      office.handle(
        actor.id,
        { type: kind, target: target.id },
        time + 16000 * i,
      );
    await changed;
  }
  const page = await list(recipient.cookie);
  assert.equal(received.length, 4);
  assert.equal(page.unreadCount, 4);
  assert.deepEqual(
    page.items.map((n) => n.kind),
    ["summon", "call", "wave", "nudge"],
  );
  assert.ok(
    page.items.every((n) => n.actorName === actor.name && n.readAt === null),
  );
  const id = page.items[0].id;
  assert.equal((await list(actor.cookie)).items.length, 0);
  assert.equal((await list(recipient.cookie, url(other))).unreadCount, 0);
  for (const [cookie, path] of [
    [actor.cookie, url()],
    [recipient.cookie, url(other)],
  ]) {
    const response = await request(cookie, path + "/" + id + "/read", "POST");
    assert.equal(response.status, 200, await response.text());
  }
  assert.equal((await list(recipient.cookie)).unreadCount, 4);
  assert.equal(
    (await request(recipient.cookie, url() + "/" + id + "/read", "POST"))
      .status,
    200,
  );
  const first = await list(recipient.cookie);
  assert.equal(first.unreadCount, 3);
  assert.ok(first.items[0].readAt);
  assert.equal(
    (await request(recipient.cookie, url() + "/" + id + "/read", "POST"))
      .status,
    200,
  );
  assert.equal(
    (await list(recipient.cookie)).items[0].readAt,
    first.items[0].readAt,
  );
  assert.equal(
    (await list(recipient.cookie, url() + "?before=" + id)).items.length,
    3,
  );
  assert.equal(
    (await request(recipient.cookie, url() + "/read-all", "POST")).status,
    200,
  );
  const all = await list(recipient.cookie);
  assert.equal(all.unreadCount, 0);
  assert.equal(all.items.length, 4);
  assert.ok(all.items.every((n) => n.readAt));
  // The same recipient can have independent unread counts and multiple pages elsewhere.
  const { db } = await import("../../server/db");
  const { notifications } = await import("../../server/schema");
  await db.insert(notifications).values(
    Array.from({ length: 51 }, () => ({
      workspaceId: other,
      recipient: recipient.id,
      actorName: actor.name,
      kind: "wave" as const,
    })),
  );
  const olderWorkspace = await list(recipient.cookie, url(other));
  assert.equal(olderWorkspace.items.length, 50);
  assert.equal(olderWorkspace.unreadCount, 51);
  assert.equal(olderWorkspace.nextCursor, olderWorkspace.items.at(-1)!.id);
  const olderPage = await list(
    recipient.cookie,
    url(other) + "?before=" + olderWorkspace.nextCursor,
  );
  assert.equal(olderPage.items.length, 1);
  assert.equal(olderPage.nextCursor, null);
  assert.ok(olderPage.items[0].id < olderWorkspace.nextCursor!);
  await request(recipient.cookie, url() + "/read-all", "POST");
  assert.equal((await list(recipient.cookie, url(other))).unreadCount, 51);
  target.status = "dnd";
  assert.throws(
    () => office.handle(actor.id, { type: "nudge", target: target.id }),
    /Do not disturb/,
  );
  assert.equal((await list(recipient.cookie)).items.length, 4);
}
