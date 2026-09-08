import { test, expect, type Page } from "@playwright/test";
import type { BoardElement } from "../shared/whiteboard";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  accounts.length !== 2 || process.env.E2E_DISPOSABLE_WORKSPACE !== "1",
  "Run with E2E_DISPOSABLE_WORKSPACE=1 and a disposable workspace database.",
);
test("two people draw continuous strokes simultaneously without crashing or losing strokes", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const errors: string[] = [];
  const scenes = new Map<Page, BoardElement[]>();
  try {
    for (const [i, page] of pages.entries()) {
      page.on("pageerror", (error) =>
        errors.push(error.stack || error.message),
      );
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          /Maximum update|Cannot read|Uncaught|React error|ErrorBoundary/i.test(
            message.text(),
          )
        )
          errors.push(message.text());
      });
      page.on("crash", () => errors.push(`Browser page ${i} crashed`));
      await page.routeWebSocket("**/api/whiteboard", (route) => {
        const server = route.connectToServer();
        const timers = new Set<ReturnType<typeof setTimeout>>();
        const delay = (action: () => void) => {
          const timer = setTimeout(() => {
            timers.delete(timer);
            action();
          }, 10);
          timers.add(timer);
        };
        route.onMessage((message) => delay(() => server.send(message)));
        server.onMessage((payload) =>
          delay(() => {
            const message = JSON.parse(String(payload));
            if (message.elements) scenes.set(page, message.elements);
            if (message.type === "error") errors.push(message.message);
            route.send(payload);
          }),
        );
        route.onClose((code, reason) => {
          timers.forEach(clearTimeout);
          void server.close({ code, reason });
        });
        server.onClose((code, reason) => {
          timers.forEach(clearTimeout);
          void route.close({ code, reason });
        });
      });
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
      await page
        .getByRole("button", { name: "Whiteboard", exact: true })
        .click();
      await expect(page.locator(".whiteboard-view")).toHaveAttribute(
        "data-board-status",
        "Saved",
      );
      await page.getByTestId("toolbar-freedraw").locator("..").click();
    }
    for (const page of pages)
      await expect(page.locator(".whiteboard-presence")).toHaveText("2");
    const prior = new Set(
      (scenes.get(pages[0]) || []).map((element) => element.id),
    );
    const bounds = await Promise.all(
      pages.map((page) =>
        page.locator(".excalidraw__canvas.interactive").boundingBox(),
      ),
    );
    for (let round = 0; round < 2; round++) {
      await Promise.all(
        pages.map(async (page, i) => {
          await page.getByTestId("toolbar-freedraw").locator("..").click();
          await page.waitForTimeout(i * 18);
          await page.mouse.move(
            bounds[i]!.x + 300,
            bounds[i]!.y + 300 + i * 150,
          );
          await page.mouse.down();
          for (let step = 1; step <= 160; step++) {
            await page.mouse.move(
              bounds[i]!.x + 300 + step * 3,
              bounds[i]!.y + 300 + i * 150 + Math.sin(step / 6) * 45,
            );
            await page.waitForTimeout(7 + i * 4);
            expect(errors).toEqual([]);
          }
          await page.mouse.up();
        }),
      );
    }
    for (const page of pages) {
      await expect(page.locator(".whiteboard-view")).toHaveAttribute(
        "data-board-status",
        "Saved",
      );
      const strokes = () =>
        (scenes.get(page) || []).filter(
          (element) => !prior.has(element.id) && !element.isDeleted,
        );
      await expect.poll(() => strokes().length).toBe(4);
      expect(
        strokes()
          .filter((element) => element.type === "freedraw")
          .every((element) => (element.points?.length || 0) >= 130),
      ).toBe(true);
      await expect(page.locator(".whiteboard-warning")).toHaveCount(0);
    }
    await pages[0].waitForTimeout(8000);
    for (const page of pages) {
      await expect(page.locator(".whiteboard-view")).toHaveAttribute(
        "data-board-status",
        "Saved",
      );
      await expect(page.locator(".whiteboard-warning")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
