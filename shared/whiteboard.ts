import { z } from "zod";
import type { Person } from "./world";
export function whiteboardEnabled(workspace: {
  features?: { whiteboard: boolean };
}) {
  return workspace.features?.whiteboard ?? true;
}
export const BOARD_MAX_ELEMENTS = 1500;
export const BOARD_MAX_BYTES = 2_000_000;
export const BOARD_MESSAGE_BYTES = 256_000;
const number = z.number().min(-1_000_000).max(1_000_000);
const id = z.string().min(1).max(100);
const point = z.tuple([number, number]);
const binding = z
  .object({
    elementId: id,
    focus: number,
    gap: number,
    fixedPoint: point.nullable().optional(),
  })
  .nullable();
// Only drawing data crosses the socket: no files, embeds, HTML, or app state.
export const BoardElement = z.object({
  id,
  type: z.enum([
    "rectangle",
    "diamond",
    "ellipse",
    "line",
    "arrow",
    "freedraw",
    "text",
    "frame",
  ]),
  version: z.number().int().min(1).max(2_147_483_647),
  versionNonce: z.number().int().min(0).max(2_147_483_647),
  isDeleted: z.boolean(),
  x: number,
  y: number,
  width: number.nonnegative(),
  height: number.nonnegative(),
  angle: number,
  seed: z.number().int(),
  index: z.string().max(100).nullable(),
  strokeColor: z.string().max(100),
  backgroundColor: z.string().max(100),
  fillStyle: z.enum(["hachure", "cross-hatch", "solid", "zigzag"]),
  strokeWidth: z.number().min(0).max(100),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]),
  roundness: z
    .object({ type: z.number().int().min(1).max(3), value: number.optional() })
    .nullable(),
  roughness: z.number().min(0).max(10),
  opacity: z.number().min(0).max(100),
  groupIds: z.array(id).max(100),
  frameId: id.nullable(),
  boundElements: z
    .array(z.object({ id, type: z.enum(["arrow", "text"]) }))
    .max(1000)
    .nullable(),
  updated: z.number().nonnegative(),
  locked: z.boolean(),
  link: z
    .string()
    .max(2000)
    .nullable()
    .transform(() => null),
  text: z.string().max(20000).optional(),
  originalText: z.string().max(20000).optional(),
  fontSize: z.number().min(1).max(1000).optional(),
  fontFamily: z.number().int().min(1).max(8).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  containerId: id.nullable().optional(),
  autoResize: z.boolean().optional(),
  lineHeight: z.number().min(0.1).max(10).optional(),
  points: z.array(point).max(10000).optional(),
  pressures: z.array(z.number().min(0).max(1)).max(10000).optional(),
  simulatePressure: z.boolean().optional(),
  startBinding: binding.optional(),
  endBinding: binding.optional(),
  startArrowhead: z.string().max(30).nullable().optional(),
  endArrowhead: z.string().max(30).nullable().optional(),
  elbowed: z.boolean().optional(),
  fixedSegments: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        start: point,
        end: point,
      }),
    )
    .max(1000)
    .nullable()
    .optional(),
  startIsSpecial: z.boolean().optional(),
  endIsSpecial: z.boolean().optional(),
  name: z.string().max(200).nullable().optional(),
});
export type BoardElement = z.infer<typeof BoardElement>;
export const BoardMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("change"),
    batch: id,
    elements: z.array(BoardElement).min(1).max(BOARD_MAX_ELEMENTS),
  }),
  z.object({
    type: z.literal("pointer"),
    x: number,
    y: number,
    button: z.enum(["up", "down"]),
  }),
  z.object({ type: z.literal("ping") }),
]);
export function boardScope(mapId: string, person: Pick<Person, "zone">) {
  return `${mapId}:${person.zone}`;
}
export function elementStamp(
  element: Pick<BoardElement, "version" | "versionNonce">,
) {
  return `${element.version}:${element.versionNonce}`;
}
// Match Excalidraw's deterministic conflict rule; retain deletion tombstones so
// a delayed client cannot resurrect deleted shapes. Different IDs always merge.
export function mergeBoard(
  current: readonly BoardElement[],
  incoming: readonly BoardElement[],
) {
  const merged = new Map(current.map((element) => [element.id, element]));
  for (const next of incoming) {
    const previous = merged.get(next.id);
    if (
      !previous ||
      next.version > previous.version ||
      (next.version === previous.version &&
        next.versionNonce < previous.versionNonce)
    )
      merged.set(next.id, next);
  }
  return [...merged.values()].sort((a, b) =>
    (a.index || "") < (b.index || "")
      ? -1
      : (a.index || "") > (b.index || "")
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
  );
}
