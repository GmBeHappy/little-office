import { describe, expect, test } from "bun:test";
import { Office } from "../server/office";
import type { ActivityEvent } from "../shared/activity";
import { Command } from "../shared/protocol";
import { boardScope } from "../shared/whiteboard";
import { JUMP_DURATION } from "../shared/world";
import { walkable, WORLD, zoneAt, canNudge } from "../shared/world";
import { MAPS, getMap, mapBlocks, mapDesks, mapZones } from "../shared/maps";
import { FARM_EGG_SPOTS, FARM_PLOTS, FARM_POND } from "../shared/farm";
function setup() {
  const retired: string[] = [],
    events: Record<string, any[]> = { a: [], b: [], c: [] };
  const office = new Office((r) => retired.push(r));
  for (const id of Object.keys(events))
    office.add(
      { id, name: id, role: "member" },
      id,
      Date.now() + 3600000,
      (e) => events[id].push(e),
      () => {},
    );
  return { office, events, retired };
}
describe("office behavior", () => {
  test("legacy idle movement keeps liveness without forcing full-office snapshots", () => {
    const { office } = setup();
    const member = office.members.get("a")!,
      now = member.seen + 1000;
    office.broadcast();
    for (let seq = 1; seq <= 12; seq++)
      office.handle("a", { type: "move", dx: 0, dy: 0, seq }, now + seq * 80);
    expect(office.dirty).toBe(false);
    expect(member.seq).toBe(12);
    expect(member.seen).toBe(now + 960);
    office.handle("a", { type: "move", dx: 1, dy: 0, seq: 13 }, now + 1040);
    expect(office.dirty).toBe(true);
    office.broadcast();
    office.handle("a", { type: "move", dx: 0, dy: 0, seq: 14 }, now + 1060);
    expect(office.dirty).toBe(true); // A real stop still acknowledges immediately.
  });
  test("ping echoes only the nonce to its sender without changing human activity", () => {
    const { office, events } = setup();
    const member = office.members.get("a")!;
    const activity = member.activity;
    for (const messages of Object.values(events)) messages.length = 0;
    office.handle("a", { type: "ping", nonce: 42 }, activity + 1000);
    expect(events.a).toEqual([{ type: "pong", nonce: 42 }]);
    expect(events.b).toEqual([]);
    expect(member.activity).toBe(activity);
    office.handle("a", { type: "ping" }, activity + 2000);
    expect(events.a).toHaveLength(1); // Old clients still send heartbeat-only ping.
  });
  test("status icons reach other people and survive reconnecting", () => {
    const { office, events } = setup();
    office.handle(
      "a",
      Command.parse({
        type: "status",
        status: "busy",
        text: "Reviewing designs",
        icon: "💻",
      }),
    );
    office.broadcast();
    expect(
      events.b
        .at(-1)
        .people.find((person: { id: string }) => person.id === "a"),
    ).toMatchObject({
      status: "busy",
      statusText: "Reviewing designs",
      statusIcon: "💻",
    });
    office.handle(
      "a",
      Command.parse({ type: "status", status: "away", text: "Back soon" }),
    );
    expect(office.members.get("a")?.statusIcon).toBe("💻");
    office.remove("a");
    office.add(
      {
        id: "a",
        name: "a",
        role: "member",
        availability: "dnd",
        statusText: "Deep work",
        statusIcon: "🎧",
      },
      "new-session",
      Date.now() + 3600000,
      () => {},
      () => {},
    );
    expect(office.people().find((person) => person.id === "a")).toMatchObject({
      status: "dnd",
      statusText: "Deep work",
      statusIcon: "🎧",
    });
    expect(
      Command.safeParse({
        type: "status",
        status: "busy",
        text: "",
        icon: "bad",
      }).success,
    ).toBe(false);
  });
  test("emotes accept one Unicode emoji and broadcast to all members without changing presence", () => {
    const { office, events } = setup();
    for (const emoji of ["😀", "👋🏽", "🇹🇭", "👨‍👩‍👧‍👦", "❤️", "1️⃣"]) {
      const command = Command.parse({ type: "emote", emoji });
      office.handle("a", command, Date.now());
      for (const messages of Object.values(events))
        expect(messages.at(-1)).toEqual({ type: "emote", from: "a", emoji });
    }
    for (const emoji of [
      "",
      "hello",
      "😀😀",
      "<script>",
      "a😀",
      "a".repeat(200),
    ])
      expect(Command.safeParse({ type: "emote", emoji }).success).toBe(false);
    expect(office.members.get("a")?.status).toBe("available");
  });
  test("nudges only target people in front, play sender acknowledgement, and have no cooldown", () => {
    const { office, events } = setup();
    const a = office.members.get("a")!,
      b = office.members.get("b")!,
      c = office.members.get("c")!;
    a.direction = "right";
    c.direction = "right";
    b.x = a.x + 30;
    c.x = a.x - 60;
    b.y = c.y = a.y;
    const now = Date.now();
    office.handle("a", { type: "nudge" }, now);
    expect(events.b.filter((e) => e.type === "nudge")).toEqual([
      { type: "nudge", from: "a", name: "a" },
    ]);
    expect(events.c.filter((e) => e.type === "nudge")).toHaveLength(0);
    expect(() =>
      office.handle("a", { type: "nudge", target: "c" }, now),
    ).toThrow("Face a nearby");
    a.direction = "left";
    office.handle("a", { type: "nudge", target: "c" }, now);
    a.direction = "right";
    office.handle("c", { type: "nudge", target: "b" }, now);
    office.handle("a", { type: "nudge", target: "b" }, now);
    expect(events.b.filter((e) => e.type === "nudge")).toHaveLength(3);
    expect(events.c.filter((e) => e.type === "nudge")).toHaveLength(1);
    expect(events.a.filter((e) => e.type === "nudge-sent")).toHaveLength(3);
    expect(events.c.filter((e) => e.type === "nudge-animation")).toHaveLength(
      4,
    );
    b.x = a.x + 121;
    expect(() =>
      office.handle("a", { type: "nudge", target: "b" }, now + 10000),
    ).toThrow("Face a nearby");
    b.x = a.x + 30;
    b.zone = "studio";
    expect(() =>
      office.handle("a", { type: "nudge", target: "b" }, now + 10000),
    ).toThrow("Face a nearby");
    b.zone = "floor";
    b.status = "dnd";
    expect(() =>
      office.handle("a", { type: "nudge", target: "b" }, now + 10000),
    ).toThrow("Do not disturb");
    expect(() =>
      office.handle("a", { type: "nudge", target: "a" }, now + 10000),
    ).toThrow("Face a nearby");
    expect(() =>
      office.handle("a", { type: "nudge", target: "offline" }, now + 10000),
    ).toThrow("Face a nearby");
  });
  test("facing cone works in all directions and excludes overlaps and sides", () => {
    const origin = { x: 0, y: 0, zone: "floor" as const };
    for (const [direction, x, y] of [
      ["right", 80, 0],
      ["left", -80, 0],
      ["up", 0, -80],
      ["down", 0, 80],
    ] as const) {
      const from = { ...origin, direction };
      expect(canNudge(from, { ...origin, x, y })).toBe(true);
      expect(canNudge(from, { ...origin, x: -x, y: -y })).toBe(false);
      expect(canNudge(from, { ...origin, x: y, y: x })).toBe(false);
      expect(canNudge(from, origin)).toBe(false);
    }
  });
  test("poses and microphone indicators synchronize without changing voice or status", () => {
    const { office } = setup();
    const a = office.members.get("a")!;
    const room = a.room;
    office.handle("a", { type: "microphone", room, enabled: true });
    for (const pose of ["sit", "sleep"] as const) {
      office.handle("a", { type: "pose", pose });
      expect(office.people().find((p) => p.id === "a")).toMatchObject({
        pose,
        microphone: true,
        room,
        status: "available",
      });
      office.handle("a", { type: "move", dx: 0, dy: 0, seq: a.seq + 1 });
      expect(a.pose).toBe(pose);
    }
    office.handle("a", { type: "move", dx: 1, dy: 0, seq: a.seq + 1 });
    expect(a.pose).toBe("stand");
    office.handle("a", { type: "pose", pose: "sit" });
    office.handle("a", { type: "jump" });
    expect(a.pose).toBe("stand");
    office.go(a, "studio");
    expect(a.microphone).toBe(false);
    office.handle("a", { type: "microphone", room, enabled: true });
    expect(a.microphone).toBe(false);
    office.handle("a", { type: "microphone", room: a.room, enabled: true });
    expect(a.microphone).toBe(true);
  });
  test("speaking refreshes activity and returns an automatically away member to their manual status", () => {
    const { office } = setup();
    const member = office.members.get("a")!;
    const now = Date.now();
    member.activity = now - 300001;
    office.tick(0.05, now);
    expect(member.status).toBe("away");
    office.handle(
      "a",
      { type: "microphone", room: member.room, enabled: true, speaking: true },
      now + 10,
    );
    expect(member.status).toBe("available");
    expect(member.activity).toBe(now + 10);
  });
  test("all maps have the advertised seats and reachable safe entrances", () => {
    expect(MAPS.filter((map) => map.size === "small")).toHaveLength(12);
    expect(MAPS.filter((map) => map.size === "large")).toHaveLength(3);
    for (const map of MAPS) {
      const blocks = mapBlocks(map);
      const office = new Office();
      office.configureWorkspace({ name: map.name, mapId: map.id, revision: 1 });
      const member = office.add(
        { id: "walker", name: "Walker", role: "member" },
        "test",
        Date.now() + 60000,
        () => {},
        () => {},
      );
      for (const zone of mapZones(map)) {
        office.go(member, zone.id);
        expect(zoneAt(member.x, member.y, office.zones)).toBe(zone.id);
      }
      for (let i = 0; i < 16; i++) {
        const x = WORLD.spawn.x + (i % 2) * 32;
        const y = WORLD.spawn.y + Math.floor(i / 2) * 32;
        expect(walkable(x, y, blocks)).toBe(true);
        expect(zoneAt(x, y, mapZones(map))).toBe("floor");
      }
      expect(mapDesks(map).length * 2).toBe(
        map.theme === "farm" ? 0 : map.size === "small" ? 8 : 12,
      );
      expect(walkable(WORLD.spawn.x, WORLD.spawn.y, blocks)).toBe(true);
      for (const zone of mapZones(map))
        expect(walkable(zone.arrival.x, zone.arrival.y, blocks)).toBe(true);
      const reachable = new Set<string>([`${WORLD.spawn.x},${WORLD.spawn.y}`]);
      const queue = [{ ...WORLD.spawn }];
      for (let i = 0; i < queue.length; i++) {
        const point = queue[i];
        for (const [dx, dy] of [
          [10, 0],
          [-10, 0],
          [0, 10],
          [0, -10],
        ]) {
          const x = point.x + dx,
            y = point.y + dy,
            key = `${x},${y}`;
          if (!reachable.has(key) && walkable(x, y, blocks)) {
            reachable.add(key);
            queue.push({ x, y });
          }
        }
      }
      for (const zone of mapZones(map))
        expect(reachable.has(`${zone.arrival.x},${zone.arrival.y}`)).toBe(true);
      for (const desk of mapDesks(map)) {
        for (const dx of [30, 80])
          expect(
            queue.some(
              (point) =>
                Math.abs(point.x - (desk.x + dx)) < 11 &&
                Math.abs(point.y - (desk.y + 90)) < 11,
            ),
          ).toBe(true);
      }
      for (const desk of mapDesks(map))
        expect(walkable(desk.x + 20, desk.y + 20, blocks)).toBe(false);
    }
  });
  test("sunny acres keeps every mini-game spot walkable, reachable, and near a bank to fish from", () => {
    const map = getMap("farm-small");
    const blocks = mapBlocks(map);
    const reachable = new Set<string>([`${WORLD.spawn.x},${WORLD.spawn.y}`]);
    const queue = [{ ...WORLD.spawn }];
    for (let i = 0; i < queue.length; i++) {
      const point = queue[i];
      for (const [dx, dy] of [
        [10, 0],
        [-10, 0],
        [0, 10],
        [0, -10],
      ]) {
        const x = point.x + dx,
          y = point.y + dy,
          key = `${x},${y}`;
        if (!reachable.has(key) && walkable(x, y, blocks)) {
          reachable.add(key);
          queue.push({ x, y });
        }
      }
    }
    for (const [x, y] of [...FARM_EGG_SPOTS, ...FARM_PLOTS]) {
      expect(walkable(x, y, blocks)).toBe(true);
      expect(reachable.has(`${x},${y}`)).toBe(true);
    }
    // Each pond edge needs a reachable bank point within casting distance.
    const banks = [
      [FARM_POND.x - 30, FARM_POND.y + FARM_POND.h / 2],
      [FARM_POND.x + FARM_POND.w + 30, FARM_POND.y + FARM_POND.h / 2],
      [FARM_POND.x + FARM_POND.w / 2, FARM_POND.y - 30],
      [FARM_POND.x + FARM_POND.w / 2, FARM_POND.y + FARM_POND.h + 30],
    ];
    for (const [x, y] of banks)
      expect(
        [...reachable].some((key) => {
          const [rx, ry] = key.split(",").map(Number);
          return Math.hypot(rx - x, ry - y) <= 40;
        }),
      ).toBe(true);
    expect(mapDesks(map)).toEqual([]);
  });
  test("zen garden uses its relocated rooms for walking, teleporting, locks, and safe map changes", () => {
    const { office } = setup();
    office.configureWorkspace({ name: "Zen", mapId: "zen-small", revision: 1 });
    const a = office.members.get("a")!;
    for (const zone of ["studio", "library", "floor"] as const) {
      office.go(a, zone);
      expect(zoneAt(a.x, a.y, office.zones)).toBe(zone);
      expect(a.conversation).toBe(zone === "floor" ? "floor" : `zone:${zone}`);
    }
    expect(walkable(560, 430, office.blocks)).toBe(false);
    expect(walkable(560, 535, office.blocks)).toBe(false);
    for (let x = 410; x <= 710; x += 10)
      expect(walkable(x, 480, office.blocks)).toBe(true);
    a.x = 200;
    a.y = 286;
    a.zone = "floor";
    const now = Date.now();
    office.locks.studio = true;
    // Keep another member inside so the room remains locked during ticks.
    office.go(office.members.get("b")!, "studio", true);
    office.handle("a", { type: "move", dx: 0, dy: -1, seq: 1 }, now);
    office.tick(0.1, now);
    office.tick(0.1, now + 100);
    expect(a.zone).toBe("floor");
    expect(() => office.go(a, "studio")).toThrow("locked");
    office.locks.studio = false;
    office.tick(0.1, now + 200);
    expect(office.members.get("a")!.zone).toBe("studio");
    expect(a.conversation).toBe("zone:studio");
    office.configureWorkspace({
      name: "Original",
      mapId: "nature-small",
      revision: 2,
    });
    office.go(a, "studio");
    expect(a.x).toBeGreaterThan(840);
    expect(zoneAt(a.x, a.y, office.zones)).toBe("studio");
  });
  test("changing workspace maps ends media, cancels invitations, resets locks, and broadcasts safe positions", () => {
    const { office, events, retired } = setup();
    office.handle("a", { type: "zone", zone: "studio" });
    office.handle("b", { type: "zone", zone: "studio" });
    office.handle("a", { type: "lock", zone: "studio", locked: true });
    office.handle("a", { type: "present", enabled: true });
    office.handle("a", { type: "invite", target: "c", kind: "summon" });
    const oldRoom = office.members.get("a")!.room;
    office.configureWorkspace({
      name: "Orbit crew",
      mapId: "space-large",
      revision: 2,
    });
    expect(retired).toContain(oldRoom);
    expect(office.invites.size).toBe(0);
    expect(office.presenters).toEqual({});
    expect(office.locks.studio).toBe(false);
    for (const person of office.people()) {
      expect(person.room).not.toBe("");
      expect(person.zone).toBe("floor");
      expect(person.conversation).toBe("floor");
      expect(
        walkable(person.x, person.y, mapBlocks(getMap("space-large"))),
      ).toBe(true);
    }
    expect(events.b.at(-1).workspace.mapId).toBe("space-large");
    const room = office.members.get("a")!.room;
    office.configureWorkspace({
      name: "Renamed",
      mapId: "space-large",
      revision: 3,
    });
    expect(office.members.get("a")!.room).toBe(room);
    office.configureWorkspace({
      name: "Stale",
      mapId: "nature-small",
      revision: 2,
    });
    expect(office.workspace.name).toBe("Renamed");
  });
  test("jumps reach other players, preserve location, and cannot overlap", () => {
    const { office, events } = setup();
    const person = office.members.get("a")!;
    const before = {
      x: person.x,
      y: person.y,
      zone: person.zone,
      room: person.room,
    };
    const now = Date.now();
    expect(Command.safeParse({ type: "jump" }).success).toBe(true);
    office.handle("a", { type: "jump" }, now);
    office.handle("a", { type: "jump" }, now + 100);
    for (const received of Object.values(events))
      expect(received.filter((event) => event.type === "jump")).toEqual([
        { type: "jump", from: "a" },
      ]);
    expect({
      x: person.x,
      y: person.y,
      zone: person.zone,
      room: person.room,
    }).toEqual(before);
    office.handle("a", { type: "jump" }, now + JUMP_DURATION);
    expect(events.b.filter((event) => event.type === "jump")).toHaveLength(2);
  });
  test("server movement is speed-limited, collides, and rejects invalid input", () => {
    const { office } = setup();
    const m = office.members.get("a")!;
    const start = m.x;
    office.handle("a", { type: "move", dx: 1, dy: 0, seq: 1 });
    office.tick(100);
    expect(m.x - start).toBe(16);
    m.x = 105;
    m.y = 210;
    office.handle("a", { type: "move", dx: 1, dy: 0, seq: 2 });
    office.tick(0.1);
    expect(m.x).toBe(105);
    expect(
      Command.safeParse({ type: "move", dx: 999, dy: 0, seq: 3 }).success,
    ).toBe(false);
  });
  test("nearby audio joins automatically, pauses for DND, and resumes after leaving meetings", () => {
    const { office } = setup();
    expect(office.members.get("a")!.room).not.toBe("");
    expect(office.audience("a").map((p) => p.id)).toEqual(["b", "c"]);
    office.handle("a", { type: "status", status: "dnd", text: "" });
    expect(office.members.get("a")!.room).toBe("");
    expect(() =>
      office.handle("b", { type: "invite", target: "a", kind: "summon" }),
    ).toThrow("Do not disturb");
    office.handle("a", { type: "status", status: "available", text: "" });
    expect(office.members.get("a")!.conversation).toBe("floor");
    office.handle("a", { type: "zone", zone: "studio" });
    office.handle("a", { type: "leave" });
    expect(office.members.get("a")!.conversation).toBe("floor");
    expect(Command.safeParse({ type: "nearby", enabled: false }).success).toBe(
      false,
    );
  });
  test("summons require acceptance, expire, and cannot be replayed or accepted by another member", () => {
    const { office } = setup();
    office.handle("a", { type: "zone", zone: "studio" });
    office.handle("a", { type: "invite", target: "b", kind: "summon" });
    const invite = [...office.invites.values()][0];
    expect(office.members.get("b")!.zone).toBe("floor");
    expect(() =>
      office.handle("c", { type: "respond", id: invite.id, accept: true }),
    ).toThrow();
    office.handle("b", { type: "respond", id: invite.id, accept: true });
    expect(office.members.get("b")!.zone).toBe("studio");
    expect(() =>
      office.handle("b", { type: "respond", id: invite.id, accept: true }),
    ).toThrow();
    office.handle("c", { type: "invite", target: "b", kind: "summon" });
    const expired = [...office.invites.values()][0];
    expect(() =>
      office.handle(
        "b",
        { type: "respond", id: expired.id, accept: true },
        expired.expires + 1,
      ),
    ).toThrow("expired");
  });
  test("locked rooms reject direct entry but admit an accepted summon from inside", () => {
    const { office } = setup();
    office.handle("a", { type: "zone", zone: "library" });
    office.handle("a", { type: "lock", zone: "library", locked: true });
    expect(() => office.handle("b", { type: "zone", zone: "library" })).toThrow(
      "locked",
    );
    office.handle("a", { type: "invite", target: "b", kind: "summon" });
    office.handle("b", {
      type: "respond",
      id: [...office.invites.keys()][0],
      accept: true,
    });
    expect(office.members.get("b")!.zone).toBe("library");
  });
  test("private-room departure changes its media generation and clears presenters", () => {
    const { office, retired } = setup();
    for (const id of ["a", "b"])
      office.handle(id, { type: "zone", zone: "studio" });
    const old = office.members.get("a")!.room;
    office.handle("a", { type: "present", enabled: true });
    office.handle("b", { type: "present", enabled: true });
    expect(office.presenters["zone:studio"]).toEqual(["a", "b"]);
    office.handle("a", { type: "zone", zone: "floor" });
    expect(retired).toContain(old);
    expect(office.members.get("b")!.room).not.toBe(old);
    expect(office.presenters["zone:studio"]).toBeUndefined();
  });
  test("a direct call requires consent and ends for both when either leaves", () => {
    const { office } = setup();
    office.handle("a", { type: "invite", target: "b", kind: "call" });
    expect(office.members.get("a")!.conversation).toBe("floor");
    office.handle("b", {
      type: "respond",
      id: [...office.invites.keys()][0],
      accept: true,
    });
    expect(office.members.get("a")!.conversation).toStartWith("call:");
    expect(office.members.get("a")!.room).toBe(office.members.get("b")!.room);
    office.handle("a", { type: "leave" });
    expect(office.members.get("b")!.conversation).toBe("floor");
  });
  test("new office connections replace old ones, including shared login sessions", () => {
    for (const sessionId of ["same-session", "different-session"]) {
      const events: unknown[] = [];
      let closeCode: number | undefined;
      const office = new Office();
      const old = office.add(
        { id: "a", name: "a", role: "member" },
        "same-session",
        Date.now() + 60000,
        (event) => events.push(event),
        (code) => {
          closeCode = code;
        },
        "old-connection",
      );
      const replacement = office.add(
        { id: "a", name: "a", role: "member" },
        sessionId,
        Date.now() + 60000,
        () => {},
        () => {},
        "new-connection",
      );
      expect(closeCode).toBe(4001);
      expect(office.members.size).toBe(1);
      expect(office.members.get("a")).toBe(replacement);
      expect(replacement.sessionId).toBe(sessionId);
      expect(replacement.connectionId).not.toBe(old.connectionId);
      expect(replacement.room).not.toBe(old.room);
    }
  });
  test("idle movement frames do not prevent auto-away and expired sessions are removed", () => {
    const { office } = setup();
    const m = office.members.get("a")!,
      now = Date.now();
    m.activity = now - 300001;
    office.handle("a", { type: "move", dx: 0, dy: 0, seq: 1 }, now);
    office.tick(0.05, now);
    expect(m.status).toBe("away");
    m.expires = now - 1;
    office.tick(0.05, now);
    expect(office.members.has("a")).toBe(false);
  });
});

test("activity records accepted actions once, including sharing interruptions and reconnects", () => {
  const log: ActivityEvent[] = [];
  const office = new Office(undefined, undefined, (event) => log.push(event));
  const add = (id: string) =>
    office.add(
      { id, name: `Person ${id}`, role: "member" },
      id,
      Date.now() + 60000,
      () => {},
      () => {},
    );
  const a = add("a"),
    b = add("b");
  expect(log.map((e) => e.action)).toEqual(["office.join", "office.join"]);
  a.direction = "right";
  b.x = a.x + 30;
  office.handle("a", { type: "nudge", target: "b" });
  expect(log.at(-1)).toMatchObject({
    action: "nudge",
    actorName: "Person a",
    targetName: "Person b",
    details: { targetId: "b" },
  });
  expect(Number.isNaN(Date.parse(log.at(-1)!.createdAt))).toBe(false);
  const count = log.length;
  expect(() =>
    office.handle("b", { type: "nudge", target: "missing" }),
  ).toThrow();
  expect(log.length).toBe(count);
  office.handle("a", { type: "screen-share", room: a.room, enabled: true });
  expect(log.length).toBe(count); // Cannot announce a share without presenting permission.
  office.handle("a", { type: "present", enabled: true });
  office.handle("a", { type: "present", enabled: false });
  expect(log.length).toBe(count); // Cancelling the picker does not start a share.
  office.handle("a", { type: "present", enabled: true });
  office.handle("a", {
    type: "screen-share",
    room: "stale-room",
    enabled: true,
  });
  expect(log.length).toBe(count);
  for (let i = 0; i < 2; i++)
    office.handle("a", { type: "screen-share", room: a.room, enabled: true });
  expect(log.filter((e) => e.action === "screen.start")).toHaveLength(1);
  office.go(b, "studio"); // Room rotation stops the remaining participant's share.
  expect(log.at(-1)?.action).toBe("screen.stop");
  office.handle("a", { type: "screen-share", room: a.room, enabled: false });
  expect(log.filter((e) => e.action === "screen.stop")).toHaveLength(1);
  office.handle("a", { type: "present", enabled: true });
  office.handle("a", { type: "screen-share", room: a.room, enabled: true });
  office.remove("a");
  office.remove("a");
  expect(log.slice(-2).map((e) => e.action)).toEqual([
    "screen.stop",
    "office.leave",
  ]);
  expect(log.filter((e) => e.action === "office.leave")).toHaveLength(1);
  add("b");
  expect(log.slice(-2).map((e) => e.action)).toEqual([
    "office.leave",
    "office.join",
  ]);
});

test("same authenticated client rebinds transport without retiring shared media or resetting presence", () => {
  const retired: string[] = [];
  const office = new Office((room) => retired.push(room));
  const user = { id: "a", name: "A", role: "member" };
  let previousClosed = false;
  const original = office.add(
    user,
    "session",
    Date.now() + 3600000,
    () => {},
    () => {
      previousClosed = true;
      expect(office.members.get("a")?.connectionId).toBe("new-connection");
    },
    "old-connection",
    "same-client",
  );
  const peer = office.add(
    { id: "b", name: "B", role: "member" },
    "other-session",
    Date.now() + 3600000,
    () => {},
    () => {},
  );
  office.go(original, "studio");
  office.go(peer, "studio");
  original.status = "busy";
  original.seq = 37;
  original.microphone = true;
  original.sharing = true;
  original.input = { dx: 1, dy: 0, at: Date.now() };
  const before = {
    room: original.room,
    x: original.x,
    y: original.y,
    zone: original.zone,
    seq: original.seq,
    status: original.status,
    microphone: true,
    sharing: true,
  };
  retired.length = 0;
  const messages: unknown[] = [];
  const resumed = office.add(
    user,
    "session",
    Date.now() + 3600000,
    (event) => messages.push(event),
    () => {},
    "new-connection",
    "same-client",
  );
  expect(resumed).toBe(original);
  expect(resumed).toMatchObject(before);
  expect(resumed.input.dx).toBe(0);
  expect(peer.room).toBe(before.room);
  expect(retired).toEqual([]);
  expect(previousClosed).toBe(true);
  expect(messages.length).toBeGreaterThan(0);
  office.add(
    user,
    "different-session",
    Date.now() + 3600000,
    () => {},
    () => {},
    "takeover-connection",
    "same-client",
  );
  expect(retired).toContain(before.room);
  expect(peer.room).not.toBe(before.room);
});

test("a stop transition is broadcast even without a stream of idle movement commands", () => {
  const { office } = setup();
  const now = Date.now();
  office.handle("a", { type: "move", dx: 0, dy: 1, seq: 1 }, now);
  office.tick(0.05, now + 50);
  office.broadcast();
  office.handle("a", { type: "move", dx: 0, dy: 0, seq: 2 }, now + 60);
  office.broadcast(); // A broadcast may run between input receipt and the next simulation tick.
  office.tick(0.05, now + 100);
  expect(office.members.get("a")?.moving).toBe(false);
  expect(office.dirty).toBe(true);
});

test("reconnect grace stops movement, expires, and never delays session revocation", () => {
  const retired: string[] = [];
  const office = new Office((room) => retired.push(room));
  const now = Date.now();
  const a = office.add(
    { id: "a", name: "A", role: "member" },
    "session",
    now + 3600000,
    () => {},
    () => {},
    "connection",
    "client",
  );
  const b = office.add(
    { id: "b", name: "B", role: "member" },
    "peer",
    now + 3600000,
    () => {},
    () => {},
  );
  const room = b.room;
  office.handle("a", { type: "move", dx: 0, dy: 1, seq: 1 }, now);
  office.detach("a", "stale-connection", now);
  expect(a.reconnectUntil).toBeUndefined();
  office.detach("a", "connection", now);
  expect(a.input.dx).toBe(0);
  expect(a.input.dy).toBe(0);
  office.tick(0.05, now + 14999);
  expect(office.members.has("a")).toBe(true);
  expect(b.room).toBe(room);
  office.tick(0.05, now + 15000);
  expect(office.members.has("a")).toBe(false);
  expect(retired).toContain(room);
  office.add(
    { id: "a", name: "A", role: "member" },
    "session",
    now + 3600000,
    () => {},
    () => {},
    "new-connection",
    "client",
  );
  office.detach("a", "new-connection", now);
  office.revokeSession("session");
  expect(office.members.has("a")).toBe(false);
  office.add(
    { id: "a", name: "A", role: "member" },
    "session",
    now + 3600000,
    () => {},
    () => {},
    "third-connection",
    "client",
  );
  office.detach("a", "third-connection", now);
  const resumed = office.add(
    { id: "a", name: "A", role: "member" },
    "session",
    now + 3600000,
    () => {},
    () => {},
    "fourth-connection",
    "client",
  );
  expect(resumed.reconnectUntil).toBeUndefined();
  office.tick(0.05, now + 15001);
  expect(office.members.has("a")).toBe(true);
});

test("transport heartbeats preserve liveness without activity or session extension", () => {
  const office = new Office();
  const now = Date.now();
  const member = office.add(
    { id: "a", name: "A", role: "member" },
    "session",
    now + 60000,
    () => {},
    () => {},
    "current",
    "client",
  );
  member.seen = now - 34000;
  member.activity = now - 301000;
  office.acknowledgeHeartbeat("a", "stale", now);
  expect(member.seen).toBe(now - 34000);
  office.acknowledgeHeartbeat("a", "current", now);
  expect(member.seen).toBe(now);
  office.tick(0.05, now);
  expect(member.status).toBe("away");
  expect(member.activity).toBe(now - 301000);
  office.detach("a", "current", now);
  office.acknowledgeHeartbeat("a", "current", now + 10000);
  expect(member.seen).toBe(now);
  office.tick(0.05, now + 15000);
  expect(office.members.has("a")).toBe(false);
  const expired = office.add(
    { id: "a", name: "A", role: "member" },
    "session",
    now + 20000,
    () => {},
    () => {},
    "next",
    "client",
  );
  office.acknowledgeHeartbeat("a", "next", now + 21000);
  office.tick(0.05, now + 21000);
  expect(expired.expires).toBe(now + 20000);
  expect(office.members.has("a")).toBe(false);
});

test("automatic Away is broadcast and clearing status restores manual availability", () => {
  const { office } = setup();
  const now = Date.now();
  const m = office.members.get("a")!;
  m.activity = now - 300001;
  office.broadcast();
  office.tick(0.05, now);
  expect(m.status).toBe("away");
  expect(office.dirty).toBe(true);
  office.handle(
    "a",
    Command.parse({ type: "status", status: "available", text: "", icon: "" }),
    now,
  );
  office.tick(0.05, now + 1000);
  expect(m).toMatchObject({
    status: "available",
    manualStatus: "available",
    statusText: "",
    statusIcon: "",
  });
});

test("resuming the office clears old whiteboard presence without letting stale closes clear a new board", () => {
  const office = new Office(() => {});
  const user = { id: "a", name: "A", role: "member" };
  const join = (connection: string) =>
    office.add(
      user,
      "session",
      Date.now() + 3600000,
      () => {},
      () => {},
      connection,
      "same-client",
    );
  const member = join("old-connection");
  const scope = boardScope(office.workspace.mapId, member);
  office.setWhiteboard(user.id, "old-connection", scope);
  expect(office.people()[0].whiteboard).toBe(true);
  expect(office.activeUntil(member)).toBe(Infinity);

  expect(join("new-connection")).toBe(member);
  office.setWhiteboard(user.id, "old-connection");
  expect(office.people()[0].whiteboard).toBe(false);
  expect(office.activeUntil(member)).toBe(member.activity + 300000);

  office.setWhiteboard(user.id, "new-connection", scope);
  office.setWhiteboard(user.id, "old-connection");
  expect(office.people()[0].whiteboard).toBe(true);
  office.setWhiteboard(user.id, "new-connection");
  expect(office.people()[0].whiteboard).toBe(false);
});
