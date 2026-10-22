import { test, expect } from "bun:test";
import { classifyHost, workspaceSlug } from "../shared/workspace-domains";

test("workspace domains reject infrastructure names, multiple labels, ports and spoofed suffixes", () => {
  for (const value of [
    "app",
    "rtc",
    "turn",
    "api",
    "www",
    "foo.bar",
    "gmtech:443",
    "-foo",
    "foo-",
    "Foo",
    "xy",
  ])
    expect(workspaceSlug(value)).toBe(false);
  const classify = (host: string) =>
    classifyHost(host, "https://app.littleoffice.app", "littleoffice.app");
  expect(classify("app.littleoffice.app")).toEqual({ kind: "portal" });
  expect(classify("gmtech.littleoffice.app")).toEqual({
    kind: "workspace",
    slug: "gmtech",
  });
  for (const host of [
    "evil.app",
    "gmtech.littleoffice.app.evil.app",
    "gmtech.littleoffice.app:443",
    "foo.bar.littleoffice.app",
    "rtc.littleoffice.app",
    "littleoffice.app",
    "app.littleoffice.app@evil.app",
  ])
    expect(classify(host)).toEqual({ kind: "invalid" });
});

test("workspace domains isolate API, login grants, cookies, native bearer and TLS approval", async () => {
  const child = Bun.spawn(
    [process.execPath, "tests/fixtures/workspace-domains-runner.ts"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const timer = setTimeout(() => child.kill(), 35000);
  const [code, output, diagnostics] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timer);
  expect({ code, failure: code === 0 ? "" : output + diagnostics }).toEqual({
    code: 0,
    failure: "",
  });
}, 45000);
