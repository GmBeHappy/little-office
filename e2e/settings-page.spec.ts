import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(accounts.length !== 2, "Run through scripts/e2e.ts.");

test("full-page settings keep navigation visible, work on mobile and show only permitted sections", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [owner, member] = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    for (const [index, page] of [owner, member].entries()) {
      await page.goto("/");
      await page
        .getByLabel("Username", { exact: true })
        .fill(accounts[index].username);
      await page
        .getByLabel("Password", { exact: true })
        .fill(accounts[index].password);
      await page.getByRole("button", { name: "Enter the office" }).click();
      await expect(page.locator(".pixel-map canvas")).toBeVisible();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const settings = page.getByRole("dialog", {
        name: "Office settings",
        exact: true,
      });
      await expect(settings).toBeVisible();
      const bounds = (await settings.boundingBox())!;
      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(page.viewportSize()!.width);
      expect(bounds.height).toBe(page.viewportSize()!.height);
    }
    const settings = owner.getByRole("dialog", {
      name: "Office settings",
      exact: true,
    });
    const nav = settings.locator(".settings-navigation");
    await expect(nav.getByRole("tab")).toHaveCount(7);
    await nav.getByRole("tab", { name: "Devices", exact: true }).click();
    await expect(
      settings.getByRole("heading", { name: "Audio", exact: true }),
    ).toBeVisible();
    await expect(
      settings.getByRole("heading", { name: "Camera & sharing", exact: true }),
    ).toBeVisible();
    await owner.screenshot({ path: "/private/tmp/settings-page-desktop.png" });
    await nav.getByRole("tab", { name: "Profile", exact: true }).click();
    await expect(
      settings.getByRole("textbox", { name: "Your name", exact: true }),
    ).toHaveValue("Robin");
    await settings
      .getByLabel("Your name", { exact: true })
      .fill("Robin Settings");
    await settings
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(settings.locator(".settings-account strong")).toHaveText(
      "Robin Settings",
    );
    await expect(settings).toBeVisible();
    await expect(owner.locator(".toast")).toHaveCount(0, { timeout: 8000 });
    await settings
      .locator(".profile-tabs")
      .getByRole("tab", { name: "Appearance", exact: true })
      .click();
    await expect(
      settings.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeVisible();
    await nav.getByRole("tab", { name: "Display", exact: true }).click();
    await expect(
      settings.getByRole("slider", { name: /Name tag size/ }),
    ).toBeVisible();
    await owner.setViewportSize({ width: 390, height: 844 });
    await nav.getByRole("tab", { name: "Devices", exact: true }).click();
    await expect(nav).toHaveAttribute("aria-orientation", "horizontal");
    await expect(
      settings.getByRole("heading", { name: "Audio", exact: true }),
    ).toBeVisible();
    const main = settings.locator(".settings-main");
    await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(
      settings.getByRole("button", { name: "Close dialog", exact: true }),
    ).toBeInViewport();
    expect(
      await settings.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await nav.getByRole("tab", { name: "Display", exact: true }).click();
    expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
    await nav.getByRole("tab", { name: "Devices", exact: true }).click();
    await owner.screenshot({ path: "/private/tmp/settings-page-mobile.png" });
    await settings
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(settings).toHaveCount(0);
    await expect(owner.locator(".pixel-map canvas")).toBeVisible();
    const memberSettings = member.getByRole("dialog", {
      name: "Office settings",
      exact: true,
    });
    await expect(
      memberSettings.locator(".settings-navigation").getByRole("tab"),
    ).toHaveCount(3);
    await expect(
      memberSettings.getByRole("tab", { name: "Members", exact: true }),
    ).toHaveCount(0);
    await member.keyboard.press("Escape");
    await expect(memberSettings).toHaveCount(0);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
