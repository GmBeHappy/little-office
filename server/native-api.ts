import { Elysia, type AnyElysia } from "elysia";
import { and, eq, gt, lt } from "drizzle-orm";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { auth, sessionFor } from "./auth";
import { config } from "./config";
import { db } from "./db";
import { nativeHandoffs, sessions } from "./schema";
import { Problem } from "./workspace-access";

const digest = (input: string) =>
  createHash("sha256").update(input).digest("base64url");
const challenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const nativeApi: AnyElysia = new Elysia({ name: "native-auth" })
  .onAfterHandle(({ set }) => {
    set.headers["cache-control"] = "no-store";
  })
  .post("/api/native/authorize", async ({ request, body }) => {
    const identity = await sessionFor(request.headers);
    if (!identity || identity.user.mustChangePassword)
      throw new Problem(401, "Sign in before connecting the app.");
    const input = z
      .object({ challenge, state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/) })
      .strict()
      .parse(body);
    const code = randomBytes(32).toString("base64url");
    // One pending grant per browser session. Tokens never travel in callback URLs.
    await db.transaction(async (tx) => {
      await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, identity.session.id))
        .for("update");
      await tx
        .delete(nativeHandoffs)
        .where(lt(nativeHandoffs.expiresAt, new Date()));
      await tx
        .delete(nativeHandoffs)
        .where(eq(nativeHandoffs.sessionId, identity.session.id));
      await tx
        .insert(nativeHandoffs)
        .values({
          codeHash: digest(code),
          sessionId: identity.session.id,
          challenge: input.challenge,
          expiresAt: new Date(Date.now() + 60000),
        });
    });
    return { url: `littleoffice://auth?code=${code}&state=${input.state}` };
  })
  .post("/api/native/exchange", async ({ body }) => {
    const input = z
      .object({
        code: challenge,
        verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
      })
      .strict()
      .parse(body);
    const [grant] = await db
      .delete(nativeHandoffs)
      .where(
        and(
          eq(nativeHandoffs.codeHash, digest(input.code)),
          eq(nativeHandoffs.challenge, digest(input.verifier)),
          gt(nativeHandoffs.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!grant)
      throw new Problem(
        401,
        "App sign-in expired or already used. Start again.",
      );
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, grant.sessionId),
          gt(sessions.expiresAt, new Date()),
        ),
      );
    if (!session) throw new Problem(401, "Sign in again.");
    const signature = createHmac("sha256", config.secret)
      .update(session.token)
      .digest("base64");
    const token = `${session.token}.${signature}`;
    if (!(await sessionFor(new Headers({ authorization: `Bearer ${token}` }))))
      throw new Problem(401, "Sign in again.");
    return {
      token,
      expiresAt: session.expiresAt,
      cookieName: (await auth.$context).authCookies.sessionToken.name,
    };
  });
