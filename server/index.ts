import { serverLog, errorKind, requestRef } from "./diagnostics";
import { workspaceDomainApi } from "./workspace-domain-api";
import {
  hostFor,
  sameRequestOrigin,
  tenantPathAllowed,
  workspaceCookie,
  workspaceForHost,
} from "./workspace-domains";
import {
  and,
  or,
  eq,
  ne,
  gt,
  exists,
  notExists,
  sql,
  DrizzleQueryError,
} from "drizzle-orm";
import {
  accounts,
  users,
  sessions,
  officeSettings,
  officeAudit,
} from "./schema";
import { Elysia, t } from "elysia";
import { auth, googleAuth, authForWorkspace, sessionFor } from "./auth";
import { connectionFor } from "./workspace-oidc";
import { config, oidcConfigured, oidcProvider } from "./config";
import { db, settings } from "./db";

import { storageInfo, checkStorage } from "./storage";

import { memberRoleSchema } from "../shared/forms";

import { googleConfigured } from "./config";
import { memberships } from "./schema";
import { DEFAULT_WORKSPACE_ID } from "../shared/workspaces";
import { requireSession, recent } from "./session-guards";
import { Problem, requireOperator } from "./workspace-access";
import {
  defaultRuntime,
  revokeSession,
  revokeUser,
  startRuntimeTimers,
} from "./workspace-runtime";
import { officeRoutes } from "./office-api";
import { nativeApi } from "./native-api";
import { workspaceApi } from "./workspace-api";
import { workspaceOidcApi } from "./workspace-oidc-api";
export const { office, whiteboards } = defaultRuntime;
function isAuthPath(path: string) {
  return (
    [
      "/sign-in/username",
      "/sign-in/social",
      "/sign-out",
      "/get-session",
      "/change-password",
      "/link-social",
      "/list-accounts",
    ].includes(path) || path.startsWith("/callback/")
  );
}

export const app = new Elysia({ serve: { maxRequestBodySize: 5_100_000 } })
  .onRequest(async ({ request, set }) => {
    const path = new URL(request.url).pathname;
    if (
      path === "/api/health" &&
      request.method === "GET" &&
      hostFor(request) === `127.0.0.1:${config.port}`
    ) {
      await db.execute(sql`SELECT 1`);
      return { ok: true };
    }
    if (path === "/internal/tls-allow") {
      if (
        hostFor(request) !== `127.0.0.1:${config.port}` ||
        request.method !== "GET"
      )
        return new Response(null, { status: 403 });
      try {
        const workspace = await workspaceForHost(
          new URL(request.url).searchParams.get("domain") || "",
        );
        return new Response(null, { status: workspace ? 200 : 403 });
      } catch (error) {
        return new Response(null, {
          status: error instanceof Problem ? 403 : 503,
        });
      }
    }
    if (config.workspaceDomain) {
      const workspace = await workspaceForHost(hostFor(request));
      if (workspace && !tenantPathAllowed(path, workspace.id))
        throw new Problem(404, "Workspace route not found.");
      // Elysia/Bun normally supplies Host; keep in-process requests equally constrained.
      request.headers.set("host", hostFor(request));
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      !sameRequestOrigin(request)
    ) {
      set.status = 403;
      return { error: "Untrusted request origin." };
    }
  })
  .onError(({ error, set, code, request }) => {
    serverLog(
      "api.failed",
      {
        requestRef: requestRef(request),
        errorKind: errorKind(error),
        status:
          error instanceof Problem
            ? error.status
            : code === "NOT_FOUND"
              ? 404
              : error instanceof DrizzleQueryError &&
                  (error.cause as { code?: string })?.code === "23505"
                ? 409
                : 400,
      },
      "error",
    );
    if (error instanceof Problem) {
      set.status = error.status;
      return { error: error.message };
    }
    if (
      error instanceof DrizzleQueryError &&
      (error.cause as { code?: string })?.code === "23505"
    ) {
      set.status = 409;
      return { error: "That record already exists." };
    }
    set.status = code === "NOT_FOUND" ? 404 : 400;
    return {
      error:
        code === "VALIDATION"
          ? "Invalid request."
          : error instanceof DrizzleQueryError
            ? "Database request failed."
            : error instanceof Error
              ? error.message
              : "Request failed.",
    };
  })
  .get("/api/health", async () => {
    await db.execute(sql`SELECT 1`);
    return { ok: true };
  })
  .derive(async ({ request }) => ({
    identity: await sessionFor(request.headers),
  }))
  .all("/api/auth/*", async ({ request, identity, set }) => {
    const path = new URL(request.url).pathname.slice("/api/auth".length);
    const tenant = config.workspaceDomain
      ? await workspaceForHost(hostFor(request))
      : null;
    if (tenant && path === "/sign-out") {
      if (identity) {
        await db.delete(sessions).where(eq(sessions.id, identity.session.id));
        revokeSession(identity.session.id);
      }
      set.headers["set-cookie"] =
        `${workspaceCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
      return { success: true };
    }
    if (!isAuthPath(path)) {
      set.status = 404;
      return { error: "Not found." };
    }
    const policy = await settings();
    const socialBody =
      path.includes("social") && request.method === "POST"
        ? await request.clone().json()
        : null;
    const google =
      path === "/callback/google" || socialBody?.provider === "google";
    const providerId = path.startsWith("/callback/")
      ? path.slice("/callback/".length)
      : socialBody?.provider;
    const workspaceProvider =
      typeof providerId === "string" && /^ws-[a-f0-9-]{36}$/.test(providerId);
    const connection = workspaceProvider
      ? await connectionFor(providerId)
      : undefined;
    if (workspaceProvider && (!connection?.enabled || !connection.verifiedAt))
      throw new Problem(403, "Workspace SSO is unavailable.");
    if ((workspaceProvider || google) && socialBody?.idToken)
      throw new Problem(400, "Use the browser sign-in redirect.");
    if (
      identity?.workspaceId &&
      !["/sign-out", "/get-session", "/sign-in/social"].includes(path) &&
      !path.startsWith("/callback/")
    )
      throw new Problem(
        403,
        "Sign in with your personal account to manage account security.",
      );
    const sso =
      !google &&
      !workspaceProvider &&
      (path.includes("social") || path.startsWith("/callback/"));
    if (google && !googleConfigured) {
      set.status = 403;
      return { error: "Google sign-in is not configured." };
    }
    if (
      (sso && (!policy.sso || !oidcConfigured)) ||
      (path === "/sign-in/username" && !policy.password)
    ) {
      set.status = 403;
      return { error: "This login method is disabled." };
    }
    if (path === "/link-social") {
      if (!identity || identity.workspaceId || identity.user.mustChangePassword)
        throw new Problem(403, "Sign in with your personal account first.");
      recent(identity);
    }
    if (
      path === "/change-password" &&
      (!identity || !policy.password || identity.session.method !== "password")
    ) {
      set.status = 403;
      return { error: "Password login is unavailable for this session." };
    }
    const response = await (
      connection
        ? await authForWorkspace(connection)
        : google
          ? googleAuth
          : auth
    ).handler(request);
    if (path === "/change-password" && response.ok && identity)
      await db
        .update(users)
        .set({ mustChangePassword: false })
        .where(eq(users.id, identity.user.id));
    if (path === "/sign-out" && identity) revokeSession(identity.session.id);
    return response;
  })
  .get("/api/admin/storage", ({ identity }) => {
    requireOperator(requireSession(identity, true));
    return storageInfo();
  })
  .post("/api/admin/storage/check", async ({ identity }) => {
    requireOperator(requireSession(identity, true));
    try {
      return await checkStorage();
    } catch {
      throw new Error(
        "Cannot read, write and delete in the configured S3 bucket. Check its credentials and permissions.",
      );
    }
  })
  .patch(
    "/api/admin/users/:id/role",
    async ({ identity, params, body }) => {
      const s = requireOperator(requireSession(identity, true));
      recent(s);
      const { role } = memberRoleSchema.parse(body);
      if (params.id === s.user.id)
        throw new Error("You cannot change your own role.");
      await db.transaction(async (tx) => {
        await tx
          .select({ id: officeSettings.id })
          .from(officeSettings)
          .where(eq(officeSettings.id, 1))
          .for("update");
        const [actor] = await tx
          .select({ name: users.name })
          .from(users)
          .where(
            and(
              eq(users.id, s.user.id),
              eq(users.role, "owner"),
              eq(users.approved, true),
            ),
          );
        if (!actor) throw new Error("Owner access required.");
        const [target] = await tx
          .select({
            name: users.name,
            role: users.role,
            approved: users.approved,
          })
          .from(users)
          .where(eq(users.id, params.id))
          .for("update");
        if (!target?.approved)
          throw new Error("Approve this member before changing their role.");
        if (target.role !== role) {
          await tx.update(users).set({ role }).where(eq(users.id, params.id));
          await tx.insert(officeAudit).values({
            actor: s.user.id,
            actorName: actor.name,
            action: "member.role",
            targetName: target.name,
            details: { targetId: params.id, from: target.role, to: role },
          });
        }
      });
      await db
        .update(memberships)
        .set({ role })
        .where(
          and(
            eq(memberships.workspaceId, DEFAULT_WORKSPACE_ID),
            eq(memberships.userId, params.id),
          ),
        );
      const member = office.members.get(params.id);
      if (member) {
        member.role = role;
        member.send({ type: "user-updated" });
      }
      return { ok: true };
    },
    {
      body: t.Object({
        role: t.Union([t.Literal("owner"), t.Literal("member")]),
      }),
    },
  )
  .get("/api/admin/users", async ({ identity }) => {
    requireOperator(requireSession(identity, true));
    return db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        role: users.role,
        approved: users.approved,
        localPassword: sql<boolean>`${exists(
          db
            .select({ id: accounts.id })
            .from(accounts)
            .where(
              and(
                eq(accounts.userId, users.id),
                eq(accounts.providerId, "credential"),
              ),
            ),
        )}
        AND ${notExists(
          db
            .select({ id: accounts.id })
            .from(accounts)
            .where(
              and(
                eq(accounts.userId, users.id),
                ne(accounts.providerId, "credential"),
              ),
            ),
        )}`,
      })
      .from(users)
      .orderBy(users.createdAt);
  })
  .post(
    "/api/admin/users",
    async ({ identity, body }) => {
      const s = requireOperator(requireSession(identity, true));
      recent(s);
      if (!(await settings()).password)
        throw new Error(
          "Enable password login before creating a local account.",
        );
      const result = await auth.api.signUpEmail({
        body: {
          email: `${body.username.toLowerCase()}@local.invalid`,
          username: body.username,
          name: body.name,
          password: body.password,
        },
      });
      await db
        .update(users)
        .set({ approved: true, mustChangePassword: true })
        .where(eq(users.id, result.user.id));
      await db
        .update(memberships)
        .set({ approved: true })
        .where(
          and(
            eq(memberships.workspaceId, DEFAULT_WORKSPACE_ID),
            eq(memberships.userId, result.user.id),
          ),
        );
      await db.insert(officeAudit).values({
        actor: s.user.id,
        action: `Created local member ${result.user.id}`,
      });
      return { ok: true };
    },
    {
      body: t.Object({
        username: t.String({ pattern: "^[a-zA-Z0-9_]{3,30}$" }),
        name: t.String({ minLength: 1, maxLength: 40 }),
        password: t.String({ minLength: 12, maxLength: 128 }),
      }),
    },
  )
  .patch(
    "/api/admin/users/:id",
    async ({ identity, params, body }) => {
      const s = requireOperator(requireSession(identity, true));
      if (params.id === s.user.id)
        throw new Error("You cannot disable your own account.");
      await db.transaction(async (tx) => {
        await tx
          .select({ id: officeSettings.id })
          .from(officeSettings)
          .where(eq(officeSettings.id, 1))
          .for("update");
        const [actor] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, s.user.id),
              eq(users.role, "owner"),
              eq(users.approved, true),
            ),
          );
        if (!actor) throw new Error("Owner access required.");
        await tx
          .update(users)
          .set({ approved: body.approved, disabled: !body.approved })
          .where(eq(users.id, params.id));
        if (!body.approved)
          await tx.delete(sessions).where(eq(sessions.userId, params.id));
      });
      await db
        .update(memberships)
        .set({ approved: body.approved })
        .where(
          and(
            eq(memberships.workspaceId, DEFAULT_WORKSPACE_ID),
            eq(memberships.userId, params.id),
          ),
        );
      if (!body.approved) revokeUser(params.id);
      return { ok: true };
    },
    { body: t.Object({ approved: t.Boolean() }) },
  )
  .delete("/api/admin/users/:id", async ({ identity, params }) => {
    const s = requireOperator(requireSession(identity, true));
    recent(s);
    await db.transaction(async (tx) => {
      const removed = await tx
        .delete(users)
        .where(
          and(
            eq(users.id, params.id),
            eq(users.role, "member"),
            ne(users.id, s.user.id),
          ),
        )
        .returning({ id: users.id });
      if (!removed.length)
        throw new Error("Member not found or owner account protected.");
      await tx
        .insert(officeAudit)
        .values({ actor: s.user.id, action: `Deleted member ${params.id}` });
    });
    revokeUser(params.id);
    return { ok: true };
  })
  .post(
    "/api/admin/reset-password",
    async ({ identity, body }) => {
      const s = requireOperator(requireSession(identity, true));
      recent(s);
      if (!(await settings()).password)
        throw new Error("Password login is disabled.");
      const hash = await Bun.password.hash(body.password, {
        algorithm: "argon2id",
        memoryCost: 19456,
        timeCost: 2,
      });
      await db.transaction(async (tx) => {
        const result = await tx
          .update(accounts)
          .set({ password: hash })
          .where(
            and(
              eq(accounts.userId, body.userId),
              eq(accounts.providerId, "credential"),
              notExists(
                tx
                  .select({ id: accounts.id })
                  .from(accounts)
                  .where(
                    and(
                      eq(accounts.userId, body.userId),
                      ne(accounts.providerId, "credential"),
                    ),
                  ),
              ),
            ),
          )
          .returning({ id: accounts.id });
        if (!result.length)
          throw new Error(
            "Only local password accounts can be reset here. Manage SSO passwords with your identity provider.",
          );
        await tx
          .update(users)
          .set({ mustChangePassword: true })
          .where(eq(users.id, body.userId));
        await tx.delete(sessions).where(eq(sessions.userId, body.userId));
        await tx.insert(officeAudit).values({
          actor: s.user.id,
          action: `Reset local password for ${body.userId}`,
        });
      });
      revokeUser(body.userId);
      return { ok: true };
    },
    {
      body: t.Object({
        userId: t.String(),
        password: t.String({ minLength: 12, maxLength: 128 }),
      }),
    },
  )
  .patch(
    "/api/admin/auth",
    async ({ identity, body }) => {
      const s = requireOperator(requireSession(identity, true));
      recent(s);
      const removed = await db.transaction(async (tx) => {
        await tx
          .select({ id: officeSettings.id })
          .from(officeSettings)
          .where(eq(officeSettings.id, 1))
          .for("update");
        if (!body.password && !body.sso)
          throw new Error("At least one login method must remain enabled.");
        if (body.sso && !oidcConfigured)
          throw new Error("Configure OIDC on the server before enabling SSO.");
        if (!body.password) {
          const verified = await tx
            .select({ id: sessions.id })
            .from(sessions)
            .innerJoin(users, eq(users.id, sessions.userId))
            .innerJoin(accounts, eq(accounts.userId, users.id))
            .where(
              and(
                eq(sessions.method, "sso"),
                gt(sessions.expiresAt, sql`now()`),
                eq(users.role, "owner"),
                eq(users.approved, true),
                eq(accounts.providerId, oidcProvider),
              ),
            )
            .limit(1);
          if (!verified.length)
            throw new Error(
              "An owner must successfully sign in with the configured SSO before disabling passwords.",
            );
        }
        if (!body.sso) {
          const owner = await tx
            .select({ id: accounts.id })
            .from(accounts)
            .innerJoin(users, eq(users.id, accounts.userId))
            .where(
              and(
                eq(accounts.providerId, "credential"),
                eq(users.role, "owner"),
                eq(users.approved, true),
              ),
            )
            .limit(1);
          if (!owner.length)
            throw new Error(
              "Keep an owner account with password access before disabling SSO.",
            );
        }
        await tx
          .update(officeSettings)
          .set({
            password: body.password,
            sso: body.sso,
            version: sql`${officeSettings.version}+1`,
          })
          .where(eq(officeSettings.id, 1));
        const removed = await tx
          .delete(sessions)
          .where(
            or(
              and(eq(sessions.method, "password"), sql`${!body.password}`),
              and(eq(sessions.method, "sso"), sql`${!body.sso}`),
            ),
          )
          .returning({ id: sessions.id });
        await tx.insert(officeAudit).values({
          actor: s.user.id,
          action: `Login methods: password=${body.password}, sso=${body.sso}`,
        });
        return removed;
      });
      for (const row of removed) revokeSession(row.id);
      return settings();
    },
    { body: t.Object({ password: t.Boolean(), sso: t.Boolean() }) },
  )
  .use(workspaceDomainApi)
  .use(nativeApi)
  .use(workspaceOidcApi)
  .use(workspaceApi)
  .use(officeRoutes(false))
  .use(officeRoutes(true));

if (import.meta.main) {
  app.listen({
    port: config.port,
    hostname: process.env.API_HOST || "127.0.0.1",
  });
  startRuntimeTimers();
  console.log(`Office API listening on ${config.port}`);
}
