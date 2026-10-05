import { expect, test } from "bun:test";
import {
  readNameTagPreferences,
  nameTagColors,
  DEFAULT_NAME_TAGS,
} from "../lib/name-tags";
test("invalid or old stored preferences remain usable", () => {
  expect(readNameTagPreferences(null)).toEqual(DEFAULT_NAME_TAGS);
  expect(readNameTagPreferences({ size: 200, opacity: -4 })).toEqual({
    size: 16,
    opacity: 0,
  });
  expect(readNameTagPreferences({ size: "large", opacity: NaN })).toEqual(
    DEFAULT_NAME_TAGS,
  );
});
test("transparent speaking labels keep their text visible", () => {
  const colors = nameTagColors({ size: 8, opacity: 0 }, true);
  expect(colors.background).toBe("rgba(40, 121, 79, 0)");
  expect(colors.text).toBe("#205e3e");
  expect(colors.outline).toBeGreaterThan(0);
  expect(nameTagColors({ size: 16, opacity: 100 }, true).text).toBe("#ffffff");
});
