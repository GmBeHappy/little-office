// Only technical, allowlisted fields cross the diagnostic boundary. Never pass
// messages, URLs, headers, user profiles, tokens or raw SDK/error objects here.
export const diagnosticEvents = [
  "socket.connect",
  "socket.open",
  "socket.close",
  "socket.retry",
  "socket.dispose",
  "socket.accepted",
  "socket.resumed",
  "socket.rejected",
  "socket.rate_limited",
  "socket.failed",
  "office.removed",
  "media.rotate",
  "media.retire",
  "media.deleted",
  "media.delete_failed",
  "media.connect",
  "media.connected",
  "media.reconnecting",
  "media.reconnected",
  "media.disconnected",
  "media.failed",
  "media.dispose",
  "api.failed",
  "auth.revalidation_failed",
  "page.state",
] as const;
export type DiagnosticEvent = (typeof diagnosticEvents)[number];
export const reasons = [
  "socket_closed",
  "takeover",
  "heartbeat_timeout",
  "session_expired",
  "session_revoked",
  "access_revoked",
  "revalidation_failed",
  "member_removed",
  "conversation_changed",
  "map_changed",
  "process_cleanup",
  "unspecified",
] as const;
export type DiagnosticReason = (typeof reasons)[number];
export type DiagnosticFields = {
  clientRef?: string;
  connectionRef?: string;
  previousConnectionRef?: string;
  roomRef?: string;
  nextRoomRef?: string;
  workspaceRef?: string;
  requestRef?: string;
  reason?: DiagnosticReason;
  errorKind?: string;
  code?: number;
  attempt?: number;
  status?: number;
  ageMs?: number;
  durationMs?: number;
  peers?: number;
  clean?: boolean;
  online?: boolean;
  hidden?: boolean;
  current?: boolean;
};
// Correlation for random IDs, not a security hash or anonymization of user data.
export function diagnosticRef(value: string | undefined) {
  if (!value) return undefined;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
const errorKinds = [
  "Error",
  "TypeError",
  "AbortError",
  "NotAllowedError",
  "NotFoundError",
  "NotReadableError",
  "ConnectionError",
  "DrizzleQueryError",
  "APIError",
  "Problem",
  "TwirpError",
  "TimeoutError",
  "unknown",
];
export function errorKind(error: unknown) {
  const name =
    error instanceof Error
      ? error.constructor.name === "Error"
        ? error.name
        : error.constructor.name
      : "unknown";
  return errorKinds.includes(name) ? name : "unknown";
}
export function diagnosticRecord(
  source: "client" | "server",
  event: DiagnosticEvent,
  fields: DiagnosticFields = {},
  level: "info" | "warn" | "error" = "info",
) {
  if (!diagnosticEvents.includes(event))
    throw new Error("Unknown diagnostic event");
  const safe: DiagnosticFields = {};
  for (const key of [
    "clientRef",
    "connectionRef",
    "previousConnectionRef",
    "roomRef",
    "nextRoomRef",
    "workspaceRef",
    "requestRef",
  ] as const)
    if (/^[a-f0-9]{8}$/.test(fields[key] || "")) safe[key] = fields[key]!;
  for (const key of [
    "code",
    "attempt",
    "status",
    "ageMs",
    "durationMs",
    "peers",
  ] as const)
    if (typeof fields[key] === "number" && Number.isFinite(fields[key]))
      safe[key] = Math.round(fields[key]!);
  for (const key of ["clean", "online", "hidden", "current"] as const)
    if (typeof fields[key] === "boolean") safe[key] = fields[key]!;
  if (fields.reason && reasons.includes(fields.reason))
    safe.reason = fields.reason;
  if (fields.errorKind && errorKinds.includes(fields.errorKind))
    safe.errorKind = fields.errorKind;
  return {
    schema: 1,
    at: new Date().toISOString(),
    source,
    level,
    event,
    ...safe,
  };
}
