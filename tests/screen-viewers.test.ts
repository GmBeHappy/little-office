import { expect, test } from "bun:test";
import { Office } from "../server/office";
import { Command } from "../shared/protocol";

function setup() {
  const office = new Office();
  for (const id of ["a", "b", "c"]) {
    const member = office.add(
      { id, name: id, role: "member" },
      id,
      Date.now() + 3600000,
      () => {},
      () => {},
    );
    office.go(member, "studio");
  }
  const share = (id: string) => {
    office.handle(id, { type: "present", enabled: true });
    office.handle(id, {
      type: "screen-share",
      room: office.members.get(id)!.room,
      enabled: true,
    });
  };
  const view = (
    id: string,
    publisher: string | null,
    room = office.members.get(id)!.room,
  ) =>
    office.handle(id, Command.parse({ type: "screen-view", room, publisher }));
  const watching = (publisher: string) =>
    office
      .people()
      .filter((person) => person.watching === publisher)
      .map((person) => person.id);
  return { office, share, view, watching };
}

test("viewer presence tracks the selected sharer and removes closed views", () => {
  const { share, view, watching } = setup();
  share("a");
  share("c");
  view("b", "a");
  view("c", "a");
  expect(watching("a")).toEqual(["b", "c"]);
  view("b", "c");
  expect(watching("a")).toEqual(["c"]);
  expect(watching("c")).toEqual(["b"]);
  view("b", null);
  expect(watching("c")).toEqual([]);
});

test("viewer reports reject self, inactive sharers, outsiders and stale rooms", () => {
  const { office, share, view, watching } = setup();
  view("b", "a");
  expect(watching("a")).toEqual([]);
  share("a");
  view("a", "a");
  view("b", "missing");
  view("b", "a", "old-room");
  expect(watching("a")).toEqual([]);
  office.go(office.members.get("c")!, "library");
  share("a");
  view("c", "a");
  expect(watching("a")).toEqual([]);
  view("b", "a");
  view("b", null, "old-room");
  expect(watching("a")).toEqual(["b"]);
  expect(
    Command.safeParse({
      type: "screen-view",
      room: "r",
      publisher: "x".repeat(81),
    }).success,
  ).toBe(false);
});

test("stopping a share, leaving and moving rooms clear viewer presence", () => {
  const { office, share, view, watching } = setup();
  share("a");
  view("b", "a");
  office.handle("a", {
    type: "screen-share",
    room: office.members.get("a")!.room,
    enabled: false,
  });
  share("a");
  expect(watching("a")).toEqual([]);
  view("b", "a");
  office.remove("b");
  expect(watching("a")).toEqual([]);
  view("c", "a");
  office.go(office.members.get("c")!, "library");
  expect(watching("a")).toEqual([]);
});

test("nearby sharing does not expose viewers outside the sharing range", () => {
  const { office, share, view, watching } = setup();
  for (const member of office.members.values()) office.go(member, "floor");
  share("a");
  view("b", "a");
  expect(watching("a")).toEqual(["b"]);
  office.members.get("b")!.x = office.members.get("a")!.x + 1000;
  expect(watching("a")).toEqual([]);
});
