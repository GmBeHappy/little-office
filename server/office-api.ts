import { and, eq, lt, desc, sql, DrizzleQueryError } from "drizzle-orm";
import { users, workspaces, officeFiles, officeAudit } from "./schema";
import { Elysia, t, type AnyElysia } from "elysia";
import { sessionFor } from "./auth";
import {
  config,
  oidcConfigured,
  oidcProvider,
  googleConfigured,
} from "./config";
import { db, settings } from "./db";
import { mediaConfigured, tokenFor } from "./media";
import { Command } from "../shared/protocol";
import { AVATAR_PATTERN } from "../shared/appearance";

import { storage, storageConfigured } from "./storage";
import {
  BOARD_MESSAGE_BYTES,
  boardScope,
  whiteboardEnabled,
} from "../shared/whiteboard";
import { ACTIVITY_ACTIONS } from "../shared/activity";

import { MAPS } from "../shared/maps";
import { STATUS_ICONS } from "../shared/status";
import { mapDay } from "./daily-map";

import { nativeMap, nativeAvatar } from "./native-scene";
import { memberships } from "./schema";
import { DEFAULT_WORKSPACE_ID, PROTOCOL_VERSION } from "../shared/workspaces";
import { workspaceSession, manageWorkspace } from "./workspace-access";
import { requireSession, requireWorkspaceManager } from "./session-guards";
import { runtimeFor, runtimes } from "./workspace-runtime";
export function officeRoutes(scoped: boolean): AnyElysia {
  return new Elysia({
    prefix: scoped ? "/api/workspaces/:workspaceId" : "/api",
    name: scoped ? "workspace-office" : "legacy-office",
  })
    .derive(async ({ request }) => {
      const workspaceId = scoped
        ? new URL(request.url).pathname.split("/")[3]
        : DEFAULT_WORKSPACE_ID;
      const raw = await sessionFor(request.headers);
      const publicPath =
        !scoped &&
        ["/api/config", "/api/me"].includes(new URL(request.url).pathname);
      const identity = publicPath
        ? raw
        : await workspaceSession(raw, workspaceId);
      return { identity, ...(await runtimeFor(workspaceId)) };
    })
    .get("/config", async ({ office, workspaceId }) => ({
      ...(await settings()),
      workspace: office.workspace,
      workspaceId,
      protocolVersion: PROTOCOL_VERSION,
      ssoConfigured: oidcConfigured,
      googleConfigured,
      provider: oidcProvider,
      mediaConfigured,
      storageConfigured,
      officeName: "Little Office",
    }))
    .get("/scene", ({ office }) => ({
      ...nativeMap(office.workspace.mapId),
      revision: office.workspace.revision,
    }))
    .get("/avatar", ({ query }) => nativeAvatar(query.appearance || "sage"))
    .get("/whiteboard/context", ({ office, identity }) => {
      const member = identity && office.members.get(identity.user.id);
      if (!member || member.sessionId !== identity!.session.id)
        throw new Error("Join the office first.");
      return {
        scope: boardScope(office.workspace.mapId, member),
        name: office.workspace.name,
        userId: member.id,
        enabled: whiteboardEnabled(office.workspace),
        storageConfigured,
      };
    })
    .get("/me", async ({ identity, set, workspaceId }) => {
      if (!identity) {
        set.status = 401;
        return { error: "Not signed in." };
      }
      const [member] = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.userId, identity.user.id),
          ),
        );
      const user = member
        ? {
            ...identity.user,
            role: member.role,
            approved: member.approved,
            availability: member.availability,
            statusText: member.statusText,
            statusIcon: member.statusIcon,
          }
        : identity.user;
      return {
        user,
        method: identity.session.method,
        operator: !!process.env.OFFICE_OPERATOR_IDS?.split(",")
          .map((id) => id.trim())
          .includes(identity.user.id),
      };
    })
    .patch(
      "/profile",
      async ({ office, whiteboards, workspaceId, identity, body }) => {
        const s = requireSession(identity);
        if (
          identity!.workspaceId &&
          (body.name !== s.user.name || body.avatar !== s.user.avatar)
        )
          throw new Error(
            "Sign in with your personal account to change your name or avatar.",
          );
        await db
          .update(users)
          .set({
            name: body.name,
            avatar: body.avatar,
          })
          .where(eq(users.id, s.user.id));
        if (body.status !== undefined)
          await db
            .update(memberships)
            .set({
              availability: body.status,
              statusText: body.statusText ?? "",
              statusIcon: body.statusIcon ?? "",
            })
            .where(
              and(
                eq(memberships.workspaceId, workspaceId),
                eq(memberships.userId, s.user.id),
              ),
            );
        for (const runtime of runtimes.values()) {
          const person = runtime.office.members.get(s.user.id);
          if (person) {
            person.name = body.name;
            person.avatar = body.avatar as typeof person.avatar;
            runtime.office.broadcast();
          }
        }
        const member = office.members.get(s.user.id);
        if (member) {
          member.name = body.name;
          member.avatar =
            body.avatar as import("../shared/appearance").AvatarId;
          if (body.status !== undefined)
            office.handle(s.user.id, {
              type: "status",
              status: body.status,
              text: body.statusText ?? "",
              icon: body.statusIcon ?? "",
            });
          office.broadcast();
        }
        return { ok: true };
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 40 }),
          avatar: t.String({ pattern: AVATAR_PATTERN, maxLength: 32 }),
          status: t.Optional(
            t.Union([
              t.Literal("available"),
              t.Literal("busy"),
              t.Literal("dnd"),
              t.Literal("away"),
            ]),
          ),
          statusText: t.Optional(t.String({ maxLength: 80 })),
          statusIcon: t.Optional(
            t.Union(STATUS_ICONS.map((icon) => t.Literal(icon))),
          ),
        }),
      },
    )
    .patch(
      "/admin/workspace",
      async ({ office, whiteboards, workspaceId, identity, body }) => {
        requireWorkspaceManager(identity);
        const name = body.name.trim();
        if (!name) throw new Error("Enter a workspace name.");
        const result = await manageWorkspace(
          workspaceId,
          identity!.user.id,
          (tx) =>
            tx
              .update(workspaces)
              .set({
                name,
                mapId: body.mapId,
                ...(body.dailyMapEnabled === undefined
                  ? {}
                  : {
                      dailyMap: {
                        enabled: body.dailyMapEnabled,
                        date: mapDay(),
                      },
                    }),
                revision: sql`${workspaces.revision}+1`,
              })
              .where(
                and(
                  eq(workspaces.id, workspaceId),
                  eq(workspaces.revision, body.revision),
                ),
              )
              .returning({
                name: workspaces.name,
                mapId: workspaces.mapId,
                revision: workspaces.revision,
                features: workspaces.features,
                dailyMap: workspaces.dailyMap,
              }),
        );
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
          dailyMapEnabled: t.Optional(t.Boolean()),
          revision: t.Integer({ minimum: 0 }),
        }),
      },
    )
    .patch(
      "/admin/features",
      async ({ office, whiteboards, workspaceId, identity, body }) => {
        requireWorkspaceManager(identity);
        const result = await manageWorkspace(
          workspaceId,
          identity!.user.id,
          (tx) =>
            tx
              .update(workspaces)
              .set({
                features: sql`${workspaces.features} || ${JSON.stringify(body.features)}::jsonb`,
                revision: sql`${workspaces.revision}+1`,
              })
              .where(
                and(
                  eq(workspaces.id, workspaceId),
                  eq(workspaces.revision, body.revision),
                ),
              )
              .returning({
                name: workspaces.name,
                mapId: workspaces.mapId,
                revision: workspaces.revision,
                features: workspaces.features,
                dailyMap: workspaces.dailyMap,
              }),
        );
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
          features: t.Object({
            whiteboard: t.Boolean(),
            wildlife: t.Optional(t.Boolean()),
            activities: t.Optional(t.Boolean()),
          }),
          revision: t.Integer({ minimum: 0 }),
        }),
      },
    )
    .get(
      "/whiteboard/files",
      async ({ office, whiteboards, workspaceId, identity }) => {
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
            and(
              eq(officeFiles.workspaceId, workspaceId),
              eq(
                officeFiles.boardId,
                boardScope(office.workspace.mapId, member),
              ),
            ),
          )
          .orderBy(desc(officeFiles.createdAt))
          .limit(20);
      },
    )
    .post(
      "/whiteboard/files",
      async ({ office, whiteboards, workspaceId, identity, request }) => {
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
        const key = `workspaces/${config.mediaNamespace}/${workspaceId}/whiteboards/${new Bun.CryptoHasher("sha256").update(scope).digest("hex")}/${id}.png`;
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
            workspaceId,
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
        return {
          id,
          name,
          url: `/api/workspaces/${workspaceId}/whiteboard/files/${id}`,
        };
      },
      { parse: "none" },
    )
    .get(
      "/whiteboard/files/:id",
      async ({
        office,
        whiteboards,
        workspaceId,
        identity,
        params,
        redirect,
      }) => {
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
              and(
                eq(officeFiles.workspaceId, workspaceId),
                eq(
                  officeFiles.boardId,
                  boardScope(office.workspace.mapId, member),
                ),
              ),
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
    .get(
      "/admin/activity",
      async ({ office, whiteboards, workspaceId, identity, query, set }) => {
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
              eq(officeAudit.workspaceId, workspaceId),
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
      },
    )
    .post(
      "/media/token",
      async ({ office, whiteboards, workspaceId, identity, request }) => {
        const s = requireSession(identity);
        const m = office.members.get(s.user.id);
        if (!m || m.sessionId !== s.session.id || !m.room)
          throw new Error("Join a conversation first.");
        const room = m.room;
        const result = await tokenFor(
          room,
          m.id,
          m.name,
          office.presenters[m.conversation]?.includes(m.id) || false,
        );
        const valid = await workspaceSession(
          await sessionFor(request.headers),
          workspaceId,
        );
        const current = office.members.get(m.id);
        if (!current || current.room !== room || !valid)
          throw new Error("Conversation changed. Try again.");
        return result;
      },
    )
    .ws("/whiteboard", {
      beforeHandle({
        office,
        whiteboards,
        workspaceId,
        request,
        identity,
        set,
      }) {
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
        const { office, whiteboards, workspaceId } = ws.data;
        try {
          const s = await workspaceSession(
            await sessionFor(ws.data.request.headers),
            workspaceId,
          );
          if (ws.raw.readyState !== 1) return;
          await whiteboards.open(
            ws.id,
            s.user.id,
            s.session.id,
            (event) => {
              ws.send({
                ...(event as Record<string, unknown>),
                workspaceId,
                protocolVersion: PROTOCOL_VERSION,
              });
            },
            () => ws.close(1008, "Whiteboard access ended"),
          );
        } catch {
          ws.send({
            type: "error",
            message: "Unable to open this whiteboard.",
          });
          ws.close(1008);
        }
      },
      async message(ws, raw) {
        const { office, whiteboards, workspaceId } = ws.data;
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
        const { office, whiteboards, workspaceId } = ws.data;
        whiteboards.remove(ws.id);
      },
    })
    .ws("/office", {
      query: t.Object({
        takeover: t.Optional(t.Literal("1")),
        protocol: t.Optional(t.Literal("1")),
      }),
      beforeHandle({
        office,
        whiteboards,
        workspaceId,
        request,
        identity,
        set,
      }) {
        if (request.headers.get("origin") !== config.origin) {
          set.status = 403;
          return "Untrusted origin";
        }
        requireSession(identity);
      },
      maxPayloadLength: 2048,
      async open(ws) {
        const { office, whiteboards, workspaceId } = ws.data;
        try {
          const s = await workspaceSession(
            await sessionFor(ws.data.request.headers),
            workspaceId,
          );
          if (ws.raw.readyState !== 1) return;
          if (office.members.has(s.user.id) && ws.data.query.takeover !== "1") {
            ws.close(4001, "Office opened elsewhere");
            return;
          }
          office.add(
            s.user,
            s.session.id,
            new Date(s.session.expiresAt).getTime(),
            (event) => {
              ws.send({
                ...(event as Record<string, unknown>),
                workspaceId,
                protocolVersion: PROTOCOL_VERSION,
              });
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
        const { office, whiteboards, workspaceId } = ws.data;
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
              .update(memberships)
              .set({
                availability: result.data.status,
                statusText: result.data.text,
                ...(result.data.icon !== undefined
                  ? { statusIcon: result.data.icon }
                  : {}),
              })
              .where(
                and(
                  eq(memberships.workspaceId, workspaceId),
                  eq(memberships.userId, s.user.id),
                ),
              )
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
        const { office, whiteboards, workspaceId } = ws.data;
        const s = ws.data.identity;
        if (s && office.members.get(s.user.id)?.connectionId === ws.id)
          office.remove(s.user.id);
      },
    });
}
