export const ACTIVITY_ACTIONS = {
  "office.join": "Joined the office",
  "office.leave": "Left the office",
  "screen.start": "Started screen sharing",
  "screen.stop": "Stopped screen sharing",
  nudge: "Nudged a teammate",
  "member.role": "Changed a member's role",
} as const;
export type ActivityEvent = {
  actor: string;
  actorName: string;
  action: keyof typeof ACTIVITY_ACTIONS;
  targetName?: string;
  details: Record<string, string>;
  createdAt: string;
};
export type ActivityRecord = Omit<ActivityEvent, "action"> & {
  id: string;
  action: string;
};
export type ActivityPage = {
  entries: ActivityRecord[];
  nextCursor: string | null;
};
