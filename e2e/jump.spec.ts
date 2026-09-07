import { test, expect } from "@playwright/test";
import type { Person } from "../shared/world";

const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(!accounts.length, "Run through bun scripts/e2e.ts jump.spec.ts");

test("repeated Space presses keep the character connected and at its position", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let self: Person | undefined;
  let connections = 0;
  let disconnects = 0;
  let jumps = 0;
  const commands: string[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/api/office")) return;
    connections++;
    socket.on("framesent", ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type !== "move") commands.push(message.type);
    });
    socket.on("close", () => disconnects++);
    socket.on("framereceived", ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === "snapshot")
        self = message.people.find((p: Person) => p.id === accounts[0].id);
      if (message.type === "jump" && message.from === accounts[0].id) jumps++;
    });
  });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  await expect.poll(() => self?.id).toBe(accounts[0].id);
  await page
    .getByRole("button", { name: "Rooms", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Back to the commons", exact: true })
    .click();
  await page.waitForTimeout(150);
  const spawn = { x: self!.x, y: self!.y };
  await page.keyboard.down("a");
  await page.waitForTimeout(500);
  await page.keyboard.up("a");
  await expect.poll(() => self?.moving).toBe(false);
  expect(self!.x).toBeLessThan(spawn.x - 20);
  const position = { x: self!.x, y: self!.y };
  const initialConnections = connections;
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(80);
    await page.keyboard.press("Space");
    await page.waitForTimeout(750);
    expect(self).toMatchObject(position);
    expect(disconnects).toBe(0);
  }
  expect(jumps).toBe(5);
  expect(commands.filter((command) => command === "zone")).toHaveLength(1);

  // Clicking the map also releases focus from room controls without walking.
  await page
    .getByRole("button", { name: "Join The Studio", exact: true })
    .focus();
  await page
    .locator(".pixel-map canvas")
    .click({ position: { x: 200, y: 200 } });
  await page.keyboard.press("Space");
  await page.waitForTimeout(80);
  await page.keyboard.press("Space");
  await page.waitForTimeout(750);
  expect(self).toMatchObject(position);
  expect(jumps).toBe(6);
  expect(commands.filter((command) => command === "zone")).toHaveLength(1);

  // A retained room-button focus must not turn the jump shortcut into a teleport.
  await page
    .getByRole("button", { name: "Join The Studio", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(80);
  await page.keyboard.press("Space");
  await page.waitForTimeout(750);
  expect(self).toMatchObject({ ...position, zone: "floor" });
  expect(commands.filter((command) => command === "zone")).toHaveLength(1);
  expect(jumps).toBe(7);

  // The visible Jump control also continues to work.
  await page.getByRole("button", { name: "Jump", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect.poll(() => jumps).toBe(8);
  expect(connections).toBe(initialConnections);
  expect(disconnects).toBe(0);
  // Deliberate Tab navigation preserves native Space activation for buttons.
  await page
    .getByRole("button", { name: "Join The Studio", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Join The Library", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(() => self?.zone).toBe("library");
  expect(errors).toEqual([]);
});
