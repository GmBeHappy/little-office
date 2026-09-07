import { test, expect, type Page } from "@playwright/test";
import { MAPS, type WorkspaceSettings } from "../shared/maps";
import type { Snapshot } from "../shared/world";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]") as {
  username: string;
  password: string;
  name: string;
}[];
test.skip(
  accounts.length !== 2,
  "Run with bun scripts/e2e.ts to provision isolated test accounts.",
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
  await expect(page.locator(".immersive-office")).toBeVisible();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
}
test("two teammates can wave, summon, enter rooms, publish media, and leave", async ({
  browser,
}) => {
  test.setTimeout(90000); // Fullscreen, media, five skins, and six map changes in two browsers.
  const errors: string[] = [];
  const contextA = await browser.newContext({
      permissions: ["microphone", "camera"],
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 2,
    }),
    contextB = await browser.newContext({
      permissions: ["microphone", "camera"],
      viewport: { width: 1440, height: 960 },
    });
  const a = await contextA.newPage(),
    b = await contextB.newPage();
  const jumps = new Map<Page, number>([
    [a, 0],
    [b, 0],
  ]);
  const snapshots = new Map<Page, Snapshot>();
  for (const page of [a, b]) {
    page.on("websocket", (socket) => {
      if (!socket.url().includes("/api/office")) return;
      socket.on("framereceived", ({ payload }) => {
        const message = JSON.parse(String(payload));
        if (message.type === "snapshot") snapshots.set(page, message);
        if (message.type === "jump") jumps.set(page, jumps.get(page)! + 1);
      });
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("requestfailed", (r) =>
      console.log("Failed request:", r.url(), r.failure()?.errorText),
    );
    page.on("response", (r) => {
      if (r.url().includes("/api/config") && r.status() !== 200)
        console.log("Config response:", r.status());
    });
  }
  await login(a, 0);
  await expect(a.locator(".pixel-map")).toHaveCSS("width", "1440px");
  await expect(a.locator(".pixel-map")).toHaveCSS("height", "960px");
  await a
    .getByRole("button", { name: "Close people and rooms", exact: true })
    .click();
  await expect(
    a.getByRole("complementary", { name: "People and rooms" }),
  ).toHaveCount(0);
  await a.getByRole("button", { name: "People", exact: true }).click();
  await expect(
    a.getByRole("complementary", { name: "People and rooms" }),
  ).toBeVisible();
  await a
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect
    .poll(() =>
      a.evaluate(() =>
        document.fullscreenElement?.classList.contains("app-shell"),
      ),
    )
    .toBe(true);
  await expect(
    a.getByRole("button", { name: "Microphone", exact: true }),
  ).toBeVisible();
  await expect(
    a.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await a.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  // Capture both side profiles during the walk cycle for visual review.
  for (const [key, direction] of [
    ["a", "left"],
    ["d", "right"],
  ]) {
    await a.keyboard.down(key);
    try {
      await a.waitForTimeout(250);
      await a.locator(".pixel-map").screenshot({
        path: `test-results/walk-${direction}.png`,
      });
    } finally {
      await a.keyboard.up(key);
    }
  }
  await login(b, 1);
  for (const [name, id] of [
    ["Scout", "sage"],
    ["Maker", "blue"],
    ["Artist", "coral"],
    ["Explorer", "gold"],
    ["Stargazer", "plum"],
  ]) {
    await a.getByRole("button", { name: "Your profile", exact: true }).click();
    await expect(
      a.getByRole("group", { name: "Character skins" }).getByRole("button"),
    ).toHaveCount(5);
    await a.getByRole("button", { name: `${name} skin`, exact: true }).click();
    await expect(a.locator(".character-preview h3")).toHaveText(name);
    if (id === "plum")
      await a
        .locator(".modal")
        .screenshot({ path: "test-results/character-skins.png" });
    await a.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(a.locator(`.header-avatar .avatar-${id}`)).toBeVisible();
    await expect(
      b
        .locator(".person")
        .filter({ hasText: "Robin" })
        .locator(`.avatar-${id}`),
    ).toBeVisible();
  }
  await a.keyboard.press("Space");
  await expect.poll(() => jumps.get(b)).toBe(1);
  await a.waitForTimeout(180);
  await a.locator(".pixel-map").screenshot({ path: "test-results/jump.png" });
  await a.waitForTimeout(700);
  await a.getByPlaceholder("Find your people").fill("test");
  await a.keyboard.press("Space");
  await expect(a.getByPlaceholder("Find your people")).toHaveValue("test ");
  await a.getByPlaceholder("Find your people").fill("");
  await a.getByRole("button", { name: "Jump", exact: true }).focus();
  await a.keyboard.press("Space");
  await expect.poll(() => jumps.get(b)).toBe(2);
  for (const page of [a, b]) {
    await page
      .getByRole("button", { name: "Nearby audio", exact: true })
      .click();
    await expect(page.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "true",
      { timeout: 20000 },
    );
  }
  await a.getByRole("button", { name: "Microphone", exact: true }).click();
  await a.getByRole("button", { name: "Camera", exact: true }).click();
  await expect(b.locator(".video-tile video")).toBeVisible({ timeout: 15000 });
  await expect(b.locator(".audio-tracks audio")).toHaveCount(1);
  await b.keyboard.down("s");
  try {
    await expect(b.locator(".video-tile video")).toHaveCount(0, {
      timeout: 6000,
    });
  } finally {
    await b.keyboard.up("s");
  }
  await b.keyboard.down("w");
  try {
    await expect(b.locator(".video-tile video")).toBeVisible({ timeout: 6000 });
  } finally {
    await b.keyboard.up("w");
  }
  await a.locator(".person").filter({ hasText: "Jamie" }).click();
  await a
    .locator(".person-actions")
    .getByRole("button", { name: "Wave", exact: true })
    .click();
  await expect(b.getByRole("status")).toContainText("Robin waved");
  await a.getByRole("button", { name: "Join The Studio", exact: true }).click();
  await expect(a.locator(".map-topline")).toContainText("The Studio");
  await expect(b.locator(".video-tile video")).toHaveCount(0);
  await a
    .locator(".person-actions")
    .getByRole("button", { name: "Summon", exact: true })
    .click();
  await expect(
    b.getByRole("dialog", { name: "Conversation invitation" }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Join them", exact: true }).click();
  await expect(b.locator(".map-topline")).toContainText("The Studio");
  await expect(a.locator(".media-error")).toHaveCount(0);
  await expect(b.locator(".media-error")).toHaveCount(0);
  await expect(a.locator(".controlbar")).toHaveAttribute(
    "data-media-connected",
    "true",
    { timeout: 20000 },
  );
  await expect(b.locator(".controlbar")).toHaveAttribute(
    "data-media-connected",
    "true",
    { timeout: 20000 },
  );
  await expect(
    a.getByRole("button", { name: "Microphone", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    a.getByRole("button", { name: "Camera", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(b.locator(".video-tile video")).toBeVisible({ timeout: 15000 });
  await expect
    .poll(() =>
      b
        .locator(".video-tile video")
        .evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  await a.getByRole("button", { name: "Share screen", exact: true }).click();
  await expect(b.locator(".screen-tile video")).toBeVisible({ timeout: 15000 });
  await a.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await expect(b.locator(".screen-tile")).toHaveCount(0);
  await a.screenshot({
    path: "test-results/office-desktop.png",
    fullPage: true,
  });
  await b
    .getByRole("button", { name: "Leave conversation", exact: true })
    .click();
  await expect(b.locator(".map-topline")).toContainText("The commons");
  await expect(b.locator(".video-tile")).toHaveCount(0);
  await a.setViewportSize({ width: 390, height: 844 });
  await expect(a.locator(".pixel-map")).toHaveCSS("width", "390px");
  await expect(a.locator(".pixel-map")).toHaveCSS("height", "844px");
  await expect(
    a.getByRole("complementary", { name: "People and rooms" }),
  ).toHaveCount(0);
  await a.getByRole("button", { name: "People", exact: true }).click();
  await expect(a.getByPlaceholder("Find your people")).toBeVisible();
  await a
    .getByRole("button", { name: "Close people and rooms", exact: true })
    .click();
  await a.screenshot({
    path: "test-results/office-mobile.png",
    fullPage: true,
  });
  expect(
    await a.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await a.reload();
  await a.getByRole("button", { name: "Your profile", exact: true }).click();
  await expect(
    a.getByRole("button", { name: "Stargazer skin", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await a.screenshot({
    path: "test-results/character-skins-mobile.png",
    fullPage: true,
  });
  expect(
    await a
      .locator(".avatar-picker")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await a.getByRole("button", { name: "Close dialog", exact: true }).click();
  await a.setViewportSize({ width: 1440, height: 960 });
  const originalWorkspace: WorkspaceSettings = (
    await (await a.request.get("/api/config")).json()
  ).workspace;
  try {
    for (const map of MAPS) {
      await a.getByRole("button", { name: "Settings", exact: true }).click();
      await a.getByRole("button", { name: "Workspace", exact: true }).click();
      await a.getByRole("button", { name: new RegExp(map.people) }).click();
      await expect(
        a.getByRole("group", { name: "Workspace maps" }).getByRole("button"),
      ).toHaveCount(3);
      await a
        .getByRole("button", { name: `${map.name} map`, exact: true })
        .click();
      if (snapshots.get(a)?.workspace.mapId !== map.id) {
        await a
          .getByRole("button", { name: "Apply map to workspace", exact: true })
          .click();
      }
      await expect(b.locator(".pixel-map")).toHaveAttribute(
        "data-map-id",
        map.id,
      );
      await expect(a.locator(".pixel-map canvas")).toHaveCount(1);
      await a
        .locator(".modal")
        .screenshot({ path: `test-results/settings-${map.id}.png` });
      await a
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      const self = snapshots
        .get(a)!
        .people.find((p) => p.id === snapshots.get(a)!.self)!;
      const start = self.x;
      await a.keyboard.down("d");
      try {
        await expect
          .poll(() => snapshots.get(a)?.people.find((p) => p.id === self.id)?.x)
          .toBeGreaterThan(start);
      } finally {
        await a.keyboard.up("d");
      }
      await a
        .locator(".pixel-map")
        .screenshot({ path: `test-results/map-${map.id}.png` });
    }
    await a.reload();
    await expect(a.locator(".pixel-map")).toHaveAttribute(
      "data-map-id",
      "space-large",
    );
    await a.getByRole("button", { name: "Settings", exact: true }).click();
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({
      path: "test-results/workspace-settings-mobile.png",
      fullPage: true,
    });
    expect(
      await a
        .locator(".map-picker")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  } finally {
    const current = (await (await a.request.get("/api/config")).json())
      .workspace;
    await a.request.patch("/api/admin/workspace", {
      headers: { origin: "http://localhost:3000" },
      data: { ...originalWorkspace, revision: current.revision },
    });
  }
  expect(errors).toEqual([]);
  await contextA.close();
  await contextB.close();
});
