import { test, expect, type WebSocketRoute } from "@playwright/test";
import { DEFAULT_WORKSPACE } from "../shared/maps";
import { emptyHabitat } from "../shared/habitats";
import { WORLD, type Person } from "../shared/world";

const user = {
  id: "recovery-test",
  name: "Recovery",
  username: "recovery",
  role: "member",
  approved: true,
  mustChangePassword: false,
  avatar: "sage" as const,
  availability: "available",
  statusText: "",
};
const person: Person = {
  ...user,
  ...WORLD.spawn,
  direction: "down",
  moving: false,
  pose: "stand",
  microphone: false,
  status: "available",
  zone: "floor",
  conversation: "",
  room: "",
  seq: 0,
};
for (const failure of ["network", "server", "unauthorized"] as const) {
  test(`office handles ${failure} failure during reconnect and focus`, async ({
    page,
  }) => {
    let failed = false,
      checks = 0;
    const sockets: WebSocketRoute[] = [];
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config")
        return route.fulfill({
          json: {
            workspace: { ...DEFAULT_WORKSPACE, revision: 0 },
            password: true,
            sso: false,
            officeName: "Test office",
          },
        });
      if (path === "/api/me") {
        checks++;
        if (failed && failure === "network")
          return route.abort("connectionfailed");
        if (failed)
          return route.fulfill({
            status: failure === "server" ? 503 : 401,
            json: { error: "Fixture failure" },
          });
        return route.fulfill({ json: { user } });
      }
      return route.fulfill({ json: {} });
    });
    await page.routeWebSocket("**/api/office?*", (ws) => {
      sockets.push(ws);
      ws.send(
        JSON.stringify({
          type: "snapshot",
          epoch: "fixture",
          self: user.id,
          workspace: { ...DEFAULT_WORKSPACE, revision: 0 },
          habitat: emptyHabitat(),
          people: [person],
          locks: {},
          presenters: {},
        }),
      );
    });
    await page.goto("/office");
    await expect(page.locator(".connection")).toHaveText("Connected");
    failed = true;
    await sockets[0].close({
      code: 1001,
      reason: "Fixture transport interruption",
    });
    await expect.poll(() => checks).toBeGreaterThan(1);
    if (failure === "unauthorized") {
      await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
      await page.waitForTimeout(1200);
      expect(sockets).toHaveLength(1);
      return;
    }
    await expect.poll(() => sockets.length).toBe(2);
    await expect(page.locator(".connection")).toHaveText("Connected");
    const beforeFocus = checks;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => checks).toBeGreaterThan(beforeFocus);
    await expect(page.locator(".connection")).toHaveText("Connected");
    await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
  });
}
