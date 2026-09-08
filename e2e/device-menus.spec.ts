import { test, expect } from "@playwright/test";
const accounts = JSON.parse(process.env.E2E_ACCOUNTS || "[]");
test.skip(
  !accounts.length,
  "Run through scripts/e2e.ts with isolated accounts.",
);

test("long device menus stay inside their dialog and scroll to the final option", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 540 });
  await page.addInitScript(() => {
    const enumerate = navigator.mediaDevices.enumerateDevices.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.enumerateDevices = async () => [
      ...(await enumerate()),
      ...Array.from(
        { length: 20 },
        (_, i) =>
          ({
            deviceId: `camera-${i}`,
            groupId: "test",
            kind: "videoinput",
            label: `Test camera ${i + 1}`,
            toJSON() {
              return {};
            },
          }) as MediaDeviceInfo,
      ),
      ...Array.from(
        { length: 20 },
        (_, i) =>
          ({
            deviceId: `extra-${i}`,
            groupId: "test",
            kind: "audioinput",
            label: `Test microphone ${i + 1}`,
            toJSON() {
              return {};
            },
          }) as MediaDeviceInfo,
      ),
    ];
  });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Audio devices", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Audio devices" });
  await dialog
    .getByRole("combobox", { name: "Microphone", exact: true })
    .click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await page.screenshot({ path: "/private/tmp/device-menu-regression.png" });
  const bounds = (await dialog.boundingBox())!;
  const menu = (await list.boundingBox())!;
  expect.soft(menu.y).toBeGreaterThanOrEqual(bounds.y);
  expect
    .soft(menu.y + menu.height)
    .toBeLessThanOrEqual(bounds.y + bounds.height);
  const viewport = list.locator("[data-radix-select-viewport]");
  await viewport.hover();
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollTop), { timeout: 2000 })
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("option", { name: "Test microphone 20", exact: true }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Allow microphone access & refresh devices",
    }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Camera devices", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Allow camera access & refresh devices" }),
  ).toHaveCount(0);
  const cameraDialog = page.getByRole("dialog", { name: "Camera devices" });
  await cameraDialog
    .getByRole("combobox", { name: "Camera", exact: true })
    .click();
  const cameraList = page.getByRole("listbox");
  const cameraViewport = cameraList.locator("[data-radix-select-viewport]");
  expect((await cameraViewport.boundingBox())!.height).toBeGreaterThanOrEqual(
    40,
  );
  await cameraViewport.hover();
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() => cameraViewport.evaluate((el) => el.scrollTop), {
      timeout: 2000,
    })
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("option", { name: "Test camera 20", exact: true }),
  ).toBeInViewport();
  const cameraBounds = (await cameraDialog.boundingBox())!;
  const cameraMenu = (await cameraList.boundingBox())!;
  expect(cameraMenu.y).toBeGreaterThanOrEqual(cameraBounds.y);
  expect(cameraMenu.y + cameraMenu.height).toBeLessThanOrEqual(
    cameraBounds.y + cameraBounds.height,
  );
  await page.screenshot({ path: "/private/tmp/camera-menu-regression.png" });
});

test("permission buttons track grants and revocation independently", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const statuses: Record<string, EventTarget & { state: PermissionState }> =
      {};
    for (const name of ["microphone", "camera"])
      statuses[name] = Object.assign(new EventTarget(), {
        state: "prompt" as PermissionState,
      });
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = async (descriptor) =>
      (statuses[descriptor.name] as PermissionStatus) || query(descriptor);
    Object.assign(window, { capturePermissionStatuses: statuses });
    const capture = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await capture(constraints);
      for (const [name, requested] of [
        ["microphone", constraints?.audio],
        ["camera", constraints?.video],
      ] as const) {
        if (requested) {
          statuses[name].state = "granted";
          statuses[name].dispatchEvent(new Event("change"));
        }
      }
      return stream;
    };
  });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Audio devices", exact: true })
    .click();
  const mic = page.getByRole("button", {
    name: "Allow microphone access & refresh devices",
  });
  await mic.click();
  await expect(mic).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Microphone", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Camera devices", exact: true })
    .click();
  const camera = page.getByRole("button", {
    name: "Allow camera access & refresh devices",
  });
  await camera.click();
  await expect(camera).toHaveCount(0);
  await page.evaluate(() => {
    const statuses = (
      window as unknown as {
        capturePermissionStatuses: Record<
          string,
          EventTarget & { state: PermissionState }
        >;
      }
    ).capturePermissionStatuses;
    statuses.camera.state = "denied";
    statuses.camera.dispatchEvent(new Event("change"));
  });
  await expect(camera).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Devices", exact: true }).click();
  await expect(mic).toHaveCount(0);
});

test("browsers without capture permission queries infer grants from named devices", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.permissions.query = async () => {
      throw new TypeError("Unsupported permission name");
    };
  });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(accounts[0].username);
  await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Enter the office" }).click();
  await expect(page.locator(".pixel-map canvas")).toBeVisible();
  for (const [menu, label] of [
    ["Audio devices", "Allow microphone access & refresh devices"],
    ["Camera devices", "Allow camera access & refresh devices"],
  ]) {
    await page.getByRole("button", { name: menu, exact: true }).click();
    await expect(page.getByRole("button", { name: label })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});
