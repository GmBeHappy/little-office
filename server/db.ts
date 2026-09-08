import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import * as schema from "./schema";
export const pool = new Pool({ connectionString: config.database, max: 5 });
pool.on("error", () =>
  console.error(
    "An idle database connection was interrupted; the pool will reconnect.",
  ),
);
export const db = drizzle(pool, { schema });
export async function migrateDatabase() {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
}
export type AuthSettings = Pick<
  typeof schema.officeSettings.$inferSelect,
  "password" | "sso" | "version"
>;
export async function settings(): Promise<AuthSettings> {
  const [row] = await db
    .select({
      password: schema.officeSettings.password,
      sso: schema.officeSettings.sso,
      version: schema.officeSettings.version,
    })
    .from(schema.officeSettings)
    .where(eq(schema.officeSettings.id, 1));
  return row;
}
export async function workspaceSettings() {
  const [row] = await db
    .select({
      name: schema.workspaces.name,
      mapId: schema.workspaces.mapId,
      revision: schema.workspaces.revision,
      features: schema.workspaces.features,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, 1));
  return row;
}
