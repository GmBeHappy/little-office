import { expect, test } from "bun:test";
import { Office } from "../server/office";
import { MAPS } from "../shared/maps";
import { walkable, zoneAt, WORLD } from "../shared/world";
function join(office: Office, id: string) {
  return office.add(
    { id, name: id, role: "member" },
    id,
    Date.now() + 60000,
    () => {},
    () => {},
  );
}
function checkPositions(office: Office) {
  const people = office.people();
  for (const [i, person] of people.entries()) {
    expect(walkable(person.x, person.y, office.blocks)).toBe(true);
    expect(zoneAt(person.x, person.y, office.zones)).toBe("floor");
    for (const other of people.slice(i + 1)) {
      expect(
        Math.hypot(person.x - other.x, person.y - other.y),
      ).toBeGreaterThanOrEqual(64);
    }
  }
}
test("consecutive logins use separate walkable positions on every map", () => {
  for (const map of MAPS) {
    const office = new Office();
    office.configureWorkspace({ name: map.name, mapId: map.id, revision: 1 });
    for (let i = 0; i < 32; i++) join(office, `user-${i}`);
    checkPositions(office);
  }
});
test("spawn avoids people who moved into the entrance and reuses vacated space", () => {
  const office = new Office();
  const a = join(office, "a");
  a.x = WORLD.spawn.x + 8;
  a.y = WORLD.spawn.y + 8;
  join(office, "b");
  checkPositions(office);
  office.remove("a");
  join(office, "c");
  checkPositions(office);
  expect(office.members.get("c")).toMatchObject(WORLD.spawn);
});
test("changing maps spreads everyone out without wrapping after sixteen people", () => {
  const office = new Office();
  for (let i = 0; i < 32; i++) join(office, `user-${i}`);
  office.configureWorkspace({ name: "Zen", mapId: "zen-small", revision: 1 });
  checkPositions(office);
});
