import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { genericOAuth, username } from "better-auth/plugins";
import { config, oidcConfigured, oidcProvider } from "./config";
import { db, settings } from "./db";

export const auth = betterAuth({
  database: db,
  baseURL: config.origin,
  basePath: "/api/auth",
  secret: config.secret,
  trustedOrigins: [config.origin],
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: ["127.0.0.1", "::1"],
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    password: {
      hash: (password) =>
        Bun.password.hash(password, {
          algorithm: "argon2id",
          memoryCost: 19456,
          timeCost: 2,
        }),
      verify: ({ hash, password }) => Bun.password.verify(password, hash),
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "member", input: false },
      approved: { type: "boolean", defaultValue: false, input: false },
      avatar: { type: "string", defaultValue: "sage", input: false },
      availability: { type: "string", defaultValue: "available", input: false },
      statusText: { type: "string", defaultValue: "", input: false },
      mustChangePassword: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 8 * 60 * 60,
    disableSessionRefresh: true,
    updateAge: 60 * 60,
    freshAge: 10 * 60,
    cookieCache: { enabled: false },
    additionalFields: {
      method: { type: "string", defaultValue: "password", input: false },
      policyVersion: { type: "number", defaultValue: 1, input: false },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: true,
    },
    encryptOAuthTokens: true,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: { "/sign-in/username": { window: 60, max: 8 } },
  },
  plugins: [
    username(),
    ...(oidcConfigured
      ? [
          genericOAuth({
            config: [
              {
                providerId: oidcProvider,
                discoveryUrl: `${config.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
                clientId: config.clientId,
                clientSecret: config.clientSecret || undefined,
                scopes: ["openid", "profile", "email"],
                pkce: true,
                requireIdTokenVerification: true,
              },
            ],
          }),
        ]
      : []),
  ],
  databaseHooks: {
    session: {
      create: {
        before: async (session, ctx) => {
          const policy = await settings();
          const method = ctx?.path?.includes("callback") ? "sso" : "password";
          if (!policy[method])
            throw new APIError("FORBIDDEN", {
              message: "This login method is disabled.",
            });
          return {
            data: { ...session, method, policyVersion: policy.version },
          };
        },
      },
    },
  },
});

export async function sessionFor(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const policy = await settings();
  if (!(session.session.method === "sso" ? policy.sso : policy.password))
    return null;
  return session;
}
export type AuthSession = NonNullable<Awaited<ReturnType<typeof sessionFor>>>;
