import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  accounts.length !== 2,
  "Run through scripts/e2e.ts with isolated accounts.",
);
test("workspace tabs expose owner feature controls and external storage without credentials", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Maps", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .locator(".modal")
    .screenshot({ path: "/private/tmp/workspace-maps.png" });
  await page.getByRole("tab", { name: "Features", exact: true }).click();
  const toggle = page.getByRole("switch", {
    name: "Enable whiteboard",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // Verify an unsuccessful save leaves the feature enabled, without changing
  // the shared development workspace while someone may be drawing in it.
  await page.route("**/api/admin/features", (route) =>
    route.fulfill({
      status: 400,
      json: {
        error:
          "Workspace settings changed. Close and reopen settings before saving again.",
      },
    }),
  );
  await toggle.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Workspace settings changed" }),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page
    .locator(".modal")
    .screenshot({ path: "/private/tmp/workspace-features.png" });
  await page.getByRole("tab", { name: "File storage", exact: true }).click();
  await expect(page.locator(".storage-status")).toHaveText("Configured");
  await expect(page.locator(".storage-details")).toContainText("little-office");
  await expect(page.locator(".storage-details")).toContainText("s3.gmtech.dev");
  await page
    .getByRole("button", { name: "Test storage connection", exact: true })
    .click();
  await expect(page.locator(".storage-test-result")).toContainText(
    "Storage check passed",
  );
  await expect(
    page.locator('.workspace-settings input[type="password"]'),
  ).toHaveCount(0);
  await page
    .locator(".modal")
    .screenshot({ path: "/private/tmp/workspace-storage.png" });
  await page.setViewportSize({ width: 390, height: 740 });
  await expect(page.locator(".workspace-settings")).toBeInViewport();
  expect(
    await page
      .locator(".workspace-settings")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "/private/tmp/workspace-storage-mobile.png" });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย", exact: true })
    .click();
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.getByRole("tab", { name: "ฟีเจอร์", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "เปิดใช้งานไวท์บอร์ด", exact: true }),
  ).toBeVisible();
});
