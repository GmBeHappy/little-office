import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
await mkdir(dirname(process.env.LOCAL_DB_PATH || ".data/postgres"), {
  recursive: true,
});
const db = new PGlite(process.env.LOCAL_DB_PATH || ".data/postgres");
await db.waitReady;
const server = new PGLiteSocketServer({
  db,
  host: "127.0.0.1",
  port: Number(process.env.LOCAL_DB_PORT || 5433),
  maxConnections: 20,
});
await server.start();
console.log(
  "Development database listening on 127.0.0.1:5433. Use PostgreSQL in production.",
);
