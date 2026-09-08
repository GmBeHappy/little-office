import { expect, test } from "bun:test";
import { BoardMessage, mergeBoard } from "../shared/whiteboard";
import { rectangle } from "./whiteboard-fixture";
test("whiteboard merges concurrent shapes, resolves same-shape conflicts deterministically and preserves deletions", () => {
  const first = rectangle("first"),
    second = { ...rectangle("second"), index: "a1" };
  expect(mergeBoard([first], [second])).toEqual(mergeBoard([second], [first]));
  const edit = { ...first, version: 2, x: 200, versionNonce: 99 };
  const conflict = { ...edit, x: 300, versionNonce: 2 };
  expect(mergeBoard([edit], [conflict])).toEqual([conflict]);
  expect(mergeBoard([conflict], [edit])).toEqual([conflict]);
  const deletion = { ...edit, isDeleted: true, version: 3 };
  expect(mergeBoard([deletion], [first, edit, conflict])).toEqual([deletion]);
  expect(
    mergeBoard([deletion], [{ ...deletion, isDeleted: false, version: 4 }])[0]
      .isDeleted,
  ).toBe(false);
});
test("whiteboard messages reject invalid coordinates, embeds and oversized drawings", () => {
  const message = {
    type: "change",
    batch: "batch",
    elements: [rectangle("first")],
  };
  expect(BoardMessage.safeParse(message).success).toBe(true);
  for (const change of [
    { x: NaN },
    { x: Infinity },
    { type: "iframe" },
    { type: "image" },
    { version: -1 },
    { text: "x".repeat(20001) },
    { points: Array(10001).fill([0, 0]) },
  ])
    expect(
      BoardMessage.safeParse({
        ...message,
        elements: [{ ...message.elements[0], ...change }],
      }).success,
    ).toBe(false);
  expect(
    BoardMessage.safeParse({
      type: "pointer",
      x: Infinity,
      y: 0,
      button: "down",
    }).success,
  ).toBe(false);
});
