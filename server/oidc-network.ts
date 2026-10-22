import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(address, prefix);
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("3fff::", 20, "ipv6");
export function publicAddress(address: string) {
  const type = isIP(address);
  return type === 4
    ? !blocked.check(address)
    : type === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}
export function oidcUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443")
  )
    throw new Error("OIDC endpoints must use public HTTPS on port 443.");
  return url;
}

// Pin the resolved address for the actual connection; redirects and DNS rebinding cannot reach internal services.
export async function oidcJson(
  urlString: string,
  body?: URLSearchParams,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const url = oidcUrl(urlString);
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  )
    throw new Error("OIDC endpoints must resolve to public addresses.");
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: body ? "POST" : "GET",
        agent: false,
        headers: {
          accept: "application/json",
          ...(body
            ? { "content-type": "application/x-www-form-urlencoded" }
            : {}),
          ...headers,
        },
        lookup: (_host, _options, callback) =>
          callback(null, addresses[0].address, addresses[0].family),
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error("OIDC endpoint returned an unsuccessful response."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 262144)
            req.destroy(new Error("OIDC response is too large."));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Invalid OIDC JSON response."));
          }
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("OIDC request timed out.")),
      10000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(body?.toString());
  });
}
