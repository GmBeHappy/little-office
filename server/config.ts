function required(name: string) {
  const v = process.env[name];
  if (!v)
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and configure it.`,
    );
  return v;
}
export const config = {
  origin: process.env.APP_URL || "http://localhost:3000",
  port: Number(process.env.API_PORT || 3001),
  database: required("DATABASE_URL"),
  secret: required("BETTER_AUTH_SECRET"),
  livekitUrl: process.env.LIVEKIT_URL || "",
  livekitInternal:
    process.env.LIVEKIT_INTERNAL_URL || process.env.LIVEKIT_URL || "",
  livekitKey: process.env.LIVEKIT_API_KEY || "",
  livekitSecret: process.env.LIVEKIT_API_SECRET || "",
  issuer: process.env.OIDC_ISSUER || "",
  clientId: process.env.OIDC_CLIENT_ID || "",
  clientSecret: process.env.OIDC_CLIENT_SECRET || "",
};
if (config.secret.length < 32)
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
if (
  process.env.NODE_ENV === "production" &&
  !config.origin.startsWith("https://")
)
  throw new Error("Production APP_URL must use HTTPS.");
export const oidcConfigured = !!(config.issuer && config.clientId);
export const oidcProvider = `oidc-${Bun.hash(config.issuer).toString(16)}`;
