import { test, expect, type Page } from "@playwright/test";
import type { Snapshot } from "../shared/world";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  accounts.length !== 2,
  "Run through scripts/e2e.ts with isolated accounts.",
);
async function login(page: Page, index: number) {
  await page.goto("/");
  await page
    .getByLabel("Username", { exact: true })
    .fill(accounts[index].username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts[index].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
}
test("custom avatars save, sync to teammates, survive reconnect, and fit mobile", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const observer = await browser.newContext();
  const page = await context.newPage();
  const other = await observer.newPage();
  let snapshot: Snapshot | undefined;
  const errors: string[] = [];
  for (const p of [page, other])
    p.on("pageerror", (e) => errors.push(e.message));
  other.on("websocket", (socket) => {
    if (!socket.url().includes("/api/office")) return;
    socket.on("framereceived", ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === "snapshot") snapshot = message;
    });
  });
  await login(page, 0);
  await login(other, 1);
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  const editor = page.locator(".avatar-editor");
  await expect(editor.locator(".skin-tone-options button")).toHaveCount(5);
  for (const group of ["Hair", "Hat", "Clothes"] as const) {
    const carousel = editor.getByRole("group", { name: group, exact: true });
    await expect(carousel).toHaveAttribute("data-option-count", "15");
    await expect(carousel.locator(".avatar-carousel-choice")).toHaveCount(3);
  }
  await editor.getByRole("button", { name: "Next Hair", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Ponytail", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const beforeRandom = await editor
    .locator(".avatar-preview-stage svg")
    .getAttribute("data-avatar");
  await editor.getByRole("button", { name: "Randomize", exact: true }).click();
  await expect(editor.locator(".avatar-preview-stage svg")).toHaveAttribute(
    "data-avatar",
    /^custom:[0-4]:(?:[0-9]|1[0-4]):(?:[0-9]|1[0-4]):(?:[0-9]|1[0-4])$/,
  );
  expect(
    await editor
      .locator(".avatar-preview-stage svg")
      .getAttribute("data-avatar"),
  ).not.toBe(beforeRandom);
  await editor
    .getByRole("button", { name: "Deep skin tone", exact: true })
    .click();
  for (const group of ["Hair", "Hat", "Clothes"] as const) {
    const carousel = editor.getByRole("group", { name: group, exact: true });
    for (let i = 0; i < 15; i++) {
      if ((await carousel.getAttribute("data-selected")) === "14") break;
      await editor
        .getByRole("button", { name: `Next ${group}`, exact: true })
        .click();
    }
    await expect(carousel).toHaveAttribute("data-selected", "14");
  }
  const id = "custom:4:14:14:14";
  await expect(editor.locator(".avatar-preview-stage svg")).toHaveAttribute(
    "data-avatar",
    id,
  );
  await page
    .locator(".modal")
    .screenshot({ path: "/private/tmp/avatar-editor-desktop.png" });
  const front = await editor.locator(".avatar-preview-stage").innerHTML();
  await editor.getByRole("button", { name: "Rotate preview" }).click();
  expect(await editor.locator(".avatar-preview-stage").innerHTML()).not.toBe(
    front,
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".header-avatar svg")).toHaveAttribute(
    "data-avatar",
    id,
  );
  await expect
    .poll(
      () => snapshot?.people.find((p) => p.name === accounts[0].name)?.avatar,
    )
    .toBe(id);
  await expect(
    other
      .locator(".person")
      .filter({ hasText: accounts[0].name })
      .locator("svg.pixel-avatar"),
  ).toHaveAttribute("data-avatar", id);
  await page.reload();
  await expect(page.locator(".header-avatar svg")).toHaveAttribute(
    "data-avatar",
    id,
  );
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await editor.getByRole("button", { name: "No hat", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".header-avatar svg")).toHaveAttribute(
    "data-avatar",
    id,
  );
  const badge = page.getByRole("button", { name: "Collapse issues badge" });
  if (await badge.isVisible()) await badge.click();
  await page.setViewportSize({ width: 390, height: 700 });
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await expect(editor.locator(".avatar-preview-stage svg")).toHaveAttribute(
    "data-avatar",
    id,
  );
  expect(await editor.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await editor
    .getByRole("button", { name: "Rainbow tee", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    editor.getByRole("button", { name: "Rainbow tee", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "/private/tmp/avatar-editor-mobile.png" });
  expect(errors).toEqual([]);
  await context.close();
  await observer.close();
});
