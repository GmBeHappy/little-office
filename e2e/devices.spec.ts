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
  await page.getByRole("button", { name: "Devices", exact: true }).click();
}
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
    await a
      .getByRole("button", {
        name: "Allow microphone access & refresh devices",
      })
      .click();
    const mic = a.getByRole("combobox", { name: "Microphone", exact: true });
    const output = a.getByRole("combobox", {
      name: "Speakers / headphones",
      exact: true,
    });
    await expect.poll(() => mic.locator("option").count()).toBeGreaterThan(1);
    const micId = await mic.locator("option").nth(1).getAttribute("value");
    const outputId = await output
      .locator("option")
      .nth(1)
      .getAttribute("value");
    expect(micId).toBeTruthy();
    expect(outputId).toBeTruthy();
    await mic.selectOption(micId!);
    await output.selectOption(outputId!);
    await expect(output).toHaveValue(outputId!);
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
    await expect(mic).toHaveValue(micId!);
    await expect(output).toHaveValue(outputId!);
    await a.screenshot({ path: "test-results/devices.png" });
    await a.getByRole("button", { name: "Close dialog" }).click();
    await login(b, 1);
    for (const page of [a, b]) {
      await page
        .getByRole("button", { name: "Join The Studio", exact: true })
        .click();
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
    const secondMicId = await mic
      .locator("option")
      .nth(2)
      .getAttribute("value");
    await mic.selectOption(secondMicId!);
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
    await output.selectOption("");
    await expect
      .poll(() => incoming.evaluate((el: HTMLMediaElement) => el.sinkId))
      .toBe("");
    await output.selectOption(outputId!);
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
    await expect(mic).toHaveValue("");
    const rejectedOutput = await output
      .locator("option")
      .nth(2)
      .getAttribute("value");
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
    await output.selectOption(rejectedOutput!);
    await expect(output).toHaveValue(outputId!);
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
