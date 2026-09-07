import { expect, test } from "bun:test";
import { translate } from "../lib/i18n/messages";
import th from "../lib/i18n/th.json";
import { MAPS } from "../shared/maps";
import { CHARACTER_LOOKS } from "../shared/avatars";
import { ZONES } from "../shared/world";

test("Thai messages preserve parameters and cover map and character descriptions", () => {
  for (const [english, thai] of Object.entries(th)) {
    expect(thai.length).toBeGreaterThan(0);
    const parameters = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    expect(parameters(thai)).toEqual(parameters(english));
  }
  for (const item of [...MAPS, ...CHARACTER_LOOKS, ...ZONES]) {
    expect(Object.hasOwn(th, item.name)).toBe(true);
    if ("description" in item)
      expect(Object.hasOwn(th, item.description)).toBe(true);
  }
});
test("language interpolation preserves names, counts, and server notification meaning", () => {
  expect(translate("th", "{count} joined", { count: 2 })).toBe("เข้าร่วม 2 คน");
  expect(translate("en", "Join {room}", { room: "The Studio" })).toBe(
    "Join The Studio",
  );
  expect(translate("th", "Nudged Camera.")).toBe("สะกิด Camera แล้ว");
  expect(translate("th", "Robin nudged you. They're nearby!")).toBe(
    "Robin สะกิดคุณ เขาอยู่ใกล้ ๆ!",
  );
  expect(
    translate(
      "th",
      "Welcome to Fern Grove. Nearby voice reconnects automatically.",
    ),
  ).toBe("ยินดีต้อนรับสู่ สวนเฟิร์น เสียงใกล้ตัวจะเชื่อมต่อใหม่โดยอัตโนมัติ");
  expect(translate("th", "Could not access devices: Permission denied")).toBe(
    "เข้าถึงอุปกรณ์ไม่ได้: ไม่ได้รับอนุญาต",
  );
  expect(translate("th", "Nudged {name}.", { name: "{count} <Camera>" })).toBe(
    "สะกิด {count} <Camera> แล้ว",
  );
});
