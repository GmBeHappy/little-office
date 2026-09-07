import { mkdir, writeFile } from "node:fs/promises";
const value = (key: string) => {
  const v = process.env[key];
  if (!v || v.includes("replace-with") || v.includes("example.com"))
    throw new Error(`Set ${key} in .env first.`);
  return v;
};
const office = value("OFFICE_DOMAIN"),
  rtc = value("RTC_DOMAIN"),
  turn = value("TURN_DOMAIN");
for (const domain of [office, rtc, turn])
  if (!/^[a-zA-Z0-9.-]+$/.test(domain) || !domain.includes("."))
    throw new Error("Use DNS hostnames without ports or URL schemes.");
if (new Set([office, rtc, turn]).size !== 3)
  throw new Error("Use three distinct DNS names for office, RTC, and TURN.");
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
    tls: { certificates: { automate: [office, rtc, turn] } },
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
          automatic_https: { disable_redirects: true },
          routes: [
            {
              match: [{ host: [office], path: ["/api/*"] }],
              handle: [proxy("127.0.0.1:3001")],
            },
            { match: [{ host: [office] }], handle: [proxy("127.0.0.1:3000")] },
            { match: [{ host: [rtc] }], handle: [proxy("127.0.0.1:7880")] },
          ],
        },
        redirect: {
          listen: [":80"],
          routes: [
            {
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
    port_range_start: 50000,
    port_range_end: 60000,
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
