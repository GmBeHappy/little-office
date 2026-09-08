import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(accounts.length !== 2, "Run through scripts/e2e.ts.");
test("forms validate inline, translate errors, retain failed edits and save valid input", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.goto("/");
  await page.screenshot({ path: "/private/tmp/ui-login.png" });
  await page
    .getByRole("button", { name: "Enter the office", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter your username." }),
  ).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toBeFocused();
  expect(writes.filter((url) => url.includes("sign-in"))).toHaveLength(0);
  await page
    .getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "กรุณากรอกชื่อผู้ใช้" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Switch to English", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page
    .getByRole("button", { name: "Enter the office", exact: true })
    .click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  const profile = page.getByRole("dialog", {
    name: "Your profile",
    exact: true,
  });
  await profile.getByLabel("Your name", { exact: true }).fill("   ");
  await profile
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(profile.getByRole("alert")).toHaveText("Enter a name.");
  expect(writes.filter((url) => url.endsWith("/profile"))).toHaveLength(0);
  await profile.getByLabel("Your name", { exact: true }).fill("Robin Forms");
  await page.route("**/api/profile", (route) =>
    route.fulfill({
      status: 400,
      json: { error: "Unable to save your profile." },
    }),
  );
  await profile
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(profile.getByRole("alert")).toHaveText(
    "Unable to save your profile.",
  );
  await expect(profile.getByLabel("Your name", { exact: true })).toHaveValue(
    "Robin Forms",
  );
  await page.unroute("**/api/profile");
  await profile
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(profile).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Workspace name", { exact: true }).fill("   ");
  await page
    .getByRole("button", { name: "Save workspace", exact: true })
    .click();
  await expect(page.locator(".modal").getByRole("alert")).toHaveText(
    "Enter a workspace name.",
  );
  expect(writes.filter((url) => url.endsWith("/admin/workspace"))).toHaveLength(
    0,
  );
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  await page.getByText("Add a teammate", { exact: true }).click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Use 3–30 letters, numbers or underscores." }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Use at least 12 characters." }),
  ).toBeVisible();
  expect(writes.filter((url) => url.endsWith("/admin/users"))).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/private/tmp/ui-forms-mobile.png" });
  expect(
    await page
      .locator(".modal")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await expect(
    page.locator(".app-shell [data-slot='dialog-content']"),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Availability", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Do not disturb", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(page.locator(".whiteboard-view")).toHaveAttribute(
    "data-board-status",
    "Saved",
  );
  await expect(
    page.getByTestId("toolbar-rectangle").locator(".."),
  ).toBeVisible();
  await page.screenshot({ path: "/private/tmp/ui-whiteboard.png" });
  await page.getByRole("button", { name: "Back to map", exact: true }).click();
});
