import { walkable, zoneAt, type Person } from "./world";
import type { mapBlocks, mapZones } from "./maps";
export const WALK_SPEED = 160;
export type MovementWorld = {
  blocks: ReturnType<typeof mapBlocks>;
  zones: ReturnType<typeof mapZones>;
  locks: Record<string, boolean>;
  people: Pick<Person, "zone">[];
};
// Identical collision and room-entry constraints for authoritative simulation
// and local rendering. This never grants conversation/media access.
export function advanceMovement(
  position: Pick<Person, "x" | "y" | "zone">,
  dx: number,
  dy: number,
  dt: number,
  world: MovementWorld,
) {
  const scale =
    (WALK_SPEED * Math.min(Math.max(dt, 0), 0.1)) /
    Math.max(1, Math.hypot(dx, dy));
  let x = position.x + dx * scale,
    y = position.y + dy * scale;
  if (!walkable(x, position.y, world.blocks)) x = position.x;
  if (!walkable(x, y, world.blocks)) y = position.y;
  const zone = zoneAt(x, y, world.zones);
  if (
    zone !== position.zone &&
    zone !== "floor" &&
    (world.locks[zone] ||
      world.people.filter((p) => p.zone === zone).length >=
        (zone === "studio" ? 8 : 6))
  ) {
    x = position.x;
    y = position.y;
  }
  return { x, y, zone: zoneAt(x, y, world.zones) };
}
