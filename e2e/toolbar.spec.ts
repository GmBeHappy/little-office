import { test, expect } from "@playwright/test";
import { selectValues, selectValue } from "./select";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(accounts.length !== 2, "Use scripts/e2e.ts for isolated accounts.");
test("compact navigation, emotes and custom toolbar menus work on desktop and mobile", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
    const emotes: any[] = [];
    let movements = 0;
    a.on("websocket", (ws) => {
      if (ws.url().includes("/api/office"))
        ws.on("framesent", ({ payload }) => {
          const value = JSON.parse(String(payload));
          if (value.type === "move" && (value.dx || value.dy)) movements++;
        });
    });
    b.on("websocket", (ws) => {
      if (ws.url().includes("/api/office"))
        ws.on("framereceived", ({ payload }) => {
          const value = JSON.parse(String(payload));
          if (value.type === "emote") emotes.push(value);
        });
    });
    for (const [i, page] of [a, b].entries()) {
      await page.goto("/");
      await page
        .getByLabel("Username", { exact: true })
        .fill(accounts[i].username);
      await page
        .getByLabel("Password", { exact: true })
        .fill(accounts[i].password);
      await page.getByRole("button", { name: "Enter the office" }).click();
      await expect(page.locator(".pixel-map canvas")).toBeVisible();
      await page
        .getByRole("button", { name: "Join The Studio", exact: true })
        .click();
      await expect(page.locator(".controlbar")).toHaveAttribute(
        "data-media-connected",
        "true",
      );
    }
    await expect(a.locator(".topbar .nav-location")).toContainText(
      "The Studio",
    );
    await expect(
      a
        .locator(".controlbar")
        .getByRole("button", { name: "Status", exact: true }),
    ).toHaveCount(0);
    await expect(
      a
        .locator(".controlbar")
        .getByRole("button", { name: "Wave", exact: true }),
    ).toHaveCount(0);
    const roster = a.getByRole("region", { name: "Conversation participants" });
    await expect(roster).toContainText("Jamie");
    expect((await roster.boundingBox())!.height).toBeLessThan(80);
    await a.getByRole("button", { name: "Audio devices", exact: true }).click();
    const audio = a.getByRole("dialog", { name: "Audio devices" });
    const mic = audio.getByRole("combobox", {
      name: "Microphone",
      exact: true,
    });
    await mic.click();
    await a.keyboard.press("ArrowDown");
    await a.keyboard.press("Enter");
    await expect(a.getByRole("listbox")).toHaveCount(0);
    await expect(audio).toBeVisible();
    await a.keyboard.press("Escape");
    await expect(audio).toHaveCount(0);
    await a
      .getByRole("button", { name: "Camera devices", exact: true })
      .click();
    const camera = a.getByRole("dialog", { name: "Camera devices" });
    await camera
      .getByRole("button", { name: "Allow camera access & refresh devices" })
      .click();
    const cameraSelect = camera.getByRole("combobox", {
      name: "Camera",
      exact: true,
    });
    const cameraId = (await selectValues(a, cameraSelect))[1];
    expect(cameraId).toBeTruthy();
    await selectValue(a, cameraSelect, cameraId);
    await expect(cameraSelect).toHaveAttribute("data-value", cameraId);
    await a.keyboard.press("Escape");
    await a.getByRole("button", { name: "Emote", exact: true }).click();
    const picker = a.getByRole("dialog", { name: "Emote", exact: true });
    await picker.getByPlaceholder("Search emoji").fill("grinning");
    const before = movements;
    await a.keyboard.press("w");
    await a.waitForTimeout(150);
    expect(movements).toBe(before);
    await picker.getByPlaceholder("Search emoji").fill("grinning");
    await picker.locator('button[data-unified="1f600"]').first().click();
    await expect.poll(() => emotes.at(-1)?.emoji).toBe("😀");
    await expect(picker).toHaveCount(0);
    await a.screenshot({ path: "/private/tmp/office-toolbar-desktop.png" });
    await a.setViewportSize({ width: 390, height: 844 });
    await a.getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย" }).click();
    await a.getByRole("button", { name: "อีโมต", exact: true }).click();
    const thaiPicker = a.getByRole("dialog", { name: "อีโมต", exact: true });
    await expect(thaiPicker.getByPlaceholder("ค้นหาอีโมจิ")).toBeVisible();
    await thaiPicker.getByPlaceholder("ค้นหาอีโมจิ").fill("ยิ้ม");
    await expect(
      thaiPicker.locator("button[data-unified]").first(),
    ).toBeVisible();
    await a.screenshot({ path: "/private/tmp/office-emote-mobile.png" });
    await a.keyboard.press("Escape");
    await a.screenshot({ path: "/private/tmp/office-toolbar-mobile.png" });
    expect(
      await a.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    expect(
      (await a.locator(".location-card").boundingBox())!.height,
    ).toBeLessThan(80);
    await a.getByRole("button", { name: "อุปกรณ์เสียง", exact: true }).click();
    const thaiAudio = a.getByRole("dialog", { name: "อุปกรณ์เสียง" });
    await thaiAudio
      .getByRole("combobox", { name: "ไมโครโฟน", exact: true })
      .click();
    await expect(a.getByRole("listbox")).toBeVisible();
    await a.screenshot({ path: "/private/tmp/office-select-mobile.png" });
    await a.keyboard.press("Escape");
    await expect(thaiAudio).toBeVisible();
    await a.keyboard.press("Escape");
    await expect(thaiAudio).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
