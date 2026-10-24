"use client";
import { useCallback, useEffect, useState } from "react";
import { Login, PasswordChange } from "./OfficeApp";
import { api, type AppConfig, type User } from "@/lib/api";
import { loginReturnTarget } from "@/lib/native-login";
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
        let target: ReturnType<typeof loginReturnTarget> = null;
        try {
          target = loginReturnTarget({
            "native-return": sessionStorage.getItem("native-return"),
            "workspace-return": sessionStorage.getItem("workspace-return"),
            "profile-return": sessionStorage.getItem("profile-return"),
          });
          if (target) sessionStorage.removeItem(target.key);
          else sessionStorage.removeItem("native-return");
        } catch {
          // Storage-disabled browsers can still reach the account dashboard.
        }
        location.assign(target?.path || "/workspaces");
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
      {error && changePassword && <p role="alert">{error}</p>}
      {changePassword ? (
        <PasswordChange onDone={refresh} />
      ) : (
        <Login
          config={config}
          refresh={refresh}
          notify={setError}
          error={error}
        />
      )}
    </>
  );
}
