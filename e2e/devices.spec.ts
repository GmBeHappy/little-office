import { selectValues, selectValue } from "./select";
import { test, expect, type Page } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]") as {
  username: string;
  password: string;
}[];
test.skip(
  accounts.length !== 2,
  "Run with bun scripts/e2e.ts to provision isolated test accounts.",
);
async function login(page: Page, index: number) {
  await page.goto("/");
  await page
    .getByLabel("Username", { exact: true })
    .fill(accounts[index].username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts[index].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Devices", exact: true }).click();
}
test("muting releases microphone capture and unmuting reacquires it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const capture = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const tracks: MediaStreamTrack[] = [];
    Object.assign(window, { capturedMicrophoneTracks: tracks });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await capture(constraints);
      tracks.push(...stream.getAudioTracks());
      return stream;
    };
  });
  const liveMicrophones = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          capturedMicrophoneTracks: MediaStreamTrack[];
        }
      ).capturedMicrophoneTracks.filter((track) => track.readyState === "live")
        .length,
    );
  await login(page, 0);
  const controls = page.locator(".controlbar");
  await expect(controls).toHaveAttribute("data-media-connected", "true");
  const mic = page.getByRole("button", { name: "Microphone", exact: true });
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  await expect.poll(liveMicrophones).toBe(0);

  // Check release and reacquisition both on the floor and after changing rooms.
  for (const room of [null, "The Studio"]) {
    if (room) {
      await page
        .getByRole("button", { name: `Join ${room}`, exact: true })
        .click();
      await expect(page.locator(".map-topline")).toContainText(room);
      await expect(controls).toHaveAttribute("data-media-connected", "true");
    }
    for (let cycle = 0; cycle < 2; cycle++) {
      await mic.click();
      await expect(mic).toHaveAttribute("aria-pressed", "true");
      await expect.poll(liveMicrophones).toBe(1);
      await mic.click();
      await expect(mic).toHaveAttribute("aria-pressed", "false");
      await expect.poll(liveMicrophones).toBe(0);
      await expect(controls).toHaveAttribute("data-media-connected", "true");
    }
  }
});

test("device choices persist and route incoming call audio to the selected output", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
    await a.addInitScript(() => {
      const capture = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      const streams: MediaStream[] = [];
      Object.assign(window, { capturedStreams: streams });
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await capture(constraints);
        streams.push(stream);
        return stream;
      };
    });
    await login(a, 0);
    await settings(a);
    const mic = a.getByRole("combobox", { name: "Microphone", exact: true });
    const output = a.getByRole("combobox", {
      name: "Speakers / headphones",
      exact: true,
    });
    const micId = (await selectValues(a, mic))[1];
    const outputId = (await selectValues(a, output))[1];
    expect(micId).toBeTruthy();
    expect(outputId).toBeTruthy();
    await selectValue(a, mic, micId!);
    await selectValue(a, output, outputId!);
    await expect(output).toHaveAttribute("data-value", outputId!);
    await expect
      .poll(() =>
        a.evaluate(() =>
          (
            window as unknown as { capturedStreams: MediaStream[] }
          ).capturedStreams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ),
        ),
      )
      .toBe(true);
    await a.reload();
    await expect(a.locator(".pixel-map canvas")).toBeVisible();
    await settings(a);
    await expect(mic).toHaveAttribute("data-value", micId!);
    await expect(output).toHaveAttribute("data-value", outputId!);
    await a.screenshot({ path: "test-results/devices.png" });
    await a.getByRole("button", { name: "Close dialog" }).click();
    await login(b, 1);
    for (const page of [a, b]) {
      await page
        .getByRole("button", { name: "Join The Studio", exact: true })
        .click();
      await expect(page.locator(".map-topline")).toContainText("The Studio");
      await expect(page.locator(".controlbar")).toHaveAttribute(
        "data-media-connected",
        "true",
      );
    }
    await a.getByRole("button", { name: "Microphone", exact: true }).click();
    await expect
      .poll(() =>
        a.evaluate(
          () =>
            (
              window as unknown as { capturedStreams: MediaStream[] }
            ).capturedStreams
              .at(-1)
              ?.getAudioTracks()[0]
              .getSettings().deviceId,
        ),
      )
      .toBe(micId);
    await b.getByRole("button", { name: "Microphone", exact: true }).click();
    const incoming = a.locator(".audio-tracks audio");
    await expect(incoming).toHaveCount(1);
    await expect
      .poll(() => incoming.evaluate((el: HTMLMediaElement) => el.sinkId))
      .toBe(outputId);
    await settings(a);
    const secondMicId = (await selectValues(a, mic))[2];
    await selectValue(a, mic, secondMicId!);
    await expect
      .poll(() =>
        a.evaluate(
          () =>
            (
              window as unknown as { capturedStreams: MediaStream[] }
            ).capturedStreams
              .at(-1)
              ?.getAudioTracks()[0]
              .getSettings().deviceId,
        ),
      )
      .toBe(secondMicId);
    await selectValue(a, output, "");
    await expect
      .poll(() => incoming.evaluate((el: HTMLMediaElement) => el.sinkId))
      .toBe("");
    await selectValue(a, output, outputId!);
    await a.getByRole("button", { name: "Close dialog" }).click();
    for (const page of [a, b])
      await page
        .getByRole("button", { name: "Join The Library", exact: true })
        .click();
    await expect(incoming).toHaveCount(1);
    await expect
      .poll(() => incoming.evaluate((el: HTMLMediaElement) => el.sinkId))
      .toBe(outputId);
    await settings(a);
    await a.evaluate((missing) => {
      const enumerate = navigator.mediaDevices.enumerateDevices.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.enumerateDevices = async () =>
        (await enumerate()).filter((d) => d.deviceId !== missing);
      navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
    }, secondMicId);
    await expect(mic).toHaveAttribute("data-value", "");
    const rejectedOutput = (await selectValues(a, output))[2];
    await a.evaluate((rejected) => {
      const setSinkId = HTMLMediaElement.prototype.setSinkId;
      HTMLMediaElement.prototype.setSinkId = function (id) {
        if (id === rejected)
          return Promise.reject(
            new DOMException("Speaker permission denied", "NotAllowedError"),
          );
        return setSinkId.call(this, id);
      };
    }, rejectedOutput);
    await selectValue(a, output, rejectedOutput!);
    await expect(output).toHaveAttribute("data-value", outputId!);
    await expect(a.getByRole("status")).toContainText(
      "Speaker permission denied",
    );
    await expect
      .poll(() => incoming.evaluate((el: HTMLMediaElement) => el.sinkId))
      .toBe(outputId);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test("unsupported browsers explain system output selection", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (HTMLMediaElement.prototype as Partial<HTMLMediaElement>).setSinkId;
  });
  await login(page, 1);
  await settings(page);
  await expect(
    page.getByRole("combobox", { name: "Speakers / headphones", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("This browser uses your system output.", { exact: false }),
  ).toBeVisible();
});
