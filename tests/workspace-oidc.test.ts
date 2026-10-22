import { test, expect } from "bun:test";

test("workspace OIDC verifies identities, provisions members, and confines browser/native sessions", async () => {
  const child = Bun.spawn([process.execPath, "tests/fixtures/oidc-runner.ts"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = setTimeout(() => child.kill(), 35000);
  const [code, output, diagnostics] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timeout);
  expect({
    code,
    failure: code === 0 ? "" : `${output}\n${diagnostics}`,
  }).toEqual({ code: 0, failure: "" });
}, 45000);
