"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { workspaceForm } from "@/shared/saas/forms";
import { MAPS } from "@/shared/maps";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import styles from "./WorkspaceDashboard.module.css";
import Brand from "./Brand";
import WorkspaceMembers from "./WorkspaceMembers";
import WorkspaceOIDC, { SaaSSignIn } from "./WorkspaceOIDC";
type Role = "owner" | "admin" | "member";
type Person = {
  id: string;
  name: string;
  email: string;
  role: Role;
  approved?: boolean;
  workspaceId?: string | null;
};
type Workspace = {
  id: string;
  name: string;
  slug: string;
  mapId: string;
  role: Role;
};
type Detail = Workspace & {
  members: Person[];
  invitations: { id: string; email: string; role: Role }[];
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}
function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export default function WorkspaceDashboard() {
  const [user, setUser] = useState<Person | null>(null),
    [ready, setReady] = useState(false),
    [google, setGoogle] = useState(false),
    [workspaceDomain, setWorkspaceDomain] = useState<string | null>(null),
    [items, setItems] = useState<Workspace[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState("");
  const create = useForm<z.infer<typeof workspaceForm>>({
    resolver: zodResolver(workspaceForm),
    defaultValues: { name: "", slug: "", mapId: "nature-small" },
  });
  async function refresh() {
    setItems(await api<Workspace[]>("/workspaces"));
  }
  async function open(id: string) {
    setDetail(await api<Detail>(`/workspaces/${id}`));
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (new URLSearchParams(location.search).has("error"))
      setError(
        "Could not connect your login. Sign in again with your personal account and retry.",
      );
    const token = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      sessionStorage.setItem("cloud-invite", token);
      history.replaceState(null, "", location.pathname);
    }
    setInvite(sessionStorage.getItem("cloud-invite") || "");
    void (async () => {
      try {
        const config = await api<{
          googleConfigured: boolean;
          workspaceBaseDomain?: string | null;
        }>("/saas/config");
        setGoogle(config.googleConfigured);
        setWorkspaceDomain(config.workspaceBaseDomain || null);
        const response = await fetch("/api/account");
        if (response.ok) {
          setUser(await response.json());
          await refresh();
          const selected = new URLSearchParams(location.search).get(
            "workspace",
          );
          if (selected) await open(selected);
        } else if (response.status !== 401)
          throw new Error("Unable to load your account.");
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Cannot connect to the workspace service.",
        );
      } finally {
        setReady(true);
      }
    })();
  }, []);
  const maps = MAPS.filter((m) => m.size === "small").map((m) => ({
    value: m.id,
    label: m.name,
  }));
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/">
          <Brand /> <small>CLOUD</small>
        </Link>
        {user && (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/auth/sign-out", "POST", {});
                setUser(null);
                setDetail(null);
                setItems([]);
              })
            }
          >
            Sign out
          </button>
        )}
      </nav>
      <header className={styles.header}>
        <span className={styles.eyebrow}>A LITTLE SPACE FOR YOUR PEOPLE</span>
        <h1>
          {user
            ? `Welcome, ${user.name.split(" ")[0]}.`
            : "Your team’s next little home."}
        </h1>
        <p>Create a workspace, gather your people, and make it your own.</p>
      </header>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!ready ? (
        <p role="status">Loading your workspaces…</p>
      ) : !user ? (
        <section className={styles.card}>
          <h2>Sign in to Little Office</h2>
          <p>Use your existing account or continue with Google.</p>
          <Link href="/login">Username, password or SSO →</Link>
          {invite && (
            <p>
              Your invitation is saved. Sign in with the invited email to accept
              it.
            </p>
          )}
          <button
            className={styles.primary}
            disabled={!google || busy}
            onClick={() =>
              run(async () => {
                const data = await api<{ url: string }>(
                  "/auth/sign-in/social",
                  "POST",
                  { provider: "google", callbackURL: "/workspaces" },
                );
                location.assign(data.url);
              })
            }
          >
            Continue with Google
          </button>
          {!google && (
            <p className={styles.muted}>
              Google sign-in isn’t configured yet. The integration is ready for
              your OAuth credentials.
            </p>
          )}
        </section>
      ) : (
        <>
          {!user.workspaceId && (
            <section className={styles.card}>
              <h2>Connect your organization</h2>
              <p>
                Connect your SSO identity to join a workspace using your
                verified organization email.
              </p>
              <SaaSSignIn google={google} link notify={setError} />
            </section>
          )}
          {invite && (
            <section className={styles.card}>
              <h2>You have an invitation</h2>
              <p>
                Accept using {user.email}. Invitations only work for the email
                they were created for.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await api<{ workspaceId: string }>(
                      "/invitations/accept",
                      "POST",
                      { token: invite },
                    );
                    sessionStorage.removeItem("cloud-invite");
                    setInvite("");
                    await refresh();
                    await open(result.workspaceId);
                  })
                }
              >
                Accept invitation
              </button>{" "}
              <button
                onClick={() => {
                  sessionStorage.removeItem("cloud-invite");
                  setInvite("");
                }}
              >
                Dismiss
              </button>
            </section>
          )}
          <div className={styles.columns}>
            <section>
              <h2>
                Your workspaces <small>{items.length}</small>
              </h2>
              {!items.length && (
                <p>No workspaces yet. Create your first little office.</p>
              )}
              <div className={styles.list}>
                {items.map((item) => (
                  <button
                    className={styles.workspace}
                    key={item.id}
                    disabled={busy}
                    onClick={() => run(() => open(item.id))}
                  >
                    <span className={styles.map}>✿</span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        /{item.slug} · {item.role}
                      </small>
                    </span>
                    <span>↗</span>
                  </button>
                ))}
              </div>
            </section>
            <section className={styles.card}>
              <h2>Create a workspace</h2>
              <p>
                Free preview · Up to 5 owned workspaces and 50 members each.
              </p>
              <form
                onSubmit={create.handleSubmit((values) =>
                  run(async () => {
                    const result = await api<Workspace>(
                      "/workspaces",
                      "POST",
                      values,
                    );
                    create.reset();
                    await refresh();
                    await open(result.id);
                  }),
                )}
              >
                <label>
                  Name
                  <input
                    {...create.register("name")}
                    placeholder="The creative corner"
                  />
                </label>
                <label>
                  Workspace address
                  <input
                    {...create.register("slug")}
                    placeholder="creative-corner"
                  />
                </label>
                <label>
                  Map
                  <Controller
                    name="mapId"
                    control={create.control}
                    render={({ field }) => (
                      <Choice
                        label="Map"
                        value={field.value}
                        onChange={field.onChange}
                        options={maps}
                      />
                    )}
                  />
                </label>
                {Object.values(create.formState.errors).map((e, i) => (
                  <p className={styles.error} key={i}>
                    {e.message}
                  </p>
                ))}
                <button className={styles.primary} disabled={busy}>
                  Create workspace
                </button>
              </form>
            </section>
          </div>
          {detail && (
            <section className={styles.card} key={detail.id}>
              <div className={styles.nav}>
                <h2>{detail.name}</h2>
                <button onClick={() => setDetail(null)}>Close</button>
              </div>
              <p>
                /{detail.slug} · {detail.role} ·{" "}
                {maps.find((m) => m.value === detail.mapId)?.label}
              </p>
              <Link
                className={styles.primary}
                href={
                  workspaceDomain
                    ? `https://${detail.slug}.${workspaceDomain}/`
                    : `/w/${detail.id}/office`
                }
              >
                Enter office →
              </Link>
              <WorkspaceMembers
                key={detail.id}
                workspaceId={detail.id}
                userId={user.id}
              />
              <WorkspaceOIDC
                key={detail.id}
                workspaceId={detail.id}
                slug={detail.slug}
              />
            </section>
          )}
        </>
      )}
      <footer className={styles.footer}>
        A calmer place to work together. Built on Little Office.
      </footer>
    </main>
  );
}
