import { test, expect } from "@playwright/test";

const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]") as {
  username: string;
  password: string;
}[];
test.skip(
  accounts.length !== 2,
  "Run with bun scripts/e2e.ts to provision isolated test accounts.",
);

test("speaking indicators follow live microphone activity and clear on mute or leave", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    const [a, b] = pages;
    // Feed actual audio samples through WebRTC, without relying on Chrome's silent fake mic.
    await a.addInitScript(() => {
      const capture = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!constraints?.audio || constraints.video)
          return capture(constraints);
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const output = audio.createMediaStreamDestination();
        oscillator.type = "triangle";
        oscillator.frequency.value = 180;
        gain.gain.value = 0.4;
        window.addEventListener("test-microphone-signal", (event) => {
          gain.gain.value = (event as CustomEvent<number>).detail;
        });
        oscillator.connect(gain).connect(output);
        oscillator.start();
        await audio.resume();
        return output.stream;
      };
    });
    for (let i = 0; i < pages.length; i++) {
      await pages[i].goto("/");
      await pages[i]
        .getByLabel("Username", { exact: true })
        .fill(accounts[i].username);
      await pages[i]
        .getByLabel("Password", { exact: true })
        .fill(accounts[i].password);
      await pages[i].getByRole("button", { name: "Enter the office" }).click();
      await expect(pages[i].locator(".pixel-map canvas")).toBeVisible();
      await expect(pages[i].locator(".controlbar")).toHaveAttribute(
        "data-media-connected",
        "true",
      );
    }
    const mic = a.getByRole("button", { name: "Microphone", exact: true });
    const remote = b.locator(".person").filter({ hasText: "Robin" });
    await expect(mic).toHaveAttribute("data-speaking", "false");
    await mic.click();
    await a.getByRole("button", { name: "Camera", exact: true }).click();
    await expect(mic).toHaveAttribute("data-speaking", "true", {
      timeout: 15000,
    });
    await expect(remote).toHaveAttribute("data-speaking", "true", {
      timeout: 15000,
    });
    await expect(
      remote.getByRole("img", { name: "Speaking", exact: true }),
    ).toBeVisible();
    await expect(b.locator(".video-tile")).toHaveAttribute(
      "data-speaking",
      "true",
    );
    await a.keyboard.down("a");
    await a.waitForTimeout(400);
    await a.keyboard.up("a");
    await b.screenshot({ path: "test-results/speaking.png" });
    await a.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("test-microphone-signal", { detail: 0 }),
      ),
    );
    await expect(mic).toHaveAttribute("aria-pressed", "true");
    await expect(mic).toHaveAttribute("data-speaking", "false");
    await expect(remote).toHaveAttribute("data-speaking", "false");
    await a.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("test-microphone-signal", { detail: 0.4 }),
      ),
    );
    await expect(remote).toHaveAttribute("data-speaking", "true");
    await b.keyboard.down("s");
    try {
      await expect(b.locator(".video-tile")).toHaveCount(0, { timeout: 6000 });
      await expect(remote).toHaveAttribute("data-speaking", "false");
    } finally {
      await b.keyboard.up("s");
    }
    await b.keyboard.down("w");
    try {
      await expect(remote).toHaveAttribute("data-speaking", "true", {
        timeout: 6000,
      });
    } finally {
      await b.keyboard.up("w");
    }
    await mic.click();
    await expect(mic).toHaveAttribute("data-speaking", "false");
    await expect(remote).toHaveAttribute("data-speaking", "false");
    await expect(b.locator(".video-tile")).toHaveAttribute(
      "data-speaking",
      "false",
    );
    for (const page of pages) {
      await page
        .getByRole("button", { name: "Join The Studio", exact: true })
        .click();
      await expect(page.locator(".controlbar")).toHaveAttribute(
        "data-media-connected",
        "true",
      );
    }
    await mic.click();
    await expect(remote).toHaveAttribute("data-speaking", "true", {
      timeout: 15000,
    });
    await b
      .getByRole("button", { name: "Leave conversation", exact: true })
      .click();
    await expect(remote).toHaveAttribute("data-speaking", "false");
    await expect(b.locator(".speaking-indicator")).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
