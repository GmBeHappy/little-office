import { describe, expect, test } from "bun:test";
import { Office } from "../server/office";
import { Command } from "../shared/protocol";
import { JUMP_DURATION } from "../shared/world";
import { walkable, WORLD, ZONES } from "../shared/world";
import { MAPS, getMap, mapBlocks, mapDesks } from "../shared/maps";
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
  test("all six maps have the advertised seats and reachable safe entrances", () => {
    expect(MAPS.filter((map) => map.size === "small")).toHaveLength(3);
    expect(MAPS.filter((map) => map.size === "large")).toHaveLength(3);
    for (const map of MAPS) {
      const blocks = mapBlocks(map);
      expect(mapDesks(map).length * 2).toBe(map.size === "small" ? 8 : 12);
      expect(walkable(WORLD.spawn.x, WORLD.spawn.y, blocks)).toBe(true);
      for (const zone of ZONES)
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
      for (const zone of ZONES)
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
      expect(person.room).toBe("");
      expect(person.zone).toBe("floor");
      expect(person.nearbyEnabled).toBe(false);
      expect(
        walkable(person.x, person.y, mapBlocks(getMap("space-large"))),
      ).toBe(true);
    }
    expect(events.b.at(-1).workspace.mapId).toBe("space-large");
    office.handle("a", { type: "nearby", enabled: true });
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
  test("nearby audio is opt-in and DND removes it", () => {
    const { office } = setup();
    expect(office.members.get("a")!.room).toBe("");
    office.handle("a", { type: "nearby", enabled: true });
    expect(office.members.get("a")!.room).not.toBe("");
    office.handle("a", { type: "status", status: "dnd", text: "" });
    expect(office.members.get("a")!.room).toBe("");
    expect(() =>
      office.handle("b", { type: "invite", target: "a", kind: "summon" }),
    ).toThrow("Do not disturb");
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
    expect(office.members.get("a")!.conversation).toBe("");
    office.handle("b", {
      type: "respond",
      id: [...office.invites.keys()][0],
      accept: true,
    });
    expect(office.members.get("a")!.conversation).toStartWith("call:");
    expect(office.members.get("a")!.room).toBe(office.members.get("b")!.room);
    office.handle("a", { type: "leave" });
    expect(office.members.get("b")!.conversation).toBe("");
  });
  test("duplicate office tabs cannot replace a live session", () => {
    const { office } = setup();
    expect(() =>
      office.add(
        { id: "a", name: "a", role: "member" },
        "other",
        Date.now() + 5000,
        () => {},
        () => {},
      ),
    ).toThrow("active office tab");
    expect(office.members.get("a")!.sessionId).toBe("a");
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
