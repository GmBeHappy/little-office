import { sameRequestOrigin, workspaceOrigin } from "./workspace-domains";
import { workspaceSlug } from "../shared/workspace-domains";
import { Elysia } from "elysia";
import { and, eq, sql } from "drizzle-orm";
import { Resolver } from "node:dns/promises";
import { z } from "zod";
import { db } from "./db";
import { sessionFor } from "./auth";
import {
  accounts,
  workspaceOidc,
  sessions,
  workspaces,
  memberships,
} from "./schema";
import { Problem, workspaceSession } from "./workspace-access";
import { recent } from "./session-guards";
import { config, googleConfigured } from "./config";
import {
  discoverOidc,
  encryptSecret,
  oidcForm,
  oidcMethod,
  type WorkspaceOIDC,
} from "./workspace-oidc";
import { revokeSession } from "./workspace-runtime";

const dns = new Resolver({ timeout: 3000, tries: 2 });
const mutations = new Map<string, { count: number; until: number }>();
export async function verifyDomain(connection: WorkspaceOIDC) {
  const records = await dns
    .resolveTxt(`_little-office.${connection.domain}`)
    .catch(() => []);
  if (
    !records.some(
      (parts) =>
        parts.join("") ===
        `little-office-verification=${connection.verificationToken}`,
    )
  )
    throw new Problem(
      400,
      "DNS TXT verification record was not found. Check the record and allow time for DNS propagation.",
    );
}
function describe(connection: WorkspaceOIDC, owner: boolean) {
  return {
    enabled: connection.enabled,
    providerId: connection.providerId,
    domain: connection.domain,
    ...(owner
      ? {
          issuer: connection.issuer,
          clientId: connection.clientId,
          hasClientSecret: true,
          verified: !!connection.verifiedAt,
          redirectURI: `${config.origin}/api/auth/callback/${connection.providerId}`,
          dnsName: `_little-office.${connection.domain}`,
          dnsValue: `little-office-verification=${connection.verificationToken}`,
        }
      : {}),
  };
}
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function ownerLock(tx: Transaction, workspaceId: string, userId: string) {
  await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for("update");
  const [member] = await tx
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, userId),
      ),
    );
  if (!member?.approved || member.role !== "owner")
    throw new Problem(403, "Workspace owner access required.");
}
async function revoke(tx: Transaction, connection: WorkspaceOIDC) {
  return tx
    .delete(sessions)
    .where(eq(sessions.method, oidcMethod(connection)))
    .returning({ id: sessions.id });
}
export const workspaceOidcApi = new Elysia({ name: "workspace-oidc" })
  .onRequest(({ request, set }) => {
    set.headers["cache-control"] = "no-store";
    if (request.method !== "GET" && !sameRequestOrigin(request))
      throw new Problem(403, "Untrusted request origin.");
  })
  .get("/api/saas/login/:slug", async ({ params }) => {
    if (!workspaceSlug(params.slug))
      throw new Problem(404, "Workspace not found.");
    const [workspace] = await db
      .select({
        name: workspaces.name,
        slug: workspaces.slug,
        providerId: workspaceOidc.providerId,
      })
      .from(workspaces)
      .leftJoin(
        workspaceOidc,
        and(
          eq(workspaceOidc.workspaceId, workspaces.id),
          eq(workspaceOidc.enabled, true),
        ),
      )
      .where(eq(workspaces.slug, params.slug));
    if (!workspace) throw new Problem(404, "Workspace not found.");
    return {
      workspace: {
        name: workspace.name,
        slug: workspace.slug,
        url: config.workspaceDomain ? workspaceOrigin(workspace.slug) : null,
      },
      providerId: workspace.providerId,
    };
  })
  .get("/api/saas/sso/:slug", async ({ params }) => {
    const slug = z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
      .parse(params.slug);
    const [connection] = await db
      .select({ providerId: workspaceOidc.providerId, name: workspaces.name })
      .from(workspaceOidc)
      .innerJoin(workspaces, eq(workspaces.id, workspaceOidc.workspaceId))
      .where(and(eq(workspaces.slug, slug), eq(workspaceOidc.enabled, true)));
    if (!connection) throw new Problem(404, "Workspace SSO is unavailable.");
    return connection;
  })
  .derive(async ({ request }) => ({
    identity: await sessionFor(request.headers),
  }))
  .onBeforeHandle(async ({ identity, request, params }) => {
    const workspaceId = (params as { workspaceId?: string }).workspaceId;
    if (!workspaceId) return;
    const member = await workspaceSession(identity, workspaceId);
    if (request.method !== "GET") {
      if (identity!.workspaceId || member.user.role !== "owner")
        throw new Problem(
          403,
          "Sign in with the owner's personal account to configure SSO.",
        );
      recent(identity!);
      const now = Date.now();
      for (const [key, limit] of mutations)
        if (limit.until <= now) mutations.delete(key);
      const limit = mutations.get(identity!.user.id) || {
        count: 0,
        until: now + 60000,
      };
      if (++limit.count > 20 || mutations.size >= 10000)
        throw new Problem(429, "Too many SSO changes. Try again shortly.");
      mutations.set(identity!.user.id, limit);
    }
  })
  .get("/api/workspaces/:workspaceId/oidc", async ({ identity, params }) => {
    const member = await workspaceSession(identity, params.workspaceId);
    const [connection] = await db
      .select()
      .from(workspaceOidc)
      .where(eq(workspaceOidc.workspaceId, params.workspaceId));
    const [linked] = connection
      ? await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.providerId, connection.providerId),
              eq(accounts.userId, identity!.user.id),
            ),
          )
      : [];
    return {
      connection: connection
        ? describe(connection, member.user.role === "owner")
        : null,
      linked: !!linked,
      canConfigure: member.user.role === "owner" && !identity!.workspaceId,
      canLink: !identity!.workspaceId,
    };
  })
  .put(
    "/api/workspaces/:workspaceId/oidc",
    async ({ identity, params, body }) => {
      const input = oidcForm.parse(body);
      const result = await db.transaction(async (tx) => {
        await ownerLock(tx, params.workspaceId, identity!.user.id);
        const [previous] = await tx
          .select()
          .from(workspaceOidc)
          .where(eq(workspaceOidc.workspaceId, params.workspaceId));
        const changedIdentity =
          !previous ||
          previous.issuer !== input.issuer ||
          previous.clientId !== input.clientId ||
          previous.domain !== input.domain;
        if (previous && changedIdentity) {
          const missingFallback =
            await tx.execute(sql`select a."userId" from account a
          join workspace_memberships m on m.user_id = a."userId" and m.workspace_id = ${params.workspaceId} and m.approved = true
          where a."providerId" = ${previous.providerId} and not exists (
            select 1 from account fallback where fallback."userId" = a."userId" and (
              (fallback."providerId" = 'google' and ${googleConfigured}) or
              (fallback."providerId" = 'credential' and fallback.password is not null and exists (select 1 from office_settings where password = true))
            )) limit 1`);
          if (missingFallback.rows.length)
            throw new Problem(
              409,
              "Active SSO-only members must connect a Google or password login before changing the issuer, client ID or domain.",
            );
        }
        if (!input.clientSecret && (!previous || changedIdentity))
          throw new Problem(
            400,
            "Enter the client secret for the new connection.",
          );
        const values = {
          workspaceId: params.workspaceId,
          issuer: input.issuer,
          clientId: input.clientId,
          domain: input.domain,
          clientSecret: input.clientSecret
            ? await encryptSecret(input.clientSecret)
            : previous!.clientSecret,
          providerId: changedIdentity
            ? `ws-${crypto.randomUUID()}`
            : previous.providerId,
          verificationToken:
            !previous || previous.domain !== input.domain
              ? crypto.randomUUID()
              : previous.verificationToken,
          verifiedAt:
            previous?.domain === input.domain ? previous.verifiedAt : null,
          enabled: false,
          revision: (previous?.revision || 0) + 1,
        };
        const [connection] = await tx
          .insert(workspaceOidc)
          .values(values)
          .onConflictDoUpdate({
            target: workspaceOidc.workspaceId,
            set: values,
          })
          .returning();
        return {
          connection,
          revoked: previous ? await revoke(tx, previous) : [],
        };
      });
      result.revoked.forEach(({ id }) => revokeSession(id));
      return describe(result.connection, true);
    },
  )
  .post(
    "/api/workspaces/:workspaceId/oidc/verify",
    async ({ identity, params }) => {
      const [connection] = await db
        .select()
        .from(workspaceOidc)
        .where(eq(workspaceOidc.workspaceId, params.workspaceId));
      if (!connection) throw new Problem(404, "Save an OIDC connection first.");
      await verifyDomain(connection);
      return db.transaction(async (tx) => {
        await ownerLock(tx, params.workspaceId, identity!.user.id);
        const [updated] = await tx
          .update(workspaceOidc)
          .set({ verifiedAt: new Date() })
          .where(
            and(
              eq(workspaceOidc.workspaceId, params.workspaceId),
              eq(workspaceOidc.revision, connection.revision),
            ),
          )
          .returning();
        if (!updated)
          throw new Problem(409, "Settings changed. Reload and try again.");
        return describe(updated, true);
      });
    },
  )
  .patch(
    "/api/workspaces/:workspaceId/oidc",
    async ({ identity, params, body }) => {
      const { enabled } = z
        .object({ enabled: z.boolean() })
        .strict()
        .parse(body);
      const [connection] = await db
        .select()
        .from(workspaceOidc)
        .where(eq(workspaceOidc.workspaceId, params.workspaceId));
      if (!connection) throw new Problem(404, "Save an OIDC connection first.");
      if (enabled) {
        await verifyDomain(connection);
        try {
          await discoverOidc(connection.issuer);
        } catch {
          throw new Problem(
            400,
            "Cannot validate this provider's public HTTPS OIDC discovery document.",
          );
        }
      }
      const result = await db.transaction(async (tx) => {
        await ownerLock(tx, params.workspaceId, identity!.user.id);
        const [updated] = await tx
          .update(workspaceOidc)
          .set({
            enabled,
            verifiedAt: enabled ? new Date() : connection.verifiedAt,
            revision: connection.revision + 1,
          })
          .where(
            and(
              eq(workspaceOidc.workspaceId, params.workspaceId),
              eq(workspaceOidc.revision, connection.revision),
            ),
          )
          .returning();
        if (!updated)
          throw new Problem(409, "Settings changed. Reload and try again.");
        return { connection: updated, revoked: await revoke(tx, connection) };
      });
      result.revoked.forEach(({ id }) => revokeSession(id));
      return describe(result.connection, true);
    },
  );
