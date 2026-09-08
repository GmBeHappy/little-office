import { describe, expect, test } from "bun:test";
import { Office } from "../server/office";
import { Command } from "../shared/protocol";
import { JUMP_DURATION } from "../shared/world";
import { walkable, WORLD, zoneAt, canNudge } from "../shared/world";
import { MAPS, getMap, mapBlocks, mapDesks, mapZones } from "../shared/maps";
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
  test("all maps have the advertised seats and reachable safe entrances", () => {
    expect(MAPS.filter((map) => map.size === "small")).toHaveLength(6);
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
      expect(mapDesks(map).length * 2).toBe(map.size === "small" ? 8 : 12);
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
  test("private-room departure changes its media generation and clears the presenter", () => {
    const { office, retired } = setup();
    for (const id of ["a", "b"])
      office.handle(id, { type: "zone", zone: "studio" });
    const old = office.members.get("a")!.room;
    office.handle("a", { type: "present", enabled: true });
    expect(() =>
      office.handle("b", { type: "present", enabled: true }),
    ).toThrow("already presenting");
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
