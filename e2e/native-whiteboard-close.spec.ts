import { test, expect } from "@playwright/test";

const workspace = "00000000-0000-4000-8000-000000000001";
test("embedded whiteboard closes once, preserves the dirty guard, and can reopen", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.addEventListener("littleoffice-whiteboard-closed", () => {
      document.documentElement.dataset.boardCloseCount = String(
        Number(document.documentElement.dataset.boardCloseCount || 0) + 1,
      );
    });
  });
  await page.route(
    `**/api/workspaces/${workspace}/whiteboard/context`,
    (route) =>
      route.fulfill({
        json: {
          scope: "commons",
          name: "Test board",
          userId: "test-user",
          enabled: true,
          storageConfigured: false,
        },
      }),
  );
  await page.routeWebSocket(
    `**/api/workspaces/${workspace}/whiteboard`,
    (socket) => {
      socket.send(
        JSON.stringify({ type: "ready", scope: "commons", elements: [] }),
      );
      // Deliberately leave edits unacknowledged to exercise the existing dirty guard.
    },
  );
  await page.goto(`/w/${workspace}/whiteboard`);
  await expect(page.locator("[data-board-status]")).toHaveAttribute(
    "data-board-status",
    "Saved",
  );
  await page.getByRole("button", { name: "Back to map", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Whiteboard closed");
  await expect(page.locator("html")).toHaveAttribute(
    "data-board-close-count",
    "1",
  );
  await page.getByRole("button", { name: "Reopen whiteboard" }).click();
  await expect(page.locator("[data-board-status]")).toHaveAttribute(
    "data-board-status",
    "Saved",
  );
  await page.getByTestId("toolbar-rectangle").locator("..").click();
  const canvas = (await page
    .locator(".excalidraw__canvas.interactive")
    .boundingBox())!;
  await page.mouse.move(canvas.x + 250, canvas.y + 200);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 350, canvas.y + 270, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("[data-board-status]")).toHaveAttribute(
    "data-board-status",
    "Saving…",
  );
  await page.getByRole("button", { name: "Back to map", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Keep open", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-board-close-count",
    "1",
  );
  await page
    .getByRole("button", { name: "Close whiteboard", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Whiteboard closed");
  await expect(page.locator("html")).toHaveAttribute(
    "data-board-close-count",
    "2",
  );
});
