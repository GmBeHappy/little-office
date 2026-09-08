import { test, expect, type Page } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(accounts.length !== 2, "Run through scripts/e2e.ts.");
async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page.locator(".controlbar")).toHaveAttribute(
    "data-media-connected",
    "true",
  );
}
test("new tabs and device sessions replace the old office without reconnect loops", async ({
  browser,
}) => {
  const first = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  const second = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  try {
    const a = await first.newPage();
    let oldSockets = 0;
    a.on("websocket", (socket) => {
      if (socket.url().includes("/api/office")) oldSockets++;
    });
    await login(a);
    await a.getByRole("button", { name: "Microphone", exact: true }).click();
    await a.getByRole("button", { name: "Whiteboard", exact: true }).click();
    await expect(a.locator(".whiteboard-view")).toHaveAttribute(
      "data-board-status",
      "Saved",
    );
    const before = oldSockets;
    const b = await first.newPage();
    await b.goto("/"); // Same cookie, different WebSocket.
    await expect(b.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "true",
    );
    await expect(a.locator(".session-taken-over")).toBeVisible();
    await expect(a.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "false",
    );
    await expect(a.locator(".whiteboard-warning")).toBeVisible();
    await b
      .getByRole("button", { name: "Join The Library", exact: true })
      .click();
    await expect(b.locator(".map-topline")).toContainText("The Library");
    await a.waitForTimeout(3000); // Exceed the reconnect delay to detect a takeover loop.
    expect(oldSockets).toBe(before);
    await expect(b.locator(".connection")).toContainText("Connected");
    await a.close(); // Late cleanup from the old socket must not remove its replacement.
    const c = await second.newPage();
    await login(c); // Independent login session, same account.
    await expect(b.locator(".session-taken-over")).toBeVisible();
    await expect(b.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "false",
    );
    await c
      .getByRole("button", { name: "Join The Studio", exact: true })
      .click();
    await expect(c.locator(".map-topline")).toContainText("The Studio");
    await b.reload(); // Explicitly opening the old tab can take over again.
    await expect(b.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "true",
    );
    await expect(c.locator(".session-taken-over")).toBeVisible();
    await c
      .getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย", exact: true })
      .click();
    await expect(c.locator(".session-taken-over")).toContainText(
      "ออฟฟิศนี้เปิดใช้งานอยู่ในแท็บหรืออุปกรณ์อื่นแล้ว",
    );
  } finally {
    await first.close();
    await second.close();
  }
});
