import { ZONES } from "./world";
import type { MapEffectSink } from "./map-effects";

// Each retreat owns its furniture, room bounds and collision geometry.
export const CAMP_DESKS = [
  { x: 150, y: 210 },
  { x: 430, y: 150 },
  { x: 140, y: 470 },
  { x: 440, y: 480 },
];
export const MOON_DESKS = [
  { x: 420, y: 140 },
  { x: 620, y: 140 },
  { x: 120, y: 430 },
  { x: 420, y: 500 },
];
export const CAMP_ZONES = [
  { ...ZONES[0], arrival: { x: 740, y: 350 } },
  { ...ZONES[1], x: 820, y: 90, w: 250, h: 210, arrival: { x: 860, y: 260 } },
  { ...ZONES[2], x: 820, y: 440, w: 250, h: 210, arrival: { x: 860, y: 610 } },
];
export const MOON_ZONES = [
  { ...ZONES[0], arrival: { x: 740, y: 350 } },
  { ...ZONES[1], x: 70, y: 90, w: 250, h: 210, arrival: { x: 110, y: 260 } },
  { ...ZONES[2], x: 820, y: 440, w: 250, h: 210, arrival: { x: 860, y: 610 } },
];
const roomWalls = (zones: typeof ZONES) =>
  zones.slice(1).flatMap(({ x, y, w, h }) => [
    { x, y, w, h: 10 },
    { x, y, w: 10, h: h - 70 },
    { x: x + w - 10, y, w: 10, h },
    { x, y: y + h - 10, w, h: 10 },
    { x: x + 80, y: y + 70, w: 100, h: 48 },
  ]);
const fire = { x: 540, y: 320, w: 60, h: 50 };
export const CAMP_BLOCKS = [
  ...CAMP_DESKS.map((d) => ({ ...d, w: 116, h: 58 })),
  ...CAMP_DESKS.map((d) => ({ x: d.x, y: d.y - 76, w: 116, h: 50 })),
  ...roomWalls(CAMP_ZONES),
  fire,
];
export const MOON_BLOCKS = [
  ...MOON_DESKS.map((d) => ({ ...d, w: 116, h: 58 })),
  ...roomWalls(MOON_ZONES),
  { x: 470, y: 310, w: 100, h: 70 },
];

export function drawRetreat(
  space: boolean,
  rect: (x: number, y: number, w: number, h: number, color: number) => void,
  label: (
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
  ) => void,
  effect?: MapEffectSink,
) {
  const ground = space ? 0x252b41 : 0x557567;
  const floor = space ? 0x87949d : 0x9bad87;
  const path = space ? 0xc4ccc4 : 0xd5c39e;
  const ink = space ? "#303e50" : "#3c5447";
  rect(0, 0, 1120, 720, ground);
  if (space) {
    // Lunar regolith remains walkable between the connected pressure decks.
    rect(40, 56, 1040, 620, 0x495064);
    for (let i = 0; i < 90; i++) {
      const x = 50 + ((i * 137) % 1010),
        y = 70 + ((i * 73) % 580);
      rect(x, y, 8 + (i % 9), 3, 0x596173);
    }
  } else {
    for (let i = 0; i < 160; i++) {
      const x = 46 + ((i * 137) % 1020),
        y = 72 + ((i * 89) % 570);
      rect(x, y, 3, 6, 0x6c8870);
      rect(x - 2, y + 2, 7, 2, 0x6c8870);
    }
  }
  // Moon: linked decks in a cross. Camp: scattered clearings along a woodland trail.
  if (space) {
    for (let i = 0; i < 85; i++)
      rect(
        (i * 167 + 19) % 1120,
        i % 2 ? 697 + (i % 16) : 8 + (i % 30),
        2,
        2,
        0xb4c3c7,
      );
    rect(350, 64, 440, 240, floor);
    rect(70, 330, 740, 310, floor);
    rect(350, 280, 460, 100, path);
    rect(310, 190, 70, 90, path);
    rect(790, 540, 80, 70, path);
    for (let y = 350; y < 640; y += 36) rect(80, y, 720, 1, 0x76848e);
    rect(450, 290, 140, 110, 0x596f7b);
    rect(470, 310, 100, 70, 0x33495b);
    rect(480, 320, 80, 45, 0x99c5bf);
    rect(510, 325, 20, 35, 0xdce7d7);
    label("LUNAR OUTPOST", 560, 91, 15, "#eceddf");
    label("OBSERVATION DECK", 540, 430, 11, ink);
  } else {
    rect(80, 100, 570, 200, floor);
    rect(90, 420, 550, 215, floor);
    rect(360, 275, 320, 145, floor);
    rect(80, 320, 970, 70, path);
    rect(690, 230, 100, 410, path);
    rect(240, 250, 60, 245, path);
    rect(520, 210, 60, 300, path);
    rect(770, 230, 80, 50, path);
    rect(770, 580, 80, 50, path);
    rect(520, 305, 100, 85, 0xb5a98e);
    rect(fire.x, fire.y, fire.w, fire.h, 0x7b8172);
    rect(549, 332, 42, 28, 0x6b5948);
    rect(555, 338, 30, 18, 0xd99865);
    rect(563, 321, 15, 31, 0xf0c789);
    label("PINE CAMP", 700, 83, 15, "#f2e5c7");
    label("THE FIRE CIRCLE", 565, 407, 10, ink);
    for (let i = 0; i < 24; i++) {
      const x = 30 + i * 46,
        y = i % 2 ? 704 : 41;
      rect(x - 4, y - 9, 8, 22, 0x816951);
      for (let tier = 0; tier < 4; tier++)
        rect(
          x - 25 + tier * 6,
          y - 20 - tier * 12,
          50 - tier * 12,
          16,
          tier % 2 ? 0x76917b : 0x3f6756,
        );
      effect?.({
        kind: "leaves",
        x,
        y: y - 46,
        spread: 20,
        fall: 65,
        color: 0xc3bd8a,
      });
    }
  }
  for (const { x, y } of space ? MOON_DESKS : CAMP_DESKS) {
    rect(x - 12, y - 12, 140, 124, space ? 0x738893 : 0xb9bc97);
    if (!space) {
      for (let row = 0; row < 6; row++)
        rect(
          x + 50 - row * 10,
          y - 90 + row * 10,
          16 + row * 20,
          11,
          row < 3 ? 0xe1cba2 : 0xbea478,
        );
      rect(x + 43, y - 62, 30, 32, 0x776c52);
    }
    rect(x, y, 116, 58, space ? 0x506779 : 0x88775a);
    rect(x + 4, y + 4, 108, 45, space ? 0xd3dacf : 0xd9c69f);
    for (const dx of [18, 70]) {
      rect(x + dx, y + 9, 28, 21, 0x475e5b);
      rect(x + dx + 3, y + 12, 22, 14, 0xa5ccc0);
      rect(x + dx, y + 35, 28, 4, 0xf0e7d1);
      rect(x + dx, y + 77, 28, 20, space ? 0x576d80 : 0x7e8f70);
    }
  }
  const zones = space ? MOON_ZONES : CAMP_ZONES;
  for (const z of zones.slice(1)) {
    rect(z.x, z.y, z.w, z.h, space ? 0xb5c1be : 0xd3c09b);
    for (let y = z.y + 15; y < z.y + z.h; y += 18)
      rect(z.x + 10, y, z.w - 20, 1, space ? 0xa2b1b2 : 0xbfac88);
    rect(z.x + 12, z.y + 12, z.w - 24, 8, space ? 0x9dccc7 : 0xe9dbb8);
    label(z.name.toUpperCase(), z.x + z.w / 2, z.y + 40, 12, ink);
    label("→", z.x + 17, z.y + z.h - 35, 16, ink);
  }
  for (const b of roomWalls(zones)) {
    rect(b.x, b.y, b.w, b.h, space ? 0x4c6476 : 0x827457);
    rect(
      b.x + 2,
      b.y + 2,
      b.w - 4,
      Math.min(b.h - 4, 5),
      space ? 0xb8dad0 : 0xecdbad,
    );
  }
  for (const z of zones.slice(1)) {
    const x = z.x + 80,
      y = z.y + 70;
    rect(x + 4, y + 5, 92, 34, space ? 0xc4d0c7 : 0xdcc89f);
    for (const dx of [12, 64]) {
      rect(x + dx, y - 20, 22, 14, space ? 0x667f8c : 0x8c9979);
      rect(x + dx, y + 56, 22, 14, space ? 0x667f8c : 0x8c9979);
    }
    rect(x + 40, y + 12, 18, 13, 0xf1e8cf);
    rect(z.x + z.w - 35, z.y + 145, 15, 22, space ? 0x92beb4 : 0x71916a);
  }
}
