import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { memberships, users, workspaces } from "./schema";
import type { AuthSession } from "./auth";
import { DEFAULT_WORKSPACE_ID } from "../shared/workspaces";

export class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function workspaceSession(
  identity: AuthSession | null,
  workspaceId: string,
) {
  if (!identity) throw new Problem(401, "Please sign in.");
  if (identity.workspaceId && identity.workspaceId !== workspaceId)
    throw new Problem(403, "This SSO session belongs to another workspace.");
  if (!z.uuid().safeParse(workspaceId).success)
    throw new Problem(404, "Workspace not found.");
  const [member] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, identity.user.id),
      ),
    );
  if (!member) throw new Problem(404, "Workspace not found.");
  const user = {
    ...identity.user,
    role: member.role,
    approved: member.approved,
    availability: member.availability,
    statusText: member.statusText,
    statusIcon: member.statusIcon,
  };
  if (!user.approved)
    throw new Problem(403, "Your account is awaiting approval.");
  if (user.mustChangePassword)
    throw new Problem(
      403,
      "Change your temporary password before entering the office.",
    );
  return { ...identity, user };
}
export function requireOperator(identity: AuthSession | null) {
  if (
    !identity ||
    identity.workspaceId ||
    !process.env.OFFICE_OPERATOR_IDS?.split(",")
      .map((id) => id.trim())
      .includes(identity.user.id)
  )
    throw new Problem(403, "Platform operator access required.");
  return identity;
}
export async function syncLegacyMembership(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (user)
    await db
      .insert(memberships)
      .values({
        workspaceId: DEFAULT_WORKSPACE_ID,
        userId,
        role: user.role === "owner" ? "owner" : "member",
        approved: user.approved,
        availability: user.availability,
        statusText: user.statusText,
        statusIcon: user.statusIcon,
      })
      .onConflictDoNothing();
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function manageWorkspace<T>(
  workspaceId: string,
  userId: string,
  operation: (tx: Transaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for("update");
    const [member] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, userId),
        ),
      );
    if (!member?.approved || !["owner", "admin"].includes(member.role))
      throw new Problem(403, "Workspace administrator access required.");
    return operation(tx);
  });
}
