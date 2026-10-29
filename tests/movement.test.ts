import { expect, test } from "bun:test";
import { LocalMovement } from "../lib/local-movement";
import { advanceMovement, type MovementWorld } from "../shared/movement";
import { WORLD, ZONES, type Person } from "../shared/world";
const person = (): Person => ({
  id: "a",
  name: "A",
  avatar: "sage",
  ...WORLD.spawn,
  direction: "down",
  moving: false,
  pose: "stand",
  microphone: false,
  status: "available",
  statusText: "",
  zone: "floor",
  conversation: "floor",
  room: "room",
  seq: 0,
});
const world = (): MovementWorld => ({
  blocks: [],
  zones: ZONES,
  locks: {},
  people: [],
});
test("local input starts before server acknowledgement and stops before stop acknowledgement", () => {
  const movement = new LocalMovement(),
    authoritative = person(),
    map = world();
  movement.step(authoritative, 0, 0, 0, 0.016, 0, map);
  const moved = movement.step(authoritative, 0, 1, 1, 0.05, 50, map);
  expect(moved.y).toBe(authoritative.y + 8);
  const stopped = movement.step(authoritative, 0, 0, 2, 0.05, 100, map);
  const held = movement.step(
    { ...authoritative, seq: 1, moving: true, y: authoritative.y + 4 },
    0,
    0,
    2,
    0.05,
    150,
    map,
  );
  expect(stopped.y).toBe(moved.y);
  expect(held.y).toBe(stopped.y);
  const ack = { ...authoritative, seq: 2, y: authoritative.y + 6 };
  let settled = held;
  for (let i = 0; i < 30; i++)
    settled = movement.step(ack, 0, 0, 2, 0.016, 200 + i * 16, map);
  expect(Math.abs(settled.y - ack.y)).toBeLessThan(0.1);
});
test("prediction cannot run forever on a stalled connection and resets on teleport or a new session", () => {
  const movement = new LocalMovement(),
    p = person(),
    map = world();
  const before = movement.step(p, 0, 1, 1, 0.05, 0, map);
  const stalled = movement.step(p, 0, 1, 1, 0.05, 1100, map);
  expect(stalled.y).toBe(before.y);
  expect(stalled.moving).toBe(false);
  const teleport = { ...p, x: 560, y: 570, seq: 5 };
  expect(movement.step(teleport, 0, 0, 1, 0.016, 1200, map)).toMatchObject({
    x: 560,
    y: 570,
  });
  expect(movement.step(p, 0, 0, 1, 0.016, 1300, map)).toMatchObject(
    WORLD.spawn,
  );
});
test("shared movement clamps diagonal speed and frame gaps, respects walls, locks and room capacity", () => {
  const p = { x: 400, y: 400, zone: "floor" as const },
    map = world();
  const diagonal = advanceMovement(p, 1, 1, 10, map);
  expect(Math.hypot(diagonal.x - p.x, diagonal.y - p.y)).toBeCloseTo(16);
  const wall = { ...map, blocks: [{ x: 100, y: 100, w: 50, h: 50 }] };
  expect(
    advanceMovement({ x: 80, y: 110, zone: "floor" }, 1, 0, 0.1, wall).x,
  ).toBe(80);
  const doorway = { x: 830, y: 200, zone: "floor" as const };
  expect(
    advanceMovement(doorway, 1, 0, 0.1, { ...map, locks: { studio: true } }),
  ).toEqual(doorway);
  expect(
    advanceMovement(doorway, 1, 0, 0.1, {
      ...map,
      people: Array.from({ length: 8 }, () => ({ zone: "studio" as const })),
    }),
  ).toEqual(doorway);
  expect(advanceMovement(doorway, 1, 0, 0.1, map).zone).toBe("studio");
});
