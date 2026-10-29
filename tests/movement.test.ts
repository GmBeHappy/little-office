import { expect, test } from "bun:test";
import { Office } from "../server/office";
import { Command } from "../shared/protocol";
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
// Run the actual client predictor and Office with ordered, delayed packets.
// Delaying just the stop used to add 32 px of motion after key release.
for (const stopDelay of [100, 450, 900])
  test(`input replay stops without warping with a ${stopDelay} ms stop delay`, () => {
    const office = new Office();
    office.blocks = [];
    office.add(
      { id: "a", name: "A", role: "member" },
      "fixture",
      Date.now() + 3600000,
      () => {},
      () => {},
    );
    Object.assign(office.members.get("a")!, { x: 500, y: 300 });
    const local = new LocalMovement(),
      map = { ...world(), zones: office.zones };
    let authority = office.people()[0],
      rendered = authority,
      released = authority;
    const epoch = Date.now();
    let time = 0,
      lastDelivery = 0;
    const queue: { at: number; run: () => void }[] = [];
    const send = (command: Command) => {
      if (command.type !== "move") return;
      const delay = time >= 800 ? stopDelay : 100;
      lastDelivery = Math.max(lastDelivery, time + delay);
      queue.push({
        at: lastDelivery,
        run: () => office.handle("a", command, epoch + time),
      });
    };
    let maxAfterRelease = 0;
    for (time = 0; time <= 2400; time += 20) {
      for (const item of queue.filter((item) => item.at <= time)) item.run();
      for (let i = queue.length - 1; i >= 0; i--)
        if (queue[i].at <= time) queue.splice(i, 1);
      if (time % 100 === 0) {
        office.tick(0.1, epoch + time);
        const snapshot = office.people()[0];
        queue.push({
          at: time + 100,
          run: () => {
            authority = snapshot;
          },
        });
      }
      // Turn mid-walk too: replay must retain the direction of every batch.
      rendered = local.step(
        authority,
        time < 400 ? 1 : 0,
        time >= 400 && time < 800 ? 1 : 0,
        0.02,
        time,
        map,
        send,
      );
      if (time === 800) released = rendered;
      if (time >= 800)
        maxAfterRelease = Math.max(
          maxAfterRelease,
          Math.hypot(rendered.x - released.x, rendered.y - released.y),
        );
    }
    expect(maxAfterRelease).toBeLessThan(0.01);
    expect(rendered.x).toBeCloseTo(office.members.get("a")!.x);
    expect(rendered.y).toBeCloseTo(office.members.get("a")!.y);
  });

test("walking starts after a quiet idle period without predicting indefinitely on a stalled socket", () => {
  const movement = new LocalMovement(),
    p = person(),
    map = world(),
    send = () => {};
  movement.step(p, 0, 0, 0.016, 0, map, send);
  const started = movement.step(p, 0, 1, 0.05, 10000, map, send);
  expect(started.y).toBe(p.y + 8);
  const stalled = movement.step(p, 0, 1, 0.05, 11000, map, send);
  expect(stalled.y).toBe(started.y);
  expect(movement.step(p, 0, 1, 0.05, 12000, map, send).y).toBe(started.y);
});

test("prediction pauses on a stalled connection and resets on teleport or a new session", () => {
  const movement = new LocalMovement(),
    p = person(),
    map = world();
  const commands: Command[] = [],
    send = (command: Command) => {
      commands.push(command);
    };
  const before = movement.step(p, 0, 1, 0.05, 0, map, send);
  const stalled = movement.step(p, 0, 1, 0.05, 1100, map, send);
  expect(stalled.y).toBe(before.y);
  expect(stalled.moving).toBe(false);
  expect(commands.at(-1)).toMatchObject({ type: "move", dx: 0, dy: 0 });
  // A server-authorized teleport keeps the previous acknowledged input sequence.
  const teleport = { ...p, x: 560, y: 570 };
  expect(movement.step(teleport, 0, 0, 0.016, 1200, map, send)).toMatchObject({
    x: 560,
    y: 570,
  });
  expect(
    movement.step({ ...p, id: "new" }, 0, 0, 0.016, 1300, map, send),
  ).toMatchObject(WORLD.spawn);
});

test("timed input cannot grant unlimited speed, duplicate steps, or bypass a wall", () => {
  const office = new Office(),
    now = Date.now();
  office.add(
    { id: "a", name: "A", role: "member" },
    "fixture",
    now + 3600000,
    () => {},
    () => {},
  );
  const member = office.members.get("a")!;
  Object.assign(member, { x: 500, y: 400 });
  office.blocks = [];
  for (let seq = 1; seq <= 20; seq++)
    office.handle(
      "a",
      { type: "move", dx: 1, dy: 0, steps: [0.1, 0.1], seq },
      now,
    );
  expect(member.x).toBeCloseTo(532); // Only the initial 200 ms budget.
  office.handle(
    "a",
    { type: "move", dx: 1, dy: 0, steps: [0.1], seq: 20 },
    now + 100,
  );
  expect(member.x).toBeCloseTo(532); // Duplicate acknowledgement cannot replay.
  office.handle("a", { type: "move", dx: 1, dy: 0, seq: 21 }, now + 100);
  office.tick(0.1, now + 100);
  expect(member.x).toBeCloseTo(532); // No switching back to legacy to double-walk.
  office.blocks = [{ x: 550, y: 380, w: 50, h: 50 }];
  office.handle(
    "a",
    { type: "move", dx: 1, dy: 0, steps: [0.1], seq: 21 },
    now + 100,
  );
  expect(member.x).toBeCloseTo(532);
  for (const steps of [[0.11], [-0.01], [0.1, 0.1, 0.1], Array(33).fill(0)])
    expect(
      Command.safeParse({ type: "move", dx: 1, dy: 0, seq: 22, steps }).success,
    ).toBe(false);
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
