import { z } from "zod";
import { isAvatar } from "./appearance";
import { MAPS } from "./maps";
const name = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(40, "Use 40 characters or fewer.");
const username = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{3,30}$/, "Use 3–30 letters, numbers or underscores.");
const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use 128 characters or fewer.");
export const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password."),
});
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your temporary password."),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
export const profileSchema = z.object({
  name,
  avatar: z.string().refine(isAvatar, "Choose a valid character."),
  status: z.enum(["available", "busy", "dnd", "away"]),
  statusText: z.string().max(80, "Use 80 characters or fewer."),
});
export const createMemberSchema = z.object({ name, username, password });
export const resetPasswordSchema = z.object({ password });
export const workspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a workspace name.")
    .max(60, "Use 60 characters or fewer."),
  mapId: z
    .string()
    .refine((id) => MAPS.some((map) => map.id === id), "Choose a valid map."),
});
