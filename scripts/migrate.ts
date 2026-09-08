import { pool, migrateDatabase } from "../server/db";
try {
  await migrateDatabase();
  console.log("Database schema is ready.");
} finally {
  await pool.end();
}
