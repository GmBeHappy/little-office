import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { nativeFixtures, capturePixels } from "../scripts/native-fixtures";
import { nativeMap } from "../server/native-scene";
import { drawOfficeMap, MAPS, mapBlocks, mapZones } from "../shared/maps";
import {
  drawFarmCrop,
  drawFarmEgg,
  FARM_RULES,
  FARM_PLOTS,
  farmTarget,
} from "../shared/farm";
import type { PixelRect, MapEffect } from "../shared/map-effects";
import golden from "./fixtures/native-rendering-golden.json";
const fixtures = nativeFixtures();
const normalized = (value: unknown): unknown =>
  typeof value === "number"
    ? Math.round(value * 1e6) / 1e6
    : Array.isArray(value)
      ? value.map(normalized)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, normalized(v)]),
          )
        : value;
const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(normalized(value)))
    .digest("hex");

test("shared drawing extraction preserves the web's pre-change pixels at fixed times", () => {
  expect(fixtures.habitat.map((c) => hash(c.expected))).toEqual(golden.habitat);
  expect(fixtures.farmAnimals.map((c) => hash(c.expected))).toEqual(
    golden.farmAnimals,
  );
  for (const { age, hash: expected } of golden.crops)
    expect(hash(capturePixels((r) => drawFarmCrop(0, 0, age, r)))).toBe(
      expected,
    );
  expect(hash(capturePixels((r) => drawFarmEgg(0, 0, r)))).toBe(golden.egg);
});

test("farm celebration atlases preserve original pixel-art pickups", () => {
  const farm = nativeMap("farm-small").animation.farm!;
  for (const [kind, expected] of Object.entries(golden.icons))
    expect(hash(farm.atlas[`icon-${kind}`])).toBe(expected);
});

test("animation is additive and preserves legacy geometry for every map", () => {
  for (const map of MAPS) {
    const scene = nativeMap(map.id);
    expect(scene.version).toBe(1);
    expect(scene.animation.version).toBe(1);
    expect(scene.rectangles).toEqual(
      capturePixels((r) => drawOfficeMap(map, r, () => {})),
    );
    expect(scene.blocks).toEqual(mapBlocks(map));
    expect(scene.zones).toEqual(mapZones(map));
    expect(!!scene.animation.farm).toBe(map.theme === "farm");
    const effects: MapEffect[] = [];
    expect(scene.animation.background).toEqual(
      capturePixels((r) =>
        drawOfficeMap(
          map,
          r,
          () => {},
          (effect) => effects.push(effect),
        ),
      ),
    );
    expect(scene.animation.effects).toEqual(effects);
  }
});

// Deliberately decode only the exported numbers, like Swift/Kotlin, without calling habitat helpers.
function routePosition(
  animal: ReturnType<
    typeof nativeMap
  >["animation"]["habitat"]["animals"][number],
  now: number,
) {
  const route = animal.route,
    index = animal.target - 1;
  const durations = route
    .slice(1)
    .map(
      (p, i) =>
        (Math.hypot(p.x - route[i].x, p.y - route[i].y) / animal.speed) * 1000,
    );
  const total = durations.reduce((sum, d) => sum + d + animal.pauseMs, 0);
  let phase = total
      ? (((now + animal.phaseOffsetMs) % total) + total) % total
      : 0,
    segment = 0;
  while (
    segment < durations.length - 1 &&
    phase >= durations[segment] + animal.pauseMs
  ) {
    phase -= durations[segment] + animal.pauseMs;
    segment++;
  }
  const a = route[segment],
    b = route[segment + 1] ?? a,
    duration = durations[segment] || 1,
    t = Math.min(1, phase / duration);
  const moving = durations.length > 0 && phase < duration;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    right: b.x === a.x ? index % 2 === 0 : b.x > a.x,
    moving,
    mode: moving ? "walk" : (segment + index) % 2 === 0 ? "graze" : "idle",
    walkTime: Math.min(phase, duration),
    poseTime: Math.max(0, phase - duration),
  };
}
test("exported routes reproduce web position, pauses, direction and timing including epoch-sized times", () => {
  for (const c of fixtures.animals) {
    const animal = nativeMap(c.mapId).animation.habitat.animals[c.index];
    expect(normalized(routePosition(animal, c.time))).toEqual(
      normalized(c.expected),
    );
  }
});

test("manifest stages, motion, atlases and mirrored affection reproduce the full web habitat", () => {
  for (const c of fixtures.habitat) {
    const habitat = nativeMap(c.mapId).animation.habitat,
      result: PixelRect[] = [];
    const translated = (
      r: PixelRect,
      x: number,
      y: number,
      left = false,
      bob = 0,
    ) =>
      result.push({ ...r, x: x + (left ? -r.x - r.w : r.x), y: y + r.y + bob });
    const stage =
      habitat.station.stages[
        c.time - c.state.updatedAt >= habitat.resetMs ? 0 : c.state.step
      ];
    for (let i = 0; i <= stage.rectangles.length; i++) {
      for (const m of stage.motions.filter((m) => m.before === i)) {
        let offset = c.still
          ? 0
          : Math.sin((c.time * 2 * Math.PI) / m.periodMs) * m.amplitude;
        if (m.roundOffset) offset = Math.round(offset);
        for (const r of m.rectangles)
          translated(
            r,
            habitat.station.x + (m.axis === "x" ? offset : 0),
            habitat.station.y + (m.axis === "y" ? offset : 0),
          );
      }
      if (i < stage.rectangles.length)
        translated(stage.rectangles[i], habitat.station.x, habitat.station.y);
    }
    for (const animal of habitat.animals) {
      const p = routePosition(animal, c.time),
        x = Math.round(p.x),
        y = Math.round(p.y);
      const frame =
        p.mode === "walk"
          ? Math.floor(p.walkTime / 160) % 2
          : p.mode === "graze"
            ? Math.floor(p.poseTime / 240) % 2
            : 0;
      for (const r of habitat.shadow) translated(r, x, y);
      for (const r of habitat.atlas[`${p.mode}-${frame}`])
        translated(r, x, y, !p.right);
      if (
        c.state.animal === animal.target - 1 &&
        c.state.affectionUntil > c.time
      )
        for (const r of habitat.affection)
          translated(r, x, y, !p.right, p.mode === "walk" && frame ? -1 : 0);
    }
    expect(normalized(result)).toEqual(normalized(c.expected));
  }
});

test("farm interaction boundaries, egg expiry and crop growth remain local and match web", () => {
  const cases = fixtures.farmTargets;
  expect(cases.slice(0, 4).map((c) => c.expected?.kind ?? null)).toEqual([
    "egg",
    null,
    "egg",
    null,
  ]);
  expect(cases.slice(4, 6).map((c) => c.expected?.kind ?? null)).toEqual([
    null,
    "harvest",
  ]);
  expect(cases.slice(6, 8).map((c) => c.expected?.kind ?? null)).toEqual([
    "plant",
    null,
  ]);
  expect(
    farmTarget(
      { x: FARM_PLOTS[0][0] - FARM_RULES.cropRadius, y: FARM_PLOTS[0][1] },
      [],
      FARM_PLOTS.map(() => 0),
      1000,
    ),
  ).toBeNull();
  const scene = nativeMap("farm-small").animation.farm!;
  for (const [stage, age] of [0, 0.25, 0.55, 1].entries())
    expect(scene.atlas[`crop-${stage}`]).toEqual(
      capturePixels((r) => drawFarmCrop(0, 0, age * FARM_RULES.growthMs, r)),
    );
});

test("interaction fixtures preserve server revision, cooldown and reset behavior", () => {
  expect(
    fixtures.interactions.map((c) => [c.expected.revision, c.expected.step]),
  ).toEqual([
    [1, 1],
    [1, 1],
    [1, 1],
    [2, 2],
    [3, 3],
    [3, 3],
    [4, 1],
  ]);
  expect(
    fixtures.targets.every(
      (c) =>
        c.expected ===
        (c.person.x - nativeMap(c.mapId).animation.habitat.station.x < 64
          ? 0
          : -1),
    ),
  ).toBe(true);
});

test("farm atlas frames reproduce web livestock with independent clocks and mirroring", () => {
  const farm = nativeMap("farm-small").animation.farm!;
  for (const c of fixtures.farmAnimals) {
    const input = c.input,
      result: PixelRect[] = [];
    let key: string,
      bob = 0;
    if (c.kind === "hen") {
      const idleBob = Math.sin(c.time / 400 + input.x) > 0.6;
      const frame =
        input.mode === "walk"
          ? Math.floor(input.walkTime / 120) % 2
          : input.mode === "peck"
            ? Math.floor((c.time - input.since) / 160) % 2
            : Number(idleBob);
      key = `hen-light-${input.mode}-${frame}`;
      if (input.mode === "peck") bob = idleBob ? -1 : 0;
    } else {
      const frame =
        input.mode === "walk"
          ? Math.floor(input.walkTime / 160) % 2
          : input.mode === "graze"
            ? Math.floor((c.time - input.since) / 240) % 2
            : 0;
      key = `${c.kind}-${input.mode}-${frame}`;
    }
    for (const r of farm.shadows[c.kind])
      result.push({ ...r, x: input.x + r.x, y: input.y + r.y });
    for (const r of farm.atlas[key])
      result.push({
        ...r,
        x: input.x + (input.direction === "left" ? -r.x - r.w : r.x),
        y: input.y + r.y + bob,
      });
    expect(normalized(result)).toEqual(normalized(c.expected));
  }
});
