import { test, expect } from "bun:test";

test("same-tab reconnect survives an old socket without allowing session takeover loops", async () => {
  const child = Bun.spawn(
    [process.execPath, "tests/fixtures/office-reconnect-runner.ts"],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const timeout = setTimeout(() => child.kill(), 15000);
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
}, 20000);
