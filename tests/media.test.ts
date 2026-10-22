import { test, expect } from "bun:test";
test("media grants isolate room names, preserve other deployments, and fail closed when revocation fails", async () => {
  const child = Bun.spawn(
    [process.execPath, "tests/fixtures/media-runner.ts"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const code = await child.exited;
  const diagnostics = await new Response(child.stderr).text();
  expect({ code, diagnostics }).toEqual({ code: 0, diagnostics: "" });
}, 15000);
