import { ZONES } from "./world";

// Two tea houses face a central garden; their open south doors lead to the commons.
export const ZEN_ZONES = [
  { ...ZONES[0], x: 40, y: 40, w: 1040, h: 640, arrival: { x: 740, y: 350 } },
  { ...ZONES[1], x: 60, y: 70, w: 280, h: 200, arrival: { x: 200, y: 230 } },
  { ...ZONES[2], x: 780, y: 70, w: 280, h: 200, arrival: { x: 920, y: 230 } },
];
export const ZEN_DESKS = [
  { x: 130, y: 400 },
  { x: 130, y: 550 },
  { x: 870, y: 400 },
  { x: 870, y: 550 },
];
const trees = [
  [380, 105],
  [740, 105],
  [350, 410],
  [815, 410],
  [380, 650],
  [740, 650],
];
const lanterns = [
  [310, 310],
  [810, 310],
  [390, 580],
  [730, 580],
];
const rocks = [
  { x: 475, y: 195, w: 40, h: 26 },
  { x: 555, y: 220, w: 52, h: 32 },
  { x: 615, y: 175, w: 28, h: 22 },
];
const pond = [
  { x: 430, y: 405, w: 260, h: 45 },
  { x: 430, y: 515, w: 260, h: 45 },
];
const walls = [60, 780].flatMap((x) => [
  { x: x - 12, y: 60, w: 304, h: 12 },
  { x: x - 12, y: 60, w: 12, h: 222 },
  { x: x + 280, y: 60, w: 12, h: 222 },
  { x: x - 12, y: 270, w: 112, h: 12 },
  { x: x + 180, y: 270, w: 112, h: 12 },
]);
const tables = [60, 780].map((x) => ({ x: x + 92, y: 146, w: 96, h: 40 }));
export const ZEN_BLOCKS = [
  ...ZEN_DESKS.map((desk) => ({ ...desk, w: 116, h: 58 })),
  ...walls,
  ...tables,
  ...rocks,
  ...pond,
  ...trees.map(([x, y]) => ({ x: x - 7, y, w: 14, h: 18 })),
  ...lanterns.map(([x, y]) => ({ x: x - 9, y, w: 18, h: 14 })),
];

export function drawZenGarden(
  rect: (x: number, y: number, w: number, h: number, color: number) => void,
  label: (
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
  ) => void,
) {
  const ink = "#4c5c4b";
  rect(0, 0, 1120, 720, 0x577461);
  rect(32, 40, 1060, 644, 0x8fa582);
  rect(40, 56, 1040, 620, 0xb7c8a0);
  // Moss, stepping stones, and a broad loop keep each destination reachable.
  for (let i = 0; i < 130; i++) {
    const x = 48 + ((i * 137) % 1020),
      y = 65 + ((i * 79) % 598);
    rect(x, y, 8, 3, i % 3 ? 0xa7bc91 : 0xc8d3a9);
  }
  rect(168, 285, 784, 70, 0xded7bc);
  rect(270, 320, 70, 310, 0xded7bc);
  rect(780, 320, 70, 310, 0xded7bc);
  rect(300, 600, 520, 42, 0xded7bc);
  rect(340, 453, 440, 60, 0xded7bc);
  for (const x of [180, 900]) {
    for (let y = 287; y < 344; y += 24) rect(x, y, 40, 16, 0xa1a69a);
  }
  for (let x = 355; x < 780; x += 56) {
    rect(x, 312, 32, 18, 0xb4b3a1);
    rect(x + 3, 311, 24, 3, 0xf1ead3);
  }
  // Raked sand: nested rectangular ripples retain the crisp pixel-art language.
  rect(421, 137, 278, 145, 0x969b83);
  rect(427, 143, 266, 133, 0xe8e1c9);
  for (let i = 0; i < 6; i++) {
    const x = 436 + i * 10,
      y = 152 + i * 9,
      w = 248 - i * 20,
      h = 115 - i * 18;
    rect(x, y, w, 2, 0xcfc5a9);
    rect(x, y + h, w, 2, 0xcfc5a9);
    rect(x, y, 2, h, 0xcfc5a9);
    rect(x + w, y, 2, h, 0xcfc5a9);
  }
  for (const b of rocks) {
    rect(b.x, b.y, b.w, b.h, 0x707d74);
    rect(b.x + 5, b.y - 9, b.w - 10, b.h, 0x929e91);
    rect(b.x + 9, b.y - 9, b.w - 18, 5, 0xb7c0aa);
    rect(b.x - 3, b.y + b.h - 5, b.w + 6, 8, 0x879b70);
  }
  // Water is split around a wide, walkable bridge, matching the collision bounds.
  for (const b of pond) {
    rect(b.x, b.y, b.w, b.h, 0x7c9d95);
    rect(b.x + 5, b.y + 4, b.w - 10, b.h - 8, 0x8fbdaf);
    for (let i = 0; i < 5; i++)
      rect(b.x + 18 + i * 48, b.y + 12 + (i % 2) * 13, 24, 3, 0xb9dbca);
  }
  for (const [x, y] of [
    [474, 426],
    [622, 536],
  ]) {
    rect(x, y, 18, 7, 0xf7ead6);
    rect(x + 6, y, 7, 7, 0xd77758);
    rect(x - 5, y + 2, 5, 3, 0xe7be99);
  }
  rect(421, 460, 278, 45, 0x85604c);
  for (let x = 425; x < 695; x += 16) rect(x, 464, 13, 36, 0xc99c70);
  rect(421, 458, 278, 5, 0xe0b786);
  rect(421, 502, 278, 5, 0x6f5143);
  // Low desks and indigo cushions in four separate garden work areas.
  for (const { x, y } of ZEN_DESKS) {
    rect(x - 18, y - 13, 152, 117, 0x9eaf8c);
    rect(x - 13, y - 8, 142, 107, 0xd9cfac);
    for (let dx = -8; dx < 124; dx += 18) rect(x + dx, y - 5, 1, 100, 0xc5bb99);
    rect(x, y, 116, 58, 0x84664f);
    rect(x + 3, y + 3, 110, 47, 0xc39d72);
    for (const dx of [18, 70]) {
      rect(x + dx, y + 9, 29, 20, 0x425956);
      rect(x + dx + 3, y + 12, 23, 14, 0xabc8b6);
      rect(x + dx + 5, y + 33, 22, 5, 0xeee6cc);
      rect(x + dx, y + 74, 28, 23, 0x627e87);
      rect(x + dx + 3, y + 77, 22, 17, 0x819da0);
    }
  }
  for (const [index, x] of [60, 780].entries()) {
    rect(x, 72, 280, 198, 0xcab68e);
    for (let dx = 8; dx < 274; dx += 44) {
      rect(x + dx, 91, 39, 168, 0xded5af);
      rect(x + dx + 2, 174, 35, 2, 0xb6ab86);
    }
    // A shallow tiled eave leaves the meeting-room floor visible.
    rect(x - 18, 48, 316, 16, 0x465d59);
    rect(x - 9, 38, 298, 13, 0x607870);
    rect(x + 5, 32, 270, 8, 0x7e9380);
    for (let dx = 0; dx < 285; dx += 22) rect(x + dx, 40, 2, 21, 0x93a28b);
    label(index === 0 ? "THE STUDIO" : "THE LIBRARY", x + 140, 107, 12, ink);
    label("TEA HOUSE", x + 140, 127, 9, "#827658");
  }
  for (const b of walls) {
    rect(b.x, b.y, b.w, b.h, 0x80654f);
    if (b.w > b.h) rect(b.x, b.y, b.w, 3, 0xb99b74);
    else rect(b.x + 3, b.y, 3, b.h, 0xb99b74);
  }
  for (const b of tables) {
    rect(b.x, b.y, b.w, b.h, 0x89684f);
    rect(b.x + 3, b.y + 3, b.w - 6, b.h - 8, 0xc39b70);
    rect(b.x + 40, b.y + 11, 16, 12, 0x738976);
    for (const dx of [14, 62]) {
      rect(b.x + dx, b.y - 18, 22, 14, 0x7c8e85);
      rect(b.x + dx, b.y + b.h + 7, 22, 14, 0x7c8e85);
      rect(b.x + dx + 3, b.y + 15, 7, 5, 0xf0e5ca);
    }
  }
  const sakura = (x: number, y: number) => {
    rect(x - 29, y + 12, 60, 10, 0x99aa85);
    rect(x - 6, y - 24, 12, 42, 0x79584f);
    rect(x - 18, y - 28, 17, 7, 0x79584f);
    rect(x + 3, y - 39, 17, 7, 0x79584f);
    rect(x - 40, y - 53, 80, 28, 0xc8889d);
    rect(x - 49, y - 65, 98, 24, 0xe6a2b5);
    rect(x - 36, y - 84, 76, 29, 0xefb3c2);
    rect(x - 18, y - 94, 45, 24, 0xf7ccd5);
    rect(x - 37, y - 69, 30, 13, 0xf9d4dc);
    rect(x + 13, y - 54, 29, 11, 0xf6c3d0);
    for (const [dx, dy] of [
      [-24, -47],
      [26, -70],
      [-7, -78],
      [9, -37],
    ]) {
      rect(x + dx, y + dy, 6, 6, 0xffe4e6);
      rect(x + dx - 2, y + dy + 2, 10, 2, 0xffe4e6);
    }
    for (let i = 0; i < 9; i++)
      rect(x - 35 + ((i * 19) % 75), y + 23 + ((i * 11) % 24), 4, 2, 0xeec0cd);
  };
  for (const [x, y] of trees) sakura(x, y);
  for (const [x, y] of lanterns) {
    rect(x - 9, y + 8, 18, 6, 0x859084);
    rect(x - 4, y - 11, 8, 22, 0xa5af9d);
    rect(x - 10, y - 22, 20, 13, 0x798a7e);
    rect(x - 5, y - 20, 10, 9, 0xf5d69a);
    rect(x - 15, y - 27, 30, 5, 0x6d8074);
    rect(x - 9, y - 32, 18, 5, 0x91a08d);
  }
  // Bamboo hedges frame the garden without blocking its paths.
  for (const x of [18, 1093])
    for (let y = 350; y < 660; y += 37) {
      rect(x, y, 5, 31, 0x365e4e);
      rect(x - 8, y + 4, 20, 5, 0x7a9a6d);
      rect(x + 3, y + 15, 18, 4, 0x91ad78);
    }
  label("SAKURA GARDEN", 560, 78, 16, ink);
  label("THE ZEN GARDEN", 560, 119, 10, ink);
  label("THE KOI POND", 560, 587, 10, ink);
  label("4–8 PEOPLE · 8 WORK SEATS", 560, 665, 10, ink);
  label("↓", 200, 290, 16, ink);
  label("↓", 920, 290, 16, ink);
}
