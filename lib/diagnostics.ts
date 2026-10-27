import {
  diagnosticRecord,
  diagnosticRef,
  type DiagnosticEvent,
  type DiagnosticFields,
} from "@/shared/diagnostics";
export { diagnosticRef, errorKind } from "@/shared/diagnostics";
const records: ReturnType<typeof diagnosticRecord>[] = [];
let clientRef: string | undefined;
export function setDiagnosticClient(id: string) {
  clientRef = diagnosticRef(id);
}
export function clientLog(
  event: DiagnosticEvent,
  fields: DiagnosticFields = {},
  level: "info" | "warn" | "error" = "info",
) {
  if (typeof window === "undefined") return;
  const record = diagnosticRecord(
    "client",
    event,
    {
      clientRef,
      online: navigator.onLine,
      hidden: document.hidden,
      ...fields,
    },
    level,
  );
  records.push(record);
  if (records.length > 300) records.shift();
  console[level]("[little-office]", JSON.stringify(record));
}
export function downloadDiagnostics() {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { schema: 1, exportedAt: new Date().toISOString(), events: records },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `little-office-diagnostics-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
