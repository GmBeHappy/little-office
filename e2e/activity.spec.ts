import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  accounts.length !== 2,
  "Run through scripts/e2e.ts with isolated accounts.",
);
test("owner views activity and changes roles while members lose admin access immediately", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [owner, member] = await Promise.all(contexts.map((c) => c.newPage()));
    for (const [i, page] of [owner, member].entries()) {
      await page.goto("/");
      await page
        .getByLabel("Username", { exact: true })
        .fill(accounts[i].username);
      await page
        .getByLabel("Password", { exact: true })
        .fill(accounts[i].password);
      await page
        .getByRole("button", { name: "Enter the office", exact: true })
        .click();
      await expect(page.locator(".pixel-map canvas")).toBeVisible();
    }
    const denied = await member.request.get("/api/admin/activity");
    expect(denied.status()).toBe(400);
    await owner
      .getByRole("button", { name: "Invite teammate", exact: true })
      .click();
    await owner.getByRole("tab", { name: "Activity", exact: true }).click();
    const log = owner.getByRole("region", { name: "Activity log" });
    await expect(
      log.getByText("Joined the office", { exact: true }).first(),
    ).toBeVisible();
    await expect(log.getByText("Jamie", { exact: true }).first()).toBeVisible();
    await owner.setViewportSize({ width: 390, height: 844 });
    await expect(log).toBeVisible();
    expect(
      await owner.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await owner.screenshot({ path: "/private/tmp/activity-mobile.png" });
    await owner.setViewportSize({ width: 1440, height: 960 });
    await owner.getByRole("tab", { name: "Members", exact: true }).click();
    const row = owner.locator(`[data-member-id="${accounts[1].id}"]`);
    await row.getByRole("button", { name: "Change role", exact: true }).click();
    const form = owner.getByRole("form", { name: "Change role", exact: true });
    await form.getByRole("combobox", { name: "Role", exact: true }).click();
    await owner.getByRole("option", { name: "owner", exact: true }).click();
    await form.getByRole("button", { name: "Save role", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(
      member.getByRole("button", { name: "Invite teammate", exact: true }),
    ).toBeVisible();
    await member
      .getByRole("button", { name: "Invite teammate", exact: true })
      .click();
    await member.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(
      member.getByRole("region", { name: "Activity log" }),
    ).toBeVisible();
    await row.getByRole("button", { name: "Change role", exact: true }).click();
    await form.getByRole("combobox", { name: "Role", exact: true }).click();
    await owner.getByRole("option", { name: "member", exact: true }).click();
    await form.getByRole("button", { name: "Save role", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(
      member.getByRole("tab", { name: "Activity", exact: true }),
    ).toHaveCount(0);
    await expect(
      member.getByRole("region", { name: "Activity log" }),
    ).toHaveCount(0);
    expect((await member.request.get("/api/admin/activity")).status()).toBe(
      400,
    );
    await owner.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(
      log.getByText("Changed a member's role", { exact: false }).first(),
    ).toBeVisible();
    await log.getByRole("combobox", { name: "Activity type" }).click();
    await owner
      .getByRole("option", { name: "Changed a member's role", exact: true })
      .click();
    await expect(log.locator("li").first()).toContainText(
      "Changed a member's role",
    );
    expect(await log.locator("li").count()).toBeGreaterThanOrEqual(2);
    await owner.screenshot({ path: "/private/tmp/activity-desktop.png" });
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
