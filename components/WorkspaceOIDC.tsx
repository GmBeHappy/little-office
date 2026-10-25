"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { useI18n } from "@/lib/i18n";

async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || data.message || "Please try again.");
  return data;
}
async function redirect(provider: string, link = false, workspaceId?: string) {
  const result = await api<{ url: string }>(
    `/auth/${link ? "link-social" : "sign-in/social"}`,
    "POST",
    {
      provider,
      callbackURL: `${location.origin}${link ? (workspaceId ? `/workspaces?workspace=${workspaceId}` : "/workspaces") : "/login"}`,
      errorCallbackURL: `${location.origin}${link ? "/workspaces" : "/login"}`,
    },
  );
  location.assign(result.url);
}
export function SaaSSignIn({
  google,
  notify,
  link = false,
}: {
  google: boolean;
  notify: (message: string) => void;
  link?: boolean;
}) {
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSlug(new URLSearchParams(location.search).get("workspace") || "");
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4 mt-5">
      {google && (
        <Button
          className="w-full"
          variant="secondary"
          disabled={busy}
          onClick={() => void run(() => redirect("google", link))}
        >
          {link ? "Connect Google" : "Continue with Google"}
        </Button>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const provider = await api<{ providerId: string }>(
              `/saas/sso/${encodeURIComponent(slug.trim().toLowerCase())}`,
            );
            await redirect(provider.providerId, link);
          });
        }}
      >
        <label className="block text-sm" htmlFor="sso-workspace">
          Workspace address
        </label>
        <input
          id="sso-workspace"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="your-company"
          required
          maxLength={48}
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-md border p-2"
        />
        <Button
          type="submit"
          variant="secondary"
          className="w-full"
          disabled={busy}
        >
          {link
            ? "Connect and join with workspace SSO"
            : "Continue with workspace SSO"}
        </Button>
      </form>
    </div>
  );
}
type Connection = {
  enabled: boolean;
  providerId: string;
  domain: string;
  issuer?: string;
  clientId?: string;
  hasClientSecret?: boolean;
  verified?: boolean;
  redirectURI?: string;
  dnsName?: string;
  dnsValue?: string;
};
type Settings = {
  connection: Connection | null;
  linked: boolean;
  canConfigure: boolean;
  canLink: boolean;
};
export default function WorkspaceOIDC({
  workspaceId,
}: {
  workspaceId: string;
  slug?: string;
}) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [portal, setPortal] = useState(""),
    [slug, setSlug] = useState("");
  const [issuer, setIssuer] = useState(""),
    [clientId, setClientId] = useState(""),
    [secret, setSecret] = useState(""),
    [domain, setDomain] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/oidc`;
  async function refresh() {
    const [data, config, workspace] = await Promise.all([
      api<Settings>(path),
      api<{ portalOrigin: string }>("/saas/config"),
      api<{ slug: string }>(`/workspaces/${encodeURIComponent(workspaceId)}`),
    ]);
    setSettings(data);
    setPortal(config.portalOrigin);
    setSlug(workspace.slug);
    setIssuer(data.connection?.issuer || "");
    setClientId(data.connection?.clientId || "");
    setDomain(data.connection?.domain || "");
    setSecret("");
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [workspaceId]); // callers key this component by workspace
  async function run(action: () => Promise<unknown>, success: string) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied.");
    } catch {
      setError("Could not copy. Select the value and copy it manually.");
    }
  }
  const connection = settings?.connection;
  const personalURL = portal
    ? `${portal}/workspaces?workspace=${encodeURIComponent(workspaceId)}`
    : "";
  const copyField = (label: string, value: string) => (
    <div className="workspace-copy-field">
      <label>
        {t(label)}
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
      </label>
      <Button variant="secondary" onClick={() => void copy(value)}>
        {t("Copy {label}", { label: t(label) })}
      </Button>
    </div>
  );
  return (
    <div className="workspace-oidc">
      {error && (
        <div className="settings-feedback" role="alert">
          <p>{t(error)}</p>
          <Button
            variant="secondary"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            {t("Try again")}
          </Button>
        </div>
      )}
      {message && <p role="status">{t(message)}</p>}
      {loading && <p role="status">{t("Loading SSO settings…")}</p>}
      {settings && (
        <>
          <section className="settings-card">
            <h4>{t("Workspace SSO")}</h4>
            <p role="status">
              {connection?.enabled
                ? t("Enabled for @{domain}. New people join as members.", {
                    domain: connection.domain,
                  })
                : t("Workspace SSO is disabled.")}
            </p>
            <p className="muted">
              {t(
                "Only people with a verified email at your verified organization domain can join automatically. They join as members, never as admins or owners.",
              )}
            </p>
            {connection?.enabled && (
              <div className="flex flex-wrap gap-3">
                <a
                  className="underline"
                  href={`${portal}/login?workspace=${encodeURIComponent(slug)}`}
                >
                  {t("Workspace sign-in link")}
                </a>
                {settings.canLink && (
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={() =>
                      void run(
                        () =>
                          redirect(connection.providerId, true, workspaceId),
                        "SSO account connected.",
                      )
                    }
                  >
                    {t(
                      settings.linked
                        ? "Reconnect your SSO account"
                        : "Connect your SSO account",
                    )}
                  </Button>
                )}
              </div>
            )}
          </section>
          {settings.canConfigure ? (
            <>
              <section className="settings-card">
                <h4>{t("1. Save your identity provider")}</h4>
                <p className="muted">
                  {t(
                    "Create an OpenID Connect (OIDC) application using authorization code flow with PKCE. Allow the openid, profile and email scopes and provide a verified email claim. Enter one organization email domain below.",
                  )}
                </p>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () =>
                        api(path, "PUT", {
                          issuer,
                          clientId,
                          domain,
                          ...(secret ? { clientSecret: secret } : {}),
                        }),
                      "Connection saved. Register the callback and verify your domain before enabling SSO.",
                    );
                  }}
                >
                  <fieldset disabled={busy} className="space-y-4">
                    <label className="block">
                      {t("Issuer URL")}
                      <input
                        className="block w-full rounded border p-2"
                        type="url"
                        value={issuer}
                        onChange={(e) => setIssuer(e.target.value)}
                        placeholder="https://identity.example.com/realms/company"
                        maxLength={2048}
                        required
                      />
                    </label>
                    <label className="block">
                      {t("Client ID")}
                      <input
                        className="block w-full rounded border p-2"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        maxLength={512}
                        required
                        autoComplete="off"
                      />
                    </label>
                    <label className="block">
                      {t("Client secret")}
                      <input
                        className="block w-full rounded border p-2"
                        type="password"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        required={!connection}
                        maxLength={4096}
                        autoComplete="new-password"
                        placeholder={
                          connection
                            ? t("Leave blank to keep the saved secret")
                            : ""
                        }
                      />
                      <small>
                        {t(
                          "Saved secrets are never shown. Leave this blank to keep the secret for an unchanged connection.",
                        )}
                      </small>
                    </label>
                    <label className="block">
                      {t("Organization email domain")}
                      <input
                        className="block w-full rounded border p-2"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="example.com"
                        maxLength={253}
                        required
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </label>
                    <p className="settings-feedback">
                      {t(
                        "Saving disables SSO and signs out its active sessions. Changing issuer, client ID or domain creates a new callback URL and requires existing accounts to reconnect.",
                      )}
                    </p>
                    <Button type="submit" disabled={busy}>
                      {t(busy ? "Saving…" : "Save connection")}
                    </Button>
                  </fieldset>
                </form>
              </section>
              <section className="settings-card">
                <h4>{t("2. Register the callback and verify your domain")}</h4>
                {!connection ? (
                  <p className="muted">
                    {t(
                      "Save the connection first. Your exact callback URL and DNS TXT record will appear here.",
                    )}
                  </p>
                ) : (
                  <>
                    <p>
                      {t(
                        "Register this exact callback URL in your identity provider. It uses the main Little Office portal, even when your workspace has its own subdomain.",
                      )}
                    </p>
                    {copyField("Callback URL", connection.redirectURI || "")}
                    <p>
                      {t(
                        "Add this TXT record at your domain’s DNS provider. Keep the value unchanged, then select Verify domain. DNS changes may take time to appear.",
                      )}
                    </p>
                    {copyField("DNS record name", connection.dnsName || "")}
                    {copyField("DNS record value", connection.dnsValue || "")}
                    <p role="status">
                      {t(
                        connection.verified
                          ? "Domain verified"
                          : "Domain not verified yet",
                      )}
                    </p>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => api(`${path}/verify`, "POST", {}),
                          "Domain verified.",
                        )
                      }
                    >
                      {t("Verify domain")}
                    </Button>
                  </>
                )}
              </section>
              <section className="settings-card">
                <h4>{t("3. Enable workspace SSO")}</h4>
                <p className="muted">
                  {t(
                    "After registering the callback, enable SSO to verify the provider and domain again. Keep your personal owner login as a recovery method.",
                  )}
                </p>
                <Button
                  disabled={busy || !connection}
                  onClick={() => {
                    if (connection)
                      void run(
                        () =>
                          api(path, "PATCH", { enabled: !connection.enabled }),
                        connection.enabled
                          ? "Workspace SSO disabled."
                          : "Workspace SSO enabled.",
                      );
                  }}
                >
                  {t(
                    connection?.enabled
                      ? "Disable SSO"
                      : "Verify and enable SSO",
                  )}
                </Button>
              </section>
            </>
          ) : (
            <section className="settings-card">
              <h4>{t("Owner access required")}</h4>
              <p>
                {t(
                  settings.canLink
                    ? "Only workspace owners can configure the identity provider."
                    : "Use the workspace owner’s original personal account (or Google if available) to configure SSO. A workspace SSO session cannot change its own sign-in provider.",
                )}
              </p>
            </section>
          )}
          {personalURL && (
            <p className="settings-note">
              {t(
                "Authentication changes need a recent personal sign-in. If asked to sign in again, open the portal, sign out and sign back in with your personal account, then select this workspace.",
              )}{" "}
              <a className="underline" href={personalURL}>
                {t("Open workspace in personal portal")}
              </a>
            </p>
          )}
        </>
      )}
    </div>
  );
}
