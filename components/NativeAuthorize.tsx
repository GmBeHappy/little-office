"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
export default function NativeAuthorize() {
  const params = useSearchParams(),
    challenge = params.get("challenge"),
    state = params.get("state");
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [google, setGoogle] = useState(false);
  const valid =
    /^[A-Za-z0-9_-]{43}$/.test(challenge || "") &&
    /^[A-Za-z0-9_-]{32,128}$/.test(state || "");
  useEffect(() => {
    if (!valid) return;
    sessionStorage.setItem(
      "native-return",
      location.pathname + location.search,
    );
    void api<{ user: { name: string } }>("/me")
      .then((r) => setName(r.user.name))
      .catch(() => {});
    void api<{ googleConfigured: boolean }>("/saas/config")
      .then((r) => setGoogle(r.googleConfigured))
      .catch((e) => setError(e.message));
  }, [valid]);
  async function connect() {
    try {
      const result = await api<{ url: string }>("/native/authorize", {
        challenge,
        state,
      });
      sessionStorage.removeItem("native-return");
      location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!valid)
    return <p role="alert">Start sign-in from the Little Office app.</p>;
  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", padding: 24 }}>
      <h1>Connect Little Office</h1>
      {name ? (
        <>
          <p>Continue as {name} on your Mac or iPhone.</p>
          <button onClick={() => void connect()}>Continue to app</button>
        </>
      ) : (
        <>
          <p>Sign in to connect your workspaces.</p>
          <a href="/login">Username, password or SSO →</a>
          {google && (
            <p>
              <button
                onClick={async () => {
                  try {
                    const result = await api<{ url: string }>(
                      "/auth/sign-in/social",
                      {
                        provider: "google",
                        callbackURL: location.pathname + location.search,
                      },
                    );
                    location.assign(result.url);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Continue with Google
              </button>
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
