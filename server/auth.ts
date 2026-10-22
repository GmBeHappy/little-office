import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  users,
  sessions,
  accounts,
  verifications,
  memberships,
} from "./schema";
import { and, eq } from "drizzle-orm";
import {
  connectionFor,
  currentConnection,
  oidcMethod,
  provisionOidcMember,
  workspaceOidcPlugin,
  type WorkspaceOIDC,
} from "./workspace-oidc";
import { APIError } from "better-auth/api";
import { bearer, genericOAuth, username } from "better-auth/plugins";
import {
  config,
  oidcConfigured,
  oidcProvider,
  googleConfigured,
} from "./config";
import { syncLegacyMembership } from "./workspace-access";
import { db, settings } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
    transaction: true,
  }),
  baseURL: config.origin,
  basePath: "/api/auth",
  secret: config.secret,
  trustedOrigins: [config.origin],
  onAPIError: { errorURL: `${config.origin}/login` },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: config.googleId,
          clientSecret: config.googleSecret,
          prompt: "select_account",
        },
      }
    : {},
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
      statusIcon: { type: "string", defaultValue: "", input: false },
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
    bearer({ requireSignature: true }),
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
    user: {
      create: {
        after: async (user) => {
          if ((user as typeof user & { username?: string }).username)
            await syncLegacyMembership(user.id);
        },
      },
    },
    session: {
      create: {
        before: async (session, ctx) => {
          const policy = await settings();
          const method = ctx?.path?.includes("callback/google")
            ? "google"
            : ctx?.path?.includes("callback")
              ? "sso"
              : "password";
          if (method === "google" ? !googleConfigured : !policy[method])
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

// Google proves ownership of the same verified email, including recovery of an OIDC-only account.
export const googleAuth = betterAuth({
  ...auth.options,
  plugins: [username(), bearer({ requireSignature: true })],
  databaseHooks: {
    ...auth.options.databaseHooks,
    session: {
      create: {
        before: async (session) => {
          if (!googleConfigured)
            throw new APIError("FORBIDDEN", {
              message: "Google sign-in is disabled.",
            });
          return {
            data: {
              ...session,
              method: "google",
              policyVersion: (await settings()).version,
            },
          };
        },
      },
    },
  },
  account: {
    ...auth.options.account,
    accountLinking: {
      ...auth.options.account?.accountLinking,
      disableImplicitLinking: false,
      trustedProviders: ["google"],
      requireLocalEmailVerified: true,
    },
  },
  user: {
    ...auth.options.user,
    async validateUserInfo({ user, source }, context) {
      if (user.emailVerified !== true)
        return { error: "verified_google_email_required" };
      if (source.action === "link-account") {
        const domain = user.email?.split("@")[1]?.toLowerCase();
        const hostedDomain = source.oauth?.profile?.hd;
        if (
          domain === "gmail.com" ||
          (typeof hostedDomain === "string" &&
            hostedDomain.toLowerCase() === domain)
        )
          return;
        // Google is not authoritative for third-party mailboxes without a Workspace hosted-domain claim.
        const identity = await sessionFor(context.headers || new Headers());
        if (
          !identity ||
          identity.workspaceId ||
          identity.user.id !== user.id ||
          Date.now() - new Date(identity.session.createdAt).getTime() > 600000
        )
          return { error: "fresh_account_login_required" };
      }
    },
  },
});

async function createWorkspaceAuth(connection: WorkspaceOIDC) {
  await currentConnection(connection);
  return betterAuth({
    ...auth.options,
    socialProviders: {},
    plugins: [
      username(),
      bearer({ requireSignature: true }),
      await workspaceOidcPlugin(connection),
    ],
    advanced: {
      ...auth.options.advanced,
      // OAuth state is bound to both the provider and the exact configuration revision.
      cookies: {
        state: {
          name: `better-auth.${connection.providerId}.${connection.revision}.state`,
        },
        oauth_state: {
          name: `better-auth.${connection.providerId}.${connection.revision}.oauth_state`,
        },
      },
    },
    user: {
      ...auth.options.user,
      async validateUserInfo({ user, source }, context) {
        if (source.oauth?.providerId !== connection.providerId)
          return { error: "invalid_provider" };
        if (source.action === "link-account") {
          const identity = await sessionFor(context.headers || new Headers());
          if (
            !identity ||
            identity.workspaceId ||
            identity.user.id !== user.id ||
            identity.user.mustChangePassword ||
            Date.now() - new Date(identity.session.createdAt).getTime() > 600000
          )
            return { error: "fresh_account_login_required" };
        }
      },
    },
    databaseHooks: {
      ...auth.options.databaseHooks,
      account: {
        create: {
          after: async (account) => {
            await provisionOidcMember(connection, account.userId);
          },
        },
        update: {
          after: async (account) => {
            await provisionOidcMember(connection, account.userId);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [user] = await db
              .select({ disabled: users.disabled })
              .from(users)
              .where(eq(users.id, session.userId));
            if (!user || user.disabled)
              throw new APIError("FORBIDDEN", { message: "Account disabled." });
            await provisionOidcMember(connection, session.userId);
            return {
              data: {
                ...session,
                method: oidcMethod(connection),
                policyVersion: connection.revision,
              },
            };
          },
        },
      },
    },
  });
}

const workspaceAuths = new Map<
  string,
  { expires: number; auth: ReturnType<typeof createWorkspaceAuth> }
>();
let discoveries = 0;
export async function authForWorkspace(connection: WorkspaceOIDC) {
  await currentConnection(connection);
  const key = `${connection.providerId}:${connection.revision}`;
  const cached = workspaceAuths.get(key);
  if (cached && cached.expires > Date.now()) return cached.auth;
  if (discoveries >= 8)
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "SSO is busy. Please try again shortly.",
    });
  if (workspaceAuths.size >= 64)
    workspaceAuths.delete(workspaceAuths.keys().next().value!);
  discoveries++;
  const pending = createWorkspaceAuth(connection)
    .catch((error) => {
      workspaceAuths.delete(key);
      throw error;
    })
    .finally(() => {
      discoveries--;
    });
  workspaceAuths.set(key, { expires: Date.now() + 300000, auth: pending });
  return pending;
}

export async function sessionFor(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { users } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  const [user] = await db
    .select({ disabled: users.disabled })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!user || user.disabled) return null;
  if (session.session.method.startsWith("workspace-oidc:")) {
    const connection = await connectionFor(
      session.session.method.slice("workspace-oidc:".length),
    );
    if (
      !connection?.enabled ||
      !connection.verifiedAt ||
      connection.revision !== session.session.policyVersion
    )
      return null;
    const [member] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, connection.workspaceId),
          eq(memberships.userId, session.user.id),
        ),
      );
    if (!member?.approved) return null;
    return { ...session, workspaceId: connection.workspaceId };
  }
  const policy = await settings();
  if (
    !(session.session.method === "google"
      ? googleConfigured
      : session.session.method === "sso"
        ? policy.sso
        : policy.password)
  )
    return null;
  return { ...session, workspaceId: null };
}
export type AuthSession = NonNullable<Awaited<ReturnType<typeof sessionFor>>>;
