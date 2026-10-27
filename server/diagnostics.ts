import {
  diagnosticRecord,
  diagnosticRef,
  type DiagnosticEvent,
  type DiagnosticFields,
} from "../shared/diagnostics";
export { diagnosticRef, errorKind } from "../shared/diagnostics";
const boot = crypto.randomUUID();
export function serverLog(
  event: DiagnosticEvent,
  fields: DiagnosticFields = {},
  level: "info" | "warn" | "error" = "info",
) {
  // One JSON object per stdout line; Docker handles rotation. No raw error serialization.
  console.log(
    JSON.stringify({
      ...diagnosticRecord("server", event, fields, level),
      boot,
    }),
  );
}
const requestIds = new WeakMap<Request, string>();
export function requestRef(request: Request) {
  let id = requestIds.get(request);
  if (!id) {
    const supplied = request.headers.get("x-office-request-id") || "";
    id = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(supplied)
      ? supplied
      : crypto.randomUUID();
    requestIds.set(request, id);
  }
  return diagnosticRef(id);
}
