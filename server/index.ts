import {
  and,
  or,
  eq,
  ne,
  lt,
  gt,
  desc,
  exists,
  notExists,
  inArray,
  sql,
  DrizzleQueryError,
} from "drizzle-orm";
import {
  accounts,
  users,
  sessions,
  officeSettings,
  workspaces,
  officeFiles,
  officeAudit,
} from "./schema";
import { Elysia, t } from "elysia";
import { auth, sessionFor, type AuthSession } from "./auth";
import { config, oidcConfigured, oidcProvider } from "./config";
import { db, settings, workspaceSettings } from "./db";
import { Office } from "./office";
import { mediaConfigured, retireRoom, setPresenter, tokenFor } from "./media";
import { Command } from "../shared/protocol";
import { AVATAR_PATTERN } from "../shared/appearance";
import { Whiteboards } from "./whiteboard";
import {
  storage,
  storageConfigured,
  storageInfo,
  checkStorage,
} from "./storage";
import {
  BOARD_MESSAGE_BYTES,
  boardScope,
  whiteboardEnabled,
} from "../shared/whiteboard";
import { ACTIVITY_ACTIONS } from "../shared/activity";
import { memberRoleSchema } from "../shared/forms";
import { MAPS } from "../shared/maps";

export const office = new Office(retireRoom, setPresenter, (event) => {
  void db
    .insert(officeAudit)
    .values({ ...event, createdAt: new Date(event.createdAt) })
    .catch(() => console.error("Could not persist office activity."));
});
office.configureWorkspace(await workspaceSettings());
export const whiteboards = new Whiteboards(office);
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

export const app = new Elysia({ serve: { maxRequestBodySize: 5_100_000 } })
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
  .get("/api/config", async () => ({
    ...(await settings()),
    workspace: office.workspace,
    ssoConfigured: oidcConfigured,
    provider: oidcProvider,
    mediaConfigured,
    storageConfigured,
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
      await db
        .update(users)
        .set({ mustChangePassword: false })
        .where(eq(users.id, identity.user.id));
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
      await db
        .update(users)
        .set({ name: body.name, avatar: body.avatar })
        .where(eq(users.id, s.user.id));
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
      const result = await db
        .update(workspaces)
        .set({
          name,
          mapId: body.mapId,
          revision: sql`${workspaces.revision}+1`,
        })
        .where(
          and(eq(workspaces.id, 1), eq(workspaces.revision, body.revision)),
        )
        .returning({
          name: workspaces.name,
          mapId: workspaces.mapId,
          revision: workspaces.revision,
          features: workspaces.features,
        });
      if (!result.length)
        throw new Error(
          "Workspace settings changed. Close and reopen settings before saving again.",
        );
      office.configureWorkspace(result[0]);
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
  .patch(
    "/api/admin/features",
    async ({ identity, body }) => {
      requireSession(identity, true);
      const result = await db
        .update(workspaces)
        .set({
          features: body.features,
          revision: sql`${workspaces.revision}+1`,
        })
        .where(
          and(eq(workspaces.id, 1), eq(workspaces.revision, body.revision)),
        )
        .returning({
          name: workspaces.name,
          mapId: workspaces.mapId,
          revision: workspaces.revision,
          features: workspaces.features,
        });
      if (!result.length)
        throw new Error(
          "Workspace settings changed. Close and reopen settings before saving again.",
        );
      office.configureWorkspace(result[0]);
      whiteboards.prune();
      return { workspace: office.workspace };
    },
    {
      body: t.Object({
        features: t.Object({ whiteboard: t.Boolean() }),
        revision: t.Integer({ minimum: 0 }),
      }),
    },
  )
  .get("/api/admin/storage", ({ identity }) => {
    requireSession(identity, true);
    return storageInfo();
  })
  .post("/api/admin/storage/check", async ({ identity }) => {
    requireSession(identity, true);
    try {
      return await checkStorage();
    } catch {
      throw new Error(
        "Cannot read, write and delete in the configured S3 bucket. Check its credentials and permissions.",
      );
    }
  })
  .get("/api/whiteboard/files", async ({ identity }) => {
    const session = requireSession(identity);
    const member = office.members.get(session.user.id);
    if (
      !member ||
      member.sessionId !== session.session.id ||
      !whiteboardEnabled(office.workspace)
    )
      throw new Error("Whiteboard access ended.");
    return db
      .select({
        id: officeFiles.id,
        name: officeFiles.name,
        size: officeFiles.size,
        createdAt: officeFiles.createdAt,
      })
      .from(officeFiles)
      .where(
        eq(officeFiles.boardId, boardScope(office.workspace.mapId, member)),
      )
      .orderBy(desc(officeFiles.createdAt))
      .limit(20);
  })
  .post(
    "/api/whiteboard/files",
    async ({ identity, request }) => {
      const session = requireSession(identity);
      const member = office.members.get(session.user.id);
      if (
        !member ||
        member.sessionId !== session.session.id ||
        !whiteboardEnabled(office.workspace)
      )
        throw new Error("Whiteboard access ended.");
      if (!storage) throw new Error("External S3 storage is not configured.");
      const scope = boardScope(office.workspace.mapId, member);
      const cooldown = `storage:${member.id}`;
      if (Date.now() < (office.cooldowns.get(cooldown) || 0))
        throw new Error(
          "Please wait a few seconds before saving another file.",
        );
      office.cooldowns.set(cooldown, Date.now() + 5000);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (
        request.headers.get("content-type") !== "image/png" ||
        bytes.length > 5_000_000 ||
        ![137, 80, 78, 71, 13, 10, 26, 10].every(
          (value, index) => bytes[index] === value,
        )
      )
        throw new Error("Upload a PNG snapshot smaller than 5 MB.");
      const id = crypto.randomUUID();
      const key = `whiteboards/${new Bun.CryptoHasher("sha256").update(scope).digest("hex")}/${id}.png`;
      const name = `whiteboard-${scope.replaceAll(":", "-")}-${Date.now()}.png`;
      try {
        await storage.write(key, bytes, { type: "image/png" });
        const current = office.members.get(member.id);
        if (
          !current ||
          current.sessionId !== session.session.id ||
          boardScope(office.workspace.mapId, current) !== scope ||
          !whiteboardEnabled(office.workspace)
        )
          throw new Error("Whiteboard access ended.");
        await db.insert(officeFiles).values({
          id,
          boardId: scope,
          objectKey: key,
          name,
          size: bytes.length,
          createdBy: member.id,
        });
      } catch (error) {
        await storage.delete(key).catch(() => {});
        throw error;
      }
      return { id, name, url: `/api/whiteboard/files/${id}` };
    },
    { parse: "none" },
  )
  .get(
    "/api/whiteboard/files/:id",
    async ({ identity, params, redirect }) => {
      const session = requireSession(identity);
      const member = office.members.get(session.user.id);
      if (
        !storage ||
        !member ||
        member.sessionId !== session.session.id ||
        !whiteboardEnabled(office.workspace)
      )
        throw new Error("Whiteboard access ended.");
      const result = await db
        .select({ objectKey: officeFiles.objectKey, name: officeFiles.name })
        .from(officeFiles)
        .where(
          and(
            eq(officeFiles.id, params.id),
            eq(officeFiles.boardId, boardScope(office.workspace.mapId, member)),
          ),
        );
      if (!result.length)
        throw new Error("File not found in your current area.");
      const file = result[0];
      return redirect(
        storage.presign(file.objectKey, {
          expiresIn: 60,
          contentDisposition: `attachment; filename="${file.name}"`,
        }),
      );
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .get("/api/admin/activity", async ({ identity, query, set }) => {
    requireSession(identity, true);
    set.headers["cache-control"] = "no-store";
    const before = query.before;
    if (
      before &&
      (!/^[1-9][0-9]{0,18}$/.test(before) ||
        BigInt(before) > 9223372036854775807n)
    )
      throw new Error("Invalid activity cursor.");
    const action = query.action;
    if (action && !Object.hasOwn(ACTIVITY_ACTIONS, action))
      throw new Error("Invalid activity filter.");
    const result = await db
      .select({
        id: officeAudit.id,
        actor: officeAudit.actor,
        actorName: sql<string>`coalesce(${officeAudit.actorName},${users.name},${officeAudit.actor})`,
        action: officeAudit.action,
        targetName: officeAudit.targetName,
        details: officeAudit.details,
        createdAt: officeAudit.createdAt,
      })
      .from(officeAudit)
      .leftJoin(users, eq(users.id, officeAudit.actor))
      .where(
        and(
          before ? lt(officeAudit.id, BigInt(before)) : undefined,
          action ? eq(officeAudit.action, action) : undefined,
        ),
      )
      .orderBy(desc(officeAudit.id))
      .limit(51);
    const entries = result
      .slice(0, 50)
      .map((row) => ({ ...row, id: row.id.toString() }));
    return {
      entries,
      nextCursor: result.length > 50 ? entries.at(-1)!.id : null,
    };
  })
  .patch(
    "/api/admin/users/:id/role",
    async ({ identity, params, body }) => {
      const s = requireSession(identity, true);
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
    requireSession(identity, true);
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
      await db
        .update(users)
        .set({ approved: true, mustChangePassword: true })
        .where(eq(users.id, result.user.id));
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
      const s = requireSession(identity, true);
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
          .set({ approved: body.approved })
          .where(eq(users.id, params.id));
        if (!body.approved)
          await tx.delete(sessions).where(eq(sessions.userId, params.id));
      });
      if (!body.approved) office.remove(params.id);
      return { ok: true };
    },
    { body: t.Object({ approved: t.Boolean() }) },
  )
  .delete("/api/admin/users/:id", async ({ identity, params }) => {
    const s = requireSession(identity, true);
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
      for (const row of removed) office.revokeSession(row.id);
      return settings();
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
  .ws("/api/whiteboard", {
    beforeHandle({ request, identity, set }) {
      if (request.headers.get("origin") !== config.origin) {
        set.status = 403;
        return "Untrusted origin";
      }
      const session = requireSession(identity);
      if (
        office.members.get(session.user.id)?.sessionId !== session.session.id
      ) {
        set.status = 403;
        return "Join the office first";
      }
    },
    maxPayloadLength: BOARD_MESSAGE_BYTES,
    idleTimeout: 60,
    async open(ws) {
      try {
        const s = requireSession(ws.data.identity);
        await whiteboards.open(
          ws.id,
          s.user.id,
          s.session.id,
          (event) => {
            ws.send(event);
          },
          () => ws.close(1008, "Whiteboard access ended"),
        );
      } catch {
        ws.send({ type: "error", message: "Unable to open this whiteboard." });
        ws.close(1008);
      }
    },
    async message(ws, raw) {
      try {
        await whiteboards.message(ws.id, raw);
      } catch (error) {
        ws.send({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to save whiteboard.",
        });
      }
    },
    close(ws) {
      whiteboards.remove(ws.id);
    },
  })
  .ws("/api/office", {
    query: t.Object({ takeover: t.Optional(t.Literal("1")) }),
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
        if (office.members.has(s.user.id) && ws.data.query.takeover !== "1") {
          ws.close(4001, "Office opened elsewhere");
          return;
        }
        office.add(
          s.user,
          s.session.id,
          new Date(s.session.expiresAt).getTime(),
          (event) => {
            ws.send(event);
          },
          (code, reason) => ws.close(code, reason),
          ws.id,
        );
        whiteboards.prune();
      } catch (error) {
        ws.send({
          type: "error",
          message:
            error instanceof DrizzleQueryError
              ? "Database request failed."
              : (error as Error).message,
        });
        ws.close();
      }
    },
    message(ws, raw) {
      const s = ws.data.identity;
      if (!s) return;
      const member = office.members.get(s.user.id);
      if (!member || member.connectionId !== ws.id) return;
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
          void db
            .update(users)
            .set({
              availability: result.data.status,
              statusText: result.data.text,
            })
            .where(eq(users.id, s.user.id))
            .catch(() => {});
      } catch (error) {
        ws.send({
          type: "error",
          message:
            error instanceof DrizzleQueryError
              ? "Database request failed."
              : (error as Error).message,
        });
      }
    },
    close(ws) {
      const s = ws.data.identity;
      if (s && office.members.get(s.user.id)?.connectionId === ws.id)
        office.remove(s.user.id);
    },
  });

if (import.meta.main) {
  app.listen({
    port: config.port,
    hostname: process.env.API_HOST || "127.0.0.1",
  });
  setInterval(() => office.tick(0.05), 50);
  setInterval(() => whiteboards.prune(), 1000);
  setInterval(() => {
    if (office.dirty) office.broadcast();
  }, 100);
  // Recheck database sessions to enforce expiry, logout, and policy changes on open sockets.
  setInterval(async () => {
    try {
      const ids = [...office.members.values()].map((m) => m.sessionId);
      if (!ids.length) return;
      const valid = await db
        .select({ id: sessions.id })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .innerJoin(officeSettings, eq(officeSettings.id, 1))
        .where(
          and(
            inArray(sessions.id, ids),
            gt(sessions.expiresAt, sql`now()`),
            eq(users.approved, true),
            or(
              and(
                eq(sessions.method, "password"),
                eq(officeSettings.password, true),
              ),
              and(eq(sessions.method, "sso"), eq(officeSettings.sso, true)),
            ),
          ),
        );
      const keep = new Set(valid.map((r) => r.id));
      for (const m of [...office.members.values()])
        if (!keep.has(m.sessionId)) office.remove(m.id);
    } catch {
      for (const m of [...office.members.values()]) office.remove(m.id);
    }
  }, 5000);
  console.log(`Office API listening on ${config.port}`);
}
