import { z } from "zod";
import type { Availability } from "./world";

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
] as const;
export const STATUS_PRESETS = [
  { status: "busy", icon: "💻", text: "Making something good…" },
  { status: "busy", icon: "📅", text: "In a meeting" },
  { status: "dnd", icon: "🎧", text: "Deep work" },
  { status: "dnd", icon: "⛔", text: "Please do not interrupt" },
  { status: "away", icon: "☕", text: "Back in 10 minutes" },
  { status: "away", icon: "🍽️", text: "Out for lunch" },
] as const;

export function statusIcon(status: Availability, icon?: string) {
  return icon || { available: "", busy: "💻", dnd: "⛔", away: "☕" }[status];
}
