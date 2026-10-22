import { mkdir, writeFile } from "node:fs/promises";
import { workspaceSlug } from "../shared/workspace-domains";
const value = (key: string) => {
  const v = process.env[key];
  if (!v || v.includes("replace-with") || v.includes("example.com"))
    throw new Error(`Set ${key} in .env first.`);
  return v;
};
const office = value("OFFICE_DOMAIN"),
  rtc = value("RTC_DOMAIN"),
  turn = value("TURN_DOMAIN");
const base = process.env.WORKSPACE_BASE_DOMAIN || "";
const legacy = process.env.LEGACY_OFFICE_DOMAIN || "";
const legacySlug = process.env.LEGACY_WORKSPACE_SLUG || "";
for (const domain of [office, rtc, turn, base, legacy].filter(Boolean))
  if (
    domain.length > 253 ||
    !domain.includes(".") ||
    !domain
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw new Error(
      "Use lowercase DNS hostnames without ports or URL schemes.",
    );
const staticDomains = [office, rtc, turn, ...(legacy ? [legacy] : [])];
if (new Set(staticDomains).size !== staticDomains.length)
  throw new Error(
    "Use distinct DNS names for office, RTC, TURN, and legacy redirect.",
  );
if (
  !!legacy !== !!legacySlug ||
  (legacy && (!base || !workspaceSlug(legacySlug)))
)
  throw new Error(
    "Legacy redirect requires WORKSPACE_BASE_DOMAIN and a valid LEGACY_WORKSPACE_SLUG.",
  );
if (legacy && legacy === `${legacySlug}.${base}`)
  throw new Error("Legacy redirect must not redirect to itself.");
const port = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(n) || n < 1024 || n > 65535)
    throw new Error(`${key} must be an integer between 1024 and 65535.`);
  return n;
};
const rtcStart = port("LIVEKIT_RTC_PORT_RANGE_START", 50000);
const rtcEnd = port("LIVEKIT_RTC_PORT_RANGE_END", 60000);
if (rtcStart > rtcEnd)
  throw new Error(
    "LIVEKIT_RTC_PORT_RANGE_START must not exceed LIVEKIT_RTC_PORT_RANGE_END.",
  );
const officeHosts = [office, ...(base ? [`*.${base}`] : [])];
const legacyRedirect = legacy
  ? [
      {
        match: [{ host: [legacy] }],
        handle: [
          {
            handler: "static_response",
            status_code: 308,
            headers: {
              Location: [`https://${legacySlug}.${base}{http.request.uri}`],
            },
          },
        ],
        terminal: true,
      },
    ]
  : [];
if (
  value("APP_URL") !== `https://${office}` ||
  value("LIVEKIT_URL") !== `wss://${rtc}`
)
  throw new Error("APP_URL and LIVEKIT_URL must match the configured domains.");
const key = value("LIVEKIT_API_KEY"),
  secret = value("LIVEKIT_API_SECRET");
if (secret.length < 32 || value("BETTER_AUTH_SECRET").length < 32)
  throw new Error("Use secrets with at least 32 characters.");
value("POSTGRES_PASSWORD");
value("DATABASE_URL");
const proxy = (dial: string) => ({
  handler: "reverse_proxy",
  upstreams: [{ dial }],
});
const caddy = {
  apps: {
    tls: {
      certificates: { automate: staticDomains },
      ...(base
        ? {
            automation: {
              policies: [
                { subjects: staticDomains },
                { subjects: [`*.${base}`], on_demand: true },
              ],
              on_demand: {
                permission: {
                  module: "http",
                  endpoint: "http://127.0.0.1:3001/internal/tls-allow",
                },
              },
            },
          }
        : {}),
    },
    layer4: {
      servers: {
        public: {
          listen: [":443"],
          routes: [
            {
              match: [{ tls: { sni: [turn] } }],
              handle: [
                { handler: "tls" },
                { handler: "proxy", upstreams: [{ dial: ["127.0.0.1:5349"] }] },
              ],
            },
            {
              handle: [
                {
                  handler: "proxy",
                  proxy_protocol: "v2",
                  upstreams: [{ dial: ["127.0.0.1:8443"] }],
                },
              ],
            },
          ],
        },
      },
    },
    http: {
      servers: {
        https: {
          listen: ["127.0.0.1:8443"],
          protocols: ["h1", "h2"],
          listener_wrappers: [
            {
              wrapper: "proxy_protocol",
              allow: ["127.0.0.1/32", "::1/128"],
              fallback_policy: "reject",
            },
            { wrapper: "tls" },
          ],
          tls_connection_policies: [{}],
          // Explicit static certificates prevent the wildcard host matcher requesting DNS-01.
          automatic_https: {
            disable_redirects: true,
            disable_certificates: true,
          },
          strict_sni_host: true,
          routes: [
            {
              match: [{ path: ["/internal*"] }],
              handle: [{ handler: "static_response", status_code: 404 }],
              terminal: true,
            },
            ...legacyRedirect,
            { match: [{ host: [rtc] }], handle: [proxy("127.0.0.1:7880")] },
            {
              match: [{ host: officeHosts, path: ["/api", "/api/*"] }],
              handle: [proxy("127.0.0.1:3001")],
            },
            {
              match: [{ host: officeHosts }],
              handle: [proxy("127.0.0.1:3000")],
            },
            { handle: [{ handler: "static_response", status_code: 404 }] },
          ],
        },
        redirect: {
          listen: [":80"],
          routes: [
            ...legacyRedirect,
            {
              match: [{ host: [...officeHosts, rtc, turn] }],
              handle: [
                {
                  handler: "static_response",
                  status_code: 308,
                  headers: {
                    Location: ["https://{http.request.host}{http.request.uri}"],
                  },
                },
              ],
            },
            { handle: [{ handler: "static_response", status_code: 404 }] },
          ],
        },
      },
    },
  },
};
// JSON is valid YAML; use serialization rather than interpolating secrets into YAML.
const livekit = {
  port: 7880,
  bind_addresses: ["0.0.0.0"],
  rtc: {
    tcp_port: 7881,
    port_range_start: rtcStart,
    port_range_end: rtcEnd,
    use_external_ip: true,
  },
  keys: { [key]: secret },
  turn: {
    enabled: true,
    domain: turn,
    tls_port: 5349,
    udp_port: 3478,
    external_tls: true,
  },
  room: { empty_timeout: 60, departure_timeout: 10 },
  logging: { level: "info" },
};
await mkdir("deploy/generated", { recursive: true });
await writeFile(
  "deploy/generated/caddy.json",
  JSON.stringify(caddy, null, 2) + "\n",
  { mode: 0o600 },
);
await writeFile(
  "deploy/generated/livekit.yaml",
  JSON.stringify(livekit, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  "Wrote Caddy TLS routing and LiveKit configuration in deploy/generated. Configure the firewall before starting containers.",
);
