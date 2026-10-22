"use client";
import { useCallback, useEffect, useState } from "react";
import { Profile } from "./OfficeApp";
import { useWorkspaceApi } from "@/lib/workspace-api";
import { APIError, type User } from "@/lib/api";
export default function AccountProfile() {
  const { api } = useWorkspaceApi();
  const [user, setUser] = useState<User | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: User; method: string }>("/me");
      if (result.method.startsWith("workspace-oidc:")) {
        setError(
          "Sign in with your personal account to edit your shared name and avatar.",
        );
        return;
      }
      setUser(result.user);
    } catch (error) {
      if (error instanceof APIError && error.status === 401) {
        sessionStorage.setItem(
          "profile-return",
          location.pathname + location.search,
        );
        location.replace("/login");
      } else setError((error as Error).message);
    }
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <main style={{ maxWidth: 740, margin: "5vh auto", padding: 24 }}>
      <a href="/workspaces">Back to workspaces</a>
      <h1>Your account profile</h1>
      <p>Your name and avatar are shared across your workspaces.</p>
      {error ? (
        <p role="alert">{error}</p>
      ) : user ? (
        <Profile
          user={user}
          saved={async () => {
            await refresh();
            setSaved(true);
          }}
        />
      ) : (
        <p>Loading…</p>
      )}
      {saved && (
        <p role="status">Profile saved. You can return to your office tab.</p>
      )}
    </main>
  );
}
