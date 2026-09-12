import { test, expect } from "@playwright/test";
import { getMap, mapZones } from "../shared/maps";
import { WORLD, type Snapshot } from "../shared/world";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  !accounts.length,
  "Run through bun scripts/e2e.ts themed-maps.spec.ts",
);

for (const map of [
  { id: "zen-small", name: "Sakura Garden", thai: "สวนซากุระ" },
  { id: "temple-small", name: "Siam Courtyard", thai: "ลานสยาม" },
  { id: "beach-small", name: "Summer Cove", thai: "อ่าวฤดูร้อน" },
  { id: "farm-small", name: "Sunny Acres", thai: "ไร่แสงอรุณ" },
])
  test(`${map.name} can be selected and its relocated meeting rooms can be clicked`, async ({
    page,
  }) => {
    let snapshot: Snapshot | undefined;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => {
      if (!socket.url().includes("/api/office")) return;
      socket.on("framereceived", ({ payload }) => {
        const message = JSON.parse(String(payload));
        if (message.type === "snapshot") snapshot = message;
      });
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page
      .getByLabel("Username", { exact: true })
      .fill(accounts[0].username);
    await page
      .getByLabel("Password", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Enter the office" }).click();
    const canvas = page.locator(".pixel-map canvas");
    await expect(canvas).toBeVisible();
    const original = (await (await page.request.get("/api/config")).json())
      .workspace;
    try {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Workspace", exact: true }).click();
      await page.getByRole("button", { name: /4–8 people/ }).click();
      await expect(
        page.getByRole("group", { name: "Workspace maps" }).getByRole("button"),
      ).toHaveCount(7);
      await page
        .getByRole("button", { name: `${map.name} map`, exact: true })
        .click();
      await page
        .locator(".modal")
        .screenshot({ path: `test-results/${map.id}-picker.png` });
      if (original.mapId !== map.id)
        await page
          .getByRole("button", { name: "Apply map to workspace", exact: true })
          .click();
      await expect(page.locator(".pixel-map")).toHaveAttribute(
        "data-map-id",
        map.id,
      );
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await page.getByRole("button", { name: "Office", exact: true }).click();
      await expect(canvas).toBeVisible();
      await page.screenshot({ path: `test-results/${map.id}-desktop.png` });
      for (const zone of mapZones(getMap(map.id)).filter(
        (z) => z.id !== "floor",
      )) {
        const self = snapshot!.people.find((p) => p.id === snapshot!.self)!;
        const bounds = (await canvas.boundingBox())!;
        const zoom = Math.max(
          bounds.width / WORLD.width,
          bounds.height / WORLD.height,
        );
        const scrollX = Math.max(
          0,
          Math.min(
            WORLD.width - bounds.width / zoom,
            self.x - bounds.width / zoom / 2,
          ),
        );
        const scrollY = Math.max(
          0,
          Math.min(
            WORLD.height - bounds.height / zoom,
            self.y - bounds.height / zoom / 2,
          ),
        );
        await canvas.click({
          position: {
            x: (zone.x + zone.w - 40 - scrollX) * zoom,
            y: (zone.y + zone.h - 30 - scrollY) * zoom,
          },
        });
        await expect
          .poll(
            () => snapshot?.people.find((p) => p.id === snapshot?.self)?.zone,
          )
          .toBe(zone.id);
        expect(
          snapshot!.people.find((p) => p.id === snapshot!.self)!.conversation,
        ).toBe(`zone:${zone.id}`);
      }
      await page
        .getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย", exact: true })
        .click();
      await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
      await expect(
        page.getByRole("button", { name: `แผนที่${map.thai}`, exact: true }),
      ).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `test-results/${map.id}-mobile-thai.png` });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      const current = (await (await page.request.get("/api/config")).json())
        .workspace;
      await page.request.patch("/api/admin/workspace", {
        headers: { origin: "http://localhost:3000" },
        data: { ...original, revision: current.revision },
      });
    }
  });
