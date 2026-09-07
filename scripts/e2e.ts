import { auth } from "../server/auth";
import { db } from "../server/db";
const accounts = [];
try {
  for (const name of ["Robin", "Jamie"]) {
    const username = `test_${crypto.randomUUID().slice(0, 8)}`,
      password = crypto.randomUUID() + "Test!";
    const result = await auth.api.signUpEmail({
      body: { username, password, name, email: `${username}@local.invalid` },
    });
    await db.query('UPDATE "user" SET approved=true,role=$2 WHERE id=$1', [
      result.user.id,
      name === "Robin" ? "owner" : "member",
    ]);
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
  for (const a of accounts)
    await db.query('DELETE FROM "user" WHERE id=$1', [a.id]);
  await db.end();
}
