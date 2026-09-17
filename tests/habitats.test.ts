import { expect, test } from "bun:test";
import { Office } from "../server/office";
import { MAPS, mapBlocks, mapZones, mapWater } from "../shared/maps";
import { walkable, zoneAt } from "../shared/world";
import {
  HABITATS,
  habitatLayout,
  animalPosition,
  emptyHabitat,
  drawHabitat,
  habitatTarget,
} from "../shared/habitats";
import th from "../lib/i18n/th.json";

test("habitats stay on walkable commons and draw safely in every map", () => {
  for (const map of MAPS) {
    const points = habitatLayout(map.id);
    expect(points).toHaveLength(4);
    for (const p of points) {
      expect(walkable(p.x, p.y, mapBlocks(map))).toBe(true);
      expect(zoneAt(p.x, p.y, mapZones(map))).toBe("floor");
    }
    for (let now = 0; now < 40000; now += 500) {
      for (let i = 0; i < 3; i++) {
        const p = animalPosition(map.id, i, now);
        expect(walkable(p.x, p.y, mapBlocks(map))).toBe(true);
      }
    }
    for (const still of [false, true])
      drawHabitat(
        map.id,
        {
          ...emptyHabitat(),
          step: 3,
          updatedAt: 1000,
          animal: 0,
          affectionUntil: 5000,
        },
        2000,
        true,
        true,
        still,
        (x, y, w, h, c) => {
          expect([x, y, w, h, c].every(Number.isFinite)).toBe(true);
          expect(w).toBeGreaterThan(0);
          expect(h).toBeGreaterThan(0);
        },
      );
  }
  for (const style of Object.values(HABITATS))
    for (const key of [style.quick, style.activity, ...style.stages])
      expect(Object.hasOwn(th, key)).toBe(true);
});

test("activity commands validate distance, share progress, reject stale actions and honor feature controls", () => {
  const office = new Office(),
    events: any[] = [];
  const a = office.add(
    { id: "a", name: "A", role: "member" },
    "s1",
    Date.now() + 60000,
    (e) => events.push(e),
    () => {},
  );
  const b = office.add(
    { id: "b", name: "B", role: "member" },
    "s2",
    Date.now() + 60000,
    (e) => events.push(e),
    () => {},
  );
  office.handle("a", { type: "interact", target: 0, revision: 0 }, 10000);
  expect(office.habitat.step).toBe(0);
  Object.assign(a, habitatLayout(office.workspace.mapId)[0]);
  Object.assign(b, habitatLayout(office.workspace.mapId)[0]);
  office.handle("a", { type: "interact", target: 0, revision: 0 }, 10000);
  office.handle("b", { type: "interact", target: 0, revision: 0 }, 10000);
  expect(office.habitat.step).toBe(1);
  office.broadcast();
  expect(events.at(-1).habitat.step).toBe(1);
  office.handle("b", { type: "interact", target: 0, revision: 1 }, 12000);
  office.handle("a", { type: "interact", target: 0, revision: 2 }, 14000);
  expect(office.habitat.step).toBe(3);
  office.handle("a", { type: "interact", target: 0, revision: 3 }, 16000);
  expect(office.habitat.revision).toBe(3);
  office.handle("a", { type: "interact", target: 0, revision: 3 }, 75000);
  expect(office.habitat.step).toBe(1);
  office.configureWorkspace({
    ...office.workspace,
    revision: 2,
    features: { whiteboard: true, activities: false },
  });
  office.handle("a", { type: "interact", target: 0, revision: 4 }, 80000);
  expect(office.habitat.revision).toBe(4);
  office.configureWorkspace({
    ...office.workspace,
    mapId: "beach-small",
    revision: 3,
  });
  expect(office.habitat).toEqual(emptyHabitat());
});

// These are the spawn positions consumed by the live farm scene.
test("farm livestock spawn on dry walkable ground", () => {
  for (const [kind, x, y] of FARM_ANIMALS) {
    expect(farmAnimalWalkable(x, y), `${kind} at ${x},${y}`).toBe(true);
  }
});

test("every habitat animal visibly roams while staying clear of water and obstacles", () => {
  for (const map of MAPS) {
    for (let i = 0; i < 3; i++) {
      const positions = Array.from({ length: 1201 }, (_, t) =>
        animalPosition(map.id, i, t * 100),
      );
      const home = animalPosition(map.id, i, 0, true);
      expect(
        Math.max(
          ...positions.map((p) => Math.hypot(p.x - home.x, p.y - home.y)),
        ),
        map.id,
      ).toBeGreaterThan(60);
      for (let n = 1; n < positions.length; n++) {
        expect(
          Math.hypot(
            positions[n].x - positions[n - 1].x,
            positions[n].y - positions[n - 1].y,
          ),
        ).toBeLessThanOrEqual(2.401);
      }
      expect(
        positions.some((p) => p.moving),
        map.id,
      ).toBe(true);
      expect(
        positions.some((p) => !p.moving),
        map.id,
      ).toBe(true);
      expect(animalPosition(map.id, i, 80000, true)).toEqual(
        animalPosition(map.id, i, 0, true),
      );
      for (const p of positions) {
        expect(walkable(p.x, p.y, mapBlocks(map)), map.id).toBe(true);
        expect(
          mapWater(map).some(
            (w) =>
              p.x + 24 > w.x &&
              p.x - 24 < w.x + w.w &&
              p.y + 8 > w.y &&
              p.y - 8 < w.y + w.h,
          ),
          map.id,
        ).toBe(false);
      }
    }
  }
});

import { FARM_ANIMALS, farmAnimalWalkable } from "../shared/farm";

test("animal interactions work along the route and at reduced-motion homes", () => {
  for (const still of [false, true]) {
    const office = new Office();
    const person = office.add(
      { id: "a", name: "A", role: "member" },
      "s",
      Date.now() + 60000,
      () => {},
      () => {},
    );
    const now = 7500;
    Object.assign(
      person,
      animalPosition(office.workspace.mapId, 0, now, still),
    );
    const target = habitatTarget(
      office.workspace.mapId,
      person,
      true,
      true,
      now,
      still,
    );
    expect(target).toBeGreaterThan(0);
    office.handle("a", { type: "interact", target, revision: 0 }, now);
    expect(office.habitat.animal).toBe(target - 1);
    expect(office.habitat.affectionUntil).toBe(now + 5000);
  }
});
