import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { spyOn } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { SignJWT, generateKeyPair, exportJWK, type JWTPayload } from "jose";

const origin = "http://localhost:3000";
const issuer = "https://login.example.com";
const clientId = "workspace-client";
const clientSecret = "test-only-enterprise-secret";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
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
  APP_URL: origin,
  WORKSPACE_BASE_DOMAIN: "",
  BETTER_AUTH_SECRET: "oidc-test-only-" + "s".repeat(40),
  LIVEKIT_URL: "",
  LIVEKIT_API_KEY: "",
  LIVEKIT_API_SECRET: "",
  OFFICE_S3_ACCESS_KEY_ID: "",
  OFFICE_S3_SECRET_ACCESS_KEY: "",
  OIDC_ISSUER: "",
  OIDC_CLIENT_ID: "",
  OIDC_CLIENT_SECRET: "",
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
});
const network = await import("../../server/oidc-network");
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(publicKey)),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
const codes = new Map<
  string,
  { url: URL; claims: JWTPayload; used?: boolean }
>();
const dnsRecords = new Map<string, string[][]>();
const dnsMock = spyOn(Resolver.prototype, "resolveTxt").mockImplementation(
  async (name) => dnsRecords.get(name) || [],
);
let exchanges = 0;
const networkMock = spyOn(network, "oidcJson").mockImplementation(
  async (url, body, headers) => {
    if (url === `${issuer}/.well-known/openid-configuration`)
      return {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
      };
    if (url === `${issuer}/jwks`) return { keys: [jwk] };
    assert.equal(
      url,
      `${issuer}/token`,
      "No unmocked network endpoint may be reached",
    );
    assert.equal(
      headers?.authorization,
      `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    );
    const code = codes.get(body!.get("code")!);
    assert.ok(
      code && !code.used,
      "Authorization code must be valid and single-use",
    );
    assert.equal(body!.get("grant_type"), "authorization_code");
    assert.equal(
      body!.get("redirect_uri"),
      code.url.searchParams.get("redirect_uri"),
    );
    assert.equal(
      digest(body!.get("code_verifier")!),
      code.url.searchParams.get("code_challenge"),
    );
    code.used = true;
    exchanges++;
    const token = await new SignJWT({
      nonce: code.url.searchParams.get("nonce"),
      email_verified: true,
      email: "new@example.com",
      name: "New teammate",
      ...code.claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuedAt()
      .setExpirationTime(code.claims.exp || "5m")
      .setIssuer(code.claims.iss || issuer)
      .setAudience(code.claims.aud || clientId)
      .setSubject(code.claims.sub || "new-member")
      .sign(privateKey);
    return {
      id_token: token,
      access_token: "never-store-this",
      refresh_token: "never-store-this-either",
    };
  },
);
// Only Google's documented token/JWKS endpoints are available in this isolated process.
const googleFetch = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url === "https://www.googleapis.com/oauth2/v3/certs")
        return Response.json({ keys: [jwk] });
      assert.equal(
        request.url,
        "https://oauth2.googleapis.com/token",
        "No external network access in OAuth tests",
      );
      const body = new URLSearchParams(await request.text());
      const code = codes.get(body.get("code")!);
      assert.ok(code && !code.used);
      assert.equal(
        digest(body.get("code_verifier")!),
        code.url.searchParams.get("code_challenge"),
      );
      assert.equal(
        body.get("redirect_uri"),
        code.url.searchParams.get("redirect_uri"),
      );
      code.used = true;
      const id_token = await new SignJWT({
        email_verified: true,
        name: "Google teammate",
        ...code.claims,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuedAt()
        .setExpirationTime("5m")
        .setIssuer("https://accounts.google.com")
        .setAudience("test-google-client")
        .setSubject(code.claims.sub || "google-member")
        .sign(privateKey);
      return Response.json({
        id_token,
        access_token: "mock-google-access",
        expires_in: 3600,
        token_type: "Bearer",
      });
    },
    { preconnect: fetch.preconnect },
  ),
);
const { pool, db, migrateDatabase } = await import("../../server/db");
try {
  await migrateDatabase();
  console.log("Migrated isolated OIDC database");
  const schema = await import("../../server/schema");
  const { eq, and } = await import("drizzle-orm");
  const { auth, sessionFor } = await import("../../server/auth");
  // Exercise many independent browser flows without waiting for the per-IP login throttle.
  Object.assign(auth.options.rateLimit!, { enabled: false });
  const { app } = await import("../../server/index");
  type Jar = Map<string, string>;
  async function request(
    path: string,
    body?: unknown,
    jar: Jar = new Map(),
    method = body === undefined ? "GET" : "POST",
    bearer?: string,
  ) {
    const response = await app.handle(
      new Request(`${origin}/api${path}`, {
        method,
        headers: {
          origin,
          cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          "content-type": "application/json",
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const at = pair.indexOf("=");
      const name = pair.slice(0, at),
        value = pair.slice(at + 1);
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return {
      status: response.status,
      data,
      location: response.headers.get("location"),
      jar,
    };
  }
  async function personal(
    username: string,
    email = `${username}@local.invalid`,
  ) {
    const password = crypto.randomUUID() + "Test!";
    const { user } = await auth.api.signUpEmail({
      body: { username, email, name: username, password },
    });
    await db
      .update(schema.users)
      .set({ approved: true, emailVerified: true })
      .where(eq(schema.users.id, user.id));
    const jar: Jar = new Map();
    const login = await request(
      "/auth/sign-in/username",
      { username, password },
      jar,
    );
    assert.equal(login.status, 200, JSON.stringify(login.data));
    return { user, jar };
  }
  const owner = await personal("oidc_owner");
  const admin = await personal("oidc_admin");
  const existing = await personal("oidc_existing", "existing@example.com");
  const workspace = crypto.randomUUID(),
    otherWorkspace = crypto.randomUUID();
  await db.insert(schema.workspaces).values([
    {
      id: workspace,
      slug: "example-team",
      name: "Example team",
      createdBy: owner.user.id,
    },
    {
      id: otherWorkspace,
      slug: "other-team",
      name: "Other team",
      createdBy: owner.user.id,
    },
  ]);
  await db.insert(schema.memberships).values([
    { workspaceId: workspace, userId: owner.user.id, role: "owner" },
    { workspaceId: otherWorkspace, userId: owner.user.id, role: "owner" },
    { workspaceId: workspace, userId: admin.user.id, role: "admin" },
  ]);
  const publicLogin = {
    workspace: { name: "Example team", slug: "example-team", url: null },
    providerId: null,
  };
  const unconfiguredLogin = await request("/saas/login/example-team");
  assert.equal(unconfiguredLogin.status, 200);
  assert.deepEqual(unconfiguredLogin.data, publicLogin);
  for (const slug of [
    "missing-team",
    "app",
    "ab",
    "invalid--slug",
    "UPPERCASE",
    "x".repeat(49),
  ]) {
    assert.equal((await request(`/saas/login/${slug}`)).status, 404, slug);
  }
  console.log("Created personal accounts and workspaces");
  const configuration = {
    issuer,
    clientId,
    clientSecret,
    domain: "example.com",
  };
  const endpoint = `/workspaces/${workspace}/oidc`;
  assert.equal((await request("/saas/config")).data.googleConfigured, true);
  assert.equal(
    (await request(endpoint, configuration, admin.jar, "PUT")).status,
    403,
    "Admins cannot configure enterprise trust",
  );
  assert.equal(
    (await request(endpoint, configuration, existing.jar, "PUT")).status,
    404,
    "Nonmembers cannot configure trust",
  );
  const saved = await request(endpoint, configuration, owner.jar, "PUT");
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.enabled, false);
  assert.equal(saved.data.hasClientSecret, true);
  assert.deepEqual(
    (await request("/saas/login/example-team")).data,
    publicLogin,
    "A saved but disabled provider must remain undiscoverable",
  );
  assert.ok(!JSON.stringify(saved.data).includes(clientSecret));
  const [connection] = await db
    .select()
    .from(schema.workspaceOidc)
    .where(eq(schema.workspaceOidc.workspaceId, workspace));
  assert.notEqual(
    connection.clientSecret,
    clientSecret,
    "Client secret must be encrypted at rest",
  );
  const preserved = await request(
    endpoint,
    { issuer, clientId, domain: configuration.domain },
    owner.jar,
    "PUT",
  );
  assert.equal(
    preserved.status,
    200,
    "Saving unchanged settings can omit the saved secret",
  );
  const [preservedConnection] = await db
    .select()
    .from(schema.workspaceOidc)
    .where(eq(schema.workspaceOidc.workspaceId, workspace));
  assert.ok(
    preservedConnection.clientSecret === connection.clientSecret,
    "Omitting the secret preserves its encrypted value",
  );
  assert.equal(
    preservedConnection.providerId,
    connection.providerId,
    "Omitting the secret preserves the callback identity",
  );
  assert.ok(
    !JSON.stringify(preserved.data).includes(clientSecret),
    "The response must not expose the preserved secret",
  );
  assert.equal(
    (await request(`${endpoint}/verify`, {}, owner.jar)).status,
    400,
  );
  assert.equal(
    (await request(endpoint, { enabled: true }, owner.jar, "PATCH")).status,
    400,
    "Cannot enable before proving DNS ownership",
  );
  dnsRecords.set(saved.data.dnsName, [[saved.data.dnsValue]]);
  assert.equal(
    (await request(`${endpoint}/verify`, {}, owner.jar)).status,
    200,
  );
  assert.equal(
    (await request(endpoint, { enabled: true }, owner.jar, "PATCH")).status,
    200,
  );
  const provider = saved.data.providerId as string;
  const enabledLogin = await request("/saas/login/example-team");
  assert.equal(enabledLogin.status, 200);
  assert.deepEqual(
    enabledLogin.data,
    { ...publicLogin, providerId: provider },
    "Public discovery returns only workspace name/slug/url and enabled provider ID",
  );
  for (const secret of [
    clientId,
    clientSecret,
    issuer,
    configuration.domain,
    connection.clientSecret,
    connection.verificationToken,
  ]) {
    assert.ok(
      !JSON.stringify(enabledLogin.data).includes(secret),
      "No provider configuration leaks",
    );
  }
  assert.equal(
    (await request("/saas/sso/example-team")).data.providerId,
    provider,
  );
  const adminView = await request(endpoint, undefined, admin.jar);
  for (const key of [
    "clientSecret",
    "clientId",
    "issuer",
    "dnsValue",
    "dnsName",
  ])
    assert.equal(adminView.data.connection[key], undefined);

  async function start(
    providerId = provider,
    jar: Jar = new Map(),
    link = false,
  ) {
    const response = await request(
      link ? "/auth/link-social" : "/auth/sign-in/social",
      {
        provider: providerId,
        callbackURL: `${origin}/workspaces`,
        errorCallbackURL: `${origin}/login`,
      },
      jar,
    );
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const url = new URL(response.data.url);
    assert.equal(
      url.searchParams.get("client_id"),
      providerId === "google" ? "test-google-client" : clientId,
    );
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    if (providerId !== "google") assert.ok(url.searchParams.get("nonce"));
    return { url, jar, providerId };
  }
  async function finish(
    flow: Awaited<ReturnType<typeof start>>,
    claims: JWTPayload = {},
    overrideProvider = flow.providerId,
  ) {
    const code = crypto.randomUUID();
    codes.set(code, { url: flow.url, claims });
    return request(
      `/auth/callback/${overrideProvider}?code=${code}&state=${encodeURIComponent(flow.url.searchParams.get("state")!)}&iss=${encodeURIComponent(overrideProvider === "google" ? "https://accounts.google.com" : issuer)}`,
      undefined,
      flow.jar,
    );
  }
  console.log("Configured and verified workspace OIDC");
  const flow = await start();
  console.log("Started initial OIDC redirect");
  const signedIn = await finish(flow);
  console.log(
    "Finished initial OIDC callback",
    signedIn.status,
    signedIn.location,
  );
  assert.equal(signedIn.status, 302, JSON.stringify(signedIn.data));
  assert.equal(signedIn.location, `${origin}/workspaces`);
  const account = await request("/account", undefined, flow.jar);
  assert.equal(account.status, 200, JSON.stringify(account.data));
  const newId = account.data.id as string;
  const [member] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, newId),
        eq(schema.memberships.workspaceId, workspace),
      ),
    );
  assert.equal(member.role, "member");
  assert.equal(member.approved, true);
  const [oidcAccount] = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.userId, newId),
        eq(schema.accounts.providerId, provider),
      ),
    );
  assert.equal(oidcAccount.accessToken, null);
  assert.equal(oidcAccount.refreshToken, null);
  // The user is also a real member elsewhere; the enterprise session must still stay confined.
  await db
    .insert(schema.memberships)
    .values({ workspaceId: otherWorkspace, userId: newId, role: "owner" });
  assert.equal(
    (await request("/workspaces", undefined, flow.jar)).data.length,
    1,
  );
  assert.equal(
    (await request(`/workspaces/${otherWorkspace}`, undefined, flow.jar))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "/workspaces",
        { name: "Unauthorized", slug: "unauthorized", mapId: "nature-small" },
        flow.jar,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/invitations/accept", { token: "x".repeat(43) }, flow.jar))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "/profile",
        {
          name: "Changed",
          avatar: "sage",
          status: "available",
          statusText: "",
          statusIcon: "",
        },
        flow.jar,
        "PATCH",
      )
    ).status,
    403,
  );
  const blockedProfile = await request(
    `/workspaces/${workspace}/profile`,
    {
      name: "Changed",
      avatar: "sage",
      status: "available",
      statusText: "",
      statusIcon: "",
    },
    flow.jar,
    "PATCH",
  );
  assert.equal(blockedProfile.status, 400);
  assert.match(blockedProfile.data.error, /personal account/);
  assert.equal(
    (await request(endpoint, { enabled: false }, flow.jar, "PATCH")).status,
    403,
  );
  assert.equal(
    (await request("/auth/link-social", { provider }, flow.jar)).status,
    403,
  );

  for (const [label, claims] of [
    ["wrong email domain", { sub: "bad-domain", email: "outsider@other.com" }],
    ["unverified email", { sub: "unverified", email_verified: false }],
    ["wrong nonce", { sub: "bad-nonce", nonce: "wrong" }],
    ["wrong audience", { sub: "bad-audience", aud: "another-client" }],
    ["wrong authorized party", { sub: "bad-azp", azp: "another-client" }],
    [
      "expired token",
      { sub: "expired", exp: Math.floor(Date.now() / 1000) - 1 },
    ],
    ["wrong issuer", { sub: "wrong-issuer", iss: "https://other.example.com" }],
  ] as const) {
    const rejected = await start();
    const response = await finish(rejected, claims);
    assert.notEqual(response.location, `${origin}/workspaces`, label);
    assert.equal(
      (await request("/account", undefined, rejected.jar)).status,
      401,
      label,
    );
  }
  const collision = await start();
  const collisionResult = await finish(collision, {
    email: existing.user.email,
    sub: "existing-member",
  });
  assert.notEqual(
    collisionResult.location,
    `${origin}/workspaces`,
    "OIDC must not implicitly link an existing personal identity",
  );
  assert.equal(
    (await request("/account", undefined, collision.jar)).status,
    401,
  );
  assert.equal(
    (
      await db
        .select()
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.userId, existing.user.id),
            eq(schema.memberships.workspaceId, workspace),
          ),
        )
    ).length,
    0,
  );
  const existingHeaders = new Headers({
    cookie: [...existing.jar].map(([k, v]) => `${k}=${v}`).join("; "),
  });
  const existingSession = (await sessionFor(existingHeaders))!.session;
  await db
    .update(schema.sessions)
    .set({ createdAt: new Date(Date.now() - 11 * 60000) })
    .where(eq(schema.sessions.id, existingSession.id));
  assert.equal(
    (await request("/auth/link-social", { provider }, existing.jar)).status,
    400,
    "Linking requires a fresh personal sign-in",
  );
  await db
    .update(schema.sessions)
    .set({ createdAt: new Date(existingSession.createdAt) })
    .where(eq(schema.sessions.id, existingSession.id));
  const linking = await start(provider, existing.jar, true);
  assert.equal(
    (
      await finish(linking, {
        email: existing.user.email,
        sub: "existing-member",
      })
    ).location,
    `${origin}/workspaces`,
  );
  assert.equal(
    (
      await db
        .select()
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.userId, existing.user.id),
            eq(schema.memberships.workspaceId, workspace),
          ),
        )
    ).length,
    1,
    "Fresh personal account may explicitly link and join",
  );
  const linkedLogin = await start();
  assert.equal(
    (
      await finish(linkedLogin, {
        email: existing.user.email,
        sub: "existing-member",
      })
    ).location,
    `${origin}/workspaces`,
  );
  assert.equal(
    (await request("/account", undefined, linkedLogin.jar)).data.id,
    existing.user.id,
  );

  const aliasLogin = await start();
  assert.equal(
    (
      await finish(aliasLogin, {
        sub: "new-member",
        email: "renamed@example.com",
        name: "IdP renamed",
      })
    ).location,
    `${origin}/workspaces`,
  );
  const aliasAccount = await request("/account", undefined, aliasLogin.jar);
  assert.equal(
    aliasAccount.data.id,
    newId,
    "Stable provider subject identifies the same account",
  );
  assert.equal(
    aliasAccount.data.email,
    "new@example.com",
    "Enterprise claims do not overwrite global account email",
  );

  const verifier = "native-verifier-" + "a".repeat(43);
  const grant = await request(
    "/native/authorize",
    { challenge: digest(verifier), state: "s".repeat(43) },
    flow.jar,
  );
  assert.equal(grant.status, 200, JSON.stringify(grant.data));
  const code = new URL(grant.data.url).searchParams.get("code")!;
  const native = await request("/native/exchange", { code, verifier });
  assert.equal(native.status, 200, JSON.stringify(native.data));
  assert.equal(
    (
      await sessionFor(
        new Headers({ authorization: `Bearer ${native.data.token}` }),
      )
    )?.workspaceId,
    workspace,
  );
  assert.equal(
    (
      await request(
        `/workspaces/${otherWorkspace}`,
        undefined,
        new Map(),
        "GET",
        native.data.token,
      )
    ).status,
    403,
  );

  await db
    .update(schema.memberships)
    .set({ approved: false })
    .where(
      and(
        eq(schema.memberships.workspaceId, workspace),
        eq(schema.memberships.userId, newId),
      ),
    );
  assert.equal(
    (await request("/account", undefined, flow.jar)).status,
    401,
    "Revoked membership invalidates browser session",
  );
  assert.equal(
    (await request("/account", undefined, new Map(), "GET", native.data.token))
      .status,
    401,
    "Revoked membership invalidates native bearer",
  );
  const revokedLogin = await start();
  assert.notEqual(
    (await finish(revokedLogin)).location,
    `${origin}/workspaces`,
    "Disabled members cannot re-provision through SSO",
  );
  assert.equal(
    (await request("/account", undefined, revokedLogin.jar)).status,
    401,
  );
  await db
    .update(schema.memberships)
    .set({ approved: true })
    .where(
      and(
        eq(schema.memberships.workspaceId, workspace),
        eq(schema.memberships.userId, newId),
      ),
    );
  const pending = await start();
  assert.equal(
    (await request(endpoint, { enabled: false }, owner.jar, "PATCH")).status,
    200,
  );
  assert.deepEqual(
    (await request("/saas/login/example-team")).data,
    publicLogin,
    "Disabling a provider immediately removes it from public discovery",
  );
  assert.equal(
    (await request("/account", undefined, flow.jar)).status,
    401,
    "Disabling SSO invalidates its sessions",
  );
  assert.equal(
    (await request(endpoint, { enabled: true }, owner.jar, "PATCH")).status,
    200,
  );
  const before = exchanges;
  const stale = await finish(pending);
  assert.notEqual(
    stale.location,
    `${origin}/workspaces`,
    "Changed configuration invalidates in-flight state",
  );
  assert.equal(
    exchanges,
    before,
    "Stale state must fail before token exchange",
  );

  const otherSaved = await request(
    `/workspaces/${otherWorkspace}/oidc`,
    configuration,
    owner.jar,
    "PUT",
  );
  assert.equal(otherSaved.status, 200);
  dnsRecords.set(otherSaved.data.dnsName, [
    [saved.data.dnsValue],
    [otherSaved.data.dnsValue],
  ]);
  assert.equal(
    (
      await request(
        `/workspaces/${otherWorkspace}/oidc`,
        { enabled: true },
        owner.jar,
        "PATCH",
      )
    ).status,
    200,
  );
  const swapped = await start();
  const swapsBefore = exchanges;
  assert.notEqual(
    (await finish(swapped, {}, otherSaved.data.providerId)).location,
    `${origin}/workspaces`,
  );
  assert.equal(
    exchanges,
    swapsBefore,
    "Cross-provider state must fail before token exchange",
  );
  assert.equal((await request("/account", undefined, swapped.jar)).status, 401);
  assert.equal(
    (
      await request("/auth/sign-in/social", {
        provider: "google",
        idToken: { token: "forbidden" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/sign-in/social", {
        provider,
        idToken: { token: "forbidden" },
      })
    ).status,
    400,
  );
  const unverifiedGoogle = await start("google");
  assert.notEqual(
    (
      await finish(unverifiedGoogle, {
        email: "unverified-google@example.com",
        email_verified: false,
        sub: "unverified-google",
      })
    ).location,
    `${origin}/workspaces`,
    "Google email must be verified",
  );
  assert.equal(
    (await request("/account", undefined, unverifiedGoogle.jar)).status,
    401,
  );
  const thirdPartyGoogle = await start("google");
  const thirdPartyResult = await finish(thirdPartyGoogle, {
    email: existing.user.email,
    sub: "third-party-google",
  });
  assert.notEqual(
    thirdPartyResult.location,
    `${origin}/workspaces`,
    "Non-authoritative Google email cannot silently link an existing account",
  );
  assert.equal(
    (await request("/account", undefined, thirdPartyGoogle.jar)).status,
    401,
  );
  const [beforeRotation] = await db
    .select()
    .from(schema.workspaceOidc)
    .where(eq(schema.workspaceOidc.workspaceId, workspace));
  for (const change of [
    { issuer: "https://replacement.example.com" },
    { clientId: "replacement-client" },
    { domain: "replacement.example.com" },
  ]) {
    const blockedRotation = await request(
      endpoint,
      { ...configuration, ...change },
      owner.jar,
      "PUT",
    );
    assert.equal(
      blockedRotation.status,
      409,
      "Identity rotation must not strand active SSO-only members",
    );
    assert.match(blockedRotation.data.error, /SSO-only members/);
    const [unchanged] = await db
      .select()
      .from(schema.workspaceOidc)
      .where(eq(schema.workspaceOidc.workspaceId, workspace));
    assert.equal(unchanged.providerId, beforeRotation.providerId);
    assert.equal(unchanged.revision, beforeRotation.revision);
    assert.equal(
      unchanged.enabled,
      true,
      "Rejected rotation preserves the working connection",
    );
  }
  const secretOnlyRotation = await request(
    endpoint,
    {
      ...configuration,
      clientSecret: "replacement-secret-only",
    },
    owner.jar,
    "PUT",
  );
  assert.equal(
    secretOnlyRotation.status,
    200,
    "Client-secret rotation is allowed for SSO-only workspaces",
  );
  assert.equal(
    secretOnlyRotation.data.providerId,
    provider,
    "Secret rotation preserves linked identities",
  );
  assert.equal(
    secretOnlyRotation.data.enabled,
    false,
    "Updated credentials need explicit re-enabling",
  );

  const recovery = await start("google");
  const recoveryResult = await finish(recovery, {
    email: "new@example.com",
    hd: "example.com",
    sub: "google-recovery",
  });
  assert.equal(
    recoveryResult.location,
    `${origin}/workspaces`,
    JSON.stringify(recoveryResult),
  );
  const recovered = await request("/account", undefined, recovery.jar);
  assert.equal(
    recovered.data.id,
    newId,
    "Google Workspace may recover the same verified identity",
  );
  assert.equal(
    recovered.data.workspaceId,
    null,
    "Google produces a personal session, not an enterprise-scoped one",
  );
  assert.equal(
    (
      await sessionFor(
        new Headers({
          cookie: [...recovery.jar].map(([k, v]) => `${k}=${v}`).join("; "),
        }),
      )
    )?.session.method,
    "google",
  );

  const rotated = await request(
    endpoint,
    {
      ...configuration,
      clientId: "replacement-client",
      clientSecret: "replacement-secret",
    },
    owner.jar,
    "PUT",
  );
  assert.equal(
    rotated.status,
    200,
    "Identity rotation is allowed once all active members have Google/password recovery",
  );
  assert.notEqual(
    rotated.data.providerId,
    provider,
    "New client identity uses a new provider namespace",
  );
  assert.equal(rotated.data.enabled, false);
  const [oldLinkedAccount] = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.userId, newId),
        eq(schema.accounts.providerId, provider),
      ),
    );
  assert.ok(
    oldLinkedAccount,
    "Rotation must not silently relabel old provider subjects",
  );

  console.log(
    "OIDC integration passed: domain/DNS trust, PKCE/nonce/JWT, explicit linking, membership, scoped browser/native sessions, revocation, and state binding.",
  );
} finally {
  googleFetch.mockRestore();
  networkMock.mockRestore();
  dnsMock.mockRestore();
  await pool.end();
  await server.stop();
  await pg.close();
}
