import { test, expect } from "@playwright/test";

const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(accounts.length !== 2, "Use scripts/e2e.ts for isolated accounts.");

test("device cards expand smoothly even with system Reduce Motion enabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  // The development badge overlaps the microphone at narrow widths.
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  const bar = page.locator(".controlbar");
  const samples = () =>
    bar.evaluate(async (el) => {
      const heights: number[] = [];
      const start = performance.now();
      while (performance.now() - start < 500) {
        heights.push(el.getBoundingClientRect().height);
        await new Promise(requestAnimationFrame);
      }
      return heights;
    });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.mouse.move(5, 5);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.waitForTimeout(500);
    expect(
      await page
        .locator(".device-bar-expand")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).not.toBe("0s");
    const collapsed = (await bar.boundingBox())!.height;
    const opening = samples();
    await page.getByRole("button", { name: "Microphone", exact: true }).hover();
    const openingHeights = await opening;
    const expanded = (await bar.boundingBox())!.height;
    expect(expanded).toBeGreaterThan(collapsed + 20);
    expect(
      openingHeights.some((h) => h > collapsed + 1 && h < expanded - 1),
    ).toBe(true);
    await expect(
      page.getByRole("group", { name: "Audio devices" }),
    ).toBeVisible();
    const closing = samples();
    await page.mouse.move(5, 5);
    const closingHeights = await closing;
    await expect(bar).not.toHaveAttribute("data-device-panel");
    expect(
      closingHeights.some((h) => h > collapsed + 1 && h < expanded - 1),
    ).toBe(true);
    expect((await bar.boundingBox())!.height).toBeCloseTo(collapsed, 0);
    await expect(
      page.getByRole("group", { name: "Audio devices" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Camera devices", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Camera devices" }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Camera", exact: true }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("group", { name: "Camera devices" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bar).not.toHaveAttribute("data-device-panel");
  }
});
