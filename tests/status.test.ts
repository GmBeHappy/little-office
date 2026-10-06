import { expect, test } from "bun:test";
import { Office } from "../server/office";
import { boardScope } from "../shared/whiteboard";
import { personStatus } from "../shared/status";

function setup() {
  const office = new Office();
  const member = office.add(
    {
      id: "a",
      name: "Robin",
      role: "member",
      availability: "busy",
      statusText: "Reviewing designs",
      statusIcon: "🎧",
    },
    "session",
    Date.now() + 3600000,
    () => {},
    () => {},
  );
  const person = () => office.people()[0];
  return { office, member, person };
}

test("screen activity begins after capture starts and restores the saved status after stopping", () => {
  const { office, member, person } = setup();
  office.handle("a", {
    type: "screen-share",
    room: member.room,
    enabled: true,
  });
  expect(person().sharing).toBe(false);
  office.handle("a", { type: "present", enabled: true });
  expect(personStatus(person()).text).toBe("Reviewing designs");
  office.handle("a", { type: "screen-share", room: "old-room", enabled: true });
  expect(person().sharing).toBe(false);
  office.handle("a", {
    type: "screen-share",
    room: member.room,
    enabled: true,
  });
  expect(personStatus(person())).toMatchObject({
    label: "Sharing screen",
    icon: "🖥️",
    text: "",
  });
  office.handle("a", {
    type: "screen-share",
    room: member.room,
    enabled: false,
  });
  expect(personStatus(person())).toMatchObject({
    status: "busy",
    text: "Reviewing designs",
    icon: "🎧",
  });
  office.handle("a", {
    type: "screen-share",
    room: member.room,
    enabled: true,
  });
  office.go(member, "studio");
  expect(person().sharing).toBe(false);
});

test("combined activities clear independently and preserve do not disturb and profile edits", () => {
  const { office, member, person } = setup();
  office.handle("a", {
    type: "status",
    status: "dnd",
    text: "Deep work",
    icon: "⛔",
  });
  office.setWhiteboard(
    "a",
    member.connectionId,
    boardScope(office.workspace.mapId, member),
  );
  expect(personStatus(person())).toMatchObject({
    status: "dnd",
    label: "Using whiteboard",
  });
  office.go(member, "studio");
  office.setWhiteboard(
    "a",
    member.connectionId,
    boardScope(office.workspace.mapId, member),
  );
  office.handle("a", { type: "present", enabled: true });
  office.handle("a", {
    type: "screen-share",
    room: member.room,
    enabled: true,
  });
  expect(personStatus(person()).label).toBe(
    "Sharing screen · Using whiteboard",
  );
  office.handle("a", {
    type: "screen-share",
    room: member.room,
    enabled: false,
  });
  expect(personStatus(person()).label).toBe("Using whiteboard");
  office.handle("a", {
    type: "status",
    status: "busy",
    text: "New status",
    icon: "💻",
  });
  office.setWhiteboard("a", member.connectionId);
  expect(personStatus(person())).toMatchObject({
    status: "busy",
    text: "New status",
    icon: "💻",
  });
});

test("whiteboard presence ends on location or feature changes and rejects old connection cleanup", () => {
  const { office, member, person } = setup();
  office.setWhiteboard(
    "a",
    member.connectionId,
    boardScope(office.workspace.mapId, member),
  );
  expect(person().whiteboard).toBe(true);
  office.setWhiteboard("a", "old-connection");
  expect(person().whiteboard).toBe(true);
  office.go(member, "studio");
  expect(person().whiteboard).toBe(false);
  office.setWhiteboard(
    "a",
    member.connectionId,
    boardScope(office.workspace.mapId, member),
  );
  office.configureWorkspace({
    ...office.workspace,
    revision: office.workspace.revision + 1,
    features: { ...office.workspace.features, whiteboard: false },
  });
  expect(person().whiteboard).toBe(false);
});

test("active whiteboarding or sharing does not automatically mark someone away", () => {
  for (const activity of ["whiteboard", "sharing"]) {
    const { office, member, person } = setup();
    office.handle("a", { type: "status", status: "available", text: "" });
    if (activity === "whiteboard")
      office.setWhiteboard(
        "a",
        member.connectionId,
        boardScope(office.workspace.mapId, member),
      );
    else {
      office.handle("a", { type: "present", enabled: true });
      office.handle("a", {
        type: "screen-share",
        room: member.room,
        enabled: true,
      });
    }
    const now = Date.now();
    member.activity = now - 300001;
    member.seen = now;
    office.tick(0, now);
    expect(person().status).toBe("available");
    expect(personStatus(person()).status).toBe("busy");
  }
});
