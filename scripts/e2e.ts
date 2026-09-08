import { auth } from "../server/auth";
import { eq } from "drizzle-orm";
import { users, officeFiles } from "../server/schema";
import { db, pool } from "../server/db";
const accounts = [];
try {
  for (const name of ["Robin", "Jamie"]) {
    const username = `test_${crypto.randomUUID().slice(0, 8)}`,
      password = crypto.randomUUID() + "Test!";
    const result = await auth.api.signUpEmail({
      body: { username, password, name, email: `${username}@local.invalid` },
    });
    await db
      .update(users)
      .set({ approved: true, role: name === "Robin" ? "owner" : "member" })
      .where(eq(users.id, result.user.id));
    accounts.push({ username, password, id: result.user.id, name });
  }
  const run = Bun.spawn(
    [
      process.env.NODE_BINARY || "node",
      "node_modules/@playwright/test/cli.js",
      "test",
      ...process.argv.slice(2),
    ],
    {
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, E2E_ACCOUNTS: JSON.stringify(accounts) },
    },
  );
  process.exitCode = await run.exited;
} finally {
  const { storage } = await import("../server/storage");
  for (const a of accounts) {
    const files = await db
      .select({ id: officeFiles.id, objectKey: officeFiles.objectKey })
      .from(officeFiles)
      .where(eq(officeFiles.createdBy, a.id));
    for (const file of files) {
      await storage?.delete(file.objectKey);
      await db.delete(officeFiles).where(eq(officeFiles.id, file.id));
    }
  }
  for (const a of accounts) await db.delete(users).where(eq(users.id, a.id));
  await pool.end();
}
