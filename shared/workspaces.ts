export const DEFAULT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
export const PROTOCOL_VERSION = 1;
export type WorkspaceRole = "owner" | "admin" | "member";
export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  mapId: string;
  role: WorkspaceRole;
};
