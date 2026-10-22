import { drawOfficeMap, getMap, mapBlocks, mapZones } from "../shared/maps";
import { drawCharacter, characterLook } from "../shared/avatars";
import { isAvatar } from "../shared/appearance";
import { WORLD } from "../shared/world";

type Rect = { x: number; y: number; w: number; h: number; color: number };
const maps = new Map<string, ReturnType<typeof buildMap>>();
function buildMap(id: string) {
  const map = getMap(id),
    rectangles: Rect[] = [];
  const labels: {
    x: number;
    y: number;
    text: string;
    color: string;
    size: number;
  }[] = [];
  drawOfficeMap(
    map,
    (x, y, w, h, color) => rectangles.push({ x, y, w, h, color }),
    (text, x, y, size, color) => labels.push({ x, y, text, color, size }),
  );
  return {
    version: 1,
    mapId: map.id,
    width: WORLD.width,
    height: WORLD.height,
    rectangles,
    labels,
    blocks: mapBlocks(map),
    zones: mapZones(map),
  };
}
export function nativeMap(id: string) {
  if (!maps.has(id)) maps.set(id, buildMap(id));
  return maps.get(id)!;
}
export function nativeAvatar(id: string) {
  if (!isAvatar(id)) throw new Error("Unknown appearance.");
  const frames: Record<string, Rect[]> = {};
  for (const direction of ["up", "down", "left", "right"] as const)
    for (const pose of ["stand", "sit", "sleep", "fish"] as const)
      // Match PixelMap: four 110 ms walking frames, then the airborne stride.
      for (const [frame, stride] of [0, 4, 0, -4, 3].entries()) {
        const rectangles: Rect[] = [];
        drawCharacter(
          id,
          direction,
          stride,
          (x, y, w, h, color) =>
            rectangles.push({
              x: direction === "left" ? -x - w : x,
              y,
              w,
              h,
              color,
            }),
          pose,
        );
        frames[`${direction}-${pose}-${frame}`] = rectangles;
      }
  return { version: 2, appearance: id, skin: characterLook(id).skin, frames };
}
