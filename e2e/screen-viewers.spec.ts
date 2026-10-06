import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(accounts.length !== 2, "Run through scripts/e2e.ts.");

test("sharing shows only large-view watchers and updates on screen switches, hidden tabs and leaving", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [sharer, viewer] = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    for (const [index, page] of [sharer, viewer].entries()) {
      await page.addInitScript(
        ({ id }) => {
          localStorage.setItem(`office-media-quality:${id}`, "balanced");
          navigator.mediaDevices.getDisplayMedia = async () => {
            const canvas = document.createElement("canvas");
            canvas.width = 1280;
            canvas.height = 720;
            const paint = canvas.getContext("2d")!;
            paint.fillStyle = "#e3ecdb";
            paint.fillRect(0, 0, 1280, 720);
            paint.fillStyle = "#304b38";
            paint.font = "bold 48px sans-serif";
            paint.fillText("Little Office · shared screen", 80, 150);
            const stream = canvas.captureStream(10);
            const timer = setInterval(() => {
              paint.fillStyle = "#e3ecdb";
              paint.fillRect(800, 30, 400, 70);
              paint.fillStyle = "#304b38";
              paint.fillText(String(Date.now()).slice(-5), 800, 80);
            }, 100);
            stream
              .getVideoTracks()[0]
              .addEventListener("ended", () => clearInterval(timer));
            return stream;
          };
        },
        { id: accounts[index].id },
      );
      await page.goto("/");
      await page
        .getByLabel("Username", { exact: true })
        .fill(accounts[index].username);
      await page
        .getByLabel("Password", { exact: true })
        .fill(accounts[index].password);
      await page.getByRole("button", { name: "Enter the office" }).click();
      await expect(page.locator(".pixel-map canvas")).toBeVisible();
      await page
        .getByRole("button", { name: "Join The Studio", exact: true })
        .click();
      await expect(page.locator(".map-topline")).toContainText("The Studio");
      await expect(page.locator(".controlbar")).toHaveAttribute(
        "data-media-connected",
        "true",
      );
    }
    await sharer
      .getByRole("button", { name: "Share screen", exact: true })
      .click();
    await expect(viewer.locator(".screen-tile video")).toBeVisible({
      timeout: 15000,
    });
    const viewersButton = sharer.getByRole("button", {
      name: "Viewers of Robin's screen",
      exact: true,
    });
    await expect(viewersButton).toContainText("0 watching");
    await viewer
      .getByRole("button", { name: "Expand shared screen", exact: true })
      .click();
    await expect(viewersButton).toContainText("1 watching");
    await viewersButton.click();
    const viewersDialog = sharer.getByRole("dialog", {
      name: "Who's watching",
      exact: true,
    });
    await expect(
      viewersDialog.getByRole("list", { name: "Screen viewers" }),
    ).toHaveText("Jamie");
    await sharer.keyboard.press("Escape");
    await viewer.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(viewersButton).toContainText("0 watching");
    await viewer.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(viewersButton).toContainText("1 watching");
    await viewer
      .getByRole("button", { name: "Share screen", exact: true })
      .click();
    await expect(viewer.locator(".media-share-rail .screen-tile")).toHaveCount(
      2,
    );
    await viewer
      .locator(".media-share-rail .screen-tile")
      .filter({ hasText: "Jamie" })
      .click();
    await expect(viewer.locator(".media-view-title h2")).toHaveText(
      "Jamie's screen",
    );
    await expect(viewersButton).toContainText("0 watching");
    await viewer
      .locator(".media-share-rail .screen-tile")
      .filter({ hasText: "Robin" })
      .click();
    await expect(viewersButton).toContainText("1 watching");
    await viewer
      .getByRole("button", { name: "Back to map", exact: true })
      .click();
    await expect(viewersButton).toContainText("0 watching");
    await viewer
      .locator(".video-strip .screen-tile")
      .filter({ hasText: "Robin" })
      .getByRole("button", { name: "Expand shared screen", exact: true })
      .click();
    await expect(viewersButton).toContainText("1 watching");
    await sharer.setViewportSize({ width: 390, height: 844 });
    await viewersButton.click();
    await expect(
      viewersDialog.getByText("Jamie", { exact: true }),
    ).toBeVisible();
    expect(
      await sharer.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await sharer.screenshot({ path: "/private/tmp/screen-viewers-mobile.png" });
    await sharer.keyboard.press("Escape");
    await sharer.setViewportSize({ width: 1440, height: 960 });
    await sharer
      .locator(".video-strip .screen-tile")
      .filter({ hasText: "Robin" })
      .getByRole("button", { name: "Expand shared screen", exact: true })
      .click();
    const expandedViewersButton = sharer
      .locator(".media-view-actions")
      .getByRole("button", { name: "Viewers of Robin's screen", exact: true });
    await expect(expandedViewersButton).toContainText("1 watching");
    await sharer
      .getByRole("button", { name: "Enter fullscreen", exact: true })
      .click();
    await expandedViewersButton.click();
    await expect(viewersDialog).toBeVisible();
    expect(
      await sharer.evaluate(
        () => !!document.fullscreenElement?.querySelector('[role="dialog"]'),
      ),
    ).toBe(true);
    await sharer.screenshot({
      path: "/private/tmp/screen-viewers-fullscreen.png",
    });
    await sharer.keyboard.press("Escape");
    await expect(expandedViewersButton).toBeVisible();
    await viewer.reload();
    // Leaving rotates the media room, so the other presentation also closes.
    await expect(sharer.locator(".app-shell")).not.toContainText("1 watching");
    await expect(sharer.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "true",
    );
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
