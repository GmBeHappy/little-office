// Infrastructure names must never be claimable by a workspace.
export const RESERVED_WORKSPACE_SLUGS = new Set([
  "app",
  "www",
  "api",
  "auth",
  "admin",
  "rtc",
  "turn",
  "stun",
  "livekit",
  "mail",
  "smtp",
  "status",
  "support",
  "cdn",
  "assets",
  "static",
  "localhost",
]);
export function workspaceSlug(value: string) {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    value.length >= 3 &&
    value.length <= 48 &&
    !RESERVED_WORKSPACE_SLUGS.has(value)
  );
}
export function classifyHost(
  host: string,
  origin: string,
  baseDomain: string,
):
  | { kind: "portal" }
  | { kind: "workspace"; slug: string }
  | { kind: "invalid" } {
  if (host === new URL(origin).host) return { kind: "portal" };
  if (!baseDomain || !host.endsWith(`.${baseDomain}`))
    return { kind: "invalid" };
  const slug = host.slice(0, -baseDomain.length - 1);
  return workspaceSlug(slug)
    ? { kind: "workspace", slug }
    : { kind: "invalid" };
}
