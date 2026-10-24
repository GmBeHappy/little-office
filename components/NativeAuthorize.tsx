"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Laptop, ShieldCheck } from "lucide-react";
import { api, type User } from "@/lib/api";
import { nativeAuthorization } from "@/lib/native-login";
import { I18nProvider, LanguageToggle, useI18n } from "@/lib/i18n";
import Brand from "./Brand";
import { Button } from "./ui/button";
import styles from "./Login.module.css";

export default function NativeAuthorize() {
  return (
    <I18nProvider>
      <AuthorizeCard />
    </I18nProvider>
  );
}
function AuthorizeCard() {
  const params = useSearchParams();
  const authorization = nativeAuthorization(
    `/native/authorize?${params.toString()}`,
  );
  const path = authorization?.path;
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let active = true;
    setName("");
    setLoading(true);
    try {
      sessionStorage.setItem("native-return", path);
    } catch {
      setError("Allow browser storage to continue sign-in to the app.");
    }
    void api<{ user: User }>("/me")
      .then((r) => {
        if (active && !r.user.mustChangePassword) setName(r.user.name);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);
  async function connect() {
    if (!authorization || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>("/native/authorize", {
        challenge: authorization.challenge,
        state: authorization.state,
      });
      try {
        sessionStorage.removeItem("native-return");
      } catch {}
      location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/" aria-label={t("Little Office home")}>
          <Brand />
        </a>
        <LanguageToggle />
      </header>
      <section
        className={styles.card}
        style={{ maxWidth: 440, margin: "5vh auto" }}
        aria-label={t("Connect Little Office")}
      >
        <div className={styles.welcomeMark}>
          <Laptop size={24} />
        </div>
        <h1>{t("Connect Little Office")}</h1>
        {!authorization ? (
          <p role="alert" className={styles.error}>
            {t("Start sign-in from the Little Office app.")}
          </p>
        ) : loading ? (
          <p role="status" className={styles.loading}>
            {t("Loading sign-in options…")}
          </p>
        ) : name ? (
          <>
            <p className={styles.intro}>
              {t("Continue as {name} in the Little Office app.", { name })}
            </p>
            <Button
              className={styles.primary}
              disabled={busy}
              onClick={() => void connect()}
            >
              {t(busy ? "Opening the app…" : "Continue to app")}
              <ArrowRight size={18} />
            </Button>
          </>
        ) : (
          <>
            <p className={styles.intro}>
              {t("Sign in to connect your workspaces.")}
            </p>
            <a className={styles.primary} href={authorization.loginPath}>
              {t("Sign in")}
              <ArrowRight size={18} />
            </a>
          </>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {t(error)}
          </p>
        )}
        <footer className={styles.footnote}>
          <ShieldCheck size={14} />
          <span>{t("A private space for your team.")}</span>
        </footer>
      </section>
    </main>
  );
}
