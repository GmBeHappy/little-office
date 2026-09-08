import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  accounts.length !== 2,
  "Run through scripts/e2e.ts with isolated accounts.",
);

test("owner resets and deletes a member, and Thai physical keys move only on the map", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    const owner = await ownerContext.newPage();
    const member = await memberContext.newPage();
    let motion = { dx: 0, dy: 0 };
    let memberClosed = false;
    owner.on("websocket", (ws) => {
      if (ws.url().includes("/api/office"))
        ws.on("framesent", ({ payload }) => {
          const value = JSON.parse(String(payload));
          if (value.type === "move") motion = value;
        });
    });
    member.on("websocket", (ws) => {
      if (ws.url().includes("/api/office"))
        ws.on("close", () => {
          memberClosed = true;
        });
    });
    for (const [i, page] of [owner, member].entries()) {
      await page.goto("/");
      await page
        .getByLabel("Username", { exact: true })
        .fill(accounts[i].username);
      await page
        .getByLabel("Password", { exact: true })
        .fill(accounts[i].password);
      await page.getByRole("button", { name: "Enter the office" }).click();
      await expect(page.locator(".pixel-map canvas")).toBeVisible();
    }
    const cdp = await ownerContext.newCDPSession(owner);
    for (const [key, code, dx, dy] of [
      ["ไ", "KeyW", 0, -1],
      ["ฟ", "KeyA", -1, 0],
      ["ห", "KeyS", 0, 1],
      ["ก", "KeyD", 1, 0],
    ] as const) {
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
      await expect.poll(() => motion).toMatchObject({ dx, dy });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
      await expect.poll(() => motion).toMatchObject({ dx: 0, dy: 0 });
    }
    await owner.getByRole("button", { name: "Invite teammate" }).click();
    const row = owner.locator(`[data-member-id="${accounts[1].id}"]`);
    const self = owner.locator(`[data-member-id="${accounts[0].id}"]`);
    await expect(
      self.getByRole("button", { name: "Delete member" }),
    ).toHaveCount(0);
    await row.getByRole("button", { name: "Reset password" }).click();
    const resetForm = owner.getByRole("form", { name: "Reset password" });
    const input = resetForm.getByLabel("Temporary password");
    await input.focus();
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "ไ",
      code: "KeyW",
      text: "ไ",
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "ไ",
      code: "KeyW",
    });
    await expect(input).toHaveValue("ไ");
    await owner.waitForTimeout(150);
    expect(motion).toMatchObject({ dx: 0, dy: 0 });
    await owner.setViewportSize({ width: 390, height: 844 });
    expect(
      await owner.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await resetForm.scrollIntoViewIfNeeded();
    await owner.screenshot({ path: "/private/tmp/member-admin-mobile.png" });
    await owner.setViewportSize({ width: 1440, height: 960 });
    const temporary = crypto.randomUUID() + "New!";
    await input.fill(temporary);
    await resetForm.getByRole("button", { name: "Reset password" }).click();
    await expect(resetForm).toHaveCount(0);
    await expect.poll(() => memberClosed).toBe(true);
    await member.reload();
    await member
      .getByLabel("Username", { exact: true })
      .fill(accounts[1].username);
    await member.getByLabel("Password", { exact: true }).fill(temporary);
    await member.getByRole("button", { name: "Enter the office" }).click();
    await expect(
      member.getByRole("heading", { name: "Make it yours." }),
    ).toBeVisible();
    await row.getByRole("button", { name: "Delete member" }).click();
    const deleteForm = owner.getByRole("form", { name: "Delete member" });
    await deleteForm.getByRole("button", { name: "Cancel" }).click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Delete member" }).click();
    await deleteForm.getByRole("button", { name: "Confirm deletion" }).click();
    await expect(row).toHaveCount(0);
    await member.reload();
    await expect(
      member.getByRole("button", { name: "Enter the office" }),
    ).toBeVisible();
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
