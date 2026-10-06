import { z } from "zod";
import type { Availability, Person } from "./world";

export const STATUS_ICONS = [
  "",
  "💻",
  "🎧",
  "📅",
  "⛔",
  "☕",
  "🍽️",
  "🚶",
  "🌙",
  "🚿",
  "⏳",
] as const;
export const statusIconSchema = z.enum(STATUS_ICONS);
export const STATUS_LABELS = {
  available: "Available",
  busy: "Busy",
  dnd: "Do not disturb",
  away: "Away",
} as const;
export const STATUS_ICON_LABELS = [
  "Automatic",
  "Working",
  "Headphones",
  "Meeting",
  "Do not disturb",
  "Coffee",
  "Lunch",
  "Stepping out",
  "Resting",
  "Showering",
  "Hourglass",
] as const;
export const STATUS_PRESETS = [
  { status: "busy", icon: "💻", text: "Making something good…" },
  { status: "busy", icon: "📅", text: "In a meeting" },
  { status: "dnd", icon: "🎧", text: "Deep work" },
  { status: "dnd", icon: "⛔", text: "Please do not interrupt" },
  { status: "away", icon: "⏳", text: "Back in 10 minutes" },
  { status: "away", icon: "🍽️", text: "Out for lunch" },
  { status: "away", icon: "☕", text: "Quick break" },
  { status: "away", icon: "🚿", text: "Showering" },
] as const;

export function statusIcon(status: Availability, icon?: string) {
  return icon || { available: "", busy: "💻", dnd: "⛔", away: "☕" }[status];
}

export function personStatus(
  person: Pick<
    Person,
    "status" | "statusText" | "statusIcon" | "sharing" | "whiteboard"
  >,
) {
  const activity = person.sharing || person.whiteboard;
  return {
    status:
      activity && person.status !== "dnd" ? ("busy" as const) : person.status,
    label:
      person.sharing && person.whiteboard
        ? "Sharing screen · Using whiteboard"
        : person.sharing
          ? "Sharing screen"
          : person.whiteboard
            ? "Using whiteboard"
            : STATUS_LABELS[person.status],
    icon: person.sharing
      ? "🖥️"
      : person.whiteboard
        ? "✏️"
        : statusIcon(person.status, person.statusIcon),
    text: activity ? "" : person.statusText.trim(),
  };
}
