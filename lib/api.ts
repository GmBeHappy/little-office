import { clientLog, diagnosticRef, errorKind } from "./diagnostics";
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method?: string,
  base = "/api",
): Promise<T> {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  const response = await fetch(`${base}${path}`, {
    method: method || (body ? "POST" : "GET"),
    credentials: "same-origin",
    headers: {
      "x-office-request-id": requestId,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch((error: unknown) => {
    clientLog(
      "api.failed",
      {
        requestRef: diagnosticRef(requestId),
        errorKind: errorKind(error),
        durationMs: performance.now() - started,
      },
      "error",
    );
    throw error;
  });
  const data = await response.json().catch(() => null);
  const fallback = "Something went wrong. Please try again.";
  if (!response.ok) {
    clientLog(
      "api.failed",
      {
        requestRef: diagnosticRef(requestId),
        status: response.status,
        durationMs: performance.now() - started,
      },
      "warn",
    );
    throw new APIError(
      data?.error || data?.message || fallback,
      response.status,
    );
  }
  if (data === null) throw new Error(fallback);
  return data;
}
export type User = {
  id: string;
  name: string;
  username?: string;
  operator?: boolean;
  profileURL?: string;
  role: string;
  approved: boolean;
  avatar: string;
  mustChangePassword: boolean;
  availability: string;
  statusText: string;
  statusIcon?: string;
};
export type AppConfig = {
  workspaceId?: string;
  workspace: import("@/shared/maps").WorkspaceSettings;
  password: boolean;
  sso: boolean;
  ssoConfigured: boolean;
  googleConfigured?: boolean;
  provider: string;
  mediaConfigured: boolean;
  storageConfigured: boolean;
  officeName: string;
};
