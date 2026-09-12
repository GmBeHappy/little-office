import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  !accounts.length,
  "Run through bun scripts/e2e.ts map-effects.spec.ts",
);

test("map effects follow reduced motion by default and allow a saved override", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1120, height: 720 });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[1].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[1].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  const canvas = page.locator(".pixel-map canvas");
  await expect(canvas).toBeVisible();
  const mapId = await page.locator(".pixel-map").getAttribute("data-map-id");
  async function settings() {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Display", exact: true }).click();
  }
  await settings();
  const toggle = page.getByRole("switch", { name: "Map effects", exact: true });
  await expect(toggle).not.toBeChecked();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(toggle).toBeChecked();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  // At the world's native aspect ratio this pond stays in a fixed screen position.
  // Crop water only, so another person's movement cannot masquerade as an effect.
  async function pondMoves() {
    const bounds = (await canvas.boundingBox())!;
    const scale = bounds.width / 1120;
    const clip = {
      x: bounds.x + 437 * scale,
      y: bounds.y + 410 * scale,
      width: 245 * scale,
      height: 31 * scale,
    };
    await page.waitForTimeout(200);
    const first = await page.screenshot({ clip });
    await page.waitForTimeout(700);
    return !first.equals(await page.screenshot({ clip }));
  }
  if (mapId === "zen-small") expect(await pondMoves()).toBe(true);
  await page.reload();
  await expect(canvas).toBeVisible();
  await settings();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(toggle).not.toBeChecked();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  if (mapId === "zen-small") expect(await pondMoves()).toBe(false);
});
