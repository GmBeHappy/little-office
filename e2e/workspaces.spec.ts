import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]") as {
  username: string;
  password: string;
  name: string;
}[];
test.skip(accounts.length !== 2, "Provision isolated E2E accounts first.");
test("landing, existing login, workspace creation, scoped office and switching", async ({
  page,
}) => {
  test.setTimeout(90000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Create your office" }).first(),
  ).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  const suffix = Date.now().toString(36);
  for (const name of ["Alpha", "Beta"]) {
    await page.getByLabel("Name", { exact: true }).fill(`${name} ${suffix}`);
    await page
      .getByLabel("Workspace address")
      .fill(`${name.toLowerCase()}-${suffix}`);
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: `${name} ${suffix}`, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  await page
    .getByRole("button", { name: new RegExp(`Alpha ${suffix}`) })
    .click();
  await page.getByRole("link", { name: "Enter office →" }).click();
  await expect(page.locator(".immersive-office")).toBeVisible();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  await expect(page).toHaveURL(/\/w\/[a-f0-9-]+\/office$/);
  const alpha = page.url().split("/")[4];
  const configs: string[] = [];
  page.on("request", (request) => {
    if (/\/config$/.test(request.url())) configs.push(request.url());
  });
  await page.getByRole("link", { name: "Switch workspace" }).first().click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await page
    .getByRole("button", { name: new RegExp(`Beta ${suffix}`) })
    .click();
  await page.getByRole("link", { name: "Enter office →" }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  const beta = page.url().split("/")[4];
  expect(beta).not.toBe(alpha);
  expect(
    configs.some((url) => url.includes(`/workspaces/${beta}/config`)),
  ).toBe(true);
  expect(
    configs.some((url) => url.includes(`/workspaces/${alpha}/config`)),
  ).toBe(false);
  await page.screenshot({ path: "test-results/workspace-office.png" });
  expect(failures).toEqual([]);
});
