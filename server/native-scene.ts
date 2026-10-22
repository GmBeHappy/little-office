import {
  habitatStyle,
  habitatLayout,
  animalRoute,
  drawHabitatStation,
} from "../shared/habitats";
import { drawWildlife } from "../shared/wildlife-art";
import { wildlifeAnimation } from "../shared/wildlife-animation";
import type { MapEffect, PixelRect, RectMotion } from "../shared/map-effects";
import {
  FARM_POND,
  FARM_HEN_YARD,
  FARM_EGG_SPOTS,
  FARM_PLOTS,
  FARM_HENS,
  FARM_ANIMALS,
  FARM_RULES,
  drawFarmEgg,
  drawFarmCrop,
  drawFarmHen,
  drawFarmAnimal,
  drawFarmIcon,
  FARM_ICON_EMOJIS,
} from "../shared/farm";
import {
  drawOfficeMap,
  getMap,
  mapBlocks,
  mapZones,
  mapWater,
} from "../shared/maps";
import { drawCharacter, characterLook } from "../shared/avatars";
import { isAvatar } from "../shared/appearance";
import { WORLD } from "../shared/world";

type Rect = PixelRect;
const capture = (
  draw: (
    rect: (
      x: number,
      y: number,
      w: number,
      h: number,
      color: number,
      alpha?: number,
    ) => void,
  ) => void,
) => {
  const rectangles: Rect[] = [];
  draw((x, y, w, h, color, alpha) =>
    rectangles.push({
      x,
      y,
      w,
      h,
      color,
      ...(alpha === undefined ? {} : { alpha }),
    }),
  );
  return rectangles;
};
function nativeFarm() {
  const atlas: Record<string, Rect[]> = {};
  const shadows: Record<string, Rect[]> = {};
  for (const variant of ["light", "dark"] as const)
    for (const mode of ["idle", "walk", "peck"] as const)
      for (const frame of [0, 1]) {
        const time =
          mode === "idle"
            ? frame * Math.PI * 200
            : mode === "walk"
              ? 0
              : frame * 160;
        const rectangles = capture((r) =>
          drawFarmHen(
            {
              x: 0,
              y: 0,
              direction: "right",
              mode,
              walkTime: frame * 120,
              since: 0,
              body: variant === "light" ? 0xf5f2e8 : 0xc98d5a,
              wing: variant === "light" ? 0xd9d2c0 : 0xb0794a,
            },
            time,
            r,
          ),
        );
        shadows.hen = rectangles.slice(0, 1);
        atlas[`hen-${variant}-${mode}-${frame}`] = rectangles.slice(1);
      }
  for (const kind of ["cow", "sheep"] as const)
    for (const mode of ["idle", "walk", "graze"] as const)
      for (const frame of [0, 1]) {
        const rectangles = capture((r) =>
          drawFarmAnimal(
            {
              kind,
              x: 0,
              y: 0,
              direction: "right",
              mode,
              walkTime: frame * 160,
              since: 0,
            },
            frame * 240,
            r,
          ),
        );
        shadows[kind] = rectangles.slice(0, 1);
        atlas[`${kind}-${mode}-${frame}`] = rectangles.slice(1);
      }
  atlas.egg = capture((r) => drawFarmEgg(0, 0, r));
  for (const [stage, age] of [0, 0.25, 0.55, 1].entries())
    atlas[`crop-${stage}`] = capture((r) =>
      drawFarmCrop(0, 0, age * FARM_RULES.growthMs, r),
    );
  for (const kind of ["egg", "sprout", "wheat", "fish", "puff"] as const)
    atlas[`icon-${kind}`] = capture((r) => drawFarmIcon(kind, 0, 0, 1, r));
  return {
    ...FARM_RULES,
    iconEmojis: FARM_ICON_EMOJIS,
    pond: FARM_POND,
    henYard: FARM_HEN_YARD,
    eggSpots: FARM_EGG_SPOTS.map(([x, y]) => ({ x, y })),
    plots: FARM_PLOTS.map(([x, y]) => ({ x, y })),
    hens: FARM_HENS.map(([x, y], i) => ({
      x,
      y,
      variant: i % 2 ? "dark" : "light",
      until: 1000 + i * 700,
    })),
    animals: FARM_ANIMALS.map(([kind, x, y]) => ({ kind, x, y })),
    atlas,
    shadows,
  };
}
function animation(map: ReturnType<typeof getMap>) {
  const effects: MapEffect[] = [];
  const background = capture((r) =>
    drawOfficeMap(
      map,
      r,
      () => {},
      (e) => effects.push(e),
    ),
  );
  const points = habitatLayout(map.id),
    style = habitatStyle(map.id);
  const stages = [0, 1, 2, 3].map((step) => {
    const rectangles: Rect[] = [],
      motions: (RectMotion & { before: number })[] = [];
    drawHabitatStation(
      map.id,
      step,
      0,
      false,
      (x, y, w, h, color) => rectangles.push({ x, y, w, h, color }),
      (motion) => motions.push({ ...motion, before: rectangles.length }),
    );
    return { rectangles, motions };
  });
  const atlas: Record<string, Rect[]> = {};
  for (const mode of ["idle", "walk", "graze"] as const)
    for (const frame of mode === "idle" ? [0] : [0, 1]) {
      const gait = wildlifeAnimation(mode, frame * 160, frame * 240);
      atlas[`${mode}-${frame}`] = capture((r) =>
        drawWildlife(style.animal, gait, (x, y, w, h, c) =>
          r(x, y + gait.bob, w, h, c),
        ),
      );
    }
  return {
    version: 1,
    background,
    effects,
    water: mapWater(map),
    habitat: {
      style,
      station: { ...points[0], stages },
      animals: points.slice(1).map((_, index) => ({
        target: index + 1,
        species: style.animal,
        route: animalRoute(map.id, index),
        speed: 24,
        pauseMs: 900 + index * 250,
        phaseOffsetMs: index * 2300,
      })),
      atlas,
      shadow: [{ x: -11, y: 3, w: 24, h: 5, color: 0x739077 }],
      affection: [
        { x: -3, y: -33, w: 4, h: 4, color: 0xd39cac },
        { x: 3, y: -33, w: 4, h: 4, color: 0xd39cac },
        { x: -1, y: -29, w: 6, h: 4, color: 0xd39cac },
        { x: 1, y: -25, w: 2, h: 2, color: 0xd39cac },
      ],
      interactionRadius: 64,
      resetMs: 60000,
      cooldownMs: 1000,
      affectionMs: 5000,
    },
    ...(map.theme === "farm" ? { farm: nativeFarm() } : {}),
  };
}
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
    animation: animation(map),
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
