import { test, expect } from "@playwright/test";
import { WORLD, type Person } from "../shared/world";
import { getMap, mapZones } from "../shared/maps";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(!accounts.length, "Run with bun scripts/e2e.ts mobile-walk.spec.ts");
test("touch joystick walks, stops on release/cancel, and distinguishes room taps from drags", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  try {
    const page = await context.newPage();
    let self: Person | undefined;
    let mapId = "nature-small";
    const moves: { dx: number; dy: number }[] = [];
    const zones: string[] = [];
    page.on("websocket", (socket) => {
      if (!socket.url().includes("/api/office")) return;
      socket.on("framereceived", ({ payload }) => {
        const message = JSON.parse(String(payload));
        if (message.type === "snapshot") {
          self = message.people.find((p: Person) => p.id === accounts[0].id);
          mapId = message.workspace.mapId;
        }
      });
      socket.on("framesent", ({ payload }) => {
        const command = JSON.parse(String(payload));
        if (command.type === "move") moves.push(command);
        if (command.type === "zone") zones.push(command.zone);
      });
    });
    await page.goto("/");
    await page
      .getByLabel("Username", { exact: true })
      .fill(accounts[0].username);
    await page
      .getByLabel("Password", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Enter the office" }).click();
    const canvas = page.locator(".pixel-map canvas");
    const joystick = page.locator(".touch-joystick");
    await expect(canvas).toBeVisible();
    await expect.poll(() => self?.id).toBe(accounts[0].id);
    await page.getByRole("button", { name: "Office", exact: true }).click();
    const cdp = await context.newCDPSession(page);
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
      x = 0,
      y = 0,
    ) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints:
          type === "touchEnd" || type === "touchCancel"
            ? []
            : [{ x, y, id: 1 }],
      });
    const startX = self!.x;
    await touch("touchStart", 150, 440);
    await expect(joystick).toBeVisible();
    await touch("touchMove", 205, 440);
    await expect.poll(() => self!.x).toBeGreaterThan(startX + 8);
    await expect.poll(() => moves.at(-1)).toMatchObject({ dx: 1, dy: 0 });
    await page.screenshot({ path: "test-results/mobile-joystick.png" });
    await touch("touchMove", 110, 400);
    await expect.poll(() => moves.at(-1)).toMatchObject({ dx: -1, dy: -1 });
    await touch("touchMove", 151, 441);
    await expect.poll(() => moves.at(-1)).toMatchObject({ dx: 0, dy: 0 });
    await touch("touchEnd");
    await expect(joystick).toBeHidden();
    await expect.poll(() => self?.moving).toBe(false);
    const stopped = { x: self!.x, y: self!.y };
    await page.waitForTimeout(250);
    expect(self).toMatchObject(stopped);
    await touch("touchStart", 150, 440);
    await touch("touchMove", 110, 440);
    await expect.poll(() => moves.at(-1)?.dx).toBe(-1);
    await touch("touchCancel");
    await expect(joystick).toBeHidden();
    await expect.poll(() => moves.at(-1)).toMatchObject({ dx: 0, dy: 0 });

    // Pick a visible edge of the nearest room in the selected map.
    const room = mapZones(getMap(mapId))
      .filter((z) => z.id !== "floor")
      .sort((a, b) => {
        const distance = (z: typeof a) =>
          Math.hypot(
            Math.max(z.x + 20, Math.min(z.x + z.w - 20, self!.x)) - self!.x,
            Math.max(z.y + 30, Math.min(z.y + z.h - 30, self!.y)) - self!.y,
          );
        return distance(a) - distance(b);
      })[0];
    const bounds = (await canvas.boundingBox())!;
    const zoom = Math.max(
      bounds.width / WORLD.width,
      bounds.height / WORLD.height,
    );
    const roomPoint = () => {
      const scrollX = Math.max(
        0,
        Math.min(
          WORLD.width - bounds.width / zoom,
          self!.x - bounds.width / zoom / 2,
        ),
      );
      const scrollY = Math.max(
        0,
        Math.min(
          WORLD.height - bounds.height / zoom,
          self!.y - bounds.height / zoom / 2,
        ),
      );
      return {
        x:
          bounds.x +
          (Math.max(room.x + 20, Math.min(room.x + room.w - 20, self!.x)) -
            scrollX) *
            zoom,
        y:
          bounds.y +
          (Math.max(room.y + 30, Math.min(room.y + room.h - 30, self!.y)) -
            scrollY) *
            zoom,
      };
    };
    await page.waitForTimeout(300);
    let point = roomPoint();
    await touch("touchStart", point.x, point.y);
    await touch("touchMove", point.x - 35, point.y);
    await touch("touchEnd");
    expect(zones).toHaveLength(0);
    await expect.poll(() => self?.moving).toBe(false);
    await page.waitForTimeout(300);
    point = roomPoint();
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(() => self?.zone).toBe(room.id);
    expect(zones).toEqual([room.id]);
    await page.getByRole("button", { name: "Settings", exact: true }).tap();
    await expect(joystick).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
