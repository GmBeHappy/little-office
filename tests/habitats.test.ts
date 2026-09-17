import { expect, test } from "bun:test";
import { Office } from "../server/office";
import { MAPS, mapBlocks, mapZones } from "../shared/maps";
import { walkable, zoneAt } from "../shared/world";
import {
  HABITATS,
  habitatLayout,
  animalPosition,
  emptyHabitat,
  drawHabitat,
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
