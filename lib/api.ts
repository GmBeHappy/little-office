export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: method || (body ? "POST" : "GET"),
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || data.message || "Something went wrong. Please try again.",
    );
  return data;
}
export type User = {
  id: string;
  name: string;
  username?: string;
  role: string;
  approved: boolean;
  avatar: string;
  mustChangePassword: boolean;
  availability: string;
  statusText: string;
};
export type AppConfig = {
  workspace: import("@/shared/maps").WorkspaceSettings;
  password: boolean;
  sso: boolean;
  ssoConfigured: boolean;
  provider: string;
  mediaConfigured: boolean;
  officeName: string;
};
