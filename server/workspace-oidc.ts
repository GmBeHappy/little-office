import { and, count, eq } from "drizzle-orm";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { createAuthorizationURL, type OAuthProvider } from "better-auth/oauth2";
import type { BetterAuthPlugin } from "better-auth";
import {
  createLocalJWKSet,
  jwtVerify,
  type JWTPayload,
  type JSONWebKeySet,
} from "jose";
import { z } from "zod";
import { config } from "./config";
import { db } from "./db";
import { memberships, workspaceOidc, workspaces } from "./schema";
import { oidcJson, oidcUrl } from "./oidc-network";

export type WorkspaceOIDC = typeof workspaceOidc.$inferSelect;
export const oidcForm = z
  .object({
    issuer: z
      .string()
      .trim()
      .max(2048)
      .url()
      .refine((s) => {
        try {
          return !oidcUrl(s).search;
        } catch {
          return false;
        }
      }, "Use a public HTTPS issuer without query parameters."),
    clientId: z.string().trim().min(1).max(512),
    clientSecret: z.string().min(1).max(4096).optional(),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
  })
  .strict();
export const oidcMethod = (connection: WorkspaceOIDC) =>
  `workspace-oidc:${connection.providerId}`;
export const encryptSecret = (secret: string) =>
  symmetricEncrypt({ key: config.secret, data: secret });
export async function connectionFor(providerId: string) {
  const [connection] = await db
    .select()
    .from(workspaceOidc)
    .where(eq(workspaceOidc.providerId, providerId));
  return connection;
}
export async function currentConnection(
  connection: WorkspaceOIDC,
  database:
    typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db,
) {
  const [current] = await database
    .select()
    .from(workspaceOidc)
    .where(eq(workspaceOidc.providerId, connection.providerId));
  if (
    !current?.enabled ||
    !current.verifiedAt ||
    current.revision !== connection.revision
  )
    throw new Error(
      "Workspace SSO changed or is disabled. Start sign-in again.",
    );
  return current;
}
export async function provisionOidcMember(
  connection: WorkspaceOIDC,
  userId: string,
) {
  await db.transaction(async (tx) => {
    await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, connection.workspaceId))
      .for("update");
    await currentConnection(connection, tx);
    const [member] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, connection.workspaceId),
          eq(memberships.userId, userId),
        ),
      );
    if (member) {
      if (!member.approved)
        throw new Error("Workspace membership is disabled.");
      return;
    }
    const [total] = await tx
      .select({ value: count() })
      .from(memberships)
      .where(eq(memberships.workspaceId, connection.workspaceId));
    if (total.value >= 50)
      throw new Error("This workspace has reached its member limit.");
    await tx.insert(memberships).values({
      workspaceId: connection.workspaceId,
      userId,
      role: "member",
      approved: true,
    });
  });
}

export async function discoverOidc(issuer: string) {
  const metadata = await oidcJson(
    `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
  );
  const result = z
    .object({
      issuer: z.literal(issuer),
      authorization_endpoint: z.string().url(),
      token_endpoint: z.string().url(),
      jwks_uri: z.string().url(),
      id_token_signing_alg_values_supported: z.array(z.string()),
      token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
    })
    .parse(metadata);
  for (const url of [
    result.authorization_endpoint,
    result.token_endpoint,
    result.jwks_uri,
  ])
    oidcUrl(url);
  return result;
}
export async function workspaceOidcPlugin(
  connection: WorkspaceOIDC,
): Promise<BetterAuthPlugin> {
  const metadata = await discoverOidc(connection.issuer);
  const secret = await symmetricDecrypt({
    key: config.secret,
    data: connection.clientSecret,
  });
  const algorithms = metadata.id_token_signing_alg_values_supported.filter(
    (a) =>
      [
        "RS256",
        "RS384",
        "RS512",
        "PS256",
        "PS384",
        "PS512",
        "ES256",
        "ES384",
        "ES512",
        "EdDSA",
      ].includes(a),
  );
  if (!algorithms.length)
    throw new Error("OIDC provider must support signed ID tokens.");
  const methods = metadata.token_endpoint_auth_methods_supported || [
    "client_secret_basic",
  ];
  const basic = methods.includes("client_secret_basic");
  if (!basic && !methods.includes("client_secret_post"))
    throw new Error("OIDC requires client_secret_basic or client_secret_post.");
  const provider: OAuthProvider<JWTPayload> = {
    id: connection.providerId,
    name: "Workspace SSO",
    issuer: connection.issuer,
    requiresIdTokenNonce: true,
    options: { overrideUserInfoOnSignIn: false },
    accountSubject: ({ profile }) => profile.sub || "",
    createAuthorizationURL: (data) =>
      createAuthorizationURL({
        id: connection.providerId,
        options: { clientId: connection.clientId },
        authorizationEndpoint: metadata.authorization_endpoint,
        redirectURI: data.redirectURI,
        state: data.state,
        codeVerifier: data.codeVerifier,
        nonce: data.idTokenNonce,
        scopes: ["openid", "email", "profile"],
        responseMode: "query",
      }),
    async validateAuthorizationCode(data) {
      if (!data.codeVerifier) throw new Error("Missing PKCE verifier.");
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: data.code,
        redirect_uri: data.redirectURI,
        code_verifier: data.codeVerifier,
      });
      const headers: Record<string, string> = {};
      if (basic) {
        const encode = (value: string) =>
          new URLSearchParams({ x: value }).toString().slice(2);
        headers.authorization = `Basic ${Buffer.from(`${encode(connection.clientId)}:${encode(secret)}`).toString("base64")}`;
      } else {
        body.set("client_id", connection.clientId);
        body.set("client_secret", secret);
      }
      const tokens = await oidcJson(metadata.token_endpoint, body, headers);
      const idToken = z.string().min(1).parse(tokens.id_token);
      // This app only uses the signed identity; do not retain enterprise access or refresh tokens.
      return { idToken };
    },
    async getUserInfo(tokens) {
      if (!tokens.idToken || !tokens.expectedIdTokenNonce) return null;
      const jwks = z
        .object({ keys: z.array(z.looseObject({ kty: z.string() })).max(100) })
        .parse(await oidcJson(metadata.jwks_uri));
      const verified = await jwtVerify(
        tokens.idToken,
        createLocalJWKSet(jwks),
        {
          issuer: connection.issuer,
          audience: connection.clientId,
          algorithms,
          requiredClaims: ["sub", "exp", "iat", "nonce"],
          maxTokenAge: "10m",
        },
      ).catch(() => null);
      if (!verified) return null;
      const { payload } = verified;
      if (
        payload.nonce !== tokens.expectedIdTokenNonce ||
        !payload.sub ||
        (payload.azp !== undefined && payload.azp !== connection.clientId) ||
        (Array.isArray(payload.aud) &&
          payload.aud.length > 1 &&
          payload.azp !== connection.clientId) ||
        payload.email_verified !== true ||
        typeof payload.email !== "string" ||
        !z.email().safeParse(payload.email).success ||
        payload.email.split("@")[1].toLowerCase() !== connection.domain
      )
        return null;
      await currentConnection(connection);
      return {
        user: {
          email: payload.email.toLowerCase(),
          emailVerified: true,
          name:
            typeof payload.name === "string"
              ? payload.name.slice(0, 200)
              : payload.email,
        },
        data: payload,
      };
    },
  };
  return {
    id: "workspace-oidc",
    init: () => ({ context: { socialProviders: [provider] } }),
  };
}
