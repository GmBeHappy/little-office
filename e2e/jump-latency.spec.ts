import { test, expect } from "@playwright/test";
import { DEFAULT_WORKSPACE } from "../shared/maps";
import { emptyHabitat } from "../shared/habitats";
import { WORLD } from "../shared/world";

for (const control of ["keyboard", "button"] as const)
  test(`${control} jump responds before a delayed echo, respects cooldown and keeps remote jumps`, async ({
    page,
  }) => {
    const user = {
      id: "jump-self",
      name: "Jumper",
      role: "member",
      approved: true,
      mustChangePassword: false,
      avatar: "sage",
      availability: "available",
      statusText: "",
    };
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config")
        return route.fulfill({
          json: { workspace: DEFAULT_WORKSPACE, password: true, sso: false },
        });
      if (path === "/api/me") return route.fulfill({ json: { user } });
      return route.fulfill({ json: {} });
    });
    let echoes = 0,
      commands = 0;
    const pending = new Set<ReturnType<typeof setTimeout>>();
    await page.routeWebSocket("**/api/office?*", (ws) => {
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
            {
              ...user,
              id: "peer",
              name: "Peer",
              ...WORLD.spawn,
              x: WORLD.spawn.x + 100,
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
      ws.onMessage((raw) => {
        if (JSON.parse(String(raw)).type !== "jump") return;
        commands++;
        const timer = setTimeout(() => {
          pending.delete(timer);
          echoes++;
          ws.send(JSON.stringify({ type: "jump", from: user.id }));
          ws.send(JSON.stringify({ type: "jump", from: "peer" }));
        }, 900);
        pending.add(timer);
      });
    });
    try {
      await page.goto("/office");
      const bubble = page.locator(
        '.avatar-status-bubble[aria-label^="Jumper:"]',
      );
      const peer = page.locator('.avatar-status-bubble[aria-label^="Peer:"]');
      await expect(bubble).toHaveAttribute("data-world-y", /.+/);
      const readY = () =>
        bubble.evaluate((el) => Number((el as HTMLElement).dataset.worldY));
      const ground = await readY();
      const jump = () =>
        control === "keyboard"
          ? page.keyboard.press("Space")
          : page.getByRole("button", { name: "Jump", exact: true }).click();
      const peerGround = await peer.evaluate((el) =>
        Number((el as HTMLElement).dataset.worldY),
      );
      await page.evaluate(
        ({ control, ground }) => {
          const start = (event: Event) => {
            if (
              control === "keyboard"
                ? (event as KeyboardEvent).code !== "Space"
                : !(event.target as HTMLElement).closest(
                    'button[aria-label="Jump"]',
                  )
            )
              return;
            document.removeEventListener(
              control === "keyboard" ? "keydown" : "click",
              start,
              true,
            );
            const began = performance.now();
            const frame = () => {
              const y = Number(
                document.querySelector<HTMLElement>(
                  '.avatar-status-bubble[aria-label^="Jumper:"]',
                )?.dataset.worldY,
              );
              if (ground - y > 1)
                Reflect.set(
                  window,
                  "jumpResponseMs",
                  performance.now() - began,
                );
              else if (performance.now() - began < 1000)
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          };
          document.addEventListener(
            control === "keyboard" ? "keydown" : "click",
            start,
            true,
          );
        },
        { control, ground },
      );
      await jump();
      await jump();
      expect(
        commands,
        "Repeated input during cooldown must not send another jump",
      ).toBe(1);
      await page.waitForTimeout(100);
      const height = ground - (await readY());
      console.log(
        JSON.stringify({
          simulatedRoundTripMs: 900,
          control,
          heightBeforeReply: height,
          responseMs: await page.evaluate(() =>
            Reflect.get(window, "jumpResponseMs"),
          ),
          echoes,
        }),
      );
      expect(echoes).toBe(0);
      expect(
        await page.evaluate(() => Reflect.get(window, "jumpResponseMs")),
      ).toBeLessThan(150);
      await expect.poll(() => echoes).toBe(1);
      await expect
        .poll(
          async () =>
            peerGround -
            (await peer.evaluate((el) =>
              Number((el as HTMLElement).dataset.worldY),
            )),
        )
        .toBeGreaterThan(3);
      expect(
        Math.abs(ground - (await readY())),
        "A late server echo must not replay the completed local jump",
      ).toBeLessThan(1);
      await jump();
      expect(commands).toBe(2);
    } finally {
      for (const timer of pending) clearTimeout(timer);
    }
  });
