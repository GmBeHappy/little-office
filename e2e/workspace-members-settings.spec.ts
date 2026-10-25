import { test, expect } from "@playwright/test";

const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  accounts.length !== 2,
  "Provision disposable accounts with scripts/e2e.ts.",
);

test("workspace settings load scoped people, retry errors, and keep feature controls aligned", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  const created = await page.request.post("/api/workspaces", {
    data: {
      name: "Settings regression",
      slug: `settings-${Date.now().toString(36)}`,
      mapId: "nature-small",
    },
  });
  expect(created.ok()).toBe(true);
  const workspace = await created.json();
  const detailPath = `**/api/workspaces/${workspace.id}`;
  const globalUsers: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/admin/users"))
      globalUsers.push(request.url());
  });
  await page.goto(`/w/${workspace.id}/office`);
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", {
    name: "Office settings",
    exact: true,
  });
  const nav = settings.locator(".settings-navigation");
  await expect(settings.getByLabel("Current workspace")).toContainText(
    "Settings regression",
  );
  await page.route(detailPath, (route) =>
    route.fulfill({ status: 503, json: { error: "Please try again." } }),
  );
  await nav.getByRole("tab", { name: "Members", exact: true }).click();
  await expect(settings.getByRole("alert")).toContainText("Please try again.");
  await page.unroute(detailPath);
  await settings
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await expect(settings.locator(".workspace-member-row")).toContainText(
    accounts[0].name,
  );
  await expect(
    settings.getByText("No pending invitations.", { exact: true }),
  ).toBeVisible();
  // The existing last-owner protection remains visible instead of navigating away.
  page.once("dialog", (dialog) => dialog.accept());
  await settings.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(settings.getByRole("alert")).toContainText(
    "Assign another owner before removing the last owner.",
  );
  await expect(settings).toBeVisible();
  await settings
    .getByLabel("Email address", { exact: true })
    .fill("invited@example.com");
  await settings
    .getByRole("button", { name: "Create invitation link", exact: true })
    .click();
  await expect(
    settings.getByLabel("Invitation link", { exact: true }),
  ).toHaveValue(/\/workspaces#invite=[a-f0-9]{64}$/);
  await expect(
    settings.getByRole("heading", { name: /Pending invitations/ }),
  ).toContainText("1");
  await settings
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await expect(
    settings.getByText("No pending invitations.", { exact: true }),
  ).toBeVisible();
  await nav.getByRole("tab", { name: "Workspace SSO", exact: true }).click();
  await expect(
    settings.getByLabel("Issuer URL", { exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText(
      "Save the connection first. Your exact callback URL and DNS TXT record will appear here.",
      { exact: true },
    ),
  ).toBeVisible();
  const oidcPath = `**/api/workspaces/${workspace.id}/oidc`;
  const savedConnection = {
    enabled: false,
    providerId: "ws-test",
    domain: "example.com",
    issuer: "https://identity.example.com",
    clientId: "test-client",
    hasClientSecret: true,
    verified: false,
    redirectURI: "https://app.example.com/api/auth/callback/ws-test",
    dnsName: "_little-office.example.com",
    dnsValue: "little-office-verification=test",
  };
  let savedBody: Record<string, unknown> | undefined;
  await page.route(oidcPath, async (route) => {
    if (route.request().method() === "PUT")
      savedBody = route.request().postDataJSON();
    await route.fulfill({
      json:
        route.request().method() === "GET"
          ? {
              connection: savedConnection,
              linked: false,
              canConfigure: true,
              canLink: true,
            }
          : { ok: true },
    });
  });
  await nav.getByRole("tab", { name: "Members", exact: true }).click();
  await nav.getByRole("tab", { name: "Workspace SSO", exact: true }).click();
  await expect(
    settings.getByLabel("Callback URL", { exact: true }),
  ).toHaveValue(savedConnection.redirectURI);
  await expect(
    settings.getByLabel("Client secret", { exact: true }),
  ).toHaveValue("");
  await settings
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect
    .poll(() => savedBody)
    .toMatchObject({
      issuer: savedConnection.issuer,
      clientId: savedConnection.clientId,
      domain: savedConnection.domain,
    });
  expect(savedBody).not.toHaveProperty("clientSecret");
  await nav.getByRole("tab", { name: "Workspace", exact: true }).click();
  await settings.getByRole("tab", { name: "Features", exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    const cards = settings.locator(
      ".workspace-feature-panel .workspace-feature-card",
    );
    await expect(cards).toHaveCount(3);
    const boxes = await cards.evaluateAll((items) =>
      items.map((item) => {
        const card = item.getBoundingClientRect();
        const toggle = item
          .querySelector('[role="switch"]')!
          .getBoundingClientRect();
        return { top: card.top, bottom: card.bottom, right: toggle.right };
      }),
    );
    expect(boxes[1].top - boxes[0].bottom).toBeGreaterThanOrEqual(12);
    expect(boxes[2].top - boxes[1].bottom).toBeGreaterThanOrEqual(12);
    expect(Math.abs(boxes[0].right - boxes[1].right)).toBeLessThan(1);
    expect(Math.abs(boxes[1].right - boxes[2].right)).toBeLessThan(1);
    expect(
      await settings.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  // A role refresh must leave a now-forbidden tab without rendering stale controls.
  await nav.getByRole("tab", { name: "Workspace SSO", exact: true }).click();
  await page.route(`**/api/workspaces/${workspace.id}/me`, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      json: { ...data, user: { ...data.user, role: "member" } },
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    nav.getByRole("tab", { name: "Devices", exact: true }),
  ).toHaveAttribute("data-state", "active");
  await expect(
    nav.getByRole("tab", { name: "Members", exact: true }),
  ).toHaveCount(0);
  await expect(
    settings.getByLabel("Client secret", { exact: true }),
  ).toHaveCount(0);
  await expect(
    settings.getByRole("heading", { name: "Audio", exact: true }),
  ).toBeVisible();
  expect(globalUsers).toEqual([]);
});
