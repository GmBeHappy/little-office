import { expect, test } from "@playwright/test";
import { DEFAULT_WORKSPACE } from "../shared/maps";
import type { BrowserPushConfig } from "../lib/browser-push";

const workspace = "00000000-0000-4000-8000-000000000001";
const user = {
  id: "push-fixture",
  name: "Tester",
  role: "member",
  approved: true,
  mustChangePassword: false,
  avatar: "sage",
  availability: "available",
  statusText: "",
};
const base = "/api/workspaces/" + workspace;
const route = "/w/" + workspace + "/office";
const config: BrowserPushConfig = {
  enabled: true,
  firebase: {
    appId: "1:123456789:web:fixture",
    projectId: "little-office-fixture",
    messagingSenderId: "123456789",
    apiKey: "only-for-local-tests",
    authDomain: "little-office-fixture.invalid",
  },
  vapidKey: Buffer.from(
    Uint8Array.from({ length: 65 }, (_, i) => i + 4),
  ).toString("base64url"),
};

test("FCM enrollment, privacy gate, system notification and per-workspace opt-out", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  await context.grantPermissions(["notifications"], { origin });
  await context.addInitScript(() => {
    // Headless macOS can deny the native app permission despite the test origin grant.
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    const subscription = {
      endpoint: "https://push-service.invalid/test-only",
      getKey: () => new Uint8Array([1, 2, 3, 4]).buffer,
      unsubscribe: async () => true,
    };
    Object.defineProperty(PushManager.prototype, "getSubscription", {
      value: async () => subscription,
    });
    Object.defineProperty(PushManager.prototype, "subscribe", {
      value: async () => subscription,
    });
    Object.defineProperty(
      ServiceWorkerRegistration.prototype,
      "getNotifications",
      {
        value: async () => {
          const displayed = await caches.open("test-displayed-notifications");
          return Promise.all(
            (await displayed.keys()).map(async (req) => {
              const record = await (await displayed.match(req))!.json();
              return {
                ...record,
                data: { workspaceId: record.tag.slice(7, 43) },
                close: () => displayed.delete(req),
              };
            }),
          );
        },
      },
    );
  });
  await page.route("https://*.googleapis.com/**", async (route) => {
    const url = route.request().url();
    const data = url.includes("firebaseinstallations.")
      ? {
          fid: "d" + "a".repeat(21),
          refreshToken: "test-refresh",
          authToken: { token: "test-auth", expiresIn: "604800s" },
        }
      : { token: "test-fcm-registration" };
    await route.fulfill({
      json: data,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "POST,GET,DELETE,OPTIONS",
      },
    });
  });
  const binds: Record<string, unknown>[] = [];
  const removes: Record<string, unknown>[] = [];
  await page.routeWebSocket("**" + base + "/office?*", () => {});
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let json: unknown = {};
    if (path === base + "/me") json = { user };
    if (path === base + "/config")
      json = { workspace: DEFAULT_WORKSPACE, workspaceId: workspace };
    if (path === base + "/notifications")
      json = { items: [], unreadCount: 0, nextCursor: null };
    if (path === base + "/notifications/push-config") json = config;
    if (path === base + "/notifications/push-device") {
      (req.method() === "PUT" ? binds : removes).push(req.postDataJSON());
      json = { ok: true };
    }
    await route.fulfill({ json });
  });
  const cdp = await context.newCDPSession(page);
  let registrationId = "";
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
    for (const r of registrations)
      if (!r.isDeleted && r.scopeURL === origin + "/")
        registrationId = r.registrationId;
  });
  await cdp.send("ServiceWorker.enable");
  await page.goto(route + "?inbox=1");
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  expect(binds).toHaveLength(0);
  await expect(
    panel.getByRole("button", { name: "Turn on", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await panel.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Turn off", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(binds[0]).toMatchObject({
    platform: "web",
    token: "test-fcm-registration",
    locale: "en",
  });
  expect(binds[0].installationId).toMatch(/^[\da-f-]{36}$/);
  await expect.poll(() => registrationId).not.toBe("");
  // The worker receives a real CDP push. Capture the final OS display request:
  // a headless browser can't grant the host Mac's Notification Center permission.
  const worker = context
    .serviceWorkers()
    .find((w) => w.url().endsWith("/firebase-messaging-sw.js"))!;
  await worker.evaluate(() => {
    const reg = (
      globalThis as unknown as { registration: ServiceWorkerRegistration }
    ).registration;
    reg.showNotification = async (title, options = {}) => {
      const displayed = await caches.open("test-displayed-notifications");
      await displayed.put(
        "/" + options.tag,
        new Response(
          JSON.stringify({ title, body: options.body, tag: options.tag }),
        ),
      );
    };
  });
  const payload = {
    type: "office-notification",
    workspaceId: workspace,
    recipientId: user.id,
    installationId: binds[0].installationId,
    notificationId: "17",
    kind: "nudge",
    title: "Little Office",
    body: "New office notification",
  };
  const push = async (data: Record<string, unknown>) =>
    cdp.send("ServiceWorker.deliverPushMessage", {
      origin,
      registrationId,
      data: JSON.stringify({ from: "123456789", data }),
    });
  const visible = () =>
    page.evaluate(async () => {
      const displayed = await caches.open("test-displayed-notifications");
      return Promise.all(
        (await displayed.keys()).map(async (key) =>
          (await displayed.match(key))!.json(),
        ),
      );
    });
  await push({ ...payload, notificationId: "15", recipientId: "someone-else" });
  await push({ ...payload, notificationId: "16", installationId: "stale" });
  await push(payload);
  await expect.poll(visible).toEqual([
    {
      title: "Little Office",
      body: payload.body,
      tag: "office-" + workspace + "-17",
    },
  ]);
  // An origin need not have any open office tab for its worker to receive a push.
  await page.goto("about:blank");
  await push({ ...payload, notificationId: "18" });
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await (await caches.open("test-displayed-notifications")).keys())
            .length,
      ),
    )
    .toBe(2);
  await page.goto(route + "?inbox=1");
  await expect(
    panel.getByRole("button", { name: "Turn off", exact: true }),
  ).toBeVisible();
  await push(payload);
  await panel.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Turn on", exact: true }),
  ).toBeVisible();
  expect(removes).toContainEqual({ installationId: binds[0].installationId });
  await expect.poll(visible).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Notifications", exact: true }),
  ).toBeVisible();
  const before = binds.length;
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Turn on", exact: true }),
  ).toBeVisible();
  expect(binds.length).toBe(before);
});
