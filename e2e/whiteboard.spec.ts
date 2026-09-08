import { test, expect, type Page } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  accounts.length !== 2,
  "Run through scripts/e2e.ts with isolated accounts.",
);
async function login(page: Page, index: number) {
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
test("teammates share a saved whiteboard without moving or interrupting audio", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const aContext = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  const bContext = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  const a = await aContext.newPage(),
    b = await bContext.newPage();
  const scenes = new Map<Page, any[]>();
  const errors: string[] = [];
  const commands: { type: string; dx?: number; dy?: number }[] = [];
  for (const page of [a, b]) {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => {
      if (socket.url().includes("/api/whiteboard"))
        socket.on("framereceived", ({ payload }) => {
          const message = JSON.parse(String(payload));
          if (message.elements) scenes.set(page, message.elements);
        });
      if (page === a && socket.url().includes("/api/office"))
        socket.on("framesent", ({ payload }) =>
          commands.push(JSON.parse(String(payload))),
        );
    });
  }
  await login(a, 0);
  await login(b, 1);
  for (const page of [a, b]) {
    await page
      .getByRole("button", { name: "Join The Library", exact: true })
      .click();
    await expect(page.locator(".map-topline")).toContainText("The Library");
    await expect(page.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "true",
    );
    await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
    await expect(page.locator(".whiteboard-view")).toHaveAttribute(
      "data-board-status",
      "Saved",
    );
  }
  await expect(a.locator(".whiteboard-presence")).toContainText("2");
  await a.screenshot({ path: "/private/tmp/whiteboard-initial.png" });
  const prior = new Set((scenes.get(a) || []).map((e) => e.id));
  const canvas = a.locator(".excalidraw__canvas.interactive");
  await a.getByTestId("toolbar-rectangle").locator("..").click();
  const rect = (await canvas.boundingBox())!;
  await a.mouse.move(rect.x + 300, rect.y + 250);
  await a.mouse.down();
  await a.mouse.move(rect.x + 460, rect.y + 350, { steps: 10 });
  await a.mouse.up();
  await expect
    .poll(
      () =>
        (scenes.get(b) || []).filter(
          (e) => !e.isDeleted && !prior.has(e.id) && e.type === "rectangle",
        ).length,
    )
    .toBe(1);
  await expect(a.locator(".whiteboard-view")).toHaveAttribute(
    "data-board-status",
    "Saved",
  );
  const id = scenes
    .get(b)!
    .find((e) => !e.isDeleted && !prior.has(e.id) && e.type === "rectangle").id;
  const testText = `Whiteboard ${Date.now()} WASD 123 z`;
  commands.length = 0;
  await a.getByTestId("toolbar-text").locator("..").click();
  await a.mouse.click(rect.x + 650, rect.y + 470);
  await expect(a.locator("textarea.excalidraw-wysiwyg")).toBeVisible();
  await a.locator("textarea.excalidraw-wysiwyg").fill(testText);
  await a.keyboard.press("End");
  await a.keyboard.press("Escape");
  await expect
    .poll(() => (scenes.get(b) || []).some((e) => e.text === testText))
    .toBe(true);
  expect(
    commands.filter((command) =>
      command.type === "move"
        ? !!command.dx || !!command.dy
        : ["jump", "pose", "nudge"].includes(command.type),
    ),
  ).toEqual([]);
  await expect(a.locator(".controlbar")).toHaveAttribute(
    "data-media-connected",
    "true",
  );
  await a.getByRole("button", { name: "Microphone", exact: true }).click();
  await expect(b.locator(".audio-tracks audio")).toHaveCount(1);
  await a.screenshot({ path: "/private/tmp/whiteboard-shared.png" });
  await a.getByRole("button", { name: "Back to map", exact: true }).click();
  await a.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(a.locator(".whiteboard-view")).toHaveAttribute(
    "data-board-status",
    "Saved",
  );
  await expect
    .poll(() => scenes.get(a)?.some((e) => e.id === id && !e.isDeleted))
    .toBe(true);
  const download = a.waitForEvent("download");
  await a.getByRole("button", { name: "Export PNG", exact: true }).click();
  expect((await download).suggestedFilename()).toContain(".png");
  if (
    await a
      .getByRole("button", { name: "Save snapshot to storage", exact: true })
      .isVisible()
  ) {
    await a
      .getByRole("button", { name: "Save snapshot to storage", exact: true })
      .click();
    await expect(a.locator(".whiteboard-file-saved")).toContainText(
      "Snapshot saved to external storage.",
    );
    const savedDownload = a.waitForEvent("download");
    await a
      .getByRole("link", { name: "Download snapshot", exact: true })
      .click();
    expect((await savedDownload).suggestedFilename()).toContain(".png");
  }
  // Other areas have separate boards. Returning to the room restores this one.
  await b.getByRole("button", { name: "Back to map", exact: true }).click();
  await b
    .getByRole("button", { name: "Leave conversation", exact: true })
    .click();
  await expect(b.locator(".map-topline")).toContainText("The commons");
  scenes.delete(b);
  await b.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(b.locator(".whiteboard-view")).toHaveAttribute(
    "data-board-status",
    "Saved",
  );
  expect(scenes.get(b)?.some((e) => e.id === id)).toBe(false);
  await a.setViewportSize({ width: 390, height: 740 });
  await expect(
    a.getByRole("button", { name: "Microphone", exact: true }),
  ).toBeInViewport();
  await expect(a.locator(".whiteboard-canvas")).toBeInViewport();
  expect(
    await a
      .locator(".whiteboard-view")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await a.screenshot({ path: "/private/tmp/whiteboard-mobile.png" });
  expect(errors).toEqual([]);
  await aContext.close();
  await bContext.close();
});
