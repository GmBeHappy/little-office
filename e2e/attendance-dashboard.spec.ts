import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { DEFAULT_WORKSPACE } from "../shared/maps";
import { WORLD } from "../shared/world";
import { emptyHabitat } from "../shared/habitats";

test("attendance dashboard filters, exports and fits desktop/mobile", async ({
  page,
}) => {
  const user = {
    id: "owner",
    name: "Owner",
    role: "owner",
    approved: true,
    avatar: "sage",
    availability: "available",
    statusText: "",
    mustChangePassword: false,
  };
  const queries: URLSearchParams[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config")
      return route.fulfill({
        json: {
          workspaceId: "fixture",
          workspace: { ...DEFAULT_WORKSPACE, revision: 0 },
          password: true,
          sso: false,
        },
      });
    if (url.pathname === "/api/me") return route.fulfill({ json: { user } });
    if (url.pathname === "/api/attendance") {
      queries.push(url.searchParams);
      return route.fulfill({
        json: {
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          generatedAt: new Date().toISOString(),
          manager: true,
          rows: [
            {
              userId: "a",
              name: "Mali",
              avatar: "sage",
              firstEntry: new Date().toISOString(),
              lastSeen: new Date().toISOString(),
              connectedMs: 7200000,
              activeMs: 5400000,
              visits: 2,
              state: "active",
            },
            {
              userId: "b",
              name: "Ton",
              avatar: "sky",
              firstEntry: new Date().toISOString(),
              lastSeen: new Date().toISOString(),
              connectedMs: 3600000,
              activeMs: 1800000,
              visits: 1,
              state: "idle",
            },
            {
              userId: "c",
              name: "Nok",
              avatar: "sage",
              firstEntry: null,
              lastSeen: null,
              connectedMs: 0,
              activeMs: 0,
              visits: 0,
              state: "offline",
            },
          ],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.routeWebSocket("**/api/office?*", (ws) =>
    ws.send(
      JSON.stringify({
        type: "snapshot",
        epoch: "fixture",
        self: user.id,
        workspace: { ...DEFAULT_WORKSPACE, revision: 0 },
        habitat: emptyHabitat(),
        people: [
          {
            ...user,
            ...WORLD.spawn,
            direction: "down",
            moving: false,
            pose: "stand",
            microphone: false,
            status: "available",
            zone: "floor",
            conversation: "",
            room: "",
            seq: 0,
          },
        ],
        presenters: {},
        locks: {},
      }),
    ),
  );
  await page.goto("/office");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Attendance", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Mali");
  await expect(page.locator(".attendance-metrics")).toContainText("3h 0m");
  await expect(page.getByRole("table")).toContainText("No recorded session");
  await page.getByRole("button", { name: "Last 7 days", exact: true }).click();
  await expect
    .poll(
      () =>
        +new Date(queries.at(-1)!.get("to")!) -
        +new Date(queries.at(-1)!.get("from")!),
    )
    .toBe(7 * 86400000);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const file = await download;
  expect(await readFile((await file.path())!, "utf8")).toContain('"Mali"');
  await page.screenshot({ path: "test-results/attendance-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("table")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/attendance-mobile.png" });
  await page.getByLabel("From date", { exact: true }).fill("2027-12-01");
  await expect(page.getByRole("alert")).toHaveText(
    "Choose a valid date range of up to 31 days.",
  );
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeDisabled();
});
