import { sameRequestOrigin } from "./workspace-domains";
import { MAPS } from "../shared/maps";
import { Elysia, type AnyElysia } from "elysia";
import { and, eq, gt, isNull, sql, count, desc } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { sessionFor } from "./auth";
import { Problem } from "./workspace-access";
import { refreshWorkspace, revokeMember } from "./workspace-runtime";
import type { WorkspaceRole as Role } from "../shared/workspaces";
import { config, googleConfigured } from "./config";
import {
  users,
  workspaces,
  memberships,
  invitations,
  workspaceOidc,
} from "./schema";
import {
  workspaceForm,
  invitationForm,
  roleForm,
  tokenForm,
} from "../shared/saas/forms";
const uuid = z.uuid();
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function membership(
  tx: typeof db | Transaction,
  id: string,
  userId: string,
) {
  const [member] = await tx
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, uuid.parse(id)),
        eq(memberships.userId, userId),
      ),
    );
  if (!member) throw new Problem(404, "Workspace not found.");
  if (!member.approved)
    throw new Problem(403, "Your membership is awaiting approval.");
  return member;
}
async function locked(tx: Transaction, id: string, userId: string) {
  await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, uuid.parse(id)))
    .for("update");
  return membership(tx, id, userId);
}
function manager(role: Role) {
  if (role === "member")
    throw new Problem(403, "Workspace administrator access required.");
}
const rates = new Map<string, { until: number; count: number }>();
export const workspaceApi: AnyElysia = new Elysia({
  name: "workspace-management",
})
  .onRequest(({ request, set }) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      !sameRequestOrigin(request)
    ) {
      set.status = 403;
      return { error: "Untrusted request origin." };
    }
    set.headers["cache-control"] = "no-store";
  })
  .onError(({ error, set, code }) => {
    if (error instanceof Problem) {
      set.status = error.status;
      return { error: error.message };
    }
    if (
      error instanceof z.ZodError ||
      code === "VALIDATION" ||
      code === "PARSE"
    ) {
      set.status = 400;
      return { error: "Check the submitted fields." };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found." };
    }
    const cause =
      "cause" in error ? (error.cause as { code?: string }) : undefined;
    if (cause?.code === "23505") {
      set.status = 409;
      return { error: "That workspace address is already taken." };
    }
    set.status = 500;
    console.error("SaaS request failed.");
    return { error: "Something went wrong. Please try again." };
  })
  .get("/api/saas/config", () => ({
    googleConfigured,
    officeReady: true,
    portalOrigin: config.origin,
    workspaceBaseDomain: config.workspaceDomain || null,
    maps: MAPS.filter((m) => m.size === "small").map(({ id, name }) => ({
      id,
      name,
    })),
    maxOwnedWorkspaces: 5,
    maxMembers: 50,
  }))
  .derive(async ({ request }) => ({
    identity: await sessionFor(request.headers),
  }))
  .onBeforeHandle(({ identity, request }) => {
    if (!identity) throw new Problem(401, "Please sign in.");
    if (identity.workspaceId) {
      const path = new URL(request.url).pathname;
      if (
        !["/api/account", "/api/workspaces"].includes(path) &&
        !path.startsWith(`/api/workspaces/${identity.workspaceId}/`) &&
        path !== `/api/workspaces/${identity.workspaceId}`
      )
        throw new Problem(403, "This SSO session is limited to its workspace.");
      if (path === "/api/workspaces" && request.method !== "GET")
        throw new Problem(
          403,
          "Sign in with your personal account to create a workspace.",
        );
    }
    if (identity.user.mustChangePassword)
      throw new Problem(403, "Change your temporary password first.");
    if (request.method !== "GET") {
      const now = Date.now();
      if (rates.size > 10000)
        for (const [key, value] of rates)
          if (value.until <= now) rates.delete(key);
      const key = identity.user.id,
        current = rates.get(key);
      if (!current || current.until <= now)
        rates.set(key, { until: now + 60000, count: 1 });
      else if (++current.count > 30)
        throw new Problem(429, "Too many changes. Try again in a minute.");
    }
  })
  .onAfterHandle(async ({ request, set }) => {
    if (typeof set.status === "number" && set.status >= 400) return;
    const match = new URL(request.url).pathname.match(
      /^\/api\/workspaces\/([^/]+)(?:\/members\/([^/]+))?$/,
    );
    if (match && ["PATCH", "DELETE"].includes(request.method)) {
      if (match[2]) await revokeMember(match[1], match[2]);
      else await refreshWorkspace(match[1]);
    }
  })
  .get("/api/account", ({ identity }) => ({
    id: identity!.user.id,
    name: identity!.user.name,
    email: identity!.user.email,
    image: identity!.user.image,
    workspaceId: identity!.workspaceId,
  }))
  .get("/api/workspaces", async ({ identity }) =>
    db
      .select({
        id: workspaces.id,
        slug: workspaces.slug,
        name: workspaces.name,
        mapId: workspaces.mapId,
        role: memberships.role,
        approved: memberships.approved,
      })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(
        and(
          eq(memberships.userId, identity!.user.id),
          identity!.workspaceId
            ? eq(memberships.workspaceId, identity!.workspaceId)
            : undefined,
        ),
      )
      .orderBy(desc(workspaces.createdAt)),
  )
  .post("/api/workspaces", async ({ identity, body, set }) => {
    const input = workspaceForm.parse(body),
      userId = identity!.user.id;
    const result = await db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      const [owned] = await tx
        .select({ total: count() })
        .from(memberships)
        .where(
          and(eq(memberships.userId, userId), eq(memberships.role, "owner")),
        );
      if (owned.total >= 5)
        throw new Problem(409, "You can own up to 5 workspaces.");
      const [workspace] = await tx
        .insert(workspaces)
        .values({ ...input, id: crypto.randomUUID(), createdBy: userId })
        .returning();
      await tx
        .insert(memberships)
        .values({ workspaceId: workspace.id, userId, role: "owner" });
      return { ...workspace, role: "owner" };
    });
    set.status = 201;
    return result;
  })
  .get("/api/workspaces/:workspaceId", async ({ identity, params }) => {
    const member = await membership(db, params.workspaceId, identity!.user.id);
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, member.workspaceId));
    const people = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: memberships.role,
        approved: memberships.approved,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, member.workspaceId));
    const pending =
      member.role === "member"
        ? []
        : await db
            .select({
              id: invitations.id,
              email: invitations.email,
              role: invitations.role,
              expiresAt: invitations.expiresAt,
            })
            .from(invitations)
            .where(
              and(
                eq(invitations.workspaceId, member.workspaceId),
                isNull(invitations.consumedAt),
                gt(invitations.expiresAt, new Date()),
              ),
            );
    return {
      ...workspace,
      role: member.role,
      members: people,
      invitations: pending,
    };
  })
  .patch("/api/workspaces/:workspaceId", async ({ identity, params, body }) =>
    db.transaction(async (tx) => {
      const member = await locked(tx, params.workspaceId, identity!.user.id);
      manager(member.role);
      const input = workspaceForm.pick({ name: true, mapId: true }).parse(body);
      await tx
        .update(workspaces)
        .set({ ...input, revision: sql`${workspaces.revision}+1` })
        .where(eq(workspaces.id, params.workspaceId));
      return { ok: true };
    }),
  )
  .post(
    "/api/workspaces/:workspaceId/invitations",
    async ({ identity, params, body, set }) => {
      const input = invitationForm.parse(body),
        userId = identity!.user.id;
      const result = await db.transaction(async (tx) => {
        const member = await locked(tx, params.workspaceId, userId);
        manager(member.role);
        if (member.role === "admin" && input.role !== "member")
          throw new Problem(403, "Only owners can invite administrators.");
        const [active] = await tx
          .select({ total: count() })
          .from(invitations)
          .where(
            and(
              eq(invitations.workspaceId, params.workspaceId),
              isNull(invitations.consumedAt),
              gt(invitations.expiresAt, new Date()),
            ),
          );
        if (active.total >= 25)
          throw new Problem(409, "Revoke an invitation before creating more.");
        const existing = await tx
          .select({ id: users.id })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              eq(memberships.workspaceId, params.workspaceId),
              sql`lower(${users.email}) = ${input.email}`,
            ),
          );
        if (existing.length)
          throw new Problem(409, "This person is already a member.");
        const token = randomBytes(32).toString("hex"),
          expiresAt = new Date(Date.now() + 7 * 86400000);
        await tx.insert(invitations).values({
          id: crypto.randomUUID(),
          workspaceId: params.workspaceId,
          ...input,
          createdBy: userId,
          tokenHash: digest(token),
          expiresAt,
        });
        return {
          url: `${config.origin}/workspaces#invite=${token}`,
          expiresAt,
        };
      });
      set.status = 201;
      return result;
    },
  )
  .delete(
    "/api/workspaces/:workspaceId/invitations/:invitationId",
    async ({ identity, params }) =>
      db.transaction(async (tx) => {
        const member = await locked(tx, params.workspaceId, identity!.user.id);
        manager(member.role);
        await tx
          .delete(invitations)
          .where(
            and(
              eq(invitations.id, uuid.parse(params.invitationId)),
              eq(invitations.workspaceId, params.workspaceId),
            ),
          );
        return { ok: true };
      }),
  )
  .post("/api/invitations/accept", async ({ identity, body }) => {
    if (!identity!.user.emailVerified)
      throw new Problem(
        403,
        "Verify the invited email address before accepting.",
      );
    const { token } = tokenForm.parse(body),
      hash = digest(token);
    return db.transaction(async (tx) => {
      const [hint] = await tx
        .select({ workspaceId: invitations.workspaceId })
        .from(invitations)
        .where(eq(invitations.tokenHash, hash));
      if (!hint)
        throw new Problem(404, "Invitation not found or no longer valid.");
      await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, hint.workspaceId))
        .for("update");
      const [invite] = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.tokenHash, hash),
            isNull(invitations.consumedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .for("update");
      if (!invite)
        throw new Problem(404, "Invitation not found or no longer valid.");
      if (invite.email !== identity!.user.email.toLowerCase())
        throw new Problem(
          403,
          "Sign in with the email address this invitation was sent to.",
        );
      // Recheck the inviter's current authority: a demoted/removed inviter cannot leave privileged grants behind.
      const [inviter] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, invite.workspaceId),
            eq(memberships.userId, invite.createdBy),
          ),
        );
      if (
        !inviter ||
        !inviter.approved ||
        inviter.role === "member" ||
        (invite.role === "admin" && inviter.role !== "owner")
      )
        throw new Problem(403, "Ask a workspace owner for a new invitation.");
      const [existing] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, invite.workspaceId),
            eq(memberships.userId, identity!.user.id),
          ),
        );
      const [seats] = await tx
        .select({ total: count() })
        .from(memberships)
        .where(eq(memberships.workspaceId, invite.workspaceId));
      if (!existing && seats.total >= 50)
        throw new Problem(409, "This workspace has reached its member limit.");
      if (!existing)
        await tx.insert(memberships).values({
          workspaceId: invite.workspaceId,
          userId: identity!.user.id,
          role: invite.role,
        });
      await tx
        .update(invitations)
        .set({ consumedAt: new Date() })
        .where(eq(invitations.id, invite.id));
      return { workspaceId: invite.workspaceId };
    });
  })
  .patch(
    "/api/workspaces/:workspaceId/members/:userId",
    async ({ identity, params, body }) =>
      db.transaction(async (tx) => {
        const caller = await locked(tx, params.workspaceId, identity!.user.id);
        if (caller.role !== "owner")
          throw new Problem(403, "Workspace owner access required.");
        const input = roleForm
          .extend({ approved: z.boolean().optional() })
          .parse(body);
        const [target] = await tx
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, params.workspaceId),
              eq(memberships.userId, params.userId),
            ),
          );
        if (!target) throw new Problem(404, "Member not found.");
        if (
          target.role === "owner" &&
          target.approved &&
          (input.role !== "owner" || input.approved === false)
        ) {
          const [owners] = await tx
            .select({ total: count() })
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, params.workspaceId),
                eq(memberships.role, "owner"),
                eq(memberships.approved, true),
              ),
            );
          if (owners.total <= 1)
            throw new Problem(
              409,
              "Assign another owner before removing the last owner.",
            );
        }
        await tx
          .update(memberships)
          .set(input)
          .where(
            and(
              eq(memberships.workspaceId, params.workspaceId),
              eq(memberships.userId, params.userId),
            ),
          );
        return { ok: true };
      }),
  )
  .delete(
    "/api/workspaces/:workspaceId/members/:userId",
    async ({ identity, params }) =>
      db.transaction(async (tx) => {
        const caller = await locked(tx, params.workspaceId, identity!.user.id);
        if (caller.role !== "owner")
          throw new Problem(403, "Workspace owner access required.");
        const [target] = await tx
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, params.workspaceId),
              eq(memberships.userId, params.userId),
            ),
          );
        if (!target) return { ok: true };
        if (target.role === "owner" && target.approved) {
          const [owners] = await tx
            .select({ total: count() })
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, params.workspaceId),
                eq(memberships.role, "owner"),
                eq(memberships.approved, true),
              ),
            );
          if (owners.total <= 1)
            throw new Problem(
              409,
              "Assign another owner before removing the last owner.",
            );
        }
        const [oidc] = await tx
          .select({ id: workspaceOidc.workspaceId })
          .from(workspaceOidc)
          .where(eq(workspaceOidc.workspaceId, params.workspaceId));
        const condition = and(
          eq(memberships.workspaceId, params.workspaceId),
          eq(memberships.userId, params.userId),
        );
        // Retain a denial so automatic domain provisioning cannot undo an owner's removal.
        if (oidc)
          await tx
            .update(memberships)
            .set({ approved: false })
            .where(condition);
        else await tx.delete(memberships).where(condition);
        return { ok: true };
      }),
  );
