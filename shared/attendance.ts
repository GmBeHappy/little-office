export type AttendanceRow = {
  userId: string;
  name: string;
  avatar: string;
  firstEntry: string | null;
  lastSeen: string | null;
  connectedMs: number;
  activeMs: number;
  visits: number;
  state: "active" | "idle" | "offline";
};
export type AttendanceReport = {
  from: string;
  to: string;
  generatedAt: string;
  manager: boolean;
  rows: AttendanceRow[];
};
export function attendanceCSV(report: AttendanceReport) {
  const cell = (value: string | number) => {
    const text = String(value);
    return (
      '"' +
      (/^[\s]*[=+@-]/.test(text) ? "'" : "") +
      text.replaceAll('"', '""') +
      '"'
    );
  };
  return (
    "\uFEFF" +
    [
      [
        "Name",
        "First entry (UTC)",
        "Last seen (UTC)",
        "Connected minutes",
        "Active minutes",
        "Idle minutes",
        "Visits",
        "Current state",
      ],
      ...report.rows.map((row) => [
        row.name,
        row.firstEntry || "",
        row.lastSeen || "",
        (row.connectedMs / 60000).toFixed(2),
        (row.activeMs / 60000).toFixed(2),
        ((row.connectedMs - row.activeMs) / 60000).toFixed(2),
        row.visits,
        row.state,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
