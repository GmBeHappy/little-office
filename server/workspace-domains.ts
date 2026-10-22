import { and, eq, gt } from "drizzle-orm";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import { db } from "./db";
import { sessions, workspaces } from "./schema";
import { classifyHost, workspaceSlug } from "../shared/workspace-domains";
import { Problem } from "./workspace-access";

export const workspaceCookie = "__Host-little-office.workspace";
export const nonceCookie = "__Host-little-office.connect";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
export function cookieValue(headers: Headers, name: string) {
  return (
    headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
export function hostFor(request: Request) {
  // Forwarded host/proto headers are never an authentication input. The ingress preserves Host.
  return request.headers.get("host") || new URL(request.url).host;
}
export async function workspaceForHost(host: string) {
  const kind = classifyHost(host, config.origin, config.workspaceDomain);
  if (kind.kind === "invalid") throw new Problem(404, "Workspace not found.");
  if (kind.kind === "portal") return null;
  const [workspace] = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.slug, kind.slug));
  if (!workspace) throw new Problem(404, "Workspace not found.");
  return workspace;
}
export function workspaceOrigin(slug: string) {
  if (!config.workspaceDomain || !workspaceSlug(slug))
    throw new Problem(404, "Workspace not found.");
  return `https://${slug}.${config.workspaceDomain}`;
}
export function sameRequestOrigin(request: Request) {
  if (!config.workspaceDomain)
    return request.headers.get("origin") === config.origin;
  const host = hostFor(request);
  const kind = classifyHost(host, config.origin, config.workspaceDomain);
  return (
    kind.kind !== "invalid" &&
    request.headers.get("origin") ===
      (kind.kind === "portal" ? config.origin : workspaceOrigin(kind.slug))
  );
}
export function signWorkspaceSession(
  sessionId: string,
  workspaceId: string,
  expiresAt: Date,
) {
  const payload = Buffer.from(
    JSON.stringify({ sessionId, workspaceId, expires: expiresAt.getTime() }),
  ).toString("base64url");
  const signature = createHmac("sha256", config.secret)
    .update(`workspace-cookie:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}
export async function workspaceSessionHeaders(
  headers: Headers,
  workspaceId: string,
) {
  const authorization = headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  const [payload, signature, extra] = (
    bearer || cookieValue(headers, workspaceCookie)
  ).split(".");
  if (!payload || !signature || extra) return bearer ? headers : null;
  const expected = createHmac("sha256", config.secret)
    .update(`workspace-cookie:${payload}`)
    .digest("base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return bearer ? headers : null;
  let value;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (
    value.workspaceId !== workspaceId ||
    typeof value.sessionId !== "string" ||
    !Number.isFinite(value.expires) ||
    value.expires <= Date.now()
  )
    return null;
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, value.sessionId), gt(sessions.expiresAt, new Date())),
    );
  if (!session) return null;
  const signed = createHmac("sha256", config.secret)
    .update(session.token)
    .digest("base64");
  return new Headers({ authorization: `Bearer ${session.token}.${signed}` });
}
export function tenantPathAllowed(path: string, workspaceId: string) {
  return (
    [
      "/api/workspace-host",
      "/api/workspace-login/start",
      "/api/workspace-login/complete",
      "/api/auth/sign-out",
      "/api/account",
      "/api/workspaces",
      "/api/saas/config",
      "/api/native/exchange",
    ].includes(path) ||
    path === `/api/workspaces/${workspaceId}` ||
    path.startsWith(`/api/workspaces/${workspaceId}/`)
  );
}
