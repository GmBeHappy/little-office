import { and, eq, gt, lt, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { attendanceIntervals, memberships, users } from "./schema";
import { Problem } from "./workspace-access";
import type { Office } from "./office";
import type { AttendanceReport } from "../shared/attendance";

export async function persistAttendance(workspaceId: string, office: Office) {
  await office.attendance.flush(async (batch) => {
    // Membership can be deleted while a disconnected interval awaits flushing.
    const allowed = new Set(
      (
        await db
          .select({ id: memberships.userId })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, workspaceId),
              inArray(memberships.userId, [
                ...new Set(batch.map((row) => row.userId)),
              ]),
            ),
          )
      ).map((row) => row.id),
    );
    const rows = batch
      .filter((row) => allowed.has(row.userId))
      .map((row) => ({
        ...row,
        workspaceId,
        startedAt: new Date(row.startedAt),
        endedAt: new Date(row.endedAt),
      }));
    if (rows.length)
      await db
        .insert(attendanceIntervals)
        .values(rows)
        .onConflictDoUpdate({
          target: attendanceIntervals.id,
          set: {
            endedAt: sql`greatest(${attendanceIntervals.endedAt}, excluded.ended_at)`,
          },
        });
  });
}
export async function attendanceReport(
  workspaceId: string,
  office: Office,
  viewer: { id: string; role: string },
  from: string,
  to: string,
): Promise<AttendanceReport> {
  const start = new Date(from),
    end = new Date(to);
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    +end <= +start ||
    +end - +start > 31 * 86400000 + 7200000
  )
    throw new Problem(400, "Choose a valid date range of up to 31 days.");
  await persistAttendance(workspaceId, office);
  const manager = ["owner", "admin"].includes(viewer.role);
  const members = await db
    .select({ userId: users.id, name: users.name, avatar: users.avatar })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        manager ? undefined : eq(memberships.userId, viewer.id),
      ),
    )
    .orderBy(users.name);
  const duration = sql`extract(epoch from (least(${attendanceIntervals.endedAt}, ${end.toISOString()}::timestamptz) - greatest(${attendanceIntervals.startedAt}, ${start.toISOString()}::timestamptz))) * 1000`;
  const totals = await db
    .select({
      userId: attendanceIntervals.userId,
      firstEntry: sql<Date>`min(greatest(${attendanceIntervals.startedAt}, ${start.toISOString()}::timestamptz))`,
      lastSeen: sql<Date>`max(least(${attendanceIntervals.endedAt}, ${end.toISOString()}::timestamptz))`,
      connectedMs: sql<number>`sum(${duration})::float8`,
      activeMs: sql<number>`sum(case when ${attendanceIntervals.active} then ${duration} else 0 end)::float8`,
      visits: sql<number>`count(distinct ${attendanceIntervals.visitId})::integer`,
    })
    .from(attendanceIntervals)
    .where(
      and(
        eq(attendanceIntervals.workspaceId, workspaceId),
        gt(attendanceIntervals.endedAt, start),
        lt(attendanceIntervals.startedAt, end),
        manager ? undefined : eq(attendanceIntervals.userId, viewer.id),
      ),
    )
    .groupBy(attendanceIntervals.userId);
  const byUser = new Map(totals.map((row) => [row.userId, row]));
  const now = Date.now();
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    generatedAt: new Date(now).toISOString(),
    manager,
    rows: members.map((member) => {
      const total = byUser.get(member.userId),
        live = office.members.get(member.userId);
      const connected =
        live &&
        !live.reconnectUntil &&
        live.seen + 35000 >= now &&
        live.expires > now;
      return {
        ...member,
        firstEntry: total ? new Date(total.firstEntry).toISOString() : null,
        lastSeen: total ? new Date(total.lastSeen).toISOString() : null,
        connectedMs: total?.connectedMs || 0,
        activeMs: total?.activeMs || 0,
        visits: total?.visits || 0,
        state: connected
          ? now < office.activeUntil(live)
            ? "active"
            : "idle"
          : "offline",
      };
    }),
  };
}
