import { strict as assert } from "node:assert";
let fail = false;
const deleted: string[] = [];
const namespace = "tenant-test";
const oldRoom = `${namespace}-${crypto.randomUUID()}-${crypto.randomUUID()}-${crypto.randomUUID()}`;
const otherRoom = `${namespace}-eu-${crypto.randomUUID()}-${crypto.randomUUID()}-${crypto.randomUUID()}`;
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const method = new URL(request.url).pathname.split("/").at(-1);
    if (method === "ListRooms")
      return Response.json({
        rooms: [
          { name: oldRoom },
          { name: otherRoom },
          { name: "other-deployment-active" },
        ],
      });
    if (method === "DeleteRoom") {
      if (fail)
        return Response.json(
          { code: "unavailable", msg: "Simulated retirement failure" },
          { status: 503 },
        );
      const body = (await request.json()) as { room: string };
      deleted.push(body.room);
      return Response.json({});
    }
    return Response.json({});
  },
});
Object.assign(process.env, {
  DATABASE_URL: "postgres://unused",
  BETTER_AUTH_SECRET: "t".repeat(40),
  APP_URL: "http://localhost:3000",
  LIVEKIT_URL: `ws://127.0.0.1:${server.port}`,
  LIVEKIT_INTERNAL_URL: `http://127.0.0.1:${server.port}`,
  LIVEKIT_API_KEY: "test-key",
  LIVEKIT_API_SECRET: "s".repeat(40),
  OFFICE_MEDIA_NAMESPACE: namespace,
});
try {
  const media = await import("../../server/media");
  const room = `${namespace}-workspace-a-epoch-generation`;
  const grant = await media.tokenFor(room, "user", "User", false);
  const payload = JSON.parse(
    Buffer.from(grant.token.split(".")[1], "base64url").toString(),
  );
  assert.equal(payload.video.room, room);
  assert.equal(payload.video.canPublishData, false);
  assert.deepEqual(deleted, [oldRoom]);
  assert.ok(payload.exp <= Math.floor(Date.now() / 1000) + 121);
  fail = true;
  media.retireRoom(room);
  await assert.rejects(() =>
    media.tokenFor(`${namespace}-workspace-b-new`, "user", "User", false),
  );
  fail = false;
  await media.tokenFor(`${namespace}-workspace-b-new`, "user", "User", false);
  assert.ok(deleted.includes(room));
  assert.ok(!deleted.includes("other-deployment-active"));
  assert.ok(!deleted.includes(otherRoom));
} finally {
  await server.stop(true);
}
