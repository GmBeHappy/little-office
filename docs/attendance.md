# Attendance and activity time

Settings → Attendance shows recorded visits, first/last observation in the selected period, connected time, active time, idle time and current presence. Owners and admins can see all current workspace members; members see only their own records. The API applies this restriction before aggregation and returns no other workspace's data. CSV export has the same scope and neutralizes spreadsheet formulas in names.

Active time means an office command or trusted web pointer/key/scroll interaction in the previous five minutes, screen sharing, an open whiteboard, or a non-floor conversation with another participant. The web sends a throttled signal without keys, text or pointer coordinates. Older native clients contribute their existing office commands and collaboration state. Heartbeats and zero movement packets do not indicate activity. Manual availability is separate from this metric.

This is application attendance, not a productivity score or measurement of work in other programs. No historical active time is invented from old join/leave logs. Empty periods mean no recorded session, not a finding of absence. The dashboard explains these limits.

The server tracks non-overlapping active/idle intervals in memory and upserts them to `workspace_attendance_intervals` every 15 seconds and on report requests. Every row has a concrete observed end; crashes cannot accrue phantom hours. A crash can lose up to the last unsaved flush interval. Short transport gaps are excluded while a same-client reconnect retains the visit identifier. Report intervals are clipped to the selected timestamps, including visits across midnight. The web sends local date boundaries as UTC timestamps (including DST), displays its timezone, and supports ranges up to 31 calendar days. CSV timestamps are UTC.

Persistence uses stable interval IDs and monotonic end updates, so retrying cannot double count. Pending writes are retained after failure and logged as `attendance.persist_failed` without personal data. Records are workspace/member scoped with cascading membership deletion. Removing a membership deletes that person's attendance for that workspace.

Checks: `bun test tests/attendance.test.ts tests/office.test.ts tests/migrations.test.ts`; browser checks `APP_URL=http://127.0.0.1:3917 bunx playwright test e2e/attendance-dashboard.spec.ts e2e/status-reset.spec.ts`. Browser fixtures use synthetic data; API regressions use isolated PGlite and actual authorization routes.

Availability stays at the member’s chosen Available, Busy, Do not disturb, or Away status while the connection is alive. Switching windows, minimizing the browser, or receiving no office input does not automatically mark them Away. Attendance active/idle time remains based on the signals above. A lost connection or expired session still removes online presence. Clear status resets availability, text and icon together when saved.
