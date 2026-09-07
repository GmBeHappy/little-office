import { test, expect } from "@playwright/test";
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
    b.on("websocket", (ws) => {
      if (ws.url().includes("/api/office"))
        ws.on("framereceived", ({ payload }) => {
          const message = JSON.parse(String(payload));
          if (message.type === "nudge") nudges.push(message);
        });
    });
    await b.addInitScript(() => {
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
    await a.getByPlaceholder("Find your people").fill("z");
    await a.keyboard.press("z");
    expect(nudges).toHaveLength(0);
    await a.getByPlaceholder("Find your people").fill("");
    await a.locator(".pixel-map").click({ position: { x: 500, y: 450 } });
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
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
