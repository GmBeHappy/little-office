export const NOTIFICATION_KINDS = ["nudge", "summon", "call", "wave"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type OfficeNotification = {
  id: number;
  kind: NotificationKind;
  actorName: string;
  createdAt: string;
  readAt: string | null;
};
export type NotificationPage = {
  items: OfficeNotification[];
  unreadCount: number;
  nextCursor: number | null;
};
