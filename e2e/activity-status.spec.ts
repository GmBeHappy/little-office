import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(accounts.length !== 2, "Run through scripts/e2e.ts.");

test("whiteboard activity reaches other users and restores saved status after closing or reconnecting", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [owner, observer] = await Promise.all(
      contexts.map((c) => c.newPage()),
    );
    for (const [index, page] of [owner, observer].entries()) {
      await page.goto("/");
      await page
        .getByLabel("Username", { exact: true })
        .fill(accounts[index].username);
      await page
        .getByLabel("Password", { exact: true })
        .fill(accounts[index].password);
      await page.getByRole("button", { name: "Enter the office" }).click();
      await expect(page.locator(".pixel-map canvas")).toBeVisible();
    }
    const bubble = observer
      .locator(".avatar-status-bubble")
      .filter({ hasText: "Using whiteboard" });
    await owner
      .getByRole("button", { name: "Whiteboard", exact: true })
      .click();
    await expect(owner.locator(".whiteboard-view")).toHaveAttribute(
      "data-board-status",
      "Saved",
    );
    await expect(bubble).toBeVisible();
    await expect(owner.locator(".self-control")).toContainText(
      "Using whiteboard",
    );
    const peopleButton = observer.getByRole("button", {
      name: "People",
      exact: true,
    });
    if ((await peopleButton.getAttribute("aria-expanded")) !== "true")
      await peopleButton.click();
    await expect(
      observer.locator(".person").filter({ hasText: "Robin" }),
    ).toContainText("Using whiteboard");
    await owner
      .getByRole("button", { name: "Back to map", exact: true })
      .click();
    await expect(bubble).toHaveCount(0);
    await expect(owner.locator(".self-control")).toContainText("Available");
    await owner
      .getByRole("button", { name: "Your profile", exact: true })
      .click();
    await owner.getByRole("tab", { name: "Status", exact: true }).click();
    const profile = owner.getByRole("dialog", {
      name: "Your profile",
      exact: true,
    });
    await profile
      .getByRole("button", { name: "Deep work", exact: true })
      .click();
    await profile
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(profile).toHaveCount(0);
    await owner
      .getByRole("button", { name: "Whiteboard", exact: true })
      .click();
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveAttribute("data-status", "dnd");
    await owner
      .getByRole("button", { name: "Back to map", exact: true })
      .click();
    await expect(
      observer
        .locator(".avatar-status-bubble")
        .filter({ hasText: "Deep work" }),
    ).toBeVisible();
    await owner
      .getByRole("button", { name: "Whiteboard", exact: true })
      .click();
    await expect(bubble).toBeVisible();
    await owner.reload();
    await expect(owner.locator(".pixel-map canvas")).toBeVisible();
    await expect(bubble).toHaveCount(0);
    await expect(
      observer
        .locator(".avatar-status-bubble")
        .filter({ hasText: "Deep work" }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
