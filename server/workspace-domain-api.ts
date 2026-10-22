import { Elysia, type AnyElysia } from "elysia";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "./config";
import { db } from "./db";
import { sessions, verifications, workspaces } from "./schema";
import { sessionFor } from "./auth";
import { Problem, workspaceSession } from "./workspace-access";
import {
  cookieValue,
  digest,
  hostFor,
  nonceCookie,
  signWorkspaceSession,
  workspaceCookie,
  workspaceForHost,
  workspaceOrigin,
} from "./workspace-domains";
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const secureCookie = (name: string, value: string, seconds: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
function redirect(url: string, cookies: string[] = []) {
  const headers = new Headers({
    location: url,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
export const workspaceDomainApi: AnyElysia = new Elysia({
  name: "workspace-domains",
})
  .get("/api/workspace-host", async ({ request, set }) => {
    set.headers["cache-control"] = "no-store";
    const workspace = await workspaceForHost(hostFor(request));
    return { workspace, portal: config.origin };
  })
  .get("/api/workspace-login/start", async ({ request }) => {
    const workspace = await workspaceForHost(hostFor(request));
    if (!workspace) throw new Problem(404, "Workspace not found.");
    const nonce = randomBytes(32).toString("base64url");
    return redirect(
      `${config.origin}/workspace-connect?workspace=${workspace.slug}&state=${digest(nonce)}`,
      [secureCookie(nonceCookie, nonce, 600)],
    );
  })
  .post("/api/workspace-login/grant", async ({ request, body }) => {
    const identity = await sessionFor(request.headers);
    const input = z
      .object({ workspace: z.string().max(48), state: token })
      .strict()
      .parse(body);
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, input.workspace));
    if (!workspace || !config.workspaceDomain)
      throw new Problem(404, "Workspace not found.");
    await workspaceSession(identity, workspace.id);
    // One-use grants contain no session credential in a URL and are bound to the initiating browser.
    const code = randomBytes(32).toString("base64url");
    await db.transaction(async (tx) => {
      await tx
        .delete(verifications)
        .where(
          and(
            like(verifications.identifier, "workspace-connect:%"),
            lt(verifications.expiresAt, new Date()),
          ),
        );
      await tx
        .insert(verifications)
        .values({
          id: `workspace-connect:${digest(code)}`,
          identifier: `workspace-connect:${workspace.id}:${input.state}`,
          value: identity!.session.id,
          expiresAt: new Date(Date.now() + 60000),
        });
    });
    return {
      url: `${workspaceOrigin(workspace.slug)}/api/workspace-login/complete?code=${code}`,
    };
  })
  .get("/api/workspace-login/complete", async ({ request, query }) => {
    const workspace = await workspaceForHost(hostFor(request));
    if (!workspace) throw new Problem(404, "Workspace not found.");
    const code = token.parse(query.code),
      nonce = token.parse(cookieValue(request.headers, nonceCookie));
    const [grant] = await db
      .delete(verifications)
      .where(
        and(
          eq(verifications.id, `workspace-connect:${digest(code)}`),
          eq(
            verifications.identifier,
            `workspace-connect:${workspace.id}:${digest(nonce)}`,
          ),
          gt(verifications.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!grant)
      throw new Problem(
        401,
        "Workspace sign-in expired. Please sign in again.",
      );
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.id, grant.value), gt(sessions.expiresAt, new Date())),
      );
    if (!session) throw new Problem(401, "Please sign in again.");
    const scopedCookie = signWorkspaceSession(
      session.id,
      workspace.id,
      session.expiresAt,
    );
    const identity = await sessionFor(
      new Headers({
        host: hostFor(request),
        cookie: `${workspaceCookie}=${scopedCookie}`,
      }),
    );
    await workspaceSession(identity, workspace.id);
    return redirect(`${workspaceOrigin(workspace.slug)}/`, [
      secureCookie(
        workspaceCookie,
        scopedCookie,
        Math.max(
          0,
          Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
        ),
      ),
      secureCookie(nonceCookie, "", 0),
    ]);
  });
