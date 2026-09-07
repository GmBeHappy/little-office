export const WORLD = { width: 1120, height: 720, spawn: { x: 740, y: 350 } };
export const JUMP_DURATION = 650;
export const NUDGE_RADIUS = 120;
export type ZoneId = "floor" | "studio" | "library";
export type Availability = "available" | "busy" | "dnd" | "away";
export const AVATARS = [
  "sage",
  "plum",
  "coral",
  "blue",
  "gold",
  "rose",
] as const;
export const COLORS = {
  sage: "#547d60",
  plum: "#8e6db0",
  coral: "#cd755a",
  blue: "#668eb7",
  gold: "#c7a44e",
  rose: "#c77e98",
};
export const ZONES = [
  {
    id: "floor" as const,
    name: "The commons",
    subtitle: "Nearby conversations",
    x: 40,
    y: 40,
    w: 760,
    h: 640,
    arrival: { x: 560, y: 570 },
  },
  {
    id: "studio" as const,
    name: "The Studio",
    subtitle: "Meeting room · 8 seats",
    x: 840,
    y: 60,
    w: 240,
    h: 240,
    arrival: { x: 880, y: 240 },
  },
  {
    id: "library" as const,
    name: "The Library",
    subtitle: "Meeting room · 6 seats",
    x: 840,
    y: 380,
    w: 240,
    h: 280,
    arrival: { x: 880, y: 570 },
  },
];
export const DESKS = [
  { x: 110, y: 185 },
  { x: 310, y: 185 },
  { x: 110, y: 395 },
  { x: 310, y: 395 },
];
export const BLOCKS = [
  ...DESKS.map((d) => ({ ...d, w: 116, h: 58 })),
  { x: 550, y: 210, w: 130, h: 45 },
  { x: 590, y: 330, w: 60, h: 45 },
  { x: 920, y: 142, w: 105, h: 65 },
  { x: 940, y: 460, w: 80, h: 70 },
  { x: 820, y: 40, w: 16, h: 150 },
  { x: 820, y: 245, w: 16, h: 100 },
  { x: 820, y: 365, w: 16, h: 150 },
  { x: 820, y: 570, w: 16, h: 110 },
  { x: 820, y: 40, w: 280, h: 16 },
  { x: 820, y: 325, w: 280, h: 16 },
  { x: 820, y: 365, w: 280, h: 16 },
  { x: 820, y: 675, w: 280, h: 16 },
];
export function walkable(x: number, y: number, blocks = BLOCKS) {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 42 &&
    x <= 1080 &&
    y >= 68 &&
    y <= 660 &&
    !blocks.some(
      (b) =>
        x > b.x - 10 && x < b.x + b.w + 10 && y > b.y - 5 && y < b.y + b.h + 10,
    )
  );
}
export function zoneAt(x: number, y: number, zones = ZONES): ZoneId {
  return (
    zones.find(
      (z) =>
        z.id !== "floor" &&
        x >= z.x - 4 &&
        x <= z.x + z.w &&
        y >= z.y &&
        y <= z.y + z.h,
    )?.id || "floor"
  );
}
export function nearby(
  a: { x: number; y: number; zone: ZoneId },
  b: { x: number; y: number; zone: ZoneId },
  radius = 190,
) {
  return (
    a.zone === b.zone &&
    (a.zone !== "floor" || Math.hypot(a.x - b.x, a.y - b.y) <= radius)
  );
}
export type Person = {
  id: string;
  name: string;
  avatar: keyof typeof COLORS;
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
  moving: boolean;
  status: Availability;
  statusText: string;
  zone: ZoneId;
  conversation: string;
  room: string;
  seq: number;
};
export type Invitation = {
  id: string;
  kind: "summon" | "call";
  from: string;
  to: string;
  fromName: string;
  destination: ZoneId;
  expires: number;
};
export type Snapshot = {
  workspace: import("./maps").WorkspaceSettings;
  type: "snapshot";
  epoch: string;
  self: string;
  people: Person[];
  presenters: Record<string, string>;
  locks: Record<string, boolean>;
};
