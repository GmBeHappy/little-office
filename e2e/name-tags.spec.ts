import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(accounts.length !== 2, "Run through scripts/e2e.ts.");
test("name tag display preferences update and survive reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page
    .getByRole("button", { name: "Enter the office", exact: true })
    .click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  const openDisplay = async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Display", exact: true }).click();
  };
  await openDisplay();
  const size = page.getByRole("slider", { name: /Name tag size/ });
  const opacity = page.getByRole("slider", { name: /Background opacity/ });
  await expect(size).toHaveValue("10");
  await size.fill("8");
  await opacity.fill("0");
  const preview = page.locator(".name-tag-preview > span");
  await expect(preview).toHaveCSS("font-size", "8px");
  await expect(preview).toHaveCSS("background-color", "rgba(250, 247, 233, 0)");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  await page.reload();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  await openDisplay();
  await expect(size).toHaveValue("8");
  await expect(opacity).toHaveValue("0");
  await page.setViewportSize({ width: 390, height: 844 });
  await size.fill("16");
  await opacity.fill("100");
  await expect(preview).toHaveCSS("font-size", "16px");
  await expect(preview).toHaveCSS("background-color", "rgb(250, 247, 233)");
  await page.screenshot({ path: "test-results/name-tags-mobile.png" });
  expect(errors).toEqual([]);
});
