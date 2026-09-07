import { Pool } from "pg";
import { config } from "./config";
import type { WorkspaceSettings } from "../shared/maps";
export const db = new Pool({ connectionString: config.database, max: 5 });
db.on("error", () =>
  console.error(
    "An idle database connection was interrupted; the pool will reconnect.",
  ),
);
export type AuthSettings = { password: boolean; sso: boolean; version: number };
export async function settings(): Promise<AuthSettings> {
  return (
    await db.query(
      "SELECT password, sso, version FROM office_settings WHERE id = 1",
    )
  ).rows[0];
}
export async function migrateOffice() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS office_settings (id integer PRIMARY KEY CHECK(id = 1), password boolean NOT NULL DEFAULT true, sso boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1);
    INSERT INTO office_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS office_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS workspace_settings (id integer PRIMARY KEY CHECK(id = 1), name text NOT NULL DEFAULT 'Team workspace', map_id text NOT NULL DEFAULT 'nature-small', revision integer NOT NULL DEFAULT 1);
    INSERT INTO workspace_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
  `);
}
export async function workspaceSettings(): Promise<WorkspaceSettings> {
  return (
    await db.query(
      'SELECT name, map_id AS "mapId", revision FROM workspace_settings WHERE id=1',
    )
  ).rows[0];
}
