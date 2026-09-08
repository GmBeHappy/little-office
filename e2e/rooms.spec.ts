import { test, expect } from "@playwright/test";
import { WORLD, type Person } from "../shared/world";

import { getMap, mapZones } from "../shared/maps";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(!accounts.length, "Run through bun scripts/e2e.ts rooms.spec.ts");

test("clicking a meeting room on the map teleports inside and Space still jumps", async ({
  page,
}) => {
  let self: Person | undefined;
  let jumps = 0;
  let mapId = "nature-small";
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/api/office")) return;
    socket.on("framereceived", ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === "snapshot") {
        self = message.people.find((p: Person) => p.id === accounts[0].id);
        mapId = message.workspace.mapId;
      }
      if (message.type === "jump" && message.from === accounts[0].id) jumps++;
    });
  });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  const canvas = page.locator(".pixel-map canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => self?.id).toBe(accounts[0].id);
  await page.getByRole("button", { name: "Office", exact: true }).click();

  for (const zone of mapZones(getMap(mapId)).filter(
    (zone) => zone.id !== "floor",
  )) {
    const bounds = (await canvas.boundingBox())!;
    const zoom = Math.max(
      bounds.width / WORLD.width,
      bounds.height / WORLD.height,
    );
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
    await canvas.click({
      position: {
        x: (zone.x + zone.w - 30 - scrollX) * zoom,
        y: (zone.y + zone.h - 40 - scrollY) * zoom,
      },
    });
    await expect.poll(() => self?.zone).toBe(zone.id);
    expect(self?.conversation).toBe(`zone:${zone.id}`);
    const position = { x: self!.x, y: self!.y, zone: self!.zone };
    const previousJumps = jumps;
    await page.keyboard.press("Space");
    await page.waitForTimeout(80);
    await page.keyboard.press("Space");
    await page.waitForTimeout(750);
    expect(jumps).toBe(previousJumps + 1);
    expect(self).toMatchObject(position);
  }
});
