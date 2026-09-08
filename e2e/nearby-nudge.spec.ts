import { test, expect, type Page } from "@playwright/test";
import { canNudge, type Snapshot } from "../shared/world";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]") as {
  username: string;
  password: string;
}[];
test.skip(
  accounts.length !== 2,
  "Run with bun scripts/e2e.ts to provision isolated test accounts.",
);
test("automatic nearby voice shows participants and Z nudges with a chime without firing while typing", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
    const nudges: unknown[] = [];
    const snapshots = new Map<Page, Snapshot>();
    for (const page of [a, b])
      page.on("websocket", (ws) => {
        if (ws.url().includes("/api/office"))
          ws.on("framereceived", ({ payload }) => {
            const message = JSON.parse(String(payload));
            if (message.type === "snapshot") snapshots.set(page, message);
          });
      });
    b.on("websocket", (ws) => {
      if (ws.url().includes("/api/office"))
        ws.on("framereceived", ({ payload }) => {
          const message = JSON.parse(String(payload));
          if (message.type === "nudge") nudges.push(message);
        });
    });
    for (const page of [a, b])
      await page.addInitScript(() => {
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          if (this.src.includes("/sounds/nudge.wav"))
            Object.assign(window, { nudgeAudio: this });
          return play.call(this);
        };
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
      await expect(page.locator(".controlbar")).toHaveAttribute(
        "data-media-connected",
        "true",
        { timeout: 20000 },
      );
      await expect(
        page.getByRole("button", { name: "Microphone", exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
      await expect(
        page.getByRole("button", { name: "Nearby audio", exact: true }),
      ).toHaveCount(0);
    }
    await expect(
      a.getByRole("region", { name: "Nearby voice", exact: true }),
    ).toContainText("Jamie");
    // Put the test pair together at the commons entrance, away from existing local users.
    for (const page of [a, b]) {
      await page
        .getByRole("button", { name: "Join The Studio", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Leave conversation", exact: true })
        .click();
    }
    const own = (page: Page) =>
      snapshots
        .get(page)!
        .people.find((p) => p.id === snapshots.get(page)!.self)!;
    await a.keyboard.press("1");
    await expect.poll(() => own(a).pose).toBe("sit");
    await expect
      .poll(
        () => snapshots.get(b)?.people.find((p) => p.id === own(a).id)?.pose,
      )
      .toBe("sit");
    await a.waitForTimeout(300);
    await a
      .locator(".pixel-map")
      .screenshot({ path: "test-results/avatar-sitting.png" });
    await a.keyboard.press("2");
    await expect.poll(() => own(a).pose).toBe("sleep");
    await a.waitForTimeout(300);
    await a
      .locator(".pixel-map")
      .screenshot({ path: "test-results/avatar-sleeping.png" });
    await a.getByRole("button", { name: "Microphone", exact: true }).click();
    await expect
      .poll(
        () =>
          snapshots.get(b)?.people.find((p) => p.id === own(a).id)?.microphone,
      )
      .toBe(true);
    await a.keyboard.press("2");
    await expect.poll(() => own(a).pose).toBe("stand");
    await a.getByRole("button", { name: "Microphone", exact: true }).click();
    await expect
      .poll(
        () =>
          snapshots.get(b)?.people.find((p) => p.id === own(a).id)?.microphone,
      )
      .toBe(false);
    await a.getByPlaceholder("Find your people").fill("z");
    await a.keyboard.press("z");
    expect(nudges).toHaveLength(0);
    await a.getByPlaceholder("Find your people").fill("");
    await a.locator(".pixel-map").click({ position: { x: 500, y: 450 } });
    const dx = own(b).x - own(a).x,
      dy = own(b).y - own(a).y;
    const key =
      Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "d" : "a") : dy > 0 ? "s" : "w";
    const facing = { d: "right", a: "left", s: "down", w: "up" }[key];
    await a.keyboard.down(key);
    await expect.poll(() => own(a).direction, { intervals: [20] }).toBe(facing);
    await a.keyboard.up(key);
    await expect.poll(() => own(a).moving).toBe(false);
    // Never nudge an unrelated user who happens to be in the local office.
    const candidates = snapshots
      .get(a)!
      .people.filter((p) => p.id !== own(a).id && canNudge(own(a), p))
      .sort(
        (p, q) =>
          Math.hypot(p.x - own(a).x, p.y - own(a).y) -
          Math.hypot(q.x - own(a).x, q.y - own(a).y),
      );
    expect(candidates[0]?.id).toBe(own(b).id);
    await a.keyboard.press("z");
    await expect.poll(() => nudges.length).toBe(1);
    await expect(b.getByRole("status")).toContainText("Robin nudged you");
    await expect
      .poll(() =>
        b.evaluate(
          () =>
            (window as unknown as { nudgeAudio?: HTMLAudioElement }).nudgeAudio
              ?.currentTime || 0,
        ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        a.evaluate(
          () =>
            (window as unknown as { nudgeAudio?: HTMLAudioElement }).nudgeAudio
              ?.currentTime || 0,
        ),
      )
      .toBeGreaterThan(0);
    await a.keyboard.press("z");
    await expect.poll(() => nudges.length).toBe(2);
    await b.screenshot({ path: "test-results/nearby-nudge.png" });
    await b
      .getByRole("button", { name: "Join The Studio", exact: true })
      .click();
    await expect(
      a.getByRole("region", { name: "Nearby voice", exact: true }),
    ).not.toContainText("Jamie");
    await b
      .getByRole("button", { name: "Leave conversation", exact: true })
      .click();
    await expect(b.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "true",
    );
    await expect(
      b.getByRole("region", { name: "Nearby voice", exact: true }),
    ).toBeVisible();
    await b.setViewportSize({ width: 390, height: 844 });
    await expect(
      b.getByRole("region", { name: "Nearby voice", exact: true }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Sit", exact: true }).click();
    await expect.poll(() => own(b).pose).toBe("sit");
    await b.getByRole("button", { name: "Sleep", exact: true }).click();
    await expect.poll(() => own(b).pose).toBe("sleep");
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
