import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/configure-deploy.ts", import.meta.url),
);
const env = {
  NODE_ENV: "test" as const,
  OFFICE_DOMAIN: "app.littleoffice.app",
  APP_URL: "https://app.littleoffice.app",
  RTC_DOMAIN: "livekit.wa.gmtech.dev",
  TURN_DOMAIN: "turn.wa.gmtech.dev",
  LIVEKIT_URL: "wss://livekit.wa.gmtech.dev",
  LIVEKIT_API_KEY: "test-key",
  LIVEKIT_API_SECRET: "a".repeat(32),
  BETTER_AUTH_SECRET: "b".repeat(32),
  POSTGRES_PASSWORD: "test-password",
  DATABASE_URL: "postgres://office:test-password@127.0.0.1:5432/office",
};
function generate(extra: Record<string, string | undefined> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "office-config-test-"));
  try {
    const result = spawnSync(process.execPath, [script], {
      cwd,
      env: { ...env, ...extra },
      encoding: "utf8",
    });
    if (result.status !== 0)
      return { ok: false as const, error: result.stderr };
    const file = (name: string) => join(cwd, "deploy/generated", name);
    return {
      ok: true as const,
      caddy: JSON.parse(readFileSync(file("caddy.json"), "utf8")),
      livekit: JSON.parse(readFileSync(file("livekit.yaml"), "utf8")),
      mode: statSync(file("livekit.yaml")).mode & 0o777,
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("tenant certificates are individually permission-gated, never wildcard automated", () => {
  const result = generate({
    WORKSPACE_BASE_DOMAIN: "littleoffice.app",
    LEGACY_OFFICE_DOMAIN: "office.gmtech.dev",
    LEGACY_WORKSPACE_SLUG: "gmtech",
    LIVEKIT_RTC_PORT_RANGE_END: "50100",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  const { tls, http, layer4 } = result.caddy.apps;
  expect(tls.certificates.automate).toEqual([
    env.OFFICE_DOMAIN,
    env.RTC_DOMAIN,
    env.TURN_DOMAIN,
    "office.gmtech.dev",
  ]);
  expect(tls.automation.policies).toEqual([
    { subjects: tls.certificates.automate },
    { subjects: ["*.littleoffice.app"], on_demand: true },
  ]);
  expect(tls.automation.on_demand.permission).toEqual({
    module: "http",
    endpoint: "http://127.0.0.1:3001/internal/tls-allow",
  });
  expect(http.servers.https.automatic_https.disable_certificates).toBe(true);
  expect(http.servers.https.strict_sni_host).toBe(true);
  const routes = http.servers.https.routes;
  expect(routes[0]).toEqual({
    match: [{ path: ["/internal*"] }],
    handle: [{ handler: "static_response", status_code: 404 }],
    terminal: true,
  });
  expect(routes[1].handle[0].headers.Location).toEqual([
    "https://gmtech.littleoffice.app{http.request.uri}",
  ]);
  expect(routes[1].handle[0].status_code).toBe(308);
  expect(routes[3].match).toEqual([
    {
      host: [env.OFFICE_DOMAIN, "*.littleoffice.app"],
      path: ["/api", "/api/*"],
    },
  ]);
  expect(routes[3].handle[0].upstreams).toEqual([{ dial: "127.0.0.1:3001" }]);
  // No Host override: Caddy forwards the original tenant host to the API/web.
  expect(routes[3].handle[0].headers).toBeUndefined();
  expect(routes.at(-1).handle[0].status_code).toBe(404);
  expect(http.servers.redirect.routes.at(-1).handle[0].status_code).toBe(404);
  expect(layer4.servers.public.routes[0].match[0].tls.sni).toEqual([
    env.TURN_DOMAIN,
  ]);
  expect(result.livekit.rtc.port_range_start).toBe(50000);
  expect(result.livekit.rtc.port_range_end).toBe(50100);
  expect(result.mode).toBe(0o600);
});

test("single-host deployments retain static certificates and the default media ports", () => {
  const result = generate();
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.caddy.apps.tls.automation).toBeUndefined();
  expect(result.caddy.apps.tls.certificates.automate).toHaveLength(3);
  expect(result.livekit.rtc.port_range_end).toBe(60000);
});

for (const extra of [
  { WORKSPACE_BASE_DOMAIN: "https://littleoffice.app" },
  { WORKSPACE_BASE_DOMAIN: "*.littleoffice.app" },
  { WORKSPACE_BASE_DOMAIN: "littleoffice..app" },
  { WORKSPACE_BASE_DOMAIN: "-littleoffice.app" },
  { OFFICE_DOMAIN: "APP.littleoffice.app" },
  { LEGACY_OFFICE_DOMAIN: "office.gmtech.dev" },
  { LEGACY_WORKSPACE_SLUG: "gmtech" },
  {
    WORKSPACE_BASE_DOMAIN: "littleoffice.app",
    LEGACY_OFFICE_DOMAIN: "office.gmtech.dev",
    LEGACY_WORKSPACE_SLUG: "app",
  },
  {
    WORKSPACE_BASE_DOMAIN: "littleoffice.app",
    LEGACY_OFFICE_DOMAIN: "office.gmtech.dev",
    LEGACY_WORKSPACE_SLUG: "gm.tech",
  },
  {
    WORKSPACE_BASE_DOMAIN: "littleoffice.app",
    LEGACY_OFFICE_DOMAIN: "gmtech.littleoffice.app",
    LEGACY_WORKSPACE_SLUG: "gmtech",
  },
  {
    WORKSPACE_BASE_DOMAIN: "littleoffice.app",
    LEGACY_OFFICE_DOMAIN: env.OFFICE_DOMAIN,
    LEGACY_WORKSPACE_SLUG: "gmtech",
  },
  {
    LIVEKIT_RTC_PORT_RANGE_START: "50101",
    LIVEKIT_RTC_PORT_RANGE_END: "50100",
  },
  { LIVEKIT_RTC_PORT_RANGE_END: "65536" },
  { LIVEKIT_RTC_PORT_RANGE_END: "50.5" },
  { LIVEKIT_RTC_PORT_RANGE_START: "443" },
  { LIVEKIT_RTC_PORT_RANGE_END: "5e4" },
  { APP_URL: "https://another.littleoffice.app" },
]) {
  test(`rejects invalid deployment config ${JSON.stringify(extra)}`, () => {
    expect(generate(extra).ok).toBe(false);
  });
}
