import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
const portal = "https://app.littleoffice.app",
  tenant = "https://gmtech.littleoffice.app",
  other = "https://second.littleoffice.app";
const pg = new PGlite();
await pg.waitReady;
const server = new PGLiteSocketServer({
  db: pg,
  host: "127.0.0.1",
  port: 0,
  maxConnections: 10,
});
await server.start();
Object.assign(process.env, {
  DATABASE_URL: `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
  APP_URL: portal,
  WORKSPACE_BASE_DOMAIN: "littleoffice.app",
  BETTER_AUTH_SECRET: "domain-test-only-" + "s".repeat(40),
  LIVEKIT_URL: "",
  LIVEKIT_API_KEY: "",
  LIVEKIT_API_SECRET: "",
  OFFICE_S3_ACCESS_KEY_ID: "",
  OFFICE_S3_SECRET_ACCESS_KEY: "",
  OIDC_ISSUER: "",
  OIDC_CLIENT_ID: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
});
const { pool, migrateDatabase } = await import("../../server/db");
try {
  await migrateDatabase();
  const { auth } = await import("../../server/auth");
  const { app } = await import("../../server/index");
  const { DEFAULT_WORKSPACE_ID: id } = await import("../../shared/workspaces");
  const password = crypto.randomUUID() + "Test!";
  const account = await auth.api.signUpEmail({
    body: {
      name: "Domain test",
      username: "domain_test",
      email: "domain@example.invalid",
      password,
    },
  });
  await pool.query('UPDATE "user" SET approved=true,role=$1 WHERE id=$2', [
    "owner",
    account.user.id,
  ]);
  await pool.query(
    "UPDATE workspace_memberships SET approved=true,role='owner' WHERE user_id=$1",
    [account.user.id],
  );
  await pool.query(
    "UPDATE workspaces SET slug='gmtech',name='GMTECH' WHERE id=$1",
    [id],
  );
  const otherId = crypto.randomUUID();
  await pool.query(
    "INSERT INTO workspaces(id,slug,name,map_id,created_by) VALUES($1,'second','Second','nature-small',$2)",
    [otherId, account.user.id],
  );
  await pool.query(
    "INSERT INTO workspace_memberships(workspace_id,user_id,role,approved) VALUES($1,$2,'owner',true)",
    [otherId, account.user.id],
  );
  async function req(
    origin: string,
    path: string,
    body?: unknown,
    cookie = "",
    headers: Record<string, string> = {},
  ) {
    return app.handle(
      new Request(origin + path, {
        method: body ? "POST" : "GET",
        headers: {
          host: new URL(origin).host,
          origin,
          cookie,
          "content-type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  }
  const { MAPS } = await import("../../shared/maps");
  const catalog = await (await req(portal, "/api/saas/config")).json();
  assert.deepEqual(
    catalog.allMaps,
    MAPS.map(({ id, name, size, theme }) => ({ id, name, size, theme })),
  );
  assert.deepEqual(
    catalog.maps.map((m: { id: string }) => m.id),
    MAPS.filter((m) => m.size === "small").map((m) => m.id),
  );
  const login = await req(portal, "/api/auth/sign-in/username", {
    username: "domain_test",
    password,
  });
  assert.equal(login.status, 200, await login.clone().text());
  const portalCookie = login.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  assert.ok(!login.headers.get("set-cookie")!.includes("Domain="));
  assert.ok(portalCookie.startsWith("__Host-little-office.session_token="));
  assert.ok(/; secure/i.test(login.headers.get("set-cookie")!));
  const start = await req(tenant, "/api/workspace-login/start");
  assert.equal(start.status, 303);
  const connect = new URL(start.headers.get("location")!);
  assert.equal(connect.origin, portal);
  const nonceCookie = start.headers.getSetCookie()[0].split(";")[0];
  const grant = await req(
    portal,
    "/api/workspace-login/grant",
    { workspace: "gmtech", state: connect.searchParams.get("state") },
    portalCookie,
  );
  assert.equal(grant.status, 200, await grant.clone().text());
  const complete = new URL((await grant.json()).url);
  assert.equal(complete.origin, tenant);
  assert.equal(
    (
      await req(
        other,
        complete.pathname + complete.search,
        undefined,
        nonceCookie,
      )
    ).status,
    401,
    "grant is host bound",
  );
  assert.equal(
    (
      await req(
        tenant,
        complete.pathname + complete.search,
        undefined,
        "__Host-little-office.connect=" + "a".repeat(43),
      )
    ).status,
    401,
    "grant is browser bound",
  );
  const finish = await req(
    tenant,
    complete.pathname + complete.search,
    undefined,
    nonceCookie,
  );
  assert.equal(finish.status, 303, await finish.clone().text());
  const tenantCookie = finish.headers.getSetCookie()[0].split(";")[0];
  assert.ok(tenantCookie.startsWith("__Host-little-office.workspace="));
  assert.ok(
    finish.headers
      .get("set-cookie")!
      .includes("HttpOnly; Secure; SameSite=Lax"),
  );
  assert.ok(!finish.headers.get("set-cookie")!.includes("Domain="));
  assert.equal(
    (
      await req(
        tenant,
        complete.pathname + complete.search,
        undefined,
        nonceCookie,
      )
    ).status,
    401,
    "grant consumed once",
  );
  assert.equal(
    (await req(tenant, `/api/workspaces/${id}/me`, undefined, tenantCookie))
      .status,
    200,
  );
  assert.equal(
    (await req(tenant, `/api/workspaces/${id}/me`, undefined, portalCookie))
      .status,
    401,
    "portal cookie cannot be used on tenant",
  );
  assert.equal(
    (await req(portal, "/api/account", undefined, tenantCookie)).status,
    401,
    "tenant cookie cannot be used on portal",
  );
  assert.equal(
    (await req(other, `/api/workspaces/${otherId}/me`, undefined, tenantCookie))
      .status,
    401,
    "tenant cookie cannot be replayed on sibling",
  );
  assert.equal(
    (
      await req(
        tenant,
        `/api/workspaces/${otherId}/me`,
        undefined,
        tenantCookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await req(
        tenant,
        `/api/workspaces/${otherId}/office`,
        undefined,
        tenantCookie,
        { upgrade: "websocket" },
      )
    ).status,
    404,
  );
  assert.equal(
    (await req(tenant, "/api/me", undefined, tenantCookie)).status,
    404,
    "legacy default routes cannot bypass host scope",
  );
  assert.equal(
    (await req(tenant, "/api/admin/storage", undefined, tenantCookie)).status,
    404,
  );
  assert.equal(
    (
      await req(tenant, "/api/auth/sign-in/username", {
        username: "domain_test",
        password,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req(tenant, "/api/auth/sign-out", {}, tenantCookie, {
        origin: other,
      })
    ).status,
    403,
    "sibling origin rejected",
  );
  assert.equal(
    (
      await req(tenant, "/api/auth/sign-out", {}, tenantCookie, {
        origin: portal,
      })
    ).status,
    403,
    "portal cannot mutate tenant",
  );
  assert.equal(
    (await req("https://unknown.littleoffice.app", "/api/workspace-host"))
      .status,
    404,
  );
  assert.equal(
    (await req("https://rtc.littleoffice.app", "/api/workspace-host")).status,
    404,
  );
  assert.equal(
    (
      await req("https://evil.invalid", "/api/workspace-host", undefined, "", {
        "x-forwarded-host": "gmtech.littleoffice.app",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req(tenant, "/api/workspace-host", undefined, "", {
        "x-forwarded-host": "second.littleoffice.app",
      })
    ).status,
    200,
  );
  const profile = await app.handle(
    new Request(`${tenant}/api/workspaces/${id}/profile`, {
      method: "PATCH",
      headers: {
        host: new URL(tenant).host,
        origin: tenant,
        cookie: tenantCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Domain test updated",
        avatar: "sage",
        status: "available",
      }),
    }),
  );
  assert.equal(
    profile.status,
    400,
    "tenant credential cannot change global account profile",
  );
  const globalProfile = await app.handle(
    new Request(`${portal}/api/workspaces/${id}/profile`, {
      method: "PATCH",
      headers: {
        host: new URL(portal).host,
        origin: portal,
        cookie: portalCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Domain test updated",
        avatar: "sage",
        status: "available",
      }),
    }),
  );
  assert.equal(
    globalProfile.status,
    200,
    "personal portal credential can update account profile",
  );
  assert.equal(
    (
      await (
        await req(tenant, `/api/workspaces/${id}/me`, undefined, tenantCookie)
      ).json()
    ).user.profileURL,
    `${portal}/profile?workspace=${id}`,
  );
  const scoped = await (
    await req(tenant, "/api/workspaces", undefined, tenantCookie)
  ).json();
  assert.deepEqual(
    scoped.map((v: any) => v.id),
    [id],
  );
  assert.equal(
    (await req("http://127.0.0.1:3001", "/api/health")).status,
    200,
    "Docker loopback healthcheck remains available",
  );
  assert.equal(
    (await req(tenant, "/api/health")).status,
    404,
    "health exception does not expose legacy tenant routes",
  );
  for (const domain of ["gmtech.littleoffice.app", "second.littleoffice.app"])
    assert.equal(
      (
        await req(
          "http://127.0.0.1:3001",
          `/internal/tls-allow?domain=${domain}`,
        )
      ).status,
      200,
    );
  for (const domain of [
    "app.littleoffice.app",
    "unknown.littleoffice.app",
    "rtc.littleoffice.app",
    "evil.invalid",
    "foo.gmtech.littleoffice.app",
  ])
    assert.equal(
      (
        await req(
          "http://127.0.0.1:3001",
          `/internal/tls-allow?domain=${domain}`,
        )
      ).status,
      403,
    );
  assert.equal(
    (await req(portal, "/internal/tls-allow?domain=gmtech.littleoffice.app"))
      .status,
    403,
  );
  const verifier = "v".repeat(43),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const native = await req(
    portal,
    "/api/native/authorize",
    { challenge, state: "a".repeat(43) },
    portalCookie,
  );
  assert.equal(native.status, 200);
  const code = new URL((await native.json()).url).searchParams.get("code");
  const exchange = await req(tenant, "/api/native/exchange", {
    code,
    verifier,
  });
  assert.equal(exchange.status, 200);
  const credential = await exchange.json();
  const bearer = credential.token;
  assert.equal(credential.cookieName, "__Host-little-office.workspace");
  assert.equal(
    (
      await req(
        tenant,
        `/api/workspaces/${id}/me`,
        undefined,
        `${credential.cookieName}=${bearer}`,
      )
    ).status,
    200,
    "native whiteboard cookie works",
  );
  assert.equal(
    (
      await req(portal, "/api/account", undefined, "", {
        authorization: `Bearer ${bearer}`,
      })
    ).status,
    401,
    "workspace native token cannot become portal credential",
  );
  assert.equal(
    (
      await req(other, `/api/workspaces/${otherId}/me`, undefined, "", {
        authorization: `Bearer ${bearer}`,
      })
    ).status,
    401,
    "native token cannot move to sibling",
  );
  assert.equal(
    (
      await req(tenant, `/api/workspaces/${id}/me`, undefined, "", {
        authorization: `Bearer ${bearer}`,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req(tenant, `/api/workspaces/${otherId}/me`, undefined, "", {
        authorization: `Bearer ${bearer}`,
      })
    ).status,
    404,
  );
  const listener = app.listen({ hostname: "127.0.0.1", port: 0 });
  const Socket = WebSocket as unknown as {
    new (url: string, options: { headers: Record<string, string> }): WebSocket;
  };
  const sockets: WebSocket[] = [];
  async function socketAttempt(origin: string, workspaceId: string) {
    const socket = new Socket(
      `ws://127.0.0.1:${listener.server!.port}/api/workspaces/${workspaceId}/office`,
      { headers: { host: new URL(tenant).host, origin, cookie: tenantCookie } },
    );
    sockets.push(socket);
    return await new Promise<{ opened: boolean; snapshot?: any }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Socket test timed out")),
          3000,
        );
        socket.addEventListener("error", () => {
          clearTimeout(timer);
          resolve({ opened: false });
        });
        socket.addEventListener("message", (event) => {
          const snapshot = JSON.parse(String(event.data));
          clearTimeout(timer);
          resolve({ opened: true, snapshot });
        });
      },
    );
  }
  try {
    const live = await socketAttempt(tenant, id);
    assert.equal(live.opened, true, "same-host tenant socket upgrades");
    assert.equal(live.snapshot.workspaceId, id);
    assert.equal(
      (await socketAttempt(other, id)).opened,
      false,
      "sibling-origin socket rejected",
    );
    assert.equal(
      (await socketAttempt(tenant, otherId)).opened,
      false,
      "cross-workspace socket rejected",
    );
  } finally {
    for (const socket of sockets) socket.close();
    await listener.stop(true);
  }
  await pool.query(
    "UPDATE workspace_memberships SET approved=false WHERE workspace_id=$1 AND user_id=$2",
    [id, account.user.id],
  );
  assert.equal(
    (await req(tenant, `/api/workspaces/${id}/me`, undefined, tenantCookie))
      .status,
    401,
    "membership revocation is immediate",
  );
  await pool.query(
    "UPDATE workspace_memberships SET approved=true WHERE workspace_id=$1 AND user_id=$2",
    [id, account.user.id],
  );
  assert.equal(
    (await req(tenant, "/api/auth/sign-out", {}, tenantCookie)).status,
    200,
  );
  assert.equal(
    (await req(tenant, `/api/workspaces/${id}/me`, undefined, tenantCookie))
      .status,
    401,
    "parent session revocation invalidates tenant cookie",
  );
  console.log("Workspace domain security checks passed.");
} finally {
  await pool.end();
  await server.stop();
  await pg.close();
}
