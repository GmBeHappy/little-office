import { test, expect } from "bun:test";
import {
  AttendanceTracker,
  type AttendanceInterval,
} from "../server/attendance";
import { Office } from "../server/office";
import { Command } from "../shared/protocol";
import { attendanceCSV } from "../shared/attendance";

test("attendance partitions active/idle time, excludes reconnect gaps and preserves the visit", async () => {
  const tracker = new AttendanceTracker();
  const saved = new Map<string, AttendanceInterval>();
  const store = async (rows: AttendanceInterval[]) => {
    for (const row of rows) saved.set(row.id, row);
  };
  tracker.start("a", 0);
  tracker.observe("a", 360000, 300000);
  tracker.pause("a", 400000);
  await tracker.flush(store);
  tracker.observe("a", 450000, 300000);
  tracker.observe("a", 470000, 300000);
  tracker.leave("a", 480000);
  await tracker.flush(store);
  const rows = [...saved.values()];
  expect(rows.reduce((sum, row) => sum + row.endedAt - row.startedAt, 0)).toBe(
    430000,
  );
  expect(
    rows
      .filter((row) => row.active)
      .reduce((sum, row) => sum + row.endedAt - row.startedAt, 0),
  ).toBe(300000);
  expect(new Set(rows.map((row) => row.visitId)).size).toBe(1);
  tracker.start("a", 500000);
  tracker.leave("a", 510000);
  await tracker.flush(store);
  expect(new Set([...saved.values()].map((row) => row.visitId)).size).toBe(2);
});
test("failed persistence retries idempotently and an in-flight write cannot lose a newer observation", async () => {
  const tracker = new AttendanceTracker();
  tracker.start("a", 0);
  tracker.observe("a", 1000, 300000);
  await expect(
    tracker.flush(async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  let release!: () => void;
  const saved: AttendanceInterval[][] = [];
  const pending = tracker.flush(async (rows) => {
    saved.push(rows);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  tracker.observe("a", 2000, 300000);
  release();
  await pending;
  await tracker.flush(async (rows) => {
    saved.push(rows);
  });
  expect(saved[0][0].endedAt).toBe(1000);
  expect(saved[1][0].endedAt).toBe(2000);
  expect(saved[0][0].id).toBe(saved[1][0].id);
  // No live record in a new process can invent the time since the last flush.
  await new AttendanceTracker().flush(async () => {
    throw new Error("phantom session");
  });
});
test("heartbeats and idle move packets do not count as activity; meeting and interaction signals do", () => {
  const office = new Office(),
    now = Date.now();
  const a = office.add(
    { id: "a", name: "A", role: "member" },
    "a",
    now + 3600000,
    () => {},
    () => {},
  );
  a.activity = now - 400000;
  office.handle("a", Command.parse({ type: "ping" }), now);
  office.handle(
    "a",
    Command.parse({ type: "move", dx: 0, dy: 0, seq: 1 }),
    now,
  );
  expect(office.activeUntil(a)).toBeLessThan(now);
  office.handle("a", Command.parse({ type: "activity" }), now);
  expect(office.activeUntil(a)).toBe(now + 300000);
  a.activity = now - 400000;
  a.sharing = true;
  expect(office.activeUntil(a)).toBe(Infinity);
  a.sharing = false;
  const b = office.add(
    { id: "b", name: "B", role: "member" },
    "b",
    now + 3600000,
    () => {},
    () => {},
  );
  a.conversation = b.conversation = "zone:studio";
  expect(office.activeUntil(a)).toBe(Infinity);
  b.conversation = "floor";
  expect(office.activeUntil(a)).toBeLessThan(now);
});
test("attendance CSV neutralizes spreadsheet formulas and quotes names", () => {
  const csv = attendanceCSV({
    from: "",
    to: "",
    generatedAt: "",
    manager: true,
    rows: [
      {
        userId: "a",
        name: '=HYPERLINK("x")',
        avatar: "sage",
        firstEntry: null,
        lastSeen: null,
        connectedMs: 120000,
        activeMs: 60000,
        visits: 1,
        state: "offline",
      },
    ],
  });
  expect(csv).toContain('"\'=HYPERLINK(""x"")"');
  expect(csv).toContain('"2.00","1.00","1.00"');
});

test("attendance API isolates workspace and viewer permissions and persists status resets", async () => {
  const child = Bun.spawn(
    [process.execPath, "tests/fixtures/attendance-runner.ts"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const timeout = setTimeout(() => child.kill(), 20000);
  const [code, output, diagnostics] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timeout);
  expect({ code, failure: code === 0 ? "" : output + diagnostics }).toEqual({
    code: 0,
    failure: "",
  });
}, 25000);
