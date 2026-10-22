import { Problem } from "./workspace-access";
import type { AuthSession } from "./auth";
export function requireSession(s: AuthSession | null, owner = false) {
  if (!s) throw new Error("Please sign in.");
  if (!s.user.approved) throw new Error("Your account is awaiting approval.");
  if (s.user.mustChangePassword)
    throw new Error(
      "Change your temporary password before entering the office.",
    );
  if (owner && s.user.role !== "owner")
    throw new Error("Owner access required.");
  return s;
}
export function recent(s: AuthSession) {
  if (Date.now() - new Date(s.session.createdAt).getTime() > 600000)
    throw new Error("Sign in again before changing authentication settings.");
}

export function requireWorkspaceManager(identity: AuthSession | null) {
  const session = requireSession(identity);
  if (!["owner", "admin"].includes(session.user.role))
    throw new Problem(403, "Workspace administrator access required.");
  return session;
}
