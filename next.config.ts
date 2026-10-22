import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  // Preserve the ingress origin for internal rewrites behind the loopback reverse proxy.
  skipProxyUrlNormalize: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:3001"}/api/:path*`,
      },
    ];
  },
};
export default config;
