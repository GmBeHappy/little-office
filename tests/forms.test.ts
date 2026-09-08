import { expect, test } from "bun:test";
import {
  loginSchema,
  passwordChangeSchema,
  profileSchema,
  createMemberSchema,
  resetPasswordSchema,
  workspaceSchema,
} from "../shared/forms";
import { translate } from "../lib/i18n/messages";
test("form schemas reject invalid data and keep credentials intact", () => {
  expect(loginSchema.safeParse({ username: " ", password: "" }).success).toBe(
    false,
  );
  expect(
    loginSchema.parse({ username: " robin ", password: " pass with spaces " }),
  ).toEqual({ username: "robin", password: " pass with spaces " });
  const password = "Valid password 123";
  expect(
    passwordChangeSchema.safeParse({
      currentPassword: "old",
      newPassword: password,
      confirmPassword: "different",
    }).success,
  ).toBe(false);
  expect(
    passwordChangeSchema.safeParse({
      currentPassword: "old",
      newPassword: password,
      confirmPassword: password,
    }).success,
  ).toBe(true);
  for (const bad of ["short", "a".repeat(129)])
    expect(resetPasswordSchema.safeParse({ password: bad }).success).toBe(
      false,
    );
  expect(
    createMemberSchema.safeParse({ name: " ", username: "bad name", password })
      .success,
  ).toBe(false);
  expect(
    createMemberSchema.parse({
      name: " Robin ",
      username: "robin_123",
      password,
    }).name,
  ).toBe("Robin");
  expect(
    profileSchema.safeParse({
      name: "Robin",
      avatar: "invalid",
      status: "available",
      statusText: "",
    }).success,
  ).toBe(false);
  expect(
    profileSchema.safeParse({
      name: "Robin",
      avatar: "sage",
      status: "available",
      statusText: "a".repeat(81),
    }).success,
  ).toBe(false);
  expect(
    workspaceSchema.safeParse({ name: " ", mapId: "invalid" }).success,
  ).toBe(false);
  expect(
    workspaceSchema.parse({ name: " Our office ", mapId: "nature-small" }).name,
  ).toBe("Our office");
  for (const schema of [
    loginSchema,
    passwordChangeSchema,
    createMemberSchema,
    resetPasswordSchema,
    workspaceSchema,
  ]) {
    const invalid = schema.safeParse({
      username: "",
      password: "",
      name: "",
      mapId: "invalid",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "wrong",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      for (const issue of invalid.error.issues)
        expect(translate("th", issue.message)).not.toBe(issue.message);
  }
});
