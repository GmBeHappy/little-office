import { DEFAULT_WORKSPACE_ID } from "../shared/workspaces";
import { auth } from "../server/auth";
import { and, eq } from "drizzle-orm";
import { users, memberships } from "../server/schema";
import { db, pool } from "../server/db";
import { createInterface } from "node:readline/promises";
const username = process.argv[2];
const name = process.argv[3] || username;
if (!username || !/^[a-z0-9_]{3,30}$/.test(username))
  throw new Error("Usage: bun user:create <username> <name> [--owner]");
let password = process.env.OFFICE_NEW_PASSWORD;
if (!password) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  process.stdout.write("Password (12+ characters): ");
  // Suppress readline echo while retaining the terminal prompt.
  const output = readline as unknown as { _writeToOutput: (s: string) => void };
  output._writeToOutput = () => {};
  password = await readline.question("");
  readline.close();
  process.stdout.write("\n");
}
const result = await auth.api.signUpEmail({
  body: { email: `${username}@local.invalid`, username, name, password },
});
await db
  .update(users)
  .set({
    approved: true,
    role: process.argv.includes("--owner") ? "owner" : "member",
  })
  .where(eq(users.id, result.user.id));
await db
  .update(memberships)
  .set({
    approved: true,
    role: process.argv.includes("--owner") ? "owner" : "member",
  })
  .where(
    and(
      eq(memberships.workspaceId, DEFAULT_WORKSPACE_ID),
      eq(memberships.userId, result.user.id),
    ),
  );
console.log(`Created ${username} (user ID: ${result.user.id}).`);
if (process.argv.includes("--owner"))
  console.log(
    "For platform administration, add this user ID to OFFICE_OPERATOR_IDS and restart the API.",
  );
await pool.end();
