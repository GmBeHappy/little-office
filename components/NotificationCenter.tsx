"use client";
import { Bell, Hand, Pointer, Phone, UserRoundPlus } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceApi } from "@/lib/workspace-api";
import type {
  NotificationPage,
  OfficeNotification,
} from "@/shared/notifications";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./ui/dialog";

const kinds = {
  nudge: { icon: Pointer, text: "{name} nudged you." },
  summon: { icon: UserRoundPlus, text: "{name} invited you to join them." },
  call: { icon: Phone, text: "{name} called you." },
  wave: { icon: Hand, text: "{name} waved at you." },
} satisfies Record<
  OfficeNotification["kind"],
  { icon: typeof Bell; text: string }
>;

function NotificationCenter({ revision }: { revision: number }) {
  const { api } = useWorkspaceApi();
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [depth, setDepth] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        let next = await api<NotificationPage>("/notifications");
        const items = [...next.items];
        const unreadCount = next.unreadCount;
        // Refresh every visible page so a read on another device is reflected here too.
        for (let i = 1; current && i < depth && next.nextCursor !== null; i++) {
          next = await api<NotificationPage>(
            `/notifications?before=${next.nextCursor}`,
          );
          items.push(...next.items);
        }
        if (current)
          setPage({ items, unreadCount, nextCursor: next.nextCursor });
      } catch {
        if (current) setError("Couldn’t load notifications.");
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => {
      current = false;
    };
  }, [api, depth, refresh, revision]);

  async function markRead(id?: number) {
    if (saving) return;
    setSaving(true);
    try {
      await api(
        id === undefined
          ? "/notifications/read-all"
          : `/notifications/${id}/read`,
        {},
        "POST",
      );
      setRefresh((value) => value + 1);
    } catch {
      setError("Couldn’t mark notifications as read.");
    } finally {
      setSaving(false);
    }
  }
  const unread = page?.unreadCount ?? 0;
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );
  const label = unread
    ? t("Notifications, {count} unread", { count: unread })
    : t("Notifications");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setRefresh((r) => r + 1);
        else setDepth(1);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="icon-button relative shrink-0"
          aria-label={label}
          title={label}
        >
          <Bell size={19} />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-1.5 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#a83b39] px-1 text-[10px] leading-none font-bold text-white tabular-nums ring-2 ring-[#fafbf4]"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="left-auto right-4 top-20 flex max-h-[min(72dvh,580px)] w-[390px] max-w-[calc(100vw-24px)] translate-x-0 translate-y-0 flex-col overflow-hidden rounded-2xl p-0 sm:p-0 max-[700px]:right-3 max-[700px]:top-[96px] max-[700px]:max-h-[calc(100dvh-108px)]"
        closeLabel={t("Close")}
        overlayClassName="bg-black/10 backdrop-blur-none"
      >
        <div className="border-b border-border px-5 pt-5 pb-3 pr-14">
          <DialogTitle className="m-0 text-lg font-semibold tracking-normal">
            {t("Notifications")}
          </DialogTitle>
          {unread > 0 && (
            <Button
              variant="link"
              className="mt-1 px-0 text-primary"
              disabled={saving}
              onClick={() => void markRead()}
            >
              {t("Mark all as read")}
            </Button>
          )}
        </div>
        <div
          className="min-h-0 overflow-y-auto overscroll-contain"
          aria-busy={loading || saving}
        >
          {error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              {t(error)}
              <Button variant="link" onClick={() => setRefresh((r) => r + 1)}>
                {t("Refresh")}
              </Button>
            </div>
          )}
          {page?.items.length ? (
            <ul className="divide-y divide-border">
              {page.items.map((entry) => {
                const { icon: Icon, text } = kinds[entry.kind];
                const message = t(text, { name: entry.actorName });
                const content = (
                  <>
                    <Icon
                      size={17}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          entry.readAt
                            ? "block break-words text-sm"
                            : "block break-words text-sm font-semibold"
                        }
                      >
                        {message}
                      </span>
                      <time
                        dateTime={entry.createdAt}
                        className="mt-1 block text-xs text-muted-foreground"
                      >
                        {date.format(new Date(entry.createdAt))}
                      </time>
                    </span>
                  </>
                );
                return (
                  <li key={entry.id}>
                    {entry.readAt ? (
                      <div className="flex items-start gap-3 px-5 py-3.5">
                        {content}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        aria-label={t("Mark as read: {message}", { message })}
                        title={t("Mark as read")}
                        onClick={() => void markRead(entry.id)}
                        className="flex w-full items-start gap-3 bg-[#eef3e7] px-5 py-3.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                      >
                        {content}
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-[#a83b39]"
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            !error && (
              <p
                role="status"
                className="px-5 py-7 text-center text-sm text-muted-foreground"
              >
                {t(
                  loading || !page
                    ? "Loading notifications…"
                    : "No notifications yet.",
                )}
              </p>
            )
          )}
          {page?.nextCursor != null && (
            <Button
              className="mx-auto my-3 flex"
              variant="link"
              disabled={loading}
              onClick={() => setDepth((n) => n + 1)}
            >
              {t("Load older notifications")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default memo(NotificationCenter);
