import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { rectangle } from "./whiteboard-fixture";
import { getMigrations } from "better-auth/db/migration";
let server: PGLiteSocketServer,
  pg: PGlite,
  app: (typeof import("../server/index"))["app"],
  auth: (typeof import("../server/auth"))["auth"],
  db: (typeof import("../server/db"))["db"];
let ownerCookie = "",
  memberCookie = "";
const password = crypto.randomUUID() + "Test!";
async function request(
  path: string,
  body?: unknown,
  cookie = "",
  method = body ? "POST" : "GET",
  origin = "http://localhost:3000",
) {
  const response = await app.handle(
    new Request(`http://localhost:3000/api${path}`, {
      method,
      headers: { origin, cookie, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  return {
    status: response.status,
    data: (await response.json()) as any,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
  server = new PGLiteSocketServer({
    db: pg,
    port: 15433,
    host: "127.0.0.1",
    maxConnections: 10,
  });
  await server.start();
  process.env.DATABASE_URL =
    "postgres://postgres:postgres@127.0.0.1:15433/postgres";
  process.env.BETTER_AUTH_SECRET = crypto.randomUUID() + crypto.randomUUID();
  process.env.APP_URL = "http://localhost:3000";
  process.env.OFFICE_S3_ACCESS_KEY_ID = "";
  process.env.OFFICE_S3_SECRET_ACCESS_KEY = "";
  process.env.OIDC_ISSUER = "";
  process.env.OIDC_CLIENT_ID = "";
  const database = await import("../server/db");
  db = database.db;
  await database.migrateOffice();
  auth = (await import("../server/auth")).auth;
  await (await getMigrations(auth.options)).runMigrations();
  app = (await import("../server/index")).app;
  for (const username of ["owner_test", "member_test"]) {
    const result = await auth.api.signUpEmail({
      body: {
        username,
        email: `${username}@local.invalid`,
        name: username,
        password,
      },
    });
    await db.query('UPDATE "user" SET approved=true,role=$1 WHERE id=$2', [
      username === "owner_test" ? "owner" : "member",
      result.user.id,
    ]);
  }
}, 20000);
afterAll(async () => {
  await db?.end();
  await server?.stop();
  await pg?.close();
});
describe("authentication and authorization", () => {
  test("password login verifies credentials and creates a secure application session", async () => {
    const bad = await request("/auth/sign-in/username", {
      username: "owner_test",
      password: "not-the-password",
    });
    expect(bad.status).toBe(401);
    const good = await request("/auth/sign-in/username", {
      username: "OWNER_TEST",
      password,
    });
    expect(good.status).toBe(200);
    ownerCookie = good.cookie;
    expect(ownerCookie).toContain("session_token");
    expect((await request("/me", undefined, ownerCookie)).data.user.role).toBe(
      "owner",
    );
    memberCookie = (
      await request("/auth/sign-in/username", {
        username: "member_test",
        password,
      })
    ).cookie;
  });
  test("public signup, cross-origin writes, and member admin access are rejected", async () => {
    expect(
      (
        await request("/auth/sign-up/email", {
          email: "bad@local.invalid",
          password,
          name: "bad",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          "/profile",
          { name: "bad", avatar: "sage" },
          ownerCookie,
          "PATCH",
          "https://untrusted.invalid",
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("/admin/users", undefined, memberCookie)).status,
    ).toBe(400);
    expect((await request("/media/token", {}, memberCookie)).status).toBe(400);
  });
  test("workspace settings require an owner, validate maps, persist, and reject stale saves", async () => {
    const initial = (await request("/config")).data.workspace;
    const body = {
      name: "Garden team",
      mapId: "nature-large",
      revision: initial.revision,
    };
    expect(
      (await request("/admin/workspace", body, memberCookie, "PATCH")).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/admin/workspace",
          { ...body, mapId: "missing" },
          ownerCookie,
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/admin/workspace",
          { ...body, name: "   " },
          ownerCookie,
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("/admin/workspace", body, ownerCookie, "PATCH")).status,
    ).toBe(200);
    const row = (
      await db.query("SELECT name, map_id FROM workspace_settings WHERE id=1")
    ).rows[0];
    expect(row).toEqual({ name: "Garden team", map_id: "nature-large" });
    expect((await request("/config")).data.workspace.mapId).toBe(
      "nature-large",
    );
    expect(
      (await request("/admin/workspace", body, ownerCookie, "PATCH")).status,
    ).toBe(400);
  });
  test("custom avatar profile updates persist and reject invalid combinations", async () => {
    const body = { name: "Custom owner", avatar: "custom:4:2:5:1" };
    expect((await request("/profile", body, ownerCookie, "PATCH")).status).toBe(
      200,
    );
    expect(
      (await request("/me", undefined, ownerCookie)).data.user.avatar,
    ).toBe(body.avatar);
    expect(
      (
        await request(
          "/profile",
          { ...body, avatar: "custom:9:2:5:1" },
          ownerCookie,
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("/me", undefined, ownerCookie)).data.user.avatar,
    ).toBe(body.avatar);
  });
  test("whiteboards persist concurrent edits, isolate rooms, and revoke access after moving or leaving", async () => {
    const { Office } = await import("../server/office");
    const { Whiteboards } = await import("../server/whiteboard");
    const office = new Office();
    const boards = new Whiteboards(office);
    const events = new Map<string, any[]>();
    const closed: string[] = [];
    for (const id of ["a", "b", "c"]) {
      office.add(
        { id, name: id, role: "member" },
        id,
        Date.now() + 60000,
        () => {},
        () => {},
      );
      events.set(id, []);
    }
    office.go(office.members.get("c")!, "studio");
    for (const id of ["a", "b", "c"])
      await boards.open(
        id,
        id,
        id,
        (event) => events.get(id)!.push(event),
        () => closed.push(id),
      );
    await expect(
      boards.open(
        "intruder",
        "a",
        "wrong-session",
        () => {},
        () => {},
      ),
    ).rejects.toThrow();
    await Promise.all([
      boards.message("a", {
        type: "change",
        batch: "one",
        elements: [rectangle("one")],
      }),
      boards.message("b", {
        type: "change",
        batch: "two",
        elements: [rectangle("two")],
      }),
    ]);
    const row = await db.query(
      "SELECT elements FROM office_whiteboards WHERE id=$1",
      [boards.peers.get("a")!.scope],
    );
    expect(row.rows[0].elements.map((e: any) => e.id).sort()).toEqual([
      "one",
      "two",
    ]);
    expect(
      events.get("a")!.some((e) => e.type === "saved" && e.batch === "one"),
    ).toBe(true);
    expect(events.get("c")!.some((e) => e.type === "scene")).toBe(false);
    boards.remove("b");
    events.set("b", []);
    await boards.open(
      "b",
      "b",
      "b",
      (event) => events.get("b")!.push(event),
      () => closed.push("b"),
    );
    expect(
      events.get("b")!.find((e) => e.type === "ready").elements,
    ).toHaveLength(2);
    office.go(office.members.get("b")!, "library");
    await boards.message("b", {
      type: "change",
      batch: "forbidden",
      elements: [rectangle("leak")],
    });
    expect(closed).toContain("b");
    // A different office socket with the same login cookie must revoke the old board too.
    office.add(
      { id: "a", name: "a", role: "member" },
      "a",
      Date.now() + 60000,
      () => {},
      () => {},
    );
    boards.prune();
    expect(closed).toContain("a");
    expect(
      (
        await db.query("SELECT elements FROM office_whiteboards WHERE id=$1", [
          row.rows[0].id || `${office.workspace.mapId}:floor`,
        ])
      ).rows[0].elements,
    ).toHaveLength(2);
    office.configureWorkspace({
      ...office.workspace,
      revision: office.workspace.revision + 1,
      features: { whiteboard: false },
    });
    boards.prune();
    expect(closed).toContain("c");
    await expect(
      boards.open(
        "disabled",
        "c",
        "c",
        () => {},
        () => {},
      ),
    ).rejects.toThrow();
    boards.remove("c");
  });
  test("only owners can change feature flags and inspect storage configuration", async () => {
    const current = (await request("/config")).data.workspace;
    const body = {
      revision: current.revision,
      features: { whiteboard: false },
    };
    expect(
      (await request("/admin/features", body, memberCookie, "PATCH")).status,
    ).toBe(400);
    const saved = await request("/admin/features", body, ownerCookie, "PATCH");
    expect(saved.status).toBe(200);
    expect(saved.data.workspace.features.whiteboard).toBe(false);
    expect(
      (await request("/admin/features", body, ownerCookie, "PATCH")).status,
    ).toBe(400);
    expect(
      (await request("/admin/storage", undefined, memberCookie)).status,
    ).toBe(400);
    const storage = await request("/admin/storage", undefined, ownerCookie);
    expect(storage.data.configured).toBe(false);
    expect(storage.data).not.toHaveProperty("accessKeyId");
    expect(storage.data).not.toHaveProperty("secretAccessKey");
    expect(
      (
        await request(
          "/admin/features",
          {
            revision: saved.data.workspace.revision,
            features: { whiteboard: true },
          },
          ownerCookie,
          "PATCH",
        )
      ).status,
    ).toBe(200);
  });
  test("last-login and unconfigured SSO switches cannot lock the owner out", async () => {
    expect(
      (
        await request(
          "/admin/auth",
          { password: false, sso: false },
          ownerCookie,
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/admin/auth",
          { password: true, sso: true },
          ownerCookie,
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect((await request("/config")).data.password).toBe(true);
  });
  test("password hashes are Argon2id, never the submitted password", async () => {
    const rows = await db.query(
      "SELECT password FROM account WHERE \"providerId\"='credential'",
    );
    expect(rows.rows[0].password).toStartWith("$argon2id$");
    expect(rows.rows[0].password).not.toBe(password);
  });
  test("member deletion and local password resets enforce owner access, revoke sessions, and protect SSO and owners", async () => {
    const result = await auth.api.signUpEmail({
      body: {
        username: "managed_test",
        email: "managed_test@local.invalid",
        name: "Managed",
        password,
      },
    });
    const id = result.user.id;
    await db.query('UPDATE "user" SET approved=true WHERE id=$1', [id]);
    const login = await request("/auth/sign-in/username", {
      username: "managed_test",
      password,
    });
    const reset = { userId: id, password: crypto.randomUUID() + "New!" };
    expect(
      (await request("/admin/reset-password", reset, memberCookie)).status,
    ).toBe(400);
    expect(
      (await request(`/admin/users/${id}`, undefined, memberCookie, "DELETE"))
        .status,
    ).toBe(400);
    expect(
      (await request(`/admin/users/${id}`, undefined, "", "DELETE")).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/admin/users/${id}`,
          undefined,
          ownerCookie,
          "DELETE",
          "https://untrusted.invalid",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/admin/reset-password",
          { ...reset, password: "short" },
          ownerCookie,
        )
      ).status,
    ).toBe(400);
    // Linked SSO identities must never be reset through a local-password control.
    await db.query(
      `INSERT INTO account(id,"accountId","providerId","userId","createdAt","updatedAt") VALUES('test-sso','subject','oidc',$1,now(),now())`,
      [id],
    );
    expect(
      (await request("/admin/users", undefined, ownerCookie)).data.find(
        (u: any) => u.id === id,
      ).localPassword,
    ).toBe(false);
    expect(
      (await request("/admin/reset-password", reset, ownerCookie)).status,
    ).toBe(400);
    await db.query("DELETE FROM account WHERE id='test-sso'");
    expect(
      (await request("/admin/users", undefined, ownerCookie)).data.find(
        (u: any) => u.id === id,
      ).localPassword,
    ).toBe(true);
    expect(
      (await request("/admin/reset-password", reset, ownerCookie)).status,
    ).toBe(200);
    expect((await request("/me", undefined, login.cookie)).status).toBe(401);
    const account = (
      await db.query('SELECT password FROM account WHERE "userId"=$1', [id])
    ).rows[0];
    expect(await Bun.password.verify(reset.password, account.password)).toBe(
      true,
    );
    expect(await Bun.password.verify(password, account.password)).toBe(false);
    const temporary = await request("/auth/sign-in/username", {
      username: "managed_test",
      password: reset.password,
    });
    expect(temporary.status).toBe(200);
    expect(
      (await request("/me", undefined, temporary.cookie)).data.user
        .mustChangePassword,
    ).toBe(true);
    expect(
      (
        await request(
          "/profile",
          { name: "Blocked", avatar: "sage" },
          temporary.cookie,
          "PATCH",
        )
      ).status,
    ).toBe(400);
    const owner = (await request("/me", undefined, ownerCookie)).data.user;
    expect(
      (
        await request(
          `/admin/users/${owner.id}`,
          undefined,
          ownerCookie,
          "DELETE",
        )
      ).status,
    ).toBe(400);
    await db.query("UPDATE \"user\" SET role='owner' WHERE id=$1", [id]);
    expect(
      (await request(`/admin/users/${id}`, undefined, ownerCookie, "DELETE"))
        .status,
    ).toBe(400);
    await db.query("UPDATE \"user\" SET role='member' WHERE id=$1", [id]);
    expect(
      (await request(`/admin/users/${id}`, undefined, ownerCookie, "DELETE"))
        .status,
    ).toBe(200);
    expect((await request("/me", undefined, temporary.cookie)).status).toBe(
      401,
    );
    for (const table of ['"user"', "account", "session"]) {
      const column = table === '\"user\"' ? "id" : '"userId"';
      expect(
        (await db.query(`SELECT * FROM ${table} WHERE ${column}=$1`, [id]))
          .rowCount,
      ).toBe(0);
    }
    expect(
      (
        await db.query("SELECT * FROM office_audit WHERE action=$1", [
          `Deleted member ${id}`,
        ])
      ).rowCount,
    ).toBe(1);
  });
  test("disabled password method rejects direct login and existing sessions", async () => {
    await db.query("UPDATE office_settings SET password=false");
    expect(
      (
        await request("/auth/sign-in/username", {
          username: "owner_test",
          password,
        })
      ).status,
    ).toBe(403);
    expect((await request("/me", undefined, ownerCookie)).status).toBe(401);
    await db.query("UPDATE office_settings SET password=true");
  });
  test("SSO endpoints stay unavailable until configured and enabled", async () => {
    expect(
      (
        await request("/auth/sign-in/social", {
          provider: "oidc",
          callbackURL: "/",
        })
      ).status,
    ).toBe(403);
    expect((await request("/auth/callback/oidc")).status).toBe(403);
  });
  test("logout invalidates the previous session cookie", async () => {
    expect((await request("/auth/sign-out", {}, memberCookie)).status).toBe(
      200,
    );
    expect((await request("/me", undefined, memberCookie)).status).toBe(401);
  });
});
