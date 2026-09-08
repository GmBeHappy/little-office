import { Elysia, t } from "elysia";
import { auth, sessionFor, type AuthSession } from "./auth";
import { config, oidcConfigured, oidcProvider } from "./config";
import { db, settings, workspaceSettings } from "./db";
import { Office } from "./office";
import { mediaConfigured, retireRoom, setPresenter, tokenFor } from "./media";
import { Command } from "../shared/protocol";
import { AVATAR_PATTERN } from "../shared/appearance";
import { MAPS } from "../shared/maps";

export const office = new Office(retireRoom, setPresenter);
office.configureWorkspace(await workspaceSettings());
function requireSession(s: AuthSession | null, owner = false) {
  if (!s) throw new Error("Please sign in.");
  if (!s.user.approved) throw new Error("Your account is awaiting approval.");
  if (s.user.mustChangePassword)
    throw new Error(
      "Change your temporary password before entering the office.",
    );
  if (owner && s.user.role !== "owner")
    throw new Error("Owner access required.");
  return s;
}
function recent(s: AuthSession) {
  if (Date.now() - new Date(s.session.createdAt).getTime() > 600000)
    throw new Error("Sign in again before changing authentication settings.");
}
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

export const app = new Elysia({ serve: { maxRequestBodySize: 16384 } })
  .onRequest(({ request, set }) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      request.headers.get("origin") !== config.origin
    ) {
      set.status = 403;
      return { error: "Untrusted request origin." };
    }
  })
  .onError(({ error, set, code }) => {
    set.status = code === "VALIDATION" ? 400 : 400;
    return {
      error:
        code === "VALIDATION"
          ? "Invalid request."
          : error instanceof Error
            ? error.message
            : "Request failed.",
    };
  })
  .get("/api/health", async () => {
    await db.query("SELECT 1");
    return { ok: true };
  })
  .get("/api/config", async () => ({
    ...(await settings()),
    workspace: office.workspace,
    ssoConfigured: oidcConfigured,
    provider: oidcProvider,
    mediaConfigured,
    officeName: "Little Office",
  }))
  .derive(async ({ request }) => ({
    identity: await sessionFor(request.headers),
  }))
  .all("/api/auth/*", async ({ request, identity, set }) => {
    const path = new URL(request.url).pathname.slice("/api/auth".length);
    if (!isAuthPath(path)) {
      set.status = 404;
      return { error: "Not found." };
    }
    const policy = await settings();
    const sso = path.includes("social") || path.startsWith("/callback/");
    if (
      (sso && (!policy.sso || !oidcConfigured)) ||
      (path === "/sign-in/username" && !policy.password)
    ) {
      set.status = 403;
      return { error: "This login method is disabled." };
    }
    if (path === "/link-social") {
      recent(requireSession(identity));
    }
    if (
      path === "/change-password" &&
      (!identity || !policy.password || identity.session.method !== "password")
    ) {
      set.status = 403;
      return { error: "Password login is unavailable for this session." };
    }
    const response = await auth.handler(request);
    if (path === "/change-password" && response.ok && identity)
      await db.query(
        'UPDATE "user" SET "mustChangePassword"=false WHERE id=$1',
        [identity.user.id],
      );
    if (path === "/sign-out" && identity)
      office.revokeSession(identity.session.id);
    return response;
  })
  .get("/api/me", ({ identity, set }) => {
    if (!identity) {
      set.status = 401;
      return { error: "Not signed in." };
    }
    return { user: identity.user, method: identity.session.method };
  })
  .patch(
    "/api/profile",
    async ({ identity, body }) => {
      const s = requireSession(identity);
      await db.query('UPDATE "user" SET name=$1, avatar=$2 WHERE id=$3', [
        body.name,
        body.avatar,
        s.user.id,
      ]);
      const member = office.members.get(s.user.id);
      if (member) {
        member.name = body.name;
        member.avatar = body.avatar as import("../shared/appearance").AvatarId;
        office.broadcast();
      }
      return { ok: true };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 40 }),
        avatar: t.String({ pattern: AVATAR_PATTERN, maxLength: 32 }),
      }),
    },
  )
  .patch(
    "/api/admin/workspace",
    async ({ identity, body }) => {
      requireSession(identity, true);
      const name = body.name.trim();
      if (!name) throw new Error("Enter a workspace name.");
      const result = await db.query(
        'UPDATE workspace_settings SET name=$1, map_id=$2, revision=revision+1 WHERE id=1 AND revision=$3 RETURNING name, map_id AS "mapId", revision',
        [name, body.mapId, body.revision],
      );
      if (!result.rows.length)
        throw new Error(
          "Workspace settings changed. Close and reopen settings before saving again.",
        );
      office.configureWorkspace(result.rows[0]);
      return { workspace: office.workspace };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 60 }),
        mapId: t.Union(MAPS.map((map) => t.Literal(map.id))),
        revision: t.Integer({ minimum: 0 }),
      }),
    },
  )
  .get("/api/admin/users", async ({ identity }) => {
    requireSession(identity, true);
    return (
      await db.query(
        `SELECT u.id,u.name,u.username,u.role,u.approved,
          EXISTS(SELECT 1 FROM account a WHERE a."userId"=u.id AND a."providerId"='credential')
          AND NOT EXISTS(SELECT 1 FROM account a WHERE a."userId"=u.id AND a."providerId"<>'credential') AS "localPassword"
         FROM "user" u ORDER BY u."createdAt"`,
      )
    ).rows;
  })
  .post(
    "/api/admin/users",
    async ({ identity, body }) => {
      const s = requireSession(identity, true);
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
      await db.query(
        'UPDATE "user" SET approved=true,"mustChangePassword"=true WHERE id=$1',
        [result.user.id],
      );
      await db.query("INSERT INTO office_audit(actor,action) VALUES($1,$2)", [
        s.user.id,
        `Created local member ${result.user.id}`,
      ]);
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
      const s = requireSession(identity, true);
      if (params.id === s.user.id)
        throw new Error("You cannot disable your own account.");
      await db.query('UPDATE "user" SET approved=$1 WHERE id=$2', [
        body.approved,
        params.id,
      ]);
      if (!body.approved) {
        await db.query('DELETE FROM session WHERE "userId"=$1', [params.id]);
        office.remove(params.id);
      }
      return { ok: true };
    },
    { body: t.Object({ approved: t.Boolean() }) },
  )
  .delete("/api/admin/users/:id", async ({ identity, params }) => {
    const s = requireSession(identity, true);
    recent(s);
    const connection = await db.connect();
    try {
      await connection.query("BEGIN");
      const result = await connection.query(
        "DELETE FROM \"user\" WHERE id=$1 AND role='member' AND id<>$2 RETURNING id",
        [params.id, s.user.id],
      );
      if (!result.rowCount)
        throw new Error("Member not found or owner account protected.");
      await connection.query(
        "INSERT INTO office_audit(actor,action) VALUES($1,$2)",
        [s.user.id, `Deleted member ${params.id}`],
      );
      await connection.query("COMMIT");
    } catch (e) {
      await connection.query("ROLLBACK");
      throw e;
    } finally {
      connection.release();
    }
    office.remove(params.id);
    return { ok: true };
  })
  .post(
    "/api/admin/reset-password",
    async ({ identity, body }) => {
      const s = requireSession(identity, true);
      recent(s);
      if (!(await settings()).password)
        throw new Error("Password login is disabled.");
      const hash = await Bun.password.hash(body.password, {
        algorithm: "argon2id",
        memoryCost: 19456,
        timeCost: 2,
      });
      const connection = await db.connect();
      try {
        await connection.query("BEGIN");
        const result = await connection.query(
          `UPDATE account SET password=$1 WHERE "userId"=$2 AND "providerId"='credential'
           AND NOT EXISTS(SELECT 1 FROM account a WHERE a."userId"=$2 AND a."providerId"<>'credential') RETURNING id`,
          [hash, body.userId],
        );
        if (!result.rowCount)
          throw new Error(
            "Only local password accounts can be reset here. Manage SSO passwords with your identity provider.",
          );
        await connection.query(
          'UPDATE "user" SET "mustChangePassword"=true WHERE id=$1',
          [body.userId],
        );
        await connection.query('DELETE FROM session WHERE "userId"=$1', [
          body.userId,
        ]);
        await connection.query(
          "INSERT INTO office_audit(actor,action) VALUES($1,$2)",
          [s.user.id, `Reset local password for ${body.userId}`],
        );
        await connection.query("COMMIT");
      } catch (e) {
        await connection.query("ROLLBACK");
        throw e;
      } finally {
        connection.release();
      }
      office.remove(body.userId);
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
      const s = requireSession(identity, true);
      recent(s);
      const connection = await db.connect();
      try {
        await connection.query("BEGIN");
        await connection.query(
          "SELECT id FROM office_settings WHERE id=1 FOR UPDATE",
        );
        if (!body.password && !body.sso)
          throw new Error("At least one login method must remain enabled.");
        if (body.sso && !oidcConfigured)
          throw new Error("Configure OIDC on the server before enabling SSO.");
        if (!body.password) {
          const verified = await connection.query(
            'SELECT s.id FROM session s JOIN "user" u ON u.id=s."userId" JOIN account a ON a."userId"=u.id WHERE s.method=\'sso\' AND s."expiresAt">now() AND u.role=\'owner\' AND u.approved=true AND a."providerId"=$1 LIMIT 1',
            [oidcProvider],
          );
          if (!verified.rowCount)
            throw new Error(
              "An owner must successfully sign in with the configured SSO before disabling passwords.",
            );
        }
        if (!body.sso) {
          const owner = await connection.query(
            'SELECT a.id FROM account a JOIN "user" u ON u.id=a."userId" WHERE a."providerId"=\'credential\' AND u.role=\'owner\' AND u.approved=true LIMIT 1',
          );
          if (!owner.rowCount)
            throw new Error(
              "Keep an owner account with password access before disabling SSO.",
            );
        }
        await connection.query(
          "UPDATE office_settings SET password=$1,sso=$2,version=version+1 WHERE id=1",
          [body.password, body.sso],
        );
        const removed = await connection.query(
          "DELETE FROM session WHERE (method='password' AND NOT $1) OR (method='sso' AND NOT $2) RETURNING id",
          [body.password, body.sso],
        );
        await connection.query(
          "INSERT INTO office_audit(actor,action) VALUES($1,$2)",
          [
            s.user.id,
            `Login methods: password=${body.password}, sso=${body.sso}`,
          ],
        );
        await connection.query("COMMIT");
        for (const row of removed.rows) office.revokeSession(row.id);
        return await settings();
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    },
    { body: t.Object({ password: t.Boolean(), sso: t.Boolean() }) },
  )
  .post("/api/media/token", async ({ identity, request }) => {
    const s = requireSession(identity);
    const m = office.members.get(s.user.id);
    if (!m || m.sessionId !== s.session.id || !m.room)
      throw new Error("Join a conversation first.");
    const room = m.room;
    const result = await tokenFor(
      room,
      m.id,
      m.name,
      office.presenters[m.conversation] === m.id,
    );
    const current = office.members.get(m.id);
    if (
      !current ||
      current.room !== room ||
      !(await sessionFor(request.headers))
    )
      throw new Error("Conversation changed. Try again.");
    return result;
  })
  .ws("/api/office", {
    beforeHandle({ request, identity, set }) {
      if (request.headers.get("origin") !== config.origin) {
        set.status = 403;
        return "Untrusted origin";
      }
      requireSession(identity);
    },
    maxPayloadLength: 2048,
    open(ws) {
      try {
        const s = requireSession(ws.data.identity);
        office.add(
          s.user,
          s.session.id,
          new Date(s.session.expiresAt).getTime(),
          (event) => {
            ws.send(event);
          },
          () => ws.close(),
        );
        (ws.data as typeof ws.data & { connected: boolean }).connected = true;
      } catch (error) {
        ws.send({ type: "error", message: (error as Error).message });
        ws.close();
      }
    },
    message(ws, raw) {
      const s = ws.data.identity;
      if (!s) return;
      const member = office.members.get(s.user.id);
      if (!member || member.sessionId !== s.session.id) return;
      const result = Command.safeParse(raw);
      if (!result.success) {
        ws.send({ type: "error", message: "Invalid office message." });
        return;
      }
      const count = ws.data as typeof ws.data & {
        rate?: { count: number; at: number };
      };
      if (!count.rate || Date.now() - count.rate.at > 1000)
        count.rate = { count: 0, at: Date.now() };
      if (++count.rate.count > 40) {
        ws.close();
        return;
      }
      try {
        office.handle(s.user.id, result.data);
        if (result.data.type === "status")
          db.query(
            'UPDATE "user" SET availability=$1,"statusText"=$2 WHERE id=$3',
            [result.data.status, result.data.text, s.user.id],
          ).catch(() => {});
      } catch (error) {
        ws.send({ type: "error", message: (error as Error).message });
      }
    },
    close(ws) {
      const s = ws.data.identity;
      if (
        (ws.data as typeof ws.data & { connected?: boolean }).connected &&
        s &&
        office.members.get(s.user.id)?.sessionId === s.session.id
      )
        office.remove(s.user.id);
    },
  });

if (import.meta.main) {
  app.listen({
    port: config.port,
    hostname: process.env.API_HOST || "127.0.0.1",
  });
  setInterval(() => office.tick(0.05), 50);
  setInterval(() => {
    if (office.dirty) office.broadcast();
  }, 100);
  // Recheck database sessions to enforce expiry, logout, and policy changes on open sockets.
  setInterval(async () => {
    try {
      const ids = [...office.members.values()].map((m) => m.sessionId);
      if (!ids.length) return;
      const valid = await db.query(
        'SELECT s.id FROM session s JOIN "user" u ON u.id=s."userId" JOIN office_settings p ON p.id=1 WHERE s.id=ANY($1::text[]) AND s."expiresAt">now() AND u.approved AND ((s.method=\'password\' AND p.password) OR (s.method=\'sso\' AND p.sso))',
        [ids],
      );
      const keep = new Set(valid.rows.map((r) => r.id));
      for (const m of [...office.members.values()])
        if (!keep.has(m.sessionId)) office.remove(m.id);
    } catch {
      for (const m of [...office.members.values()]) office.remove(m.id);
    }
  }, 5000);
  console.log(`Office API listening on ${config.port}`);
}
