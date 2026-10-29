import { test, expect } from "@playwright/test";
import { DEFAULT_WORKSPACE } from "../shared/maps";
import { WORLD } from "../shared/world";
import { emptyHabitat } from "../shared/habitats";

test("automatic Away is not saved as a manual status and custom status can be cleared", async ({
  page,
}) => {
  const user = {
    id: "status-test",
    name: "Status Test",
    role: "member",
    approved: true,
    mustChangePassword: false,
    avatar: "sage",
    availability: "available",
    statusText: "Deep work",
    statusIcon: "🎧",
  };
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config")
      return route.fulfill({
        json: {
          workspace: { ...DEFAULT_WORKSPACE, revision: 0 },
          password: true,
          sso: false,
        },
      });
    if (path === "/api/me") return route.fulfill({ json: { user } });
    if (path === "/api/profile") {
      saved = route.request().postDataJSON();
      Object.assign(user, {
        availability: saved?.status,
        statusText: saved?.statusText,
        statusIcon: saved?.statusIcon,
      });
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.routeWebSocket("**/api/office?*", (ws) =>
    ws.send(
      JSON.stringify({
        type: "snapshot",
        epoch: "test",
        self: user.id,
        workspace: { ...DEFAULT_WORKSPACE, revision: 0 },
        habitat: emptyHabitat(),
        people: [
          {
            ...user,
            ...WORLD.spawn,
            status: "away",
            direction: "down",
            pose: "stand",
            moving: false,
            microphone: false,
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
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page.getByRole("tab", { name: "Status", exact: true }).click();
  const profile = page.getByRole("dialog", {
    name: "Your profile",
    exact: true,
  });
  await expect(
    profile.getByRole("combobox", { name: "Availability", exact: true }),
  ).toHaveAttribute("data-value", "available");
  await profile
    .getByRole("button", { name: "Clear status", exact: true })
    .click();
  await expect(
    profile.getByLabel("A little status", { exact: true }),
  ).toHaveValue("");
  await profile
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect
    .poll(() => saved)
    .toMatchObject({ status: "available", statusText: "", statusIcon: "" });
});
