import { z } from "zod";
export const Command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("jump") }),
  z.object({
    type: z.literal("move"),
    dx: z.number().int().min(-1).max(1),
    dy: z.number().int().min(-1).max(1),
    seq: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("status"),
    status: z.enum(["available", "busy", "dnd", "away"]),
    text: z.string().max(80),
  }),
  z.object({ type: z.literal("wave"), target: z.string().max(80) }),
  z.object({
    type: z.literal("invite"),
    target: z.string().max(80),
    kind: z.enum(["summon", "call"]),
  }),
  z.object({
    type: z.literal("respond"),
    id: z.string().max(80),
    accept: z.boolean(),
  }),
  z.object({
    type: z.literal("zone"),
    zone: z.enum(["floor", "studio", "library"]),
  }),
  z.object({
    type: z.literal("nudge"),
    target: z.string().min(1).max(80).optional(),
  }),
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("present"), enabled: z.boolean() }),
  z.object({
    type: z.literal("lock"),
    zone: z.enum(["studio", "library"]),
    locked: z.boolean(),
  }),
  z.object({ type: z.literal("ping") }),
]);
export type Command = z.infer<typeof Command>;
