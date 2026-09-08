import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  accounts.length !== 2,
  "Run with bun scripts/e2e.ts video-view.spec.ts",
);
test("camera grid and expanded sharing preserve audio, support fullscreen, and recover when tracks end", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [a, b] = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    await a.addInitScript(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const paint = canvas.getContext("2d")!;
        paint.fillStyle = "#e3ecdb";
        paint.fillRect(0, 0, 1280, 720);
        paint.fillStyle = "#304b38";
        paint.font = "bold 64px sans-serif";
        paint.fillText("Little Office · shared screen", 80, 150);
        paint.font = "32px sans-serif";
        paint.fillText("A full view of the work, together.", 80, 220);
        paint.fillStyle = "#86a47c";
        paint.fillRect(80, 300, 1120, 340);
        const stream = canvas.captureStream(10);
        const timer = setInterval(() => {
          paint.fillStyle = "#e3ecdb";
          paint.fillRect(1050, 30, 200, 40);
          paint.fillStyle = "#304b38";
          paint.fillText(String(Date.now()).slice(-5), 1050, 60);
        }, 100);
        stream
          .getVideoTracks()[0]
          .addEventListener("ended", () => clearInterval(timer));
        return stream;
      };
    });
    let walking = 0;
    b.on("websocket", (socket) => {
      if (!socket.url().includes("/api/office")) return;
      socket.on("framesent", ({ payload }) => {
        const command = JSON.parse(String(payload));
        if (command.type === "move" && (command.dx || command.dy)) walking++;
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
      await page
        .getByRole("button", { name: "Enter the office", exact: true })
        .click();
      await expect(page.locator(".controlbar")).toHaveAttribute(
        "data-media-connected",
        "true",
      );
      await page
        .getByRole("button", { name: "Join The Studio", exact: true })
        .click();
      await expect(page.locator(".map-topline")).toContainText("The Studio");
      await expect(page.locator(".controlbar")).toHaveAttribute(
        "data-media-connected",
        "true",
      );
      await page.getByRole("button", { name: "Camera", exact: true }).click();
    }
    await a.getByRole("button", { name: "Microphone", exact: true }).click();
    await expect(b.locator(".video-strip .video-tile")).toHaveCount(2);
    await expect(b.locator(".audio-tracks audio")).toHaveCount(1);
    await b.evaluate(() =>
      Object.assign(window, {
        originalRemoteAudio: document.querySelector(".audio-tracks audio"),
      }),
    );
    await b
      .getByRole("button", { name: "Open camera grid", exact: true })
      .first()
      .click();
    const expanded = b.locator(".media-expanded");
    await expect(expanded).toBeVisible();
    await expect(expanded.locator(".media-grid video")).toHaveCount(2);
    await expect
      .poll(() =>
        expanded
          .locator("video")
          .evaluateAll((videos: HTMLVideoElement[]) =>
            videos.every((video) => video.videoWidth > 0),
          ),
      )
      .toBe(true);
    await expect(
      b.getByRole("button", { name: "Microphone", exact: true }),
    ).toBeVisible();
    await b.keyboard.down("w");
    await b.waitForTimeout(180);
    await b.keyboard.up("w");
    expect(walking).toBe(0);
    await expanded
      .getByRole("button", { name: "Enter fullscreen", exact: true })
      .click();
    await expect
      .poll(() =>
        b.evaluate(() =>
          document.fullscreenElement?.classList.contains("app-shell"),
        ),
      )
      .toBe(true);
    await b.screenshot({ path: "test-results/camera-grid.png" });
    await expanded
      .getByRole("button", { name: "Back to map", exact: true })
      .click();
    await expect(expanded).toHaveCount(0);
    await expect
      .poll(() => b.evaluate(() => !!document.fullscreenElement))
      .toBe(false);
    await expect(b.locator(".pixel-map canvas")).toBeVisible();
    await b
      .getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย", exact: true })
      .click();
    await a.getByRole("button", { name: "Share screen", exact: true }).click();
    await expect(b.locator(".screen-tile video")).toBeVisible();
    const sharingEvents = async (action: string) => {
      const response = await a.request.get(
        `/api/admin/activity?action=${action}`,
      );
      expect(response.ok()).toBe(true);
      const result = await response.json();
      return result.entries.filter(
        (entry: { actor: string }) => entry.actor === accounts[0].id,
      );
    };
    await expect
      .poll(async () => (await sharingEvents("screen.start")).length)
      .toBe(1);
    await b
      .getByRole("button", { name: "ขยายหน้าจอที่แชร์", exact: true })
      .click();
    await expect(expanded.getByRole("heading")).toHaveText("หน้าจอของ Robin");
    await expect(expanded.locator(".media-spotlight video")).toHaveCSS(
      "object-fit",
      "contain",
    );
    await expect(expanded.locator(".media-camera-rail video")).toHaveCount(2);
    await expect
      .poll(() =>
        expanded
          .locator(".media-spotlight video")
          .evaluate((video: HTMLVideoElement) => video.videoWidth),
      )
      .toBeGreaterThan(0);
    await b.evaluate(() => {
      document.querySelector<HTMLElement>(".app-shell")!.requestFullscreen =
        () => Promise.reject(new Error("Unavailable"));
    });
    await expanded
      .getByRole("button", { name: "เต็มหน้าจอ", exact: true })
      .click();
    await expect(expanded.getByRole("status")).toContainText(
      "เบราว์เซอร์ไม่รองรับเต็มหน้าจอ",
    );
    await b.setViewportSize({ width: 390, height: 844 });
    await b.screenshot({ path: "test-results/shared-screen-mobile.png" });
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expanded
      .getByRole("button", { name: "ตารางกล้อง", exact: true })
      .click();
    await expect(expanded.locator(".media-grid video")).toHaveCount(2);
    await expanded
      .getByRole("button", { name: "หน้าจอที่แชร์", exact: true })
      .click();
    await a.getByRole("button", { name: "Stop sharing", exact: true }).click();
    await expect
      .poll(async () => (await sharingEvents("screen.stop")).length)
      .toBe(1);
    expect((await sharingEvents("screen.start")).length).toBe(1);
    await expect(expanded.locator(".media-grid video")).toHaveCount(2);
    await expect(expanded.locator(".screen-tile")).toHaveCount(0);
    expect(
      await b.evaluate(() => {
        const original = (
          window as unknown as { originalRemoteAudio: HTMLAudioElement }
        ).originalRemoteAudio;
        return (
          document.querySelector(".audio-tracks audio") === original &&
          !original.paused &&
          (original.srcObject as MediaStream).active
        );
      }),
    ).toBe(true);
    await a.getByRole("button", { name: "Camera", exact: true }).click();
    await b.getByRole("button", { name: "กล้อง", exact: true }).click();
    await expect(expanded).toHaveCount(0);
    await expect(b.locator(".pixel-map canvas")).toBeVisible();
    await expect(b.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "true",
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
