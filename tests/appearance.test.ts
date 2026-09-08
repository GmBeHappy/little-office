import { test, expect } from "bun:test";
import {
  avatarId,
  appearanceFor,
  customAppearance,
  isAvatar,
  type Appearance,
} from "../shared/appearance";
import { drawCharacter } from "../shared/avatars";
import { Office } from "../server/office";
test("custom appearances validate and every combination draws in all directions and poses", () => {
  let checked = 0;
  for (let skin = 0; skin < 5; skin++)
    for (let hair = 0; hair < 5; hair++)
      for (let hat = 0; hat < 6; hat++)
        for (let clothes = 0; clothes < 5; clothes++) {
          const appearance = { skin, hair, hat, clothes } as Appearance;
          const id = avatarId(appearance);
          expect(isAvatar(id)).toBe(true);
          expect(customAppearance(id)).toEqual(appearance);
          for (const direction of ["up", "down", "left", "right"] as const)
            for (const pose of ["stand", "sit", "sleep"] as const) {
              const pixels: number[][] = [];
              drawCharacter(
                id,
                direction,
                2,
                (...pixel) => pixels.push(pixel),
                pose,
              );
              expect(pixels.length).toBeGreaterThanOrEqual(10);
              expect(
                pixels.every(
                  ([x, y, w, h, color]) =>
                    [x, y, w, h, color].every(Number.isFinite) &&
                    w > 0 &&
                    h > 0 &&
                    Math.abs(x) <= 40 &&
                    Math.abs(y) <= 55 &&
                    color >= 0 &&
                    color <= 0xffffff,
                ),
              ).toBe(true);
              checked++;
            }
        }
  expect(checked).toBe(9000);
  for (const bad of [
    "custom:5:0:0:0",
    "custom:0:5:0:0",
    "custom:0:0:6:0",
    "custom:0:0:0:5",
    "custom:0:0:0:-1",
    "custom:0:0:0:0<script>",
    "custom:0:0:0",
    null,
  ])
    expect(isAvatar(bad)).toBe(false);
  expect(appearanceFor("blue").hat).toBe(2);
});
test("custom appearances survive joining and reconnecting the office", () => {
  const office = new Office(() => {});
  const user = {
    id: "custom-member",
    name: "Custom",
    role: "member",
    avatar: "custom:4:2:5:1" as const,
  };
  for (let i = 0; i < 2; i++) {
    office.add(
      user,
      "test",
      Date.now() + 60000,
      () => {},
      () => {},
    );
    expect(office.people()[0].avatar).toBe(user.avatar);
    office.remove(user.id);
  }
});
