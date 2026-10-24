"use client";
import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { useWorkspaceApi } from "@/lib/workspace-api";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { api as portalApi, type AppConfig } from "@/lib/api";
import { loginSchema } from "@/shared/forms";
import { nativeAuthorization } from "@/lib/native-login";
import { workspaceSlug } from "@/shared/workspace-domains";
import Brand from "./Brand";
import { FormInput, FormError } from "./FormInput";
import { Button } from "./ui/button";
import styles from "./Login.module.css";

type WorkspaceLogin = {
  workspace: { name: string; slug: string; url: string | null };
  providerId: string | null;
};
export default function Login({
  config,
  refresh,
  error = "",
}: {
  config: AppConfig | null;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  error?: string;
}) {
  const { api } = useWorkspaceApi();
  const { t } = useI18n();
  const [workspace, setWorkspace] = useState<WorkspaceLogin | null>(null);
  const [resolving, setResolving] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [personal, setPersonal] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  useEffect(() => {
    let active = true;
    let address = new URLSearchParams(location.search).get("workspace");
    if (!address) {
      try {
        const pending = sessionStorage.getItem("workspace-return");
        if (pending?.startsWith("/workspace-connect?"))
          address = new URL(pending, location.origin).searchParams.get(
            "workspace",
          );
      } catch {
        /* Sign-in still works when browser storage is unavailable. */
      }
    }
    if (!address) {
      setResolving(false);
      return;
    }
    if (!workspaceSlug(address)) {
      setWorkspaceError("We couldn't find that workspace.");
      setResolving(false);
      return;
    }
    void portalApi<WorkspaceLogin>(`/saas/login/${encodeURIComponent(address)}`)
      .then((value) => {
        if (active) setWorkspace(value);
      })
      .catch(() => {
        if (active)
          setWorkspaceError(
            "We couldn't load this workspace. Check its address and try again.",
          );
      })
      .finally(() => {
        if (active) setResolving(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const teamProvider = workspace?.providerId;
  // A workspace's organization provider takes precedence over the legacy portal provider.
  const provider =
    !personal && teamProvider
      ? teamProvider
      : config?.sso
        ? config.provider
        : null;
  const showPassword = config?.password && (passwordOpen || !provider);
  async function social(id: string) {
    setBusy(true);
    setFailure("");
    try {
      const callback = new URL("/login", location.origin);
      if (workspace)
        callback.searchParams.set("workspace", workspace.workspace.slug);
      const result = await api<{ url: string }>("/auth/sign-in/social", {
        provider: id,
        callbackURL: callback.href,
        errorCallbackURL: callback.href,
      });
      location.assign(result.url);
    } catch (e) {
      setFailure((e as Error).message);
      setBusy(false);
    }
  }
  async function findWorkspace(event: React.FormEvent) {
    event.preventDefault();
    const value = slug.trim().toLowerCase();
    if (!workspaceSlug(value)) {
      setFailure("Enter the workspace name from your invitation.");
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      const result = await portalApi<WorkspaceLogin>(
        `/saas/login/${encodeURIComponent(value)}`,
      );
      let nativeJourney = false;
      try {
        nativeJourney = !!nativeAuthorization(
          sessionStorage.getItem("native-return"),
        );
      } catch {}
      location.assign(
        !nativeJourney && result.workspace.url
          ? result.workspace.url
          : `/login?workspace=${encodeURIComponent(value)}`,
      );
    } catch {
      setFailure(
        "We couldn't find that workspace. Check the name and try again.",
      );
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
      <div className={styles.layout}>
        <aside className={styles.story}>
          <span className={styles.eyebrow}>
            <i />
            {t("YOUR PEOPLE. YOUR PLACE.")}
          </span>
          <h2>
            {t("A little closer.")}
            <br />
            <span>{t("Even from afar.")}</span>
          </h2>
          <p>{t("A cozy corner of the internet to do good work, together.")}</p>
          <div className={styles.scene}>
            <div className={styles.sceneBar}>
              <span>
                <i />
                <i />
                <i />
              </span>
              {t("A place to work together")}
            </div>
            <img
              src="/landing/zen-small.svg"
              alt={t("A little pixel office surrounded by greenery")}
            />
            <div className={styles.sceneNote}>
              <span />
              {t("Good company. A little more focus.")}
            </div>
          </div>
          <p className={styles.caption}>
            {t("Walk over. Say hello. Make yourself at home.")}
          </p>
        </aside>
        <section className={styles.card} aria-label={t("Sign in")}>
          {workspace ? (
            <div className={styles.workspace}>
              <span className={styles.workspaceIcon}>
                <Building2 size={21} />
              </span>
              <div>
                <strong>{workspace.workspace.name}</strong>
                <span>
                  {workspace.workspace.url
                    ? new URL(workspace.workspace.url).host
                    : workspace.workspace.slug}
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.welcomeMark}>
              <KeyRound size={24} />
            </div>
          )}
          <span className={styles.eyebrow}>
            {t(
              workspace ? "YOUR WORKSPACE IS WAITING" : "MAKE YOURSELF AT HOME",
            )}
          </span>
          <h1>
            {t(workspace ? "Welcome to {workspace}." : "Welcome back.", {
              workspace: workspace?.workspace.name || "",
            })}
          </h1>
          <p className={styles.intro}>
            {t(
              personal
                ? "Use your personal account to continue to this workspace."
                : workspace
                  ? "Sign in and settle in with your team."
                  : "Sign in to find your people and pick up where you left off.",
            )}
          </p>
          {(failure || error) && (
            <p role="alert" className={styles.error}>
              {t(failure || error)}
            </p>
          )}
          {!config && error ? (
            <Button variant="secondary" onClick={() => location.reload()}>
              {t("Try again")}
            </Button>
          ) : resolving || !config ? (
            <p role="status" className={styles.loading}>
              {t("Loading sign-in options…")}
            </p>
          ) : workspaceError ? (
            <div className={styles.unavailable}>
              <p role="alert">{t(workspaceError)}</p>
              <Button variant="secondary" onClick={() => location.reload()}>
                {t("Try again")}
              </Button>
              <a
                href="/login"
                onClick={() => {
                  try {
                    sessionStorage.removeItem("workspace-return");
                  } catch {}
                }}
              >
                {t("Choose another workspace")}
              </a>
            </div>
          ) : (
            <>
              {personal && teamProvider && (
                <button
                  className={styles.textButton}
                  onClick={() => {
                    setPersonal(false);
                    setPasswordOpen(false);
                    setFailure("");
                  }}
                >
                  <ArrowLeft size={14} />
                  {t("Back to team sign-in")}
                </button>
              )}
              {provider && (
                <Button
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => void social(provider)}
                >
                  <ShieldCheck size={18} />
                  {t(
                    busy
                      ? "Opening sign-in…"
                      : personal
                        ? "Continue with your account"
                        : "Continue with your team",
                  )}
                  <ArrowRight size={18} />
                </Button>
              )}
              {config.googleConfigured && (
                <Button
                  variant="secondary"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => void social("google")}
                >
                  <span className={styles.googleMark} aria-hidden="true">
                    G
                  </span>
                  {t("Continue with Google")}
                </Button>
              )}
              {config.password && provider && (
                <button
                  className={styles.passwordToggle}
                  aria-expanded={!!showPassword}
                  onClick={() => setPasswordOpen(!passwordOpen)}
                >
                  <span />
                  {t("Use username and password")}
                  <ChevronDown
                    size={15}
                    style={{
                      transform: showPassword ? "rotate(180deg)" : undefined,
                    }}
                  />
                  <span />
                </button>
              )}
              {showPassword && (
                <FormProvider {...form}>
                  <form
                    className={styles.form}
                    noValidate
                    onSubmit={form.handleSubmit(async (values) => {
                      form.clearErrors("root");
                      try {
                        await api("/auth/sign-in/username", values);
                        await refresh();
                      } catch (e) {
                        form.setError("root", {
                          message: (e as Error).message,
                        });
                      }
                    })}
                  >
                    <FormInput
                      name="username"
                      label={t("Username")}
                      autoComplete="username"
                      required
                      placeholder={t("Your username")}
                    />
                    <FormInput
                      name="password"
                      label={t("Password")}
                      type="password"
                      autoComplete="current-password"
                      required
                      placeholder={t("Your password")}
                    />
                    <FormError />
                    <Button
                      type="submit"
                      className={styles.primary}
                      disabled={busy || form.formState.isSubmitting}
                    >
                      {t(
                        form.formState.isSubmitting
                          ? "Opening the door…"
                          : "Enter the office",
                      )}
                      <ArrowRight size={18} />
                    </Button>
                  </form>
                </FormProvider>
              )}
              {!provider && !config.password && !config.googleConfigured && (
                <p role="alert">
                  {t(
                    "Sign-in is unavailable. Please contact your workspace owner.",
                  )}
                </p>
              )}
              {teamProvider && !personal && (
                <button
                  className={styles.personal}
                  onClick={() => {
                    setPersonal(true);
                    setPasswordOpen(false);
                    setFailure("");
                  }}
                >
                  {t("Use a personal account instead")}
                </button>
              )}
              {!workspace && (
                <div className={styles.finder}>
                  <button
                    className={styles.textButton}
                    onClick={() => {
                      setFinding(!finding);
                      setFailure("");
                    }}
                    aria-expanded={finding}
                  >
                    <Building2 size={16} />
                    {t("Looking for your workspace?")}
                    <ArrowRight size={15} />
                  </button>
                  {finding && (
                    <form onSubmit={findWorkspace} className={styles.findForm}>
                      <label htmlFor="find-workspace">
                        {t("Workspace name")}
                      </label>
                      <div>
                        <input
                          id="find-workspace"
                          autoCapitalize="none"
                          autoCorrect="off"
                          placeholder="your-team"
                          required
                          maxLength={48}
                          value={slug}
                          onChange={(e) => setSlug(e.target.value)}
                        />
                        <Button type="submit" disabled={busy}>
                          {t("Find workspace")}
                        </Button>
                      </div>
                      <p>{t("Use the workspace name in your invitation.")}</p>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
          <footer className={styles.footnote}>
            <ShieldCheck size={14} />
            <span>{t("A private space for your team.")}</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
