import { characterLook } from "./avatars";
import type { Person } from "./world";

type Water = { x: number; y: number; w: number; h: number };
type Fisher = Pick<Person, "x" | "y" | "direction" | "moving" | "pose">;
export type Fishing = {
  x: number;
  y: number;
  direction: Person["direction"];
  target: { x: number; y: number };
  start: number;
  bite: number;
};
const CAST = 600;
export const FISHING_CATCH_DURATION = 1800;

// Only a short cast straight ahead can reach water; nearby water behind you
// or diagonally around a corner does not start an interaction.
export function fishingTarget(person: Fisher, water: readonly Water[]) {
  const dx =
    person.direction === "right" ? 1 : person.direction === "left" ? -1 : 0;
  const dy =
    person.direction === "down" ? 1 : person.direction === "up" ? -1 : 0;
  for (let distance = 12; distance <= 40; distance += 2) {
    const x = person.x + dx * distance;
    const y = person.y + dy * distance;
    const pond = water.find(
      (b) =>
        x >= b.x + 6 &&
        x <= b.x + b.w - 6 &&
        y >= b.y + 6 &&
        y <= b.y + b.h - 6,
    );
    if (pond)
      return {
        x: Math.max(pond.x + 6, Math.min(pond.x + pond.w - 6, x + dx * 18)),
        y: Math.max(pond.y + 6, Math.min(pond.y + pond.h - 6, y + dy * 18)),
      };
  }
}

export function startFishing(
  person: Fisher,
  water: readonly Water[],
  time: number,
  random = Math.random,
): Fishing | undefined {
  const target = fishingTarget(person, water);
  if (!target) return;
  return {
    x: person.x,
    y: person.y,
    direction: person.direction,
    target,
    start: time,
    bite: time + CAST + 4000 + random() * 6000,
  };
}

export function fishingPhase(fishing: Fishing, time: number) {
  if (time < fishing.start || time >= fishing.bite + FISHING_CATCH_DURATION)
    return "idle";
  if (time < fishing.start + CAST) return "cast";
  return time < fishing.bite ? "wait" : "catch";
}

export function drawFishing(
  fishing: Fishing,
  avatar: Person["avatar"],
  time: number,
  reducedMotion: boolean,
  rect: (x: number, y: number, w: number, h: number, color: number) => void,
) {
  const phase = fishingPhase(fishing, time);
  if (phase === "idle") return;
  const pixel = (x: number, y: number, w: number, h: number, color: number) =>
    rect(Math.round(x), Math.round(y), w, h, color);
  const line = (
    x: number,
    y: number,
    tx: number,
    ty: number,
    width: number,
    color: number,
  ) => {
    const steps = Math.ceil(Math.max(Math.abs(tx - x), Math.abs(ty - y)));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      pixel(x + (tx - x) * t, y + (ty - y) * t, width, width, color);
    }
  };
  const side = fishing.direction === "left" ? -1 : 1;
  const handX = side * 10,
    handY = -12;
  const targetX = fishing.target.x - fishing.x;
  const targetY = fishing.target.y - fishing.y;
  const cast = reducedMotion ? 1 : Math.min(1, (time - fishing.start) / CAST);
  const reel =
    phase === "catch"
      ? reducedMotion
        ? 1
        : Math.min(1, (time - fishing.bite) / 700)
      : 0;
  const tipX = handX + (targetX - handX) * 0.8 * cast - side * reel * 8;
  const tipY = -38 + targetY * 0.45 * cast - reel * 14;
  const bob = reducedMotion ? 0 : Math.sin(time / 260) * 1.5;
  const hookX = handX + (targetX - handX) * cast + (side * 25 - targetX) * reel;
  const hookY =
    handY + (targetY - handY) * cast - (targetY + 30) * reel + bob * (1 - reel);
  // Bent forearm, bamboo rod, fine line, and a red-and-cream float.
  line(side * 10, -8, handX, handY, 4, characterLook(avatar).skin);
  line(handX, handY, tipX, tipY, 3, 0x79543e);
  line(handX, handY, tipX, tipY, 1, 0xe1bd7d);
  line(tipX, tipY, hookX, hookY, 1, 0xfaf4d8);
  if (phase !== "catch") {
    if (cast === 1) {
      const ripple = reducedMotion ? 0 : Math.floor((time / 180) % 4);
      pixel(targetX - 6 - ripple, targetY + 3, 12 + ripple * 2, 1, 0xd8f1df);
    }
    pixel(hookX - 2, hookY - 5, 4, 4, 0xd66854);
    pixel(hookX - 2, hookY - 1, 4, 3, 0xfff4d8);
  } else {
    // The fish lifts out of the water, wiggles on the line, then disappears.
    const wiggle = reducedMotion ? 0 : Math.sin((time - fishing.bite) / 65) * 2;
    pixel(hookX - 4, hookY + 1, 9, 6, 0x437f87);
    pixel(hookX - 3, hookY + 2, 7, 3, 0xb8e2cd);
    pixel(hookX - 2 + wiggle, hookY + 7, 5, 3, 0xe3a663);
    pixel(hookX + 2, hookY + 2, 2, 2, 0x253c45);
    if (reel < 1) {
      for (const sign of [-1, 1])
        pixel(
          targetX + sign * (5 + reel * 12),
          targetY - Math.sin(reel * Math.PI) * 12,
          3,
          3,
          0xe7f6df,
        );
    } else {
      pixel(hookX - 12, hookY - 3, 3, 3, 0xf5cf70);
      pixel(hookX + 10, hookY + 6, 3, 3, 0xf5cf70);
    }
  }
}
