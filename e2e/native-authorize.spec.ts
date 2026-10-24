import { test, expect } from "@playwright/test";

const path = `/native/authorize?challenge=${"c".repeat(43)}&state=${"s".repeat(32)}&workspace=gmtech`;

test("native authorization routes temporary-password sessions through sign-in before granting access", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: { user: { name: "Test member", mustChangePassword: true } },
    }),
  );
  await page.goto(path);
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", "/login?workspace=gmtech");
  await expect(
    page.getByRole("button", { name: "Continue to app", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("native-return")))
    .toBe(path);
});

test("native authorization offers app handoff for an eligible signed-in session", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: { user: { name: "Test member", mustChangePassword: false } },
    }),
  );
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Continue to app", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
});
