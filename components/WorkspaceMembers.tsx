"use client";
import { useCallback, useEffect, useState } from "react";
import { Users, Mail, Copy, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { invitationForm } from "@/shared/saas/forms";
import type { WorkspaceRole } from "@/shared/workspaces";
import { Button } from "./ui/button";
import { Select } from "./Select";

type Member = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  approved: boolean;
};
type People = {
  name: string;
  role: WorkspaceRole;
  members: Member[];
  invitations: { id: string; email: string; role: WorkspaceRole }[];
};

// Shared by the office settings and the workspace dashboard; never uses global users APIs.
export default function WorkspaceMembers({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const { t } = useI18n();
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}`;
  const [detail, setDetail] = useState<People | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("member"),
    [link, setLink] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDetail(await api<People>("", undefined, "GET", base));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(
    action: () => Promise<void>,
    success: string,
    leaveWorkspace = false,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      if (leaveWorkspace) {
        // The tenant proxy sends this route to the canonical workspace portal.
        location.assign("/workspaces");
        return;
      }
      setDetail(await api<People>("", undefined, "GET", base));
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const owner = detail?.role === "owner";
  const manager = owner || detail?.role === "admin";
  return (
    <div className="workspace-members">
      {error && (
        <div role="alert" className="settings-feedback">
          <p>{t(error)}</p>
          <Button
            variant="secondary"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            <RefreshCw size={15} />
            {t("Try again")}
          </Button>
        </div>
      )}
      {message && <p role="status">{t(message)}</p>}
      {loading && <p role="status">{t("Loading workspace members…")}</p>}
      {detail && (
        <>
          <section className="settings-card">
            <h4>
              <Users size={19} />
              {t("People")}{" "}
              <span className="workspace-count">{detail.members.length}</span>
            </h4>
            {!detail.members.length && (
              <p className="muted">{t("No workspace members yet.")}</p>
            )}
            <div className="workspace-member-list">
              {detail.members.map((person) => (
                <div
                  className="workspace-member-row"
                  data-member-id={person.id}
                  key={person.id}
                >
                  <div className="workspace-member-copy">
                    <strong>
                      {person.name}
                      {person.id === userId ? ` · ${t("You")}` : ""}
                    </strong>
                    <span>{person.email}</span>
                    <small>
                      {t(person.approved === false ? "Suspended" : person.role)}
                    </small>
                  </div>
                  {owner ? (
                    <div className="workspace-member-actions">
                      <Select
                        label={t("Role for {name}", { name: person.name })}
                        value={person.role}
                        disabled={busy || loading}
                        options={["owner", "admin", "member"].map((value) => ({
                          value,
                          label: t(value),
                        }))}
                        onChange={(value) => {
                          if (value === person.role) return;
                          if (
                            person.id === userId &&
                            !confirm(
                              t(
                                "Change your role and return to your workspaces?",
                              ),
                            )
                          )
                            return;
                          void run(
                            async () => {
                              await api(
                                `/members/${encodeURIComponent(person.id)}`,
                                { role: value },
                                "PATCH",
                                base,
                              );
                            },
                            "Member role updated.",
                            person.id === userId,
                          );
                        }}
                      />
                      {person.approved === false ? (
                        <Button
                          variant="secondary"
                          disabled={busy || loading}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                `/members/${encodeURIComponent(person.id)}`,
                                { role: person.role, approved: true },
                                "PATCH",
                                base,
                              );
                            }, "Membership restored.")
                          }
                        >
                          {t("Restore membership")}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled={busy || loading}
                          onClick={() => {
                            if (
                              confirm(
                                t("Remove {name} from {workspace}?", {
                                  name: person.name,
                                  workspace: detail.name,
                                }),
                              )
                            )
                              void run(
                                async () => {
                                  await api(
                                    `/members/${encodeURIComponent(person.id)}`,
                                    undefined,
                                    "DELETE",
                                    base,
                                  );
                                },
                                "Member removed from workspace.",
                                person.id === userId,
                              );
                          }}
                        >
                          {t("Remove")}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {!owner && (
              <p className="muted">
                {t("Only workspace owners can change roles or remove members.")}
              </p>
            )}
          </section>
          {manager && (
            <>
              <section className="settings-card">
                <h4>
                  <Mail size={19} />
                  {t("Invite a teammate")}
                </h4>
                <p className="muted">
                  {t(
                    "Invitation links expire in 7 days and can only be accepted with the invited verified email. Share the link yourself.",
                  )}
                </p>
                <form
                  className="workspace-invite-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const input = invitationForm.safeParse({ email, role });
                    if (!input.success) {
                      setError(
                        "Enter a valid email address and invitation role.",
                      );
                      return;
                    }
                    void run(async () => {
                      const result = await api<{ url: string }>(
                        "/invitations",
                        input.data,
                        "POST",
                        base,
                      );
                      setLink(result.url);
                      setEmail("");
                    }, "Invitation link created.");
                  }}
                >
                  <label>
                    {t("Email address")}
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      maxLength={254}
                      autoComplete="email"
                      disabled={busy || loading}
                    />
                  </label>
                  <label>
                    {t("Invitation role")}
                    <Select
                      label={t("Invitation role")}
                      value={role}
                      onChange={setRole}
                      disabled={busy || loading}
                      options={(owner ? ["member", "admin"] : ["member"]).map(
                        (value) => ({ value, label: t(value) }),
                      )}
                    />
                  </label>
                  <Button type="submit" disabled={busy || loading}>
                    {t("Create invitation link")}
                  </Button>
                </form>
                {link && (
                  <div className="workspace-copy-field">
                    <label>
                      {t("Invitation link")}
                      <input
                        readOnly
                        value={link}
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(link);
                          setMessage("Link copied.");
                        } catch {
                          setError(
                            "Could not copy. Select the link and copy it manually.",
                          );
                        }
                      }}
                    >
                      <Copy size={15} />
                      {t("Copy link")}
                    </Button>
                  </div>
                )}
              </section>
              <section className="settings-card">
                <h4>
                  {t("Pending invitations")}{" "}
                  <span className="workspace-count">
                    {detail.invitations.length}
                  </span>
                </h4>
                {!detail.invitations.length && (
                  <p className="muted">{t("No pending invitations.")}</p>
                )}
                <div className="workspace-member-list">
                  {detail.invitations.map((invite) => (
                    <div className="workspace-member-row" key={invite.id}>
                      <div className="workspace-member-copy">
                        <strong>{invite.email}</strong>
                        <small>{t(invite.role)}</small>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={busy || loading}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              `/invitations/${encodeURIComponent(invite.id)}`,
                              undefined,
                              "DELETE",
                              base,
                            );
                            setLink("");
                          }, "Invitation revoked.")
                        }
                      >
                        {t("Revoke invitation")}
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
