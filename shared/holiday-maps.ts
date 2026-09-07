import { ZONES } from "./world";

type Rect = (x: number, y: number, w: number, h: number, color: number) => void;
type Label = (
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
) => void;
const commons = { ...ZONES[0], w: 1040, arrival: { x: 740, y: 350 } };
export const TEMPLE_ZONES = [
  commons,
  { ...ZONES[1], x: 420, y: 90, w: 280, h: 200, arrival: { x: 560, y: 250 } },
  { ...ZONES[2], x: 70, y: 440, w: 260, h: 220, arrival: { x: 200, y: 480 } },
];
export const TEMPLE_DESKS = [
  { x: 110, y: 150 },
  { x: 110, y: 300 },
  { x: 870, y: 150 },
  { x: 870, y: 420 },
];
const templeWalls = [
  { x: 408, y: 78, w: 304, h: 12 },
  { x: 408, y: 78, w: 12, h: 224 },
  { x: 700, y: 78, w: 12, h: 224 },
  { x: 408, y: 290, w: 112, h: 12 },
  { x: 600, y: 290, w: 112, h: 12 },
  { x: 58, y: 428, w: 102, h: 12 },
  { x: 240, y: 428, w: 102, h: 12 },
  { x: 58, y: 428, w: 12, h: 244 },
  { x: 330, y: 428, w: 12, h: 244 },
  { x: 58, y: 660, w: 284, h: 12 },
];
const templeTables = [
  { x: 512, y: 170, w: 96, h: 40 },
  { x: 152, y: 550, w: 96, h: 40 },
];
const templePond = { x: 880, y: 585, w: 145, h: 58 };
const chedi = { x: 515, y: 395, w: 90, h: 54 };
const templeTrees = [
  [350, 180],
  [355, 385],
  [385, 620],
  [810, 630],
  [1050, 390],
];
export const TEMPLE_BLOCKS = [
  ...TEMPLE_DESKS.map((d) => ({ ...d, w: 116, h: 58 })),
  ...templeWalls,
  ...templeTables,
  templePond,
  chedi,
  ...templeTrees.map(([x, y]) => ({ x: x - 7, y, w: 14, h: 18 })),
];
export const BEACH_ZONES = [
  commons,
  { ...ZONES[1], x: 60, y: 100, w: 270, h: 210, arrival: { x: 200, y: 270 } },
  { ...ZONES[2], x: 840, y: 440, w: 230, h: 220, arrival: { x: 880, y: 570 } },
];
export const BEACH_DESKS = [
  { x: 450, y: 150 },
  { x: 650, y: 150 },
  { x: 430, y: 550 },
  { x: 610, y: 550 },
];
const beachWalls = [
  { x: 48, y: 88, w: 294, h: 12 },
  { x: 48, y: 88, w: 12, h: 234 },
  { x: 330, y: 88, w: 12, h: 234 },
  { x: 48, y: 310, w: 112, h: 12 },
  { x: 240, y: 310, w: 102, h: 12 },
  { x: 828, y: 428, w: 254, h: 12 },
  { x: 1070, y: 428, w: 12, h: 244 },
  { x: 828, y: 660, w: 254, h: 12 },
  { x: 828, y: 428, w: 12, h: 92 },
  { x: 828, y: 600, w: 12, h: 72 },
];
const beachTables = [
  { x: 152, y: 180, w: 96, h: 40 },
  { x: 938, y: 535, w: 96, h: 40 },
];
// The bay wraps around a broad pier. Each water rectangle is also a collision block.
const sea = [
  { x: 40, y: 460, w: 340, h: 215 },
  { x: 380, y: 460, w: 150, h: 50 },
  { x: 650, y: 460, w: 65, h: 50 },
  { x: 930, y: 60, w: 150, h: 338 },
];
const beachPalms = [
  [80, 400],
  [390, 200],
  [820, 130],
  [865, 380],
  [1040, 625],
];
export const BEACH_BLOCKS = [
  ...BEACH_DESKS.map((d) => ({ ...d, w: 116, h: 58 })),
  ...beachWalls,
  ...beachTables,
  ...sea,
  ...beachPalms.map(([x, y]) => ({ x: x - 7, y, w: 14, h: 18 })),
];

function workDesks(
  rect: Rect,
  desks: { x: number; y: number }[],
  beach: boolean,
) {
  for (const { x, y } of desks) {
    rect(x - 16, y - 12, 148, 118, beach ? 0xd6ad7c : 0xd8b88e);
    rect(x - 12, y - 8, 140, 110, beach ? 0xf0d2a0 : 0xf0dfb8);
    rect(x, y, 116, 58, beach ? 0xb48661 : 0x967046);
    rect(x + 3, y + 3, 110, 48, beach ? 0xe9c18d : 0xcba879);
    for (const dx of [18, 70]) {
      rect(x + dx, y + 10, 29, 20, 0x456765);
      rect(x + dx + 3, y + 13, 23, 14, 0xb4d7c9);
      rect(x + dx + 4, y + 34, 23, 5, 0xf8efdc);
      rect(x + dx, y + 74, 28, 23, beach ? 0x5caaa9 : 0xa25d55);
      rect(x + dx + 3, y + 77, 22, 5, beach ? 0xbde2d1 : 0xe6b284);
    }
  }
}
function meetingTables(
  rect: Rect,
  tables: typeof templeTables,
  beach: boolean,
) {
  for (const b of tables) {
    rect(b.x, b.y, b.w, b.h, beach ? 0xa47d57 : 0x8b5d42);
    rect(b.x + 3, b.y + 3, b.w - 6, b.h - 8, beach ? 0xe3bd87 : 0xc99562);
    for (const dx of [14, 62]) {
      rect(b.x + dx, b.y - 19, 22, 14, beach ? 0x559d9d : 0xa26057);
      rect(b.x + dx, b.y + b.h + 7, 22, 14, beach ? 0x559d9d : 0xa26057);
    }
    rect(b.x + 40, b.y + 12, 16, 11, beach ? 0xf6e5c3 : 0xf0ce7f);
  }
}
export function drawTemple(rect: Rect, label: Label) {
  const ink = "#715e43";
  rect(0, 0, 1120, 720, 0x869977);
  rect(32, 40, 1060, 644, 0xab9d80);
  rect(40, 56, 1040, 620, 0xe3d2ae);
  // An open stone courtyard connects a north hall and a southwest sala.
  for (let x = 45; x < 1080; x += 42) rect(x, 57, 1, 616, 0xd6c6a2);
  for (let y = 65; y < 675; y += 42) rect(42, y, 1036, 1, 0xd6c6a2);
  rect(445, 308, 230, 225, 0xc6a578);
  rect(453, 316, 214, 209, 0xf0dfb8);
  rect(470, 333, 180, 175, 0xd9c49b);
  rect(480, 343, 160, 155, 0xeee0bd);
  for (const x of [460, 644])
    for (const y of [323, 511]) {
      rect(x, y, 10, 10, 0xbb935c);
      rect(x + 3, y + 3, 4, 4, 0xf7e4ac);
    }
  for (const [x, y, w, h] of [
    [80, 122, 173, 287],
    [844, 120, 168, 154],
    [844, 390, 168, 151],
  ]) {
    rect(x, y, w, h, 0x9fac83);
    rect(x + 7, y + 7, w - 14, h - 14, 0xbec899);
  }
  for (const room of TEMPLE_ZONES.filter((z) => z.id !== "floor")) {
    rect(room.x, room.y, room.w, room.h, 0xf3e4be);
    for (let dx = 10; dx < room.w; dx += 38)
      rect(room.x + dx, room.y + 8, 1, room.h - 16, 0xe3cba1);
    label(
      room.id === "studio" ? "THE STUDIO" : "THE LIBRARY",
      room.x + room.w / 2,
      room.y + 28,
      12,
      ink,
    );
    label(
      room.id === "studio" ? "THE GOLDEN HALL" : "THE GARDEN SALA",
      room.x + room.w / 2,
      room.y + 48,
      9,
      ink,
    );
  }
  // Tiered terracotta roofs, gold edges, and chofa-inspired finials.
  for (const [x, y, w] of [
    [408, 76, 304],
    [58, 426, 284],
  ]) {
    rect(x - 7, y - 12, w + 14, 14, 0x865043);
    rect(x - 11, y - 15, w + 22, 4, 0xd9b264);
    rect(x + 8, y - 28, w - 16, 14, 0xad6650);
    rect(x + 4, y - 31, w - 8, 4, 0xf0cc7a);
    rect(x + 35, y - 42, w - 70, 12, 0xc48055);
    rect(x + 31, y - 45, w - 62, 4, 0xf2d48b);
    for (const edge of [x - 11, x + w + 6]) {
      rect(edge, y - 30, 5, 19, 0xe6bc69);
      rect(edge + 1, y - 36, 3, 8, 0xf9dfa0);
    }
    for (let dx = 23; dx < w - 10; dx += 24)
      rect(x + dx, y - 24, 2, 10, 0xd89160);
  }
  for (const b of templeWalls) {
    rect(b.x, b.y, b.w, b.h, 0xb58e5b);
    if (b.w > b.h) rect(b.x, b.y, b.w, 3, 0xf3d897);
    else rect(b.x + 3, b.y, 4, b.h, 0xf3d897);
  }
  meetingTables(rect, templeTables, false);
  workDesks(rect, TEMPLE_DESKS, false);
  // A small golden chedi anchors the courtyard; its plinth blocks movement.
  rect(chedi.x, chedi.y + 36, chedi.w, 18, 0xb58d4f);
  rect(chedi.x + 5, chedi.y + 30, 80, 14, 0xe0b85d);
  rect(530, 410, 60, 18, 0xf1d17c);
  rect(540, 390, 40, 26, 0xd3a846);
  rect(546, 373, 28, 20, 0xecc765);
  rect(552, 354, 16, 23, 0xf2d888);
  rect(557, 331, 6, 29, 0xd8ad50);
  rect(559, 320, 2, 16, 0xffe8a6);
  for (const [x, y] of templeTrees) {
    rect(x - 25, y + 10, 52, 12, 0xb3b58a);
    rect(x - 6, y - 23, 12, 41, 0x92704e);
    rect(x - 34, y - 48, 70, 30, 0x718d64);
    rect(x - 25, y - 64, 52, 25, 0x92a77a);
    rect(x - 13, y - 72, 28, 20, 0xafbb89);
    for (const [dx, dy] of [
      [-22, -42],
      [15, -48],
      [-3, -60],
    ]) {
      rect(x + dx, y + dy, 8, 8, 0xfff0c3);
      rect(x + dx + 3, y + dy + 3, 3, 3, 0xe4bd61);
    }
  }
  const p = templePond;
  rect(p.x, p.y, p.w, p.h, 0xafb39a);
  rect(p.x + 5, p.y + 5, p.w - 10, p.h - 10, 0x8db6a6);
  for (const dx of [20, 62, 103]) {
    rect(p.x + dx, p.y + 26, 20, 9, 0x71976b);
    rect(p.x + dx + 5, p.y + 20, 10, 7, 0xe6a4b7);
    rect(p.x + dx + 8, p.y + 16, 4, 8, 0xf6cbce);
  }
  label("SIAM COURTYARD", 560, 552, 16, ink);
  label("THE LOTUS POND", 950, 566, 10, ink);
  label("4–8 PEOPLE · 8 WORK SEATS", 560, 578, 10, ink);
  label("↓", 560, 310, 15, ink);
  label("↓", 200, 447, 15, ink);
}
export function drawBeach(rect: Rect, label: Label) {
  const ink = "#586d69";
  rect(0, 0, 1120, 720, 0x5caeaf);
  rect(32, 40, 1060, 644, 0xddbf88);
  rect(40, 56, 1040, 620, 0xf3dfad);
  for (let i = 0; i < 150; i++) {
    const x = 46 + ((i * 137) % 1026),
      y = 65 + ((i * 83) % 600);
    rect(x, y, i % 2 ? 5 : 9, 2, 0xe4cb94);
  }
  // Let the sea continue beyond the map edge so the coast reads as an open bay.
  rect(0, 460, 380, 260, 0x70bfbb);
  rect(930, 0, 190, 398, 0x70bfbb);
  for (const b of sea) {
    rect(b.x, b.y, b.w, b.h, 0x93d4c8);
    rect(b.x + 6, b.y + 7, b.w - 12, b.h - 14, 0x70bfbb);
    for (let y = b.y + 19; y < b.y + b.h - 8; y += 27)
      for (let x = b.x + 15; x < b.x + b.w - 25; x += 56) {
        rect(x, y, 26, 3, 0xb9e7d4);
        rect(x + 11, y + 7, 21, 2, 0x9ad9cc);
      }
  }
  // Two pier workstations sit over the bay, connected by a central boardwalk.
  rect(390, 515, 424, 150, 0xad885c);
  rect(535, 430, 110, 90, 0xad885c);
  rect(715, 430, 112, 235, 0xad885c);
  rect(805, 532, 48, 60, 0xad885c);
  for (let y = 519; y < 662; y += 14) rect(394, y, 416, 11, 0xdbb784);
  for (let y = 434; y < 519; y += 14) rect(539, y, 102, 11, 0xdbb784);
  for (let y = 434; y < 662; y += 14) rect(719, y, 104, 11, 0xdbb784);
  for (let x = 390; x < 825; x += 62) {
    rect(x, 662, 8, 15, 0x916f52);
    rect(x - 2, 659, 12, 5, 0xf1d09b);
  }
  for (const room of BEACH_ZONES.filter((z) => z.id !== "floor")) {
    rect(room.x, room.y, room.w, room.h, 0xd0b086);
    for (let y = room.y + 6; y < room.y + room.h; y += 16)
      rect(room.x + 5, y, room.w - 10, 13, 0xead0a0);
    label(
      room.id === "studio" ? "THE STUDIO" : "THE LIBRARY",
      room.x + room.w / 2,
      room.y + 37,
      12,
      ink,
    );
    label(
      room.id === "studio" ? "THE SURF CLUB" : "THE PIER LOUNGE",
      room.x + room.w / 2,
      room.y + 58,
      9,
      ink,
    );
    rect(room.x - 17, room.y - 12, room.w + 34, 14, 0xb58e5d);
    rect(room.x - 7, room.y - 24, room.w + 14, 13, 0xd1aa68);
    rect(room.x + 13, room.y - 34, room.w - 26, 11, 0xe8c888);
    for (let dx = 0; dx < room.w; dx += 15)
      rect(room.x + dx, room.y - 20, 4, 18, 0xf0d397);
  }
  for (const b of beachWalls) {
    rect(b.x, b.y, b.w, b.h, 0xa1825e);
    if (b.w > b.h) rect(b.x, b.y, b.w, 3, 0xf6dcaa);
    else rect(b.x + 3, b.y, 4, b.h, 0xf6dcaa);
  }
  meetingTables(rect, beachTables, true);
  workDesks(rect, BEACH_DESKS, true);
  // Striped parasols, surfboards, and leaning coconut palms give the beach its colour.
  for (const x of [470, 690]) {
    rect(x + 40, 115, 4, 25, 0xa9865d);
    rect(x + 3, 101, 78, 16, 0xd98573);
    rect(x + 15, 89, 54, 13, 0xecac8f);
    rect(x + 29, 83, 26, 10, 0xf2caa4);
    rect(x + 29, 94, 12, 23, 0xffedc7);
    rect(x + 55, 101, 12, 16, 0xffedc7);
  }
  for (const [x, y] of beachPalms) {
    rect(x - 23, y + 12, 49, 10, 0xd8c496);
    rect(x - 6, y - 20, 12, 38, 0xaf8556);
    rect(x - 1, y - 47, 10, 30, 0xc19a64);
    rect(x + 5, y - 67, 9, 24, 0xcba671);
    rect(x - 32, y - 73, 82, 12, 0x518c71);
    rect(x - 47, y - 61, 40, 10, 0x639e79);
    rect(x + 34, y - 60, 31, 10, 0x639e79);
    rect(x - 14, y - 86, 28, 16, 0x7cac7e);
    rect(x + 15, y - 89, 26, 18, 0x8bb787);
    rect(x - 31, y - 50, 10, 17, 0x518c71);
    rect(x + 42, y - 48, 10, 17, 0x518c71);
    rect(x + 3, y - 61, 8, 8, 0x98734f);
    rect(x + 13, y - 58, 8, 8, 0xb18a57);
  }
  for (const [x, color] of [
    [110, 0xdc8974],
    [135, 0x75b4b2],
  ]) {
    rect(x, 330, 15, 45, color);
    rect(x + 4, 325, 7, 55, color);
    rect(x + 6, 335, 3, 33, 0xffebbf);
  }
  for (const [x, y] of [
    [375, 350],
    [660, 393],
    [920, 340],
  ]) {
    rect(x - 8, y, 17, 3, 0xe9a17c);
    rect(x - 2, y - 6, 5, 16, 0xe9a17c);
    rect(x - 6, y + 5, 13, 3, 0xf5ba8e);
  }
  label("SUMMER COVE", 575, 350, 17, ink);
  label("A LITTLE SUN, A LITTLE WORK", 575, 375, 10, ink);
  label("4–8 PEOPLE · 8 WORK SEATS", 560, 690, 10, "#e0f0d5");
  label("↓", 200, 331, 15, ink);
  label("→", 810, 564, 15, ink);
}
