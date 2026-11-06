import { and, count, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "./db";
import { pushConfigured } from "./push-config";
import { wakePush } from "./push";
import {
  sessions,
  pushDevices,
  pushJobs,
  notifications as rows,
} from "./schema";
import type {
  NotificationKind,
  NotificationPage,
} from "../shared/notifications";

const scope = (workspaceId: string, recipient: string) =>
  and(eq(rows.workspaceId, workspaceId), eq(rows.recipient, recipient));

export async function recordNotification(
  workspaceId: string,
  recipient: string,
  kind: NotificationKind,
  actorName: string,
) {
  if (!pushConfigured) {
    await db.insert(rows).values({ workspaceId, recipient, kind, actorName });
    return;
  }
  await db.transaction(async (tx) => {
    const [notice] = await tx
      .insert(rows)
      .values({ workspaceId, recipient, kind, actorName })
      .returning({ id: rows.id });
    const devices = await tx
      .select({ deviceId: pushDevices.id, sessionId: pushDevices.sessionId })
      .from(pushDevices)
      .innerJoin(
        sessions,
        and(
          eq(sessions.id, pushDevices.sessionId),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .where(
        and(
          eq(pushDevices.workspaceId, workspaceId),
          eq(pushDevices.userId, recipient),
        ),
      )
      .for("share");
    if (devices.length)
      await tx
        .insert(pushJobs)
        .values(devices.map((d) => ({ ...d, notificationId: notice.id })));
  });
  wakePush();
}

export async function notificationPage(
  workspaceId: string,
  recipient: string,
  before?: number,
): Promise<NotificationPage> {
  const mine = scope(workspaceId, recipient);
  const limit = 50;
  return db.transaction(
    async (tx) => {
      const records = await tx
        .select({
          id: rows.id,
          kind: rows.kind,
          actorName: rows.actorName,
          createdAt: rows.createdAt,
          readAt: rows.readAt,
        })
        .from(rows)
        .where(
          and(mine, before === undefined ? undefined : lt(rows.id, before)),
        )
        .orderBy(desc(rows.id))
        .limit(limit + 1);
      const [unread] = await tx
        .select({ value: count() })
        .from(rows)
        .where(and(mine, isNull(rows.readAt)));
      const items = records.slice(0, limit).map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt?.toISOString() ?? null,
      }));
      return {
        items,
        unreadCount: unread.value,
        nextCursor: records.length > limit ? items[items.length - 1].id : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function markNotificationsRead(
  workspaceId: string,
  recipient: string,
  id?: number,
) {
  await db
    .update(rows)
    .set({ readAt: new Date() })
    .where(
      and(
        scope(workspaceId, recipient),
        isNull(rows.readAt),
        id === undefined ? undefined : eq(rows.id, id),
      ),
    );
}
