"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

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
  slug,
}: {
  workspaceId: string;
  slug: string;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [issuer, setIssuer] = useState(""),
    [clientId, setClientId] = useState(""),
    [secret, setSecret] = useState(""),
    [domain, setDomain] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const path = `/workspaces/${workspaceId}/oidc`;
  async function refresh() {
    const data = await api<Settings>(path);
    setSettings(data);
    setIssuer(data.connection?.issuer || "");
    setClientId(data.connection?.clientId || "");
    setDomain(data.connection?.domain || "");
    setSecret("");
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [workspaceId]); // component is keyed by workspace
  async function run(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const connection = settings?.connection;
  return (
    <div className="space-y-4 mt-6 border-t pt-6">
      <h3 className="font-semibold">Workspace SSO</h3>
      {error && <p role="alert">{error}</p>}
      {!settings ? (
        <p>Loading SSO settings…</p>
      ) : (
        <>
          <p>
            {connection?.enabled
              ? `Enabled for @${connection.domain}. New people join as members.`
              : "Workspace SSO is disabled."}
          </p>
          {connection?.enabled && (
            <>
              <a
                className="underline"
                href={`/login?workspace=${encodeURIComponent(slug)}`}
              >
                Workspace sign-in link
              </a>
              {settings.canLink && (
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() =>
                    void run(() =>
                      redirect(connection.providerId, true, workspaceId),
                    )
                  }
                >
                  {settings.linked
                    ? "Reconnect your SSO account"
                    : "Connect your SSO account"}
                </Button>
              )}
            </>
          )}
          {settings.canConfigure && (
            <>
              <p className="text-sm">
                Use an OIDC application with the authorization code flow, PKCE
                and verified email claims. Verify your organization's domain in
                DNS before enabling automatic membership.
              </p>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() =>
                    api(path, "PUT", {
                      issuer,
                      clientId,
                      domain,
                      ...(secret ? { clientSecret: secret } : {}),
                    }),
                  );
                }}
              >
                <label className="block">
                  Issuer URL
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
                  Client ID
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
                  Client secret
                  <input
                    className="block w-full rounded border p-2"
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    required={!connection}
                    maxLength={4096}
                    autoComplete="new-password"
                    placeholder={
                      connection ? "Leave blank to keep the saved secret" : ""
                    }
                  />
                </label>
                <label className="block">
                  Organization email domain
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
                <p className="text-sm">
                  Saving disables SSO and signs out its active sessions.
                  Changing issuer, client ID or domain creates a new callback
                  URL and requires existing accounts to reconnect.
                </p>
                <Button type="submit" disabled={busy}>
                  Save connection
                </Button>
              </form>
              {connection && (
                <div className="space-y-3">
                  <p>
                    Register this exact redirect URI with your identity
                    provider:
                  </p>
                  <code className="block break-all">
                    {connection.redirectURI}
                  </code>
                  <p>Add this DNS TXT record:</p>
                  <dl>
                    <dt>Name</dt>
                    <dd className="break-all">
                      <code>{connection.dnsName}</code>
                    </dd>
                    <dt>Value</dt>
                    <dd className="break-all">
                      <code>{connection.dnsValue}</code>
                    </dd>
                  </dl>
                  <p role="status">
                    {connection.verified
                      ? "Domain verified"
                      : "Domain not verified yet"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() => api(`${path}/verify`, "POST", {}))
                      }
                    >
                      Verify domain
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          api(path, "PATCH", { enabled: !connection.enabled }),
                        )
                      }
                    >
                      {connection.enabled
                        ? "Disable SSO"
                        : "Verify and enable SSO"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          {!settings.canLink && (
            <p className="text-sm">
              Sign in with Google or your original account to configure SSO or
              connect another login method.
            </p>
          )}
        </>
      )}
    </div>
  );
}
