import { strict as assert } from "node:assert";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

// This server-side fixture uses Bun header options; the app tsconfig also loads DOM types.
const BunWebSocket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;

const origin = "http://localhost:3000";
const pg = new PGlite();
await pg.waitReady;
const database = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0 });
await database.start();
Object.assign(process.env, {
  DATABASE_URL: `postgres://postgres:postgres@${database.getServerConn()}/postgres`,
  APP_URL: origin,
  WORKSPACE_BASE_DOMAIN: "",
  BETTER_AUTH_SECRET: "reconnect-test-only-" + "s".repeat(40),
  LIVEKIT_URL: "",
  LIVEKIT_API_KEY: "",
  LIVEKIT_API_SECRET: "",
  OFFICE_S3_ACCESS_KEY_ID: "",
  OFFICE_S3_SECRET_ACCESS_KEY: "",
  OIDC_ISSUER: "",
  OIDC_CLIENT_ID: "",
  OIDC_CLIENT_SECRET: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
});
const { pool, db, migrateDatabase } = await import("../../server/db");
const sockets: WebSocket[] = [];
let stop: (() => Promise<unknown>) | undefined;
try {
  await migrateDatabase();
  const { eq } = await import("drizzle-orm");
  const { users, memberships } = await import("../../server/schema");
  const { auth } = await import("../../server/auth");
  const password = crypto.randomUUID() + "Test!";
  const { user } = await auth.api.signUpEmail({
    body: {
      username: "reconnect_test",
      email: "reconnect@local.invalid",
      name: "Reconnect",
      password,
    },
  });
  await db.update(users).set({ approved: true }).where(eq(users.id, user.id));
  await db
    .update(memberships)
    .set({ approved: true })
    .where(eq(memberships.userId, user.id));
  const { app } = await import("../../server/index");
  app.listen({ port: 0, hostname: "127.0.0.1" });
  stop = () => app.stop(true);
  const login = await app.handle(
    new Request(`${origin}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "reconnect_test", password }),
    }),
  );
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const { DEFAULT_WORKSPACE_ID } = await import("../../shared/workspaces");
  function connect(
    query: string,
    sessionCookie = cookie,
    path = "/api/office",
  ) {
    const socket = new BunWebSocket(
      `ws://127.0.0.1:${app.server!.port}${path}?${query}`,
      {
        headers: { origin, cookie: sessionCookie },
      },
    );
    sockets.push(socket);
    return new Promise<{ socket: WebSocket; outcome: string; code?: number }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("No office handshake within 3s")),
          3000,
        );
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.type === "snapshot") {
            clearTimeout(timer);
            resolve({ socket, outcome: "snapshot" });
          } else if (message.type === "error") {
            clearTimeout(timer);
            reject(new Error(message.message));
          }
        };
        socket.onclose = (event) => {
          clearTimeout(timer);
          resolve({ socket, outcome: "closed", code: event.code });
        };
        socket.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Office WebSocket failed"));
        };
      },
    );
  }
  const otherLogin = await app.handle(
    new Request(`${origin}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "reconnect_test", password }),
    }),
  );
  assert.equal(otherLogin.status, 200);
  const otherCookie = otherLogin.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.notEqual(otherCookie, cookie);
  const { office } = await import("../../server/index");
  for (const path of [
    "/api/office",
    `/api/workspaces/${DEFAULT_WORKSPACE_ID}/office`,
  ]) {
    const client = crypto.randomUUID();
    const first = await connect(`takeover=1&client=${client}`, cookie, path);
    assert.equal(first.outcome, "snapshot");
    const oldConnection = office.members.get(user.id)!.connectionId;
    // A brief network loss may leave the old server socket alive until its timeout.
    const reconnect = await connect(`client=${client}`, cookie, path);
    assert.equal(
      reconnect.outcome,
      "snapshot",
      `Same-tab reconnect incorrectly closed with ${reconnect.code} (Office opened elsewhere)`,
    );
    assert.notEqual(office.members.get(user.id)!.connectionId, oldConnection);
    const resumedConnection = office.members.get(user.id)!.connectionId;
    const differentTab = await connect(
      `client=${crypto.randomUUID()}`,
      cookie,
      path,
    );
    assert.equal(
      differentTab.code,
      4001,
      "Another tab cannot silently replace the active office",
    );
    const differentLogin = await connect(`client=${client}`, otherCookie, path);
    assert.equal(
      differentLogin.code,
      4001,
      "A matching client ID cannot resume a different login session",
    );
    assert.equal(
      office.members.get(user.id)!.connectionId,
      resumedConnection,
      "Rejected and late-closing sockets cannot remove the resumed member",
    );
    const legacy = await connect("protocol=1", cookie, path);
    assert.equal(
      legacy.code,
      4001,
      "Clients without an identifier must still request takeover",
    );
    const replacement = await connect(
      `takeover=1&client=${crypto.randomUUID()}`,
      cookie,
      path,
    );
    assert.equal(replacement.outcome, "snapshot");
    const displacedRetry = await connect(`client=${client}`, cookie, path);
    assert.equal(
      displacedRetry.code,
      4001,
      "A displaced tab must not reclaim the office on an automatic retry",
    );
    const legacyTakeover = await connect("takeover=1", cookie, path);
    assert.equal(
      legacyTakeover.outcome,
      "snapshot",
      "Existing native clients retain explicit takeover support",
    );
    console.log(
      `PASS: ${path} resumes same tab and session; other tabs, sessions and displaced retries stay blocked`,
    );
  }
  if (process.env.OFFICE_RECONNECT_SOAK === "1") {
    const { startRuntimeTimers } =
      await import("../../server/workspace-runtime");
    const stopTimers = startRuntimeTimers();
    const idle = await connect(`takeover=1&client=${crypto.randomUUID()}`);
    const heartbeat = setInterval(
      () => idle.socket.send(JSON.stringify({ type: "ping" })),
      10000,
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 150000);
        idle.socket.addEventListener(
          "close",
          (event) => {
            clearTimeout(timer);
            reject(new Error(`Idle office disconnected: ${event.code}`));
          },
          { once: true },
        );
      });
      assert.ok(office.members.has(user.id));
      console.log(
        "PASS: idle office remains connected for 150 seconds with normal 10-second heartbeats and runtime session checks",
      );
    } finally {
      clearInterval(heartbeat);
      stopTimers();
    }
  }
} finally {
  await Promise.all(
    sockets.map(
      (socket) =>
        new Promise<void>((resolve) => {
          if (socket.readyState === WebSocket.CLOSED) return resolve();
          socket.addEventListener("close", () => resolve(), { once: true });
          socket.close();
        }),
    ),
  );
  await stop?.();
  await pool.end();
  await database.stop();
  await pg.close();
}
