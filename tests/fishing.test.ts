import { expect, test } from "bun:test";
import {
  drawFishing,
  fishingPhase,
  fishingTarget,
  startFishing,
} from "../shared/fishing";
import { getMap, MAPS, mapBlocks, mapWater } from "../shared/maps";
import { Office } from "../server/office";
import { Command } from "../shared/protocol";
import { walkable, type Person } from "../shared/world";

const fisher = {
  x: 560,
  y: 480,
  direction: "up",
  moving: false,
  pose: "stand",
} as const;
const water = mapWater(getMap("zen-small"));

test("a manually started cast waits a random time, catches once, and finishes", () => {
  const first = startFishing(fisher, water, 100, () => 0)!;
  const later = startFishing(fisher, water, 100, () => 0.9)!;
  expect(later.bite - first.bite).toBe(5400);
  expect(fishingPhase(first, 99)).toBe("idle");
  expect(fishingPhase(first, first.start)).toBe("cast");
  expect(fishingPhase(first, first.start + 600)).toBe("wait");
  expect(fishingPhase(first, first.bite)).toBe("catch");
  expect(fishingPhase(first, first.bite + 1800)).toBe("idle");
});

test("fishing requires a manual command, synchronizes, cancels, and can be cast again from the same spot", () => {
  const office = new Office();
  const now = Date.now();
  office.configureWorkspace({
    ...office.workspace,
    mapId: "zen-small",
    revision: 1,
  });
  office.add(
    { id: "fisher", name: "Fisher", role: "member" },
    "test",
    now + 60000,
    () => {},
    () => {},
  );
  const person = office.members.get("fisher")!;
  Object.assign(person, fisher);
  office.tick(0.1, now + 1000);
  expect(office.people()[0].pose).toBe("stand");
  expect(office.people()[0].fishing).toBeUndefined();
  const command = Command.parse({ type: "pose", pose: "fish" });
  office.handle(person.id, command, now + 1000);
  const cast = office.people()[0].fishing!;
  expect(office.people()[0].pose).toBe("fish");
  expect(cast.start).toBe(now + 1000);
  expect(cast.bite - cast.start).toBeGreaterThanOrEqual(4600);
  expect(cast.bite - cast.start).toBeLessThan(10600);
  office.handle(person.id, command, now + 1100);
  expect(office.people()[0].fishing).toEqual(cast);
  office.tick(0.1, cast.bite + 1800);
  expect(office.people()[0].pose).toBe("stand");
  expect(office.people()[0].fishing).toBeUndefined();
  office.tick(0.1, cast.bite + 3000);
  expect(office.people()[0].pose).toBe("stand");
  for (const cancel of [
    { type: "pose", pose: "stand" },
    { type: "pose", pose: "sit" },
    { type: "pose", pose: "sleep" },
    { type: "move", dx: 1, dy: 0, seq: 1 },
    { type: "jump" },
  ]) {
    office.handle(person.id, command, cast.bite + 4000);
    expect(office.people()[0].pose).toBe("fish");
    office.handle(person.id, Command.parse(cancel), cast.bite + 4001);
    expect(office.people()[0].pose).not.toBe("fish");
    expect(office.people()[0].fishing).toBeUndefined();
  }
  person.direction = "left";
  expect(() => office.handle(person.id, command, cast.bite + 5000)).toThrow(
    "Face nearby water",
  );
  person.direction = "up";
  office.handle(person.id, command, cast.bite + 5001);
  office.configureWorkspace({
    ...office.workspace,
    mapId: "beach-small",
    revision: 2,
  });
  expect(office.people()[0].pose).toBe("stand");
  expect(office.people()[0].fishing).toBeUndefined();
});

test("all water maps expose fishable shores, but dry maps and facing away do not", () => {
  expect(
    MAPS.filter((map) => mapWater(map).length).map((map) => map.id),
  ).toEqual(["nature-small", "zen-small", "temple-small", "beach-small"]);
  for (const map of MAPS) {
    for (const b of mapWater(map)) {
      const person = {
        ...fisher,
        x: b.x + b.w / 2,
        y: b.y - 10,
        direction: "down" as const,
      };
      const shores = [
        person,
        { ...person, y: b.y + b.h + 15, direction: "up" as const },
        {
          ...person,
          x: b.x - 15,
          y: b.y + b.h / 2,
          direction: "right" as const,
        },
        {
          ...person,
          x: b.x + b.w + 15,
          y: b.y + b.h / 2,
          direction: "left" as const,
        },
      ];
      expect(
        shores.some(
          (shore) =>
            walkable(shore.x, shore.y, mapBlocks(map)) &&
            fishingTarget(shore, [b]),
        ),
      ).toBe(true);
      expect(fishingTarget(person, mapWater(map))).toBeDefined();
      expect(
        fishingTarget({ ...person, direction: "up" }, [b]),
      ).toBeUndefined();
      expect(fishingTarget({ ...person, y: b.y - 60 }, [b])).toBeUndefined();
      expect(fishingTarget({ ...person, x: b.x - 15 }, [b])).toBeUndefined();
    }
  }
});

test("fishing draws every direction, returns to an empty overlay, and respects reduced motion", () => {
  const positions: Pick<Person, "x" | "y" | "direction">[] = [
    { x: 560, y: 395, direction: "down" },
    { x: 560, y: 465, direction: "up" },
    { x: 415, y: 428, direction: "right" },
    { x: 705, y: 428, direction: "left" },
  ];
  for (const position of positions) {
    const fishing = startFishing({ ...fisher, ...position }, water, 100)!;
    const pixelsAt = (time: number, reducedMotion = false) => {
      const pixels: number[][] = [];
      drawFishing(fishing, "custom:4:2:5:1", time, reducedMotion, (...pixel) =>
        pixels.push(pixel),
      );
      expect(pixels.every((pixel) => pixel.every(Number.isFinite))).toBe(true);
      return pixels;
    };
    expect(pixelsAt(0)).toEqual([]);
    const waiting = pixelsAt(fishing.start + 1500);
    const caught = pixelsAt(fishing.bite + 900);
    expect(waiting.length).toBeGreaterThan(20);
    expect(caught.some((pixel) => pixel[4] === 0x437f87)).toBe(true);
    expect(caught).not.toEqual(waiting);
    expect(pixelsAt(fishing.bite + 1800)).toEqual([]);
    expect(pixelsAt(fishing.start + 1500, true)).toEqual(
      pixelsAt(fishing.start + 1700, true),
    );
    expect(pixelsAt(fishing.bite + 100, true)).toEqual(
      pixelsAt(fishing.bite + 900, true),
    );
  }
});
