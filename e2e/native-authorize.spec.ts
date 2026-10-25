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

test("signed-in accounts without a display name return from login and can hand off to the app", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: { user: { name: "", mustChangePassword: false } },
    }),
  );
  await page.route("**/api/config", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/native/authorize", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      challenge: "c".repeat(43),
      state: "s".repeat(32),
    });
    return route.fulfill({ json: { url: "/native-handoff-complete" } });
  });
  await page.route("**/native-handoff-complete", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>App handoff reached</h1>",
    }),
  );
  await page.goto(path);
  // Simulate returning through the real login page with an existing session.
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("native-return")))
    .toBe(path);
  await page.goto("/login?workspace=gmtech");
  await page.waitForURL(`**${path}`);
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Continue to app", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "App handoff reached" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("native-return")),
  ).toBeNull();
});
