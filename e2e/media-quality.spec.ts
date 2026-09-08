import { selectValue } from "./select";
import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  accounts.length !== 2,
  "Run through bun scripts/e2e.ts media-quality.spec.ts",
);
declare global {
  interface Window {
    qualityProbe: {
      captures: MediaStreamConstraints[];
      displays: DisplayMediaStreamOptions[];
      peers: RTCPeerConnection[];
    };
  }
}
test("quality targets reach capture and real RTP encoders, persist, and leave voice connected", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext({ deviceScaleFactor: 2 }),
  ]);
  try {
    const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
    await a.addInitScript(() => {
      const probe: Window["qualityProbe"] = (window.qualityProbe = {
        captures: [],
        displays: [],
        peers: [],
      });
      const NativePeer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePeer {
        constructor(...args: ConstructorParameters<typeof NativePeer>) {
          super(...args);
          probe.peers.push(this);
        }
      };
      const capture = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = (constraints) => {
        probe.captures.push(structuredClone(constraints || {}));
        // Model a 720p/30 webcam: a higher preferred capture target must still work.
        if (constraints && typeof constraints.video === "object")
          return capture({
            ...constraints,
            video: {
              ...constraints.video,
              width: 1280,
              height: 720,
              frameRate: 30,
            },
          });
        return capture(constraints);
      };
      navigator.mediaDevices.getDisplayMedia = async (options) => {
        probe.displays.push(structuredClone(options || {}));
        const canvas = document.createElement("canvas");
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext("2d")!;
        const paint = () => {
          ctx.fillStyle = "#e3ecdb";
          ctx.fillRect(0, 0, 1920, 1080);
          ctx.fillStyle = "#304b38";
          ctx.font = "60px sans-serif";
          ctx.fillText("High-resolution screen sharing", 100, 180);
          ctx.fillRect(100 + (Date.now() % 1200), 350, 100, 100);
        };
        paint();
        const stream = canvas.captureStream(60);
        const timer = setInterval(paint, 16);
        const track = stream.getVideoTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => {
          clearInterval(timer);
          stop();
        };
        return stream;
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
      await expect(page.locator(".pixel-map canvas")).toBeVisible();
      await page
        .getByRole("button", { name: "Join The Studio", exact: true })
        .click();
      await expect(page.locator(".controlbar")).toHaveAttribute(
        "data-media-connected",
        "true",
      );
    }
    await a.getByRole("button", { name: "Microphone", exact: true }).click();
    await expect(b.locator(".audio-tracks audio")).toHaveCount(1);
    const audio = await b.locator(".audio-tracks audio").elementHandle();
    await a.getByRole("button", { name: "Camera", exact: true }).click();
    await expect(b.locator(".video-tile video")).toBeVisible();
    expect(
      await a.evaluate(
        () => window.qualityProbe.captures.find((c) => c.video)?.video,
      ),
    ).toMatchObject({
      width: 3840,
      height: 2160,
      frameRate: 60,
    });
    const encodings = () =>
      a.evaluate(() =>
        window.qualityProbe.peers.flatMap((p) =>
          p
            .getSenders()
            .filter((s) => s.track?.kind === "video")
            .flatMap((s) => s.getParameters().encodings),
        ),
      );
    await expect
      .poll(async () =>
        (await encodings()).some(
          (e) => e.maxBitrate === 20_000_000 && e.maxFramerate === 60,
        ),
      )
      .toBe(true);
    await b
      .getByRole("button", { name: "Open camera grid", exact: true })
      .click();
    await expect
      .poll(() =>
        b
          .locator(".media-grid video")
          .evaluate((v: HTMLVideoElement) => v.videoWidth),
      )
      .toBeGreaterThan(360);
    await a.getByRole("button", { name: "Share screen", exact: true }).click();
    await expect
      .poll(() => a.evaluate(() => window.qualityProbe.displays.length))
      .toBe(1);
    expect(
      await a.evaluate(() => window.qualityProbe.displays[0].video),
    ).toMatchObject({
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      frameRate: 60,
    });
    await expect
      .poll(async () =>
        (await encodings()).some(
          (e) => e.maxBitrate === 30_000_000 && e.maxFramerate === 60,
        ),
      )
      .toBe(true);
    await b
      .locator(".media-expanded")
      .getByRole("button", { name: "Shared screen", exact: true })
      .click();
    await expect
      .poll(() =>
        b
          .locator(".media-spotlight video")
          .evaluate((v: HTMLVideoElement) => v.videoWidth),
      )
      .toBeGreaterThanOrEqual(1920);
    await a.getByRole("button", { name: "Settings", exact: true }).click();
    await a.getByRole("button", { name: "Devices", exact: true }).click();
    const quality = a.getByRole("combobox", {
      name: "Video & screen quality",
      exact: true,
    });
    await expect(quality).toHaveAttribute("data-value", "maximum");
    await selectValue(a, quality, "balanced");
    await expect(a.locator(".controlbar")).toHaveAttribute(
      "data-media-connected",
      "true",
    );
    expect(await audio!.evaluate((el) => el.isConnected)).toBe(true);
    await a
      .locator(".modal")
      .screenshot({ path: "test-results/media-quality.png" });
    await a.getByRole("button", { name: "Close dialog", exact: true }).click();
    await a.getByRole("button", { name: "Stop sharing", exact: true }).click();
    await a.getByRole("button", { name: "Camera", exact: true }).click();
    await a.getByRole("button", { name: "Camera", exact: true }).click();
    await expect
      .poll(() =>
        a.evaluate(
          () => window.qualityProbe.captures.filter((c) => c.video).length,
        ),
      )
      .toBe(2);
    expect(
      await a.evaluate(
        () => window.qualityProbe.captures.filter((c) => c.video).at(-1)?.video,
      ),
    ).toMatchObject({
      width: 1280,
      height: 720,
      frameRate: 30,
    });
    await expect
      .poll(async () =>
        (await encodings()).some(
          (e) => e.maxBitrate === 2_500_000 && e.maxFramerate === 30,
        ),
      )
      .toBe(true);
    expect(await audio!.evaluate((el) => el.isConnected)).toBe(true);
    await a.reload();
    await expect(a.locator(".pixel-map canvas")).toBeVisible();
    await a.getByRole("button", { name: "Settings", exact: true }).click();
    await a.getByRole("button", { name: "Devices", exact: true }).click();
    await expect(quality).toHaveAttribute("data-value", "balanced");
    await a.getByRole("button", { name: "Close dialog", exact: true }).click();
    await a
      .getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย", exact: true })
      .click();
    await a.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
    await a.getByRole("button", { name: "อุปกรณ์", exact: true }).click();
    await expect(
      a.getByRole("combobox", {
        name: "คุณภาพวิดีโอและการแชร์หน้าจอ",
        exact: true,
      }),
    ).toHaveAttribute("data-value", "balanced");
    await a.setViewportSize({ width: 390, height: 844 });
    await a
      .getByRole("combobox", {
        name: "คุณภาพวิดีโอและการแชร์หน้าจอ",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await a
      .locator(".modal")
      .screenshot({ path: "test-results/media-quality-thai-mobile.png" });
    expect(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
