import { waterRipple, type MapEffectSink } from "./map-effects";
import { ZONES } from "./world";

// A working farmstead: the farmhouse and barn host meetings while the yard
// between them is one big playground. No desks — eggs, crops, and fish instead.
export const FARM_ZONES = [
  { ...ZONES[0], arrival: { x: 740, y: 350 } },
  {
    ...ZONES[1],
    name: "The Farmhouse",
    subtitle: "Farmhouse meeting room · 8 seats",
    x: 60,
    y: 70,
    w: 300,
    h: 220,
    arrival: { x: 210, y: 260 },
  },
  {
    ...ZONES[2],
    name: "The Barn",
    subtitle: "Barn meeting room · 6 seats",
    x: 780,
    y: 70,
    w: 280,
    h: 210,
    arrival: { x: 920, y: 250 },
  },
];

const windmill = { x: 540, y: 120, w: 56, h: 56 };
const silo = { x: 640, y: 120, w: 46, h: 46 };
const coop = { x: 440, y: 380, w: 130, h: 80 };
// Picket fencing pens the hens in; the gate on the east side lines up with
// the path from the commons, and the coop forms part of the northern edge.
const henYardFence = [
  { x: 414, y: 380, w: 26, h: 10 },
  { x: 570, y: 380, w: 34, h: 10 },
  { x: 414, y: 380, w: 10, h: 220 },
  { x: 594, y: 380, w: 10, h: 60 },
  { x: 594, y: 500, w: 10, h: 100 },
  { x: 414, y: 590, w: 190, h: 10 },
];
// Hens roam inside this strip south of the coop, clear of every fence post.
export const FARM_HEN_YARD = { x: 424, y: 470, w: 160, h: 114 };
export const FARM_POND = { x: 110, y: 500, w: 250, h: 100 };
const hayBales = [
  { x: 470, y: 240, w: 44, h: 30 },
  { x: 770, y: 620, w: 44, h: 30 },
];
const trees = [
  [60, 340],
  [620, 250],
  [66, 620],
];
const farmhouseWalls = [
  { x: 48, y: 58, w: 324, h: 12 },
  { x: 48, y: 58, w: 12, h: 244 },
  { x: 360, y: 58, w: 12, h: 244 },
  { x: 48, y: 290, w: 120, h: 12 },
  { x: 300, y: 290, w: 72, h: 12 },
];
const barnWalls = [
  { x: 768, y: 58, w: 304, h: 12 },
  { x: 768, y: 58, w: 12, h: 234 },
  { x: 1056, y: 58, w: 12, h: 234 },
  { x: 768, y: 280, w: 100, h: 12 },
  { x: 960, y: 280, w: 108, h: 12 },
];
const farmhouseTable = { x: 130, y: 120, w: 90, h: 36 };
const barnHay = [
  { x: 810, y: 110, w: 50, h: 30 },
  { x: 1000, y: 110, w: 44, h: 30 },
];
export const FARM_BLOCKS = [
  ...farmhouseWalls,
  ...barnWalls,
  farmhouseTable,
  ...barnHay,
  windmill,
  silo,
  coop,
  ...henYardFence,
  FARM_POND,
  ...hayBales,
  ...trees.map(([x, y]) => ({ x: x - 7, y, w: 14, h: 18 })),
  { x: 1000, y: 320, w: 30, h: 26 },
];

// Hens lay eggs around these spots inside the pen.
export const FARM_EGG_SPOTS: [number, number][] = [
  [440, 510],
  [480, 540],
  [540, 510],
  [520, 570],
];
export const FARM_HENS: [number, number][] = [
  [450, 500],
  [520, 535],
  [555, 565],
  [470, 575],
];
export const FARM_PLOTS: [number, number][] = [
  [880, 500],
  [950, 500],
  [1020, 500],
  [880, 590],
  [950, 590],
  [1020, 590],
];
// Crops need this many milliseconds of sun before the E key can harvest them.
export const FARM_GROWTH = 30000;

export function drawFarmMap(
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
  const ink = "#3e5233";
  rect(0, 0, 1120, 720, 0x4e7a4a);
  rect(32, 40, 1060, 644, 0x77a55e);
  rect(40, 56, 1040, 620, 0x94c273);
  for (let i = 0; i < 120; i++) {
    const x = 48 + ((i * 137) % 1024),
      y = 64 + ((i * 89) % 600);
    rect(x, y, 6, 2, i % 3 ? 0x86b468 : 0xa5d182);
  }
  // Dirt paths link both room doors, the yard gate, the pond, and the field.
  rect(178, 300, 540, 44, 0xc9a36a);
  rect(700, 300, 80, 340, 0xc9a36a);
  rect(178, 284, 112, 20, 0xc9a36a);
  rect(868, 284, 102, 60, 0xc9a36a);
  rect(620, 344, 46, 160, 0xc9a36a);
  rect(596, 460, 70, 40, 0xc9a36a);
  for (let x = 190; x < 700; x += 54) {
    rect(x, 306, 30, 3, 0xb98f57);
    rect(x + 26, 328, 22, 3, 0xb98f57);
  }
  // The farmhouse: cream walls under a red-shingled roof.
  rect(38, 30, 344, 34, 0xc25b45);
  rect(46, 42, 328, 12, 0xa04a38);
  for (let x = 44; x < 378; x += 22) rect(x, 32, 14, 6, 0xd4725c);
  rect(60, 70, 300, 220, 0xd8c49a);
  for (let y = 86; y < 290; y += 18) rect(60, y, 300, 1, 0xc9b489);
  for (const wall of farmhouseWalls) {
    rect(wall.x, wall.y, wall.w, wall.h, 0xf0e3c8);
    rect(wall.x, wall.y, wall.w, 3, 0xd9c8a4);
  }
  rect(96, 74, 34, 24, 0x7fb2c9);
  rect(100, 78, 26, 16, 0xaad4e4);
  rect(288, 74, 34, 24, 0x7fb2c9);
  rect(292, 78, 26, 16, 0xaad4e4);
  rect(186, 286, 96, 8, 0xb98f57);
  rect(130, 120, 90, 36, 0x9a6b45);
  rect(134, 124, 82, 26, 0xc39b70);
  rect(150, 128, 14, 9, 0xf2ead2);
  rect(176, 130, 10, 12, 0x7fb2c9);
  for (const dx of [144, 196]) {
    rect(dx, 162, 22, 16, 0x8a5f3c);
    rect(dx + 2, 164, 18, 5, 0xa97b4e);
  }
  label("THE FARMHOUSE", 210, 100, 12, ink);
  // The barn: red planks, white trim, and a wide south doorway.
  rect(758, 30, 324, 34, 0x93402e);
  rect(766, 42, 308, 12, 0x7d3526);
  for (let x = 764; x < 1072; x += 24) rect(x, 32, 15, 6, 0xa8503c);
  rect(780, 70, 280, 210, 0xcbb083);
  for (let y = 88; y < 280; y += 24) rect(780, y, 280, 1, 0xbd9f72);
  for (const wall of barnWalls) {
    rect(wall.x, wall.y, wall.w, wall.h, 0xb5533c);
    rect(wall.x, wall.y, wall.w, 3, 0xd4725c);
  }
  rect(872, 262, 92, 20, 0xf2e6d0);
  rect(884, 266, 68, 16, 0x8a5f3c);
  rect(884, 266, 68, 3, 0x6b4526);
  for (const b of barnHay) {
    rect(b.x, b.y, b.w, b.h, 0xd9b45f);
    rect(b.x + 4, b.y + 4, b.w - 8, b.h - 10, 0xe8c56a);
    rect(b.x + 8, b.y + 7, b.w - 16, 2, 0xb99545);
  }
  rect(906, 74, 28, 20, 0x7fb2c9);
  rect(910, 78, 20, 12, 0xaad4e4);
  label("THE BARN", 920, 100, 12, ink);
  // Windmill and silo watch over the yard from the north meadow.
  rect(552, 78, 32, 100, 0xc9a36a);
  rect(552, 78, 32, 8, 0xa5814f);
  rect(560, 150, 16, 22, 0x7d5334);
  rect(548, 56, 40, 8, 0xb5533c);
  rect(546, 60, 16, 46, 0xf2e6d0);
  rect(532, 74, 44, 16, 0xf2e6d0);
  rect(548, 60, 12, 12, 0x7d5334);
  rect(638, 70, 50, 96, 0xc0c8cc);
  rect(638, 92, 50, 3, 0x9aa4aa);
  rect(638, 122, 50, 3, 0x9aa4aa);
  rect(642, 54, 42, 18, 0x9aa4aa);
  rect(648, 58, 12, 8, 0xb8c0c4);
  // The hen yard: a coop with a ramp inside white picket fencing. The east
  // side has a gated opening exactly where the path meets the fence.
  rect(432, 348, 146, 22, 0x8a5f3c);
  rect(440, 362, 130, 98, 0xa97b4e);
  rect(440, 362, 130, 5, 0xc1935f);
  rect(488, 416, 34, 44, 0x6b4526);
  rect(486, 456, 38, 14, 0xc9a36a);
  rect(452, 374, 26, 20, 0x7fb2c9);
  rect(522, 374, 26, 20, 0x7fb2c9);
  const fence = (f: { x: number; y: number; w: number; h: number }) => {
    rect(f.x, f.y, f.w, f.h, 0xd9c8a4);
    if (f.w > f.h) {
      rect(f.x, f.y + 1, f.w, 3, 0xf2ead2);
      rect(f.x, f.y + f.h - 4, f.w, 3, 0xf2ead2);
      for (let px = f.x; px <= f.x + f.w - 6; px += 22)
        rect(px, f.y - 3, 6, f.h + 6, 0xf2ead2);
    } else {
      rect(f.x + 1, f.y, 3, f.h, 0xf2ead2);
      rect(f.x + f.w - 4, f.y, 3, f.h, 0xf2ead2);
      for (let py = f.y; py <= f.y + f.h - 6; py += 22)
        rect(f.x - 3, py, f.w + 6, 6, 0xf2ead2);
    }
  };
  for (const f of henYardFence) fence(f);
  rect(590, 434, 16, 9, 0x9a6b45);
  rect(590, 497, 16, 9, 0x9a6b45);
  label("THE HEN YARD", 505, 618, 10, ink);
  label("←", 640, 484, 14, ink);
  // The pond: cool water, lily pads, cattails, and a small fishing dock.
  rect(102, 492, 266, 116, 0x4f8db0);
  rect(110, 500, 250, 100, 0x5f9ec0);
  rect(126, 514, 218, 72, 0x4f8db0);
  for (let i = 0; i < 7; i++)
    waterRipple(
      rect,
      effect,
      136 + i * 32,
      522 + (i % 3) * 22,
      26,
      3,
      0xd8f1df,
    );
  for (const [lx, ly] of [
    [150, 545],
    [210, 570],
    [300, 540],
  ] as const) {
    rect(lx, ly, 16, 9, 0x6fae62);
    rect(lx + 4, ly + 2, 8, 5, 0x8fc47e);
  }
  rect(304, 536, 8, 7, 0xe6a2b5);
  for (const [cx, cy] of [
    [96, 520],
    [90, 552],
    [368, 612],
  ] as const) {
    rect(cx, cy, 4, 26, 0x6f8f4f);
    rect(cx - 2, cy - 8, 8, 12, 0x8a5f3c);
  }
  rect(368, 528, 44, 40, 0x9a6b45);
  for (let y = 532; y < 568; y += 9) rect(368, y, 44, 2, 0x7d5334);
  rect(364, 524, 52, 5, 0xc39b70);
  label("THE POND", 235, 640, 10, ink);
  // The crop field: six tilled plots inside a low rail fence.
  rect(846, 466, 208, 162, 0x7a5438);
  rect(852, 472, 196, 150, 0x8a6242);
  for (const [px, py] of FARM_PLOTS) {
    rect(px - 26, py - 16, 52, 32, 0x7a5438);
    rect(px - 22, py - 8, 44, 3, 0x6b4526);
    rect(px - 22, py + 2, 44, 3, 0x6b4526);
    rect(px - 22, py - 13, 44, 2, 0x9a7050);
  }
  for (let x = 846; x < 1054; x += 34) {
    rect(x, 456, 8, 14, 0xc9b489);
    rect(x, 626, 8, 14, 0xc9b489);
  }
  rect(846, 460, 208, 4, 0xd9c8a4);
  label("CROP FIELD", 950, 448, 10, ink);
  for (const b of hayBales) {
    rect(b.x, b.y, b.w, b.h, 0xd9b45f);
    rect(b.x + 5, b.y + 5, b.w - 10, b.h - 10, 0xe8c56a);
    rect(b.x + 10, b.y + 8, b.w - 20, 2, 0xb99545);
  }
  rect(1000, 320, 30, 26, 0x9a6b45);
  rect(1003, 323, 24, 8, 0xc39b70);
  rect(1003, 335, 24, 8, 0xc39b70);
  const appleTree = (x: number, y: number) => {
    // Golden leaves read clearly against the green canopy.
    effect?.({
      kind: "leaves",
      x,
      y: y - 62,
      spread: 34,
      fall: 110,
      color: 0xe8c56a,
    });
    rect(x - 6, y - 26, 12, 32, 0x775943);
    rect(x - 30, y - 50, 60, 30, 0x4c7957);
    rect(x - 24, y - 62, 46, 32, 0x69985f);
    rect(x - 14, y - 70, 28, 28, 0x8bb16f);
    for (const [ax, ay] of [
      [-20, -48],
      [14, -56],
      [-4, -38],
    ] as const)
      rect(x + ax, y + ay, 6, 6, 0xd75b4a);
  };
  for (const [x, y] of trees) appleTree(x, y);
  for (const x of [20, 1096])
    for (let y = 340; y < 660; y += 34) {
      // A few bamboo clumps shed pale leaves along the map edges.
      if ((y - 340) % 102 === 0)
        effect?.({
          kind: "leaves",
          x: x + 4,
          y: y - 8,
          spread: 14,
          fall: 56,
          color: 0xb9d18a,
        });
      rect(x, y, 4, 28, 0x6f8f4f);
      rect(x - 7, y + 4, 18, 5, 0x86b468);
      rect(x + 3, y + 15, 16, 4, 0xa5d182);
    }
  label("SUNNY ACRES", 560, 652, 15, ink);
  label("4–8 PEOPLE · MEET AT THE FARMHOUSE & BARN", 560, 676, 10, ink);
  label("↑", 234, 318, 16, ink);
  label("↑", 919, 318, 16, ink);
}
