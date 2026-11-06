import { expect, test, type WebSocketRoute } from "@playwright/test";
import { DEFAULT_WORKSPACE } from "../shared/maps";
import type { OfficeNotification } from "../shared/notifications";

test.use({ hasTouch: true });

test("personal notification badge, read history and live refresh on a touch viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const workspace = "00000000-0000-4000-8000-000000000001";
  const base = `/api/workspaces/${workspace}`;
  const user = {
    id: "reader",
    name: "Reader",
    approved: true,
    role: "member",
    avatar: "sage",
    availability: "available",
  };
  const createdAt = new Date().toISOString();
  const items: OfficeNotification[] = [
    { id: 3, kind: "nudge", actorName: "June", createdAt, readAt: null },
    { id: 2, kind: "summon", actorName: "Oak", createdAt, readAt: null },
    { id: 1, kind: "call", actorName: "Pung", createdAt, readAt: createdAt },
  ];
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket(`**${base}/office?*`, (ws) => {
    socket = ws;
  });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === base + "/config")
      return route.fulfill({ json: { workspace: DEFAULT_WORKSPACE } });
    if (url.pathname === base + "/me") return route.fulfill({ json: { user } });
    if (url.pathname === base + "/notifications") {
      const list = items.filter(
        (i) =>
          !url.searchParams.has("before") ||
          i.id < Number(url.searchParams.get("before")),
      );
      return route.fulfill({
        json: {
          items: list.slice(0, 2),
          unreadCount: items.filter((i) => !i.readAt).length,
          nextCursor: list.length > 2 ? list[1].id : null,
        },
      });
    }
    if (
      url.pathname.startsWith(base + "/notifications/") &&
      route.request().method() === "POST"
    ) {
      for (const i of items) {
        if (
          url.pathname === base + "/notifications/read-all" ||
          url.pathname === base + `/notifications/${i.id}/read`
        )
          i.readAt ??= new Date().toISOString();
      }
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(`/w/${workspace}/office`);
  const bell = page.getByRole("button", { name: "Notifications, 2 unread" });
  await expect(bell).toHaveText("2");
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toContainText("June nudged you.");
  await expect(panel).toContainText("Oak invited you to join them.");
  await page.screenshot({
    path: test.info().outputPath("notifications-desktop.png"),
  });
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
  await panel
    .getByRole("button", { name: "Mark as read: June nudged you." })
    .click();
  await expect(
    panel.getByRole("button", { name: "Mark as read: June nudged you." }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "Load older notifications" }).click();
  await expect(panel).toContainText("Pung called you.");
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Notifications, 1 unread" }),
  ).toHaveText("1");

  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    const brand = (await page.locator(".topbar .brand").boundingBox())!;
    const controls = (await page.locator(".header-end").boundingBox())!;
    expect(
      Math.abs(brand.y + brand.height / 2 - controls.y - controls.height / 2),
    ).toBeLessThan(3);
  }
  items.unshift({
    id: 4,
    kind: "wave",
    actorName: "Fon",
    createdAt,
    readAt: null,
  });
  socket!.send(
    JSON.stringify({ type: "notifications-changed", workspaceId: workspace }),
  );
  await expect(bell).toHaveText("2");
  await page
    .getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย", exact: true })
    .click();
  await page
    .getByRole("button", { name: "การแจ้งเตือน ยังไม่ได้อ่าน 2 รายการ" })
    .tap();
  const thaiPanel = page.getByRole("dialog", { name: "การแจ้งเตือน" });
  const mobileBounds = await thaiPanel.boundingBox();
  expect(mobileBounds!.x).toBeGreaterThanOrEqual(0);
  expect(mobileBounds!.x + mobileBounds!.width).toBeLessThanOrEqual(375);
  await expect(thaiPanel).toContainText("Fon โบกมือให้คุณ");
  await page.screenshot({
    path: test.info().outputPath("notifications-mobile-th.png"),
  });
  await thaiPanel
    .getByRole("button", { name: "ทำเครื่องหมายว่าอ่านทั้งหมด" })
    .click();
  await expect(
    thaiPanel.getByRole("button", { name: "ทำเครื่องหมายว่าอ่านทั้งหมด" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "การแจ้งเตือน", exact: true }),
  ).toHaveText("");
});
