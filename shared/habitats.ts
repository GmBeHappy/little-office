import { getMap, mapBlocks, mapZones } from "./maps";
import { walkable, zoneAt, type Person } from "./world";

export const HABITATS = {
  nature: {
    animal: "rabbit",
    quick: "Feed rabbit",
    activity: "Water flowers",
    stages: ["Seeds planted", "Flower buds", "Garden in bloom"],
    color: 0xc5aece,
  },
  camping: {
    animal: "squirrel",
    quick: "Offer a nut",
    activity: "Gather firewood",
    stages: ["Kindling gathered", "Fire glowing", "Marshmallows ready"],
    color: 0xdcb483,
  },
  space: {
    animal: "robot",
    quick: "Greet robot",
    activity: "Align telescope",
    stages: ["Lens aligned", "Stars located", "Constellation discovered"],
    color: 0x9ec7cf,
  },
  zen: {
    animal: "cat",
    quick: "Pet cat",
    activity: "Prepare tea",
    stages: ["Water warming", "Tea brewing", "Tea ready to share"],
    color: 0xe0b7c6,
  },
  temple: {
    animal: "bird",
    quick: "Feed sparrows",
    activity: "Tend lotus",
    stages: ["Lotus planted", "Lotus budding", "Lotus in bloom"],
    color: 0xdbb78a,
  },
  beach: {
    animal: "crab",
    quick: "Watch crab",
    activity: "Build sandcastle",
    stages: ["Sand gathered", "Towers built", "Sandcastle complete"],
    color: 0xe0b691,
  },
  farm: {
    animal: "rabbit",
    quick: "Feed rabbit",
    activity: "Tend orchard",
    stages: ["Tree watered", "Apple blossoms", "Apples ready"],
    color: 0xb6c99b,
  },
  cloudpeak: {
    animal: "goat",
    quick: "Give goat a treat",
    activity: "Prepare cocoa",
    stages: ["Milk warming", "Cocoa stirred", "Cocoa ready to share"],
    color: 0xbccbc2,
  },
  mangrove: {
    animal: "crab",
    quick: "Watch crab",
    activity: "Plant mangrove",
    stages: ["Seedling planted", "Roots growing", "New mangrove sprouted"],
    color: 0x9dc2a8,
  },
  canopy: {
    animal: "toucan",
    quick: "Fill bird feeder",
    activity: "Observe wildlife",
    stages: ["Bird spotted", "Frog spotted", "Observation board complete"],
    color: 0xa7c887,
  },
  lakeside: {
    animal: "duck",
    quick: "Feed ducks",
    activity: "Launch paper boats",
    stages: ["Paper folded", "Boat launched", "Boats drifting together"],
    color: 0xb1cbd0,
  },
  glasshouse: {
    animal: "cat",
    quick: "Pet cat",
    activity: "Make garden coffee",
    stages: ["Beans ground", "Coffee brewing", "Coffee ready to share"],
    color: 0xc3cda9,
  },
} as const;
export type HabitatState = {
  revision: number;
  step: number;
  updatedAt: number;
  animal: number;
  affectionUntil: number;
};
export const emptyHabitat = (): HabitatState => ({
  revision: 0,
  step: 0,
  updatedAt: 0,
  animal: -1,
  affectionUntil: 0,
});
export function habitatStyle(mapId: string) {
  const key = mapId.split("-")[0] as keyof typeof HABITATS;
  return HABITATS[key] || HABITATS.nature;
}
// Routes and stations derive from the same collision geometry as the server.
// Cache by map ID: layouts are immutable for the lifetime of a build.
const layouts = new Map<string, { x: number; y: number }[]>();
export function habitatLayout(mapId: string) {
  const cached = layouts.get(mapId);
  if (cached) return cached;
  const map = getMap(mapId),
    blocks = mapBlocks(map),
    zones = mapZones(map);
  const points: { x: number; y: number }[] = [];
  for (let y = 340; y <= 600; y += 60)
    for (let x = 120; x <= 1000; x += 80) {
      if (points.length === 4) break;
      if (x > 680 && x < 820) continue;
      if (points.some((p) => Math.hypot(x - p.x, y - p.y) < 170)) continue;
      if (
        [-24, 0, 24].every((dx) =>
          [-18, 0, 18].every(
            (dy) =>
              walkable(x + dx, y + dy, blocks) &&
              zoneAt(x + dx, y + dy, zones) === "floor",
          ),
        )
      )
        points.push({ x, y });
    }
  layouts.set(mapId, points);
  return points;
}
export function animalPosition(
  mapId: string,
  index: number,
  now: number,
  still = false,
) {
  const home = habitatLayout(mapId)[index + 1];
  const phase = now / 6000 + index * 2;
  return {
    x: home.x + (still ? 0 : Math.sin(phase) * 18),
    y: home.y + (still ? 0 : Math.sin(phase * 2) * 9),
    right: Math.cos(phase) > 0,
  };
}
export function habitatTarget(
  mapId: string,
  person: Pick<Person, "x" | "y" | "zone">,
  wildlife: boolean,
  activities: boolean,
  now: number,
) {
  if (person.zone !== "floor") return -1;
  const points = habitatLayout(mapId);
  let target = -1,
    distance = 64;
  for (let i = 0; i < points.length; i++) {
    if (i === 0 ? !activities : !wildlife || !activities) continue;
    const p = i ? animalPosition(mapId, i - 1, now) : points[i];
    const d = Math.hypot(p.x - person.x, p.y - person.y);
    if (d < distance) {
      target = i;
      distance = d;
    }
  }
  return target;
}

type Rect = (x: number, y: number, w: number, h: number, color: number) => void;
export function drawHabitat(
  mapId: string,
  state: HabitatState,
  now: number,
  wildlife: boolean,
  activities: boolean,
  still: boolean,
  rect: Rect,
) {
  const style = habitatStyle(mapId),
    points = habitatLayout(mapId);
  if (activities && points[0]) {
    const { x, y } = points[0];
    const step = now - state.updatedAt < 60000 ? state.step : 0;
    rect(x - 19, y - 7, 38, 22, 0x8e7c5c);
    rect(x - 17, y - 5, 34, 5, 0xd9c49b);
    for (let i = 0; i < 3; i++) {
      const px = x - 13 + i * 10;
      rect(px, y + 19, 7, 3, i < step ? 0xe9d89c : 0x7c9175);
      if (i < step) {
        if (
          ["nature", "temple", "farm", "mangrove"].includes(mapId.split("-")[0])
        ) {
          rect(px + 2, y - 12, 3, 10, 0x77956a);
          rect(px - 1, y - 16, 9, 6, style.color);
        } else if (style.animal === "robot") {
          rect(px, y - 10 - i * 4, 5, 5, 0xcee6d9);
        } else if (style.animal === "crab") {
          rect(px, y - 10 - i * 3, 8, 10 + i * 3, 0xe7d0a5);
        } else {
          rect(px, y - 12, 7, 9, 0xeee2be);
          rect(px + 7, y - 10, 2, 4, 0xeee2be);
        }
      }
    }
    if (style.animal === "robot") {
      rect(x - 2, y - 15, 4, 14, 0x9bacaf);
      rect(x - 13, y - 23, 25, 9, 0xb7cfd1);
      rect(x + 10, y - 25, 5, 13, 0x648d98);
    }
    if (mapId.startsWith("lakeside") && step) {
      const drift = still ? 0 : Math.sin(now / 1500) * 4;
      for (let i = 0; i < step; i++) {
        rect(x - 15 + i * 12 + drift, y - 12, 12, 3, 0xf0e6cc);
        rect(x - 12 + i * 12 + drift, y - 9, 7, 3, 0xd6ceb5);
        rect(x - 10 + i * 12 + drift, y - 19, 2, 7, 0xf0e6cc);
      }
    }
    if (mapId.startsWith("camping") && step) {
      rect(x - 11, y - 7, 22, 4, 0x977355);
      rect(x - 7, y - 15, 14, 10, 0xd99b66);
      rect(
        x - 3,
        y - 22 + (still ? 0 : Math.round(Math.sin(now / 250) * 2)),
        6,
        15,
        0xf1d298,
      );
    }
    if (step === 3) {
      rect(x - 3, y - 27, 6, 6, 0xf0dc9c);
      rect(x - 6, y - 24, 12, 2, 0xf0dc9c);
    }
  }
  if (!wildlife) return;
  for (let i = 0; i < points.length - 1; i++) {
    const p = animalPosition(mapId, i, now, still),
      x = Math.round(p.x),
      y = Math.round(p.y);
    const flip = p.right ? 1 : -1;
    const r: Rect = (dx, dy, w, h, c) =>
      rect(x + (flip > 0 ? dx : -dx - w), y + dy, w, h, c);
    r(-11, 3, 24, 5, 0x739077);
    const bird = ["bird", "duck", "toucan"].includes(style.animal);
    const color =
      style.animal === "robot"
        ? 0xa1c2c8
        : style.animal === "crab"
          ? 0xcc8b70
          : style.animal === "squirrel"
            ? 0xac8963
            : style.animal === "toucan"
              ? 0x43584d
              : 0xd9cfb5;
    r(-9, -10, 18, 13, color);
    r(4, -16, 10, 11, color);
    r(11, -13, 2, 2, 0x3f5147);
    const stride = still ? 0 : Math.round(Math.sin(now / 160 + i) * 2);
    r(-6, 2, 4, 4 + stride, 0x8b795e);
    r(5, 2, 4, 4 - stride, 0x8b795e);
    if (bird) {
      r(14, -12, style.animal === "toucan" ? 10 : 5, 4, 0xdcb579);
      r(-8, -8, 10, 6, style.color);
    } else if (style.animal === "crab") {
      r(-16, -9, 6, 5, color);
      r(14, -9, 6, 5, color);
      r(-20, -13, 5, 7, color);
      r(19, -13, 5, 7, color);
    } else if (style.animal === "robot") {
      r(5, -22, 2, 6, 0xd9e8d4);
      r(3, -24, 6, 3, 0xbed9a3);
      r(-5, -7, 9, 4, 0x4e7d79);
    } else {
      r(3, -22, 4, style.animal === "rabbit" ? 12 : 7, color);
      r(10, -21, 4, 7, color);
      r(-14, style.animal === "squirrel" ? -19 : -9, 6, 14, color);
    }
    if (activities && state.animal === i && state.affectionUntil > now) {
      r(-3, -33, 4, 4, 0xd39cac);
      r(3, -33, 4, 4, 0xd39cac);
      r(-1, -29, 6, 4, 0xd39cac);
      r(1, -25, 2, 2, 0xd39cac);
    }
  }
}
