"use client";
import { useCallback, useEffect, useState } from "react";
import { Login, PasswordChange } from "./OfficeApp";
import { api, type AppConfig, type User } from "@/lib/api";
export default function LoginPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [changePassword, setChangePassword] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setConfig(await api<AppConfig>("/config"));
    const response = await fetch("/api/me");
    if (response.ok) {
      const { user }: { user: User } = await response.json();
      if (user.mustChangePassword) setChangePassword(true);
      else {
        const pending = sessionStorage.getItem("native-return");
        if (pending?.startsWith("/native/authorize?")) {
          sessionStorage.removeItem("native-return");
          location.assign(pending);
        } else location.assign("/workspaces");
      }
    }
  }, []);
  useEffect(() => {
    const failure = new URLSearchParams(location.search).get("error");
    if (failure)
      setError(
        failure.replaceAll("_", " ").includes("account not linked")
          ? "This email already has an account. Sign in with your original login, then connect SSO in workspace settings."
          : "Sign-in could not be completed. Check your organization's SSO access and try again.",
      );
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {changePassword ? (
        <PasswordChange onDone={refresh} />
      ) : (
        <Login config={config} refresh={refresh} notify={setError} />
      )}
    </>
  );
}
