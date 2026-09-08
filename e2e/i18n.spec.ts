import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(!accounts.length, "Run through bun scripts/e2e.ts i18n.spec.ts");
test("Thai and English cover login, office and settings, persist, and switch without reconnecting", async ({
  page,
}) => {
  let connections = 0,
    jumps = 0;
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/api/office")) return;
    connections++;
    ws.on("framesent", ({ payload }) => {
      if (JSON.parse(String(payload)).type === "jump") jumps++;
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "ออฟฟิศของคุณ",
  );
  await page.reload();
  await expect(page.getByLabel("ชื่อผู้ใช้", { exact: true })).toBeVisible();
  await page
    .getByLabel("ชื่อผู้ใช้", { exact: true })
    .fill(accounts[0].username);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(accounts[0].password);
  await page
    .getByRole("button", { name: "เข้าสู่ออฟฟิศ", exact: true })
    .click();
  await expect(page.locator(".controlbar")).toHaveAttribute(
    "data-media-connected",
    "true",
  );
  await expect(
    page
      .locator(".location-card")
      .getByRole("region", { name: "เสียงใกล้ตัว", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".topbar .nav-location")).toBeVisible();
  expect(
    (await page.locator(".location-card").boundingBox())!.height,
  ).toBeLessThan(80);
  await expect(
    page
      .locator(".topbar")
      .getByRole("button", { name: "เต็มหน้าจอ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "ซอร์สโค้ดบน GitHub" }),
  ).toHaveAttribute("href", "https://github.com/GmBeHappy/little-office");
  const connected = connections;
  await page
    .getByRole("button", { name: "Switch to English", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Nearby voice", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย", exact: true })
    .click();
  await expect(page.locator(".pixel-map canvas")).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect.poll(() => jumps).toBe(1);
  expect(connections).toBe(connected);
  await expect(page.locator(".controlbar")).toHaveAttribute(
    "data-media-connected",
    "true",
  );
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "เปลี่ยนบรรยากาศกันหน่อย" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "แผนที่สวนเฟิร์น" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "10–12 คน" }).click();
  await expect(
    dialog.getByRole("button", { name: "แผนที่สถานีวงโคจร" }),
  ).toBeVisible();
  await dialog.getByRole("tab", { name: "อุปกรณ์", exact: true }).click();
  await expect(
    dialog.getByLabel("ลำโพง / หูฟัง", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("tab", { name: "การเข้าสู่ระบบ", exact: true })
    .click();
  await expect(
    dialog.getByRole("switch", {
      name: "เปิดการเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน",
    }),
  ).toBeVisible();
  await dialog.getByRole("tab", { name: "สมาชิก", exact: true }).click();
  await expect(dialog).toContainText("เจ้าของ");
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  await page
    .getByRole("button", { name: "โปรไฟล์ของคุณ", exact: true })
    .click();
  await dialog.getByText("เริ่มจากอวาตาร์สำเร็จรูป", { exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "รูปลักษณ์นักดูดาว" }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "สถานะความพร้อม", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "ห้ามรบกวน", exact: true }),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  await page.getByRole("button", { name: "ออฟฟิศ", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("IBM Plex Sans Thai");
  expect(
    await page.evaluate(() =>
      document.fonts.check('400 14px "IBM Plex Sans Thai"', "ภาษาไทย"),
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/thai-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".location-card")).toBeVisible();
  await expect(
    page
      .locator(".topbar")
      .getByRole("button", { name: "Switch to English", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/thai-mobile.png" });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const header = (await page.locator(".topbar").boundingBox())!;
    const buttons = await page.locator(".topbar .header-end").boundingBox();
    expect(buttons!.x + buttons!.width).toBeLessThanOrEqual(
      header.x + header.width,
    );
  }
  await page
    .getByRole("button", { name: "Switch to English", exact: true })
    .click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("region", { name: "Nearby voice", exact: true }),
  ).toBeVisible();
});
