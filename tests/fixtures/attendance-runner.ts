import { strict as assert } from "node:assert";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
const pg = new PGlite();
await pg.waitReady;
const database = new PGLiteSocketServer({
  db: pg,
  host: "127.0.0.1",
  port: 0,
  maxConnections: 10,
});
await database.start();
const origin = "http://localhost:3000";
Object.assign(process.env, {
  DATABASE_URL: `postgres://postgres:postgres@${database.getServerConn()}/postgres`,
  APP_URL: origin,
  WORKSPACE_BASE_DOMAIN: "",
  BETTER_AUTH_SECRET: "attendance-fixture-" + "s".repeat(40),
  LIVEKIT_URL: "",
  LIVEKIT_API_KEY: "",
  LIVEKIT_API_SECRET: "",
  OIDC_ISSUER: "",
  OIDC_CLIENT_ID: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
});
const { pool, migrateDatabase } = await import("../../server/db");
try {
  await migrateDatabase();
  const { auth } = await import("../../server/auth");
  const { app, office } = await import("../../server/index");
  const { DEFAULT_WORKSPACE_ID: workspaceId } =
    await import("../../shared/workspaces");
  const people: { id: string; cookie: string; role: string; name: string }[] =
    [];
  for (const role of ["owner", "admin", "member"]) {
    const password = crypto.randomUUID() + "Test!",
      username = `attendance_${role}`;
    const { user } = await auth.api.signUpEmail({
      body: {
        username,
        name: username,
        email: `${username}@local.invalid`,
        password,
      },
    });
    await pool.query('UPDATE "user" SET approved=true WHERE id=$1', [user.id]);
    await pool.query(
      "UPDATE workspace_memberships SET approved=true,role=$1 WHERE user_id=$2",
      [role, user.id],
    );
    const login = await app.handle(
      new Request(origin + "/api/auth/sign-in/username", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      }),
    );
    assert.equal(login.status, 200);
    people.push({
      id: user.id,
      name: username,
      role,
      cookie: login.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; "),
    });
  }
  const [owner, admin, member] = people;
  const other = crypto.randomUUID();
  await pool.query(
    "INSERT INTO workspaces(id,slug,name,map_id,created_by) VALUES($1,'attendance-other','Other','nature-small',$2)",
    [other, owner.id],
  );
  await pool.query(
    "INSERT INTO workspace_memberships(workspace_id,user_id,role,approved) VALUES($1,$2,'owner',true)",
    [other, owner.id],
  );
  const insert = async (
    workspace: string,
    userId: string,
    start: string,
    end: string,
    active: boolean,
    visitId = crypto.randomUUID(),
  ) =>
    pool.query(
      "INSERT INTO workspace_attendance_intervals(id,workspace_id,user_id,visit_id,started_at,ended_at,active) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        crypto.randomUUID(),
        workspace,
        userId,
        visitId,
        `2026-10-29T${start}:00Z`,
        `2026-10-29T${end}:00Z`,
        active,
      ],
    );
  const visit = crypto.randomUUID();
  await insert(workspaceId, owner.id, "00:00", "00:30", true, visit);
  await insert(workspaceId, owner.id, "00:30", "01:00", false, visit);
  await insert(workspaceId, member.id, "00:00", "00:10", true);
  await insert(other, owner.id, "00:00", "02:00", true);
  const request = (
    cookie: string,
    path: string,
    method = "GET",
    body?: unknown,
  ) =>
    app.handle(
      new Request(origin + path, {
        method,
        headers: { origin, cookie, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const path = (id = workspaceId, start = "00:15", end = "00:45") =>
    `/api/workspaces/${id}/attendance?${new URLSearchParams({ from: `2026-10-29T${start}:00Z`, to: `2026-10-29T${end}:00Z` })}`;
  for (const manager of [owner, admin]) {
    const response = await request(manager.cookie, path());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const report = await response.json();
    assert.equal(report.manager, true);
    assert.equal(report.rows.length, 3);
    const row = report.rows.find(
      (r: { userId: string }) => r.userId === owner.id,
    );
    assert.equal(row.connectedMs, 30 * 60000);
    assert.equal(row.activeMs, 15 * 60000);
    assert.equal(row.visits, 1);
    assert.equal(row.firstEntry, "2026-10-29T00:15:00.000Z");
    assert.equal(row.lastSeen, "2026-10-29T00:45:00.000Z");
  }
  const own = await (
    await request(member.cookie, path(workspaceId, "00:00", "02:00"))
  ).json();
  assert.equal(own.manager, false);
  assert.equal(own.rows.length, 1);
  assert.equal(own.rows[0].userId, member.id);
  assert.equal(own.rows[0].activeMs, 10 * 60000);
  assert.equal((await request(member.cookie, path(other))).status, 404);
  assert.notEqual((await request("", path())).status, 200);
  assert.equal(
    (await request(owner.cookie, `/api/attendance?from=invalid&to=invalid`))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        owner.cookie,
        `/api/attendance?from=2026-01-01&to=2027-01-01`,
      )
    ).status,
    400,
  );
  const empty = await (
    await request(owner.cookie, `/api/attendance?from=2025-01-01&to=2025-01-02`)
  ).json();
  assert.ok(
    empty.rows.every(
      (row: { firstEntry: unknown; connectedMs: number }) =>
        row.firstEntry === null && row.connectedMs === 0,
    ),
  );
  const live = office.add(
    {
      ...member,
      availability: "busy",
      statusText: "Deep work",
      statusIcon: "🎧",
    },
    "fixture",
    Date.now() + 3600000,
    () => {},
    () => {},
  );
  const clear = await request(member.cookie, "/api/profile", "PATCH", {
    name: member.name,
    avatar: "sage",
    status: "available",
    statusText: "",
    statusIcon: "",
  });
  assert.equal(clear.status, 200);
  assert.equal(live.status, "available");
  assert.equal(live.manualStatus, "available");
  assert.equal(live.statusText, "");
  assert.equal(live.statusIcon, "");
  const me = await (await request(member.cookie, "/api/me")).json();
  assert.equal(me.user.availability, "available");
  assert.equal(me.user.statusText, "");
  assert.equal(me.user.statusIcon, "");
  const { persistAttendance } = await import("../../server/attendance-report");
  await persistAttendance(workspaceId, office);
  await persistAttendance(workspaceId, office);
  const result = await pool.query(
    "SELECT count(*)::int AS count FROM workspace_attendance_intervals WHERE workspace_id=$1 AND user_id=$2",
    [workspaceId, member.id],
  );
  assert.equal(
    result.rows[0].count,
    2,
    "Flushing an ongoing visit is idempotent",
  );
  const timezone = await (
    await request(
      owner.cookie,
      `/api/attendance?${new URLSearchParams({ from: "2026-10-29T00:00:00+07:00", to: "2026-10-30T00:00:00+07:00" })}`,
    )
  ).json();
  assert.equal(
    timezone.rows.find((row: { userId: string }) => row.userId === owner.id)
      .connectedMs,
    60 * 60000,
  );
  await pool.query(
    "DELETE FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2",
    [workspaceId, member.id],
  );
  const deleted = await pool.query(
    "SELECT count(*)::int AS count FROM workspace_attendance_intervals WHERE workspace_id=$1 AND user_id=$2",
    [workspaceId, member.id],
  );
  assert.equal(
    deleted.rows[0].count,
    0,
    "Deleting membership removes its attendance history",
  );
  console.log(
    "PASS: attendance role/workspace isolation, clipped totals, bounded dates, empty history, idempotency and persisted status reset",
  );
} finally {
  await pool.end();
  const deadline = Date.now() + 3000;
  while (database.getStats().activeConnections > 0) {
    assert.ok(Date.now() < deadline);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await database.stop();
  await pg.close();
}
