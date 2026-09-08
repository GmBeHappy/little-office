import type { Page, Locator } from "@playwright/test";
export async function selectValues(page: Page, select: Locator) {
  await select.click();
  const values = await page
    .getByRole("option")
    .evaluateAll((options) =>
      options.map((option) => option.getAttribute("data-value")!),
    );
  await page.keyboard.press("Escape");
  return values;
}
export async function selectValue(page: Page, select: Locator, value: string) {
  await select.click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
}
