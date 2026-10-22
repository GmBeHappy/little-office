"use client";
import { useEffect, useState } from "react";
import { api, APIError } from "@/lib/api";
import { workspaceSlug } from "@/shared/workspace-domains";
export default function WorkspaceConnect() {
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const workspace = params.get("workspace") || "",
      state = params.get("state") || "";
    if (!workspaceSlug(workspace) || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
      setError("Open your workspace address to sign in.");
      return;
    }
    let active = true;
    // Check login before creating a one-use grant; effects can run twice during development.
    void api("/account")
      .then(async () => {
        if (!active) return;
        const result = await api<{ url: string }>("/workspace-login/grant", {
          workspace,
          state,
        });
        if (active) location.replace(result.url);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof APIError && error.status === 401) {
          sessionStorage.setItem(
            "workspace-return",
            location.pathname + location.search,
          );
          location.replace(`/login?workspace=${encodeURIComponent(workspace)}`);
        } else setError(error.message || "Unable to connect to the workspace.");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", padding: 24 }}>
      <h1>Connecting to your workspace</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <a href="/workspaces">Back to workspaces</a>
        </>
      ) : (
        <p>Please wait…</p>
      )}
    </main>
  );
}
