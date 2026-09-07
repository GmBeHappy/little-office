import { getMigrations } from "better-auth/db/migration";
import { auth } from "../server/auth";
import { db, migrateOffice } from "../server/db";
await migrateOffice();
await (await getMigrations(auth.options)).runMigrations();
console.log("Database schema is ready.");
await db.end();
