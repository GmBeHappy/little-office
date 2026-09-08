"use client";
import { useEffect, useRef, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ACTIVITY_ACTIONS, type ActivityPage } from "@/shared/activity";
import { getMap } from "@/shared/maps";
import { Button } from "./ui/button";
import { Select } from "./Select";
export function ActivityLog() {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState<ActivityPage>({
    entries: [],
    nextCursor: null,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(0);
  async function load(action: string, before?: string) {
    const id = ++request.current;
    setBusy(true);
    setError("");
    if (!before) setPage({ entries: [], nextCursor: null });
    try {
      const query = new URLSearchParams();
      if (action) query.set("action", action);
      if (before) query.set("before", before);
      const next = await api<ActivityPage>(`/admin/activity?${query}`);
      if (id === request.current)
        setPage((old) => ({
          entries: before ? [...old.entries, ...next.entries] : next.entries,
          nextCursor: next.nextCursor,
        }));
    } catch (e) {
      if (id === request.current) {
        setError((e as Error).message);
        setPage({ entries: [], nextCursor: null });
      }
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load(filter);
    return () => {
      request.current++;
    };
  }, [filter]);
  const date = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
  return (
    <section className="space-y-4" aria-label={t("Activity log")}>
      <p className="muted">
        {t(
          "Office activity is visible only to owners. Newest events appear first.",
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <Select
            label={t("Activity type")}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "", label: t("All activities") },
              ...Object.entries(ACTIVITY_ACTIONS).map(([value, label]) => ({
                value,
                label: t(label),
              })),
            ]}
          />
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void load(filter)}
        >
          <RefreshCw size={16} />
          {t("Refresh")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Times shown in {timezone}.", {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <div
        aria-busy={busy}
        className="max-h-[45dvh] overflow-y-auto overscroll-contain rounded-xl border border-border"
      >
        <ol className="divide-y divide-border">
          {page.entries.map((entry) => (
            <li key={entry.id} className="flex gap-3 p-4 text-sm">
              <History
                size={17}
                className="mt-1 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1 break-words">
                <p className="font-semibold">{entry.actorName}</p>
                <p>
                  {t(
                    ACTIVITY_ACTIONS[
                      entry.action as keyof typeof ACTIVITY_ACTIONS
                    ] || entry.action,
                  )}
                  {entry.targetName && <> · {entry.targetName}</>}
                  {entry.action === "member.role" && (
                    <>
                      {" "}
                      · {t(entry.details.from)} → {t(entry.details.to)}
                    </>
                  )}
                </p>
                {entry.details.mapId && (
                  <p className="text-xs text-muted-foreground">
                    {t(getMap(entry.details.mapId).name)}
                  </p>
                )}
                <time
                  dateTime={entry.createdAt}
                  className="text-xs text-muted-foreground"
                >
                  {date.format(new Date(entry.createdAt))}
                </time>
              </div>
            </li>
          ))}
        </ol>
        {!page.entries.length && !error && (
          <p
            role="status"
            className="p-6 text-center text-sm text-muted-foreground"
          >
            {t(busy ? "Loading activity…" : "No activity recorded yet.")}
          </p>
        )}
      </div>
      {page.nextCursor && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void load(filter, page.nextCursor!)}
        >
          {t("Load older activity")}
        </Button>
      )}
    </section>
  );
}
