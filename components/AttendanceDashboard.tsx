"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Download,
  RefreshCw,
  Users,
  Zap,
} from "lucide-react";
import { useWorkspaceApi } from "@/lib/workspace-api";
import { useI18n } from "@/lib/i18n";
import { attendanceCSV, type AttendanceReport } from "@/shared/attendance";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Avatar } from "./Avatar";

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function AttendanceDashboard() {
  const { api } = useWorkspaceApi();
  const { t, locale } = useI18n();
  const [from, setFrom] = useState(() => dateValue(new Date()));
  const [to, setTo] = useState(() => dateValue(new Date()));
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    const start = new Date(`${from}T00:00:00`),
      end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    if (
      !from ||
      !to ||
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      +end <= +start ||
      +end - +start > 31 * 86400000 + 7200000
    ) {
      setError("Choose a valid date range of up to 31 days.");
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<AttendanceReport>(
        `/attendance?${new URLSearchParams({ from: start.toISOString(), to: end.toISOString() })}`,
      );
      if (request.current === id) setReport(next);
    } catch (e) {
      if (request.current === id) setError((e as Error).message);
    } finally {
      if (request.current === id) setBusy(false);
    }
  }, [api, from, to]);
  useEffect(() => {
    setReport(null);
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      request.current++;
      clearInterval(timer);
    };
  }, [load]);
  const rows = report?.rows || [];
  const total = rows.reduce(
    (sum, row) => ({
      connected: sum.connected + row.connectedMs,
      active: sum.active + row.activeMs,
    }),
    { connected: 0, active: 0 },
  );
  const duration = (ms: number) =>
    t("{hours}h {minutes}m", {
      hours: Math.floor(ms / 3600000),
      minutes: Math.floor(ms / 60000) % 60,
    });
  const timestamp = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value))
      : "—";
  const period = (days: number) => {
    const now = new Date(),
      start = new Date(now);
    start.setDate(start.getDate() - days + 1);
    setFrom(dateValue(start));
    setTo(dateValue(now));
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([attendanceCSV(report)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `little-office-attendance-${from}-${to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section
      className="attendance-dashboard"
      aria-label={t("Attendance dashboard")}
      aria-busy={busy}
    >
      <div className="attendance-intro">
        <span className="eyebrow">{t("TIME TOGETHER")}</span>
        <h4>
          {t(
            report?.manager
              ? "A clear view of your team's day."
              : "Your time in the office.",
          )}
        </h4>
        <p>
          {t(
            "See office visits and active time, with a clear distinction between being connected and being active.",
          )}
        </p>
      </div>
      <div className="attendance-filters">
        <label>
          <span>{t("From date")}</span>
          <Input
            type="date"
            aria-label={t("From date")}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          <span>{t("To date")}</span>
          <Input
            type="date"
            aria-label={t("To date")}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <div className="attendance-actions">
          <Button variant="secondary" onClick={() => period(1)}>
            {t("Today")}
          </Button>
          <Button variant="secondary" onClick={() => period(7)}>
            {t("Last 7 days")}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void load()}
            aria-label={t("Refresh attendance")}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <div className="attendance-metrics">
        {[
          {
            label: "People with recorded time",
            value: rows.filter((r) => r.connectedMs > 0).length,
            icon: Users,
          },
          {
            label: "Time in office",
            value: duration(total.connected),
            icon: Clock3,
          },
          { label: "Active time", value: duration(total.active), icon: Zap },
          {
            label: "Online now",
            value: rows.filter((r) => r.state !== "offline").length,
            icon: CalendarDays,
          },
        ].map((card) => (
          <div className="attendance-metric" key={card.label}>
            <card.icon size={18} />
            <span>{t(card.label)}</span>
            <strong>{report ? card.value : "—"}</strong>
          </div>
        ))}
      </div>
      <div className="attendance-table-heading">
        <div>
          <h4>{t(report?.manager ? "Team attendance" : "My attendance")}</h4>
          <p>
            {t("Times shown in {timezone}.", {
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!report || busy || !!error}
          onClick={download}
        >
          <Download size={16} />
          {t("Export CSV")}
        </Button>
      </div>
      <div
        className="attendance-table-scroll"
        tabIndex={0}
        aria-label={t("Attendance records")}
      >
        <table className="attendance-table">
          <thead>
            <tr>
              {[
                "Person",
                "First entry",
                "Last seen",
                "Time in office",
                "Active time",
                "Idle time",
                "Now",
              ].map((label) => (
                <th scope="col" key={label}>
                  {t(label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId}>
                <th scope="row">
                  <div className="attendance-person">
                    <Avatar color={row.avatar} />
                    <div>
                      <strong>{row.name}</strong>
                      <small>
                        {row.visits
                          ? t("{count} visits", { count: row.visits })
                          : t("No recorded session")}
                      </small>
                    </div>
                  </div>
                </th>
                <td>{timestamp(row.firstEntry)}</td>
                <td>{timestamp(row.lastSeen)}</td>
                <td>{row.firstEntry ? duration(row.connectedMs) : "—"}</td>
                <td className="attendance-active-time">
                  {row.firstEntry ? duration(row.activeMs) : "—"}
                </td>
                <td>
                  {row.firstEntry
                    ? duration(row.connectedMs - row.activeMs)
                    : "—"}
                </td>
                <td>
                  <span className={`attendance-state ${row.state}`}>
                    {t(
                      { active: "Active", idle: "Idle", offline: "Offline" }[
                        row.state
                      ],
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="attendance-empty" role="status">
            {t(
              busy
                ? "Loading attendance…"
                : "No attendance records for this period.",
            )}
          </p>
        )}
      </div>
      <div className="attendance-notes">
        <strong>{t("How this is counted")}</strong>
        <p>
          {t(
            "Active means an office interaction within 5 minutes, screen sharing, an open whiteboard, or a meeting room or private call with another person. Idle is connected time without these signals.",
          )}
        </p>
        <p>
          {t(
            "Only Little Office activity is counted. Time spent working in other apps is not measured, and these totals are not a productivity score.",
          )}
        </p>
        <p>
          {t(
            "Recording starts when this feature is enabled; earlier activity cannot be reconstructed. Records are saved every 15 seconds. A restart may lose the last unsaved seconds.",
          )}
        </p>
        {report && (
          <p>
            {t("Updated {time}. Refreshes every 30 seconds.", {
              time: timestamp(report.generatedAt),
            })}
          </p>
        )}
      </div>
    </section>
  );
}
