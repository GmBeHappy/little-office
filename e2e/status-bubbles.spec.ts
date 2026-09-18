import { test, expect, type Page } from "@playwright/test";
import { selectValue } from "./select";

const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(accounts.length !== 2, "Run through scripts/e2e.ts.");

async function login(page: Page, index: number) {
  await page.goto("/");
  await page
    .getByLabel("Username", { exact: true })
    .fill(accounts[index].username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts[index].password);
  await page
    .getByRole("button", { name: "Enter the office", exact: true })
    .click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
}

test("status bubbles share presets, save custom messages and icons, and clear when available", async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [owner, observer] = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    const errors: string[] = [];
    owner.on("pageerror", (error) => errors.push(error.message));
    await login(owner, 0);
    await login(observer, 1);
    await owner
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    let profile = owner.getByRole("dialog", {
      name: "Your profile",
      exact: true,
    });
    await profile
      .getByRole("button", { name: "Deep work", exact: true })
      .click();
    await expect(profile.locator(".status-preview-bubble")).toContainText(
      "🎧Deep work",
    );
    await profile
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(profile).toHaveCount(0);
    const bubble = owner
      .locator(".avatar-status-bubble")
      .filter({ hasText: "Deep work" });
    await expect(bubble).toBeVisible();
    await expect(
      observer
        .locator(".avatar-status-bubble")
        .filter({ hasText: "Deep work" }),
    ).toBeVisible();
    await owner.reload();
    await expect(bubble).toBeVisible();
    await owner
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    profile = owner.getByRole("dialog", { name: "Your profile", exact: true });
    await expect(
      profile.getByLabel("A little status", { exact: true }),
    ).toHaveValue("Deep work");
    const custom =
      "Reviewing designs — back after lunch. Please leave a message for me.";
    await profile.getByLabel("A little status", { exact: true }).fill(custom);
    await selectValue(
      owner,
      profile.getByRole("combobox", { name: "Status icon", exact: true }),
      "🌙",
    );
    await owner.route("**/api/profile", (route) =>
      route.fulfill({
        status: 500,
        json: { error: "Unable to save your profile." },
      }),
    );
    await profile
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(profile.getByRole("alert")).toHaveText(
      "Unable to save your profile.",
    );
    await expect(
      profile.getByLabel("A little status", { exact: true }),
    ).toHaveValue(custom);
    await owner.unroute("**/api/profile");
    await owner.screenshot({ path: testInfo.outputPath("status-editor.png") });
    await profile
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    const customBubble = owner
      .locator(".avatar-status-bubble")
      .filter({ hasText: custom });
    await expect(customBubble).toContainText("🌙");
    // Approach the floating bubble as a user would; hover pauses its motion
    // before Playwright waits for a stable click target.
    const desktopBubble = await customBubble.boundingBox();
    await owner.mouse.move(
      desktopBubble!.x + desktopBubble!.width / 2,
      desktopBubble!.y + desktopBubble!.height / 2,
    );
    await customBubble.click();
    await expect(customBubble).toHaveAttribute("aria-expanded", "true");
    await owner.screenshot({
      path: testInfo.outputPath("status-bubble-desktop.png"),
    });
    await customBubble.press("Escape");
    await expect(customBubble).toHaveAttribute("aria-expanded", "false");
    await owner.setViewportSize({ width: 390, height: 844 });
    await expect(customBubble).toBeInViewport();
    const mobileBubble = await customBubble.boundingBox();
    await owner.mouse.move(
      mobileBubble!.x + mobileBubble!.width / 2,
      mobileBubble!.y + mobileBubble!.height / 2,
    );
    await customBubble.click();
    const box = await customBubble.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await owner.screenshot({
      path: testInfo.outputPath("status-bubble-mobile.png"),
    });
    await owner
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    await profile
      .getByRole("button", { name: "Back in 10 minutes", exact: true })
      .click();
    await profile
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      owner.locator(
        '.avatar-status-bubble[data-status="away"][aria-label^="Robin:"]',
      ),
    ).toContainText("⏳Back in 10 minutes");
    await owner
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    await selectValue(
      owner,
      profile.getByRole("combobox", { name: "Availability", exact: true }),
      "busy",
    );
    await selectValue(
      owner,
      profile.getByRole("combobox", { name: "Status icon", exact: true }),
      "",
    );
    await profile.getByLabel("A little status", { exact: true }).fill("");
    await profile
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      owner.locator(
        '.avatar-status-bubble[data-status="busy"][aria-label^="Robin:"]',
      ),
    ).toHaveText("💻Busy");
    await owner
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    await selectValue(
      owner,
      profile.getByRole("combobox", { name: "Availability", exact: true }),
      "available",
    );
    await profile
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      owner.locator('.avatar-status-bubble[aria-label^="Robin:"]:visible'),
    ).toHaveCount(0);
    await expect(
      observer.locator('.avatar-status-bubble[aria-label^="Robin:"]:visible'),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
