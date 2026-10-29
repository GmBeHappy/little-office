import { test, expect, type WebSocketRoute } from "@playwright/test";
import { DEFAULT_WORKSPACE } from "../shared/maps";
import { emptyHabitat } from "../shared/habitats";
import { WORLD } from "../shared/world";

test("navbar measures round-trip ping, ignores stale replies and resets on reconnect", async ({
  page,
}) => {
  const user = {
    id: "ping-self",
    name: "Ping tester",
    role: "member",
    approved: true,
    mustChangePassword: false,
    avatar: "sage",
    availability: "available",
    statusText: "",
  };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/api/config"
          ? { workspace: DEFAULT_WORKSPACE, password: true, sso: false }
          : path === "/api/me"
            ? { user }
            : {},
    });
  });
  const sockets: WebSocketRoute[] = [];
  const probes: { socket: WebSocketRoute; nonce: number }[] = [];
  await page.routeWebSocket("**/api/office?*", (ws) => {
    sockets.push(ws);
    ws.onMessage((raw) => {
      const command = JSON.parse(String(raw));
      if (command.type === "ping")
        probes.push({ socket: ws, nonce: command.nonce });
    });
    ws.send(
      JSON.stringify({
        type: "snapshot",
        epoch: "fixture",
        self: user.id,
        workspace: DEFAULT_WORKSPACE,
        habitat: emptyHabitat(),
        locks: {},
        presenters: {},
        people: [
          {
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
          },
        ],
      }),
    );
  });
  await page.clock.install();
  await page.goto("/office");
  await expect.poll(() => probes.length).toBe(1);
  const ping = page.locator(".connection-ping");
  await expect(ping).toHaveText("— ms");
  probes[0].socket.send(JSON.stringify({ type: "pong", nonce: 999 }));
  await expect(ping).toHaveText("— ms");
  await page.clock.runFor(300);
  probes[0].socket.send(
    JSON.stringify({ type: "pong", nonce: probes[0].nonce }),
  );
  await expect(ping).toHaveText(/^\d+ ms$/);
  const measured = Number((await ping.innerText()).split(" ")[0]);
  expect(measured).toBeGreaterThanOrEqual(300);
  expect(measured).toBeLessThan(5000);
  await expect(ping).toHaveClass(/slow/);
  await expect(ping).toHaveAttribute(
    "title",
    "Round-trip latency to the office server",
  );
  // Keep a screenshot artifact of the actual navbar layout.
  await page
    .locator(".topbar")
    .screenshot({ path: "/tmp/little-office-navbar-ping.png" });
  await page.clock.fastForward(10000);
  await expect.poll(() => probes.length).toBe(2);
  await page.clock.fastForward(5001);
  await expect(ping).toHaveText("— ms");
  probes[1].socket.send(
    JSON.stringify({ type: "pong", nonce: probes[1].nonce }),
  );
  await expect(ping).toHaveText("— ms");
  await sockets[0].close({ code: 1012, reason: "Fixture reconnect" });
  await expect(page.locator(".connection")).toHaveText("Reconnecting");
  await expect(ping).toHaveCount(0);
  await page.clock.fastForward(1100);
  await expect.poll(() => sockets.length).toBe(2);
  await expect.poll(() => probes.length).toBe(3);
  await expect(ping).toHaveText("— ms");
  await page.clock.runFor(50);
  probes[2].socket.send(
    JSON.stringify({ type: "pong", nonce: probes[2].nonce }),
  );
  await expect(ping).toHaveText(/^\d+ ms$/);
  expect(Number((await ping.innerText()).split(" ")[0])).toBeLessThan(250);
  expect(sockets).toHaveLength(2); // Ping renders must never recreate a socket.
});
