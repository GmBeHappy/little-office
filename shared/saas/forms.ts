import { z } from "zod";
import { MAPS } from "../maps";
export const workspaceForm = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(48)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and single hyphens.",
    ),
  mapId: z
    .enum(MAPS.map((map) => map.id))
    .refine(
      (id) => MAPS.some((m) => m.id === id && m.size === "small"),
      "Choose an available map.",
    ),
});
export const invitationForm = z.object({
  email: z.email().trim().toLowerCase().max(254),
  role: z.enum(["admin", "member"]),
});
export const roleForm = z.object({
  role: z.enum(["owner", "admin", "member"]),
});
export const tokenForm = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
