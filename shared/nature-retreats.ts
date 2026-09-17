import { ZONES } from "./world";
import { waterRipple, type MapEffectSink } from "./map-effects";

type Box = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };
type Retreat = {
  id: string;
  name: string;
  ground: number;
  lawn: number;
  accent: number;
  rooms: Point[];
  desks: Point[];
  water: Box[];
  paths: Box[];
  trees: Point[];
};

export const NATURE_RETREATS: Retreat[] = [
  {
    id: "cloudpeak-small",
    name: "Cloudpeak Lodge",
    ground: 0x778c8a,
    lawn: 0xb9c7b0,
    accent: 0x9b8170,
    rooms: [
      { x: 70, y: 90 },
      { x: 820, y: 90 },
    ],
    desks: [
      { x: 370, y: 180 },
      { x: 570, y: 230 },
      { x: 190, y: 490 },
      { x: 470, y: 490 },
    ],
    water: [
      { x: 80, y: 340, w: 170, h: 75 },
      { x: 100, y: 290, w: 36, h: 50 },
    ],
    paths: [
      { x: 170, y: 280, w: 810, h: 45 },
      { x: 670, y: 300, w: 130, h: 320 },
      { x: 140, y: 590, w: 540, h: 36 },
    ],
    trees: [
      { x: 330, y: 400 },
      { x: 950, y: 470 },
      { x: 980, y: 620 },
      { x: 90, y: 620 },
    ],
  },
  {
    id: "mangrove-small",
    name: "Mangrove Hideaway",
    ground: 0x527d73,
    lawn: 0xa2b89b,
    accent: 0x997e60,
    rooms: [
      { x: 70, y: 80 },
      { x: 820, y: 430 },
    ],
    desks: [
      { x: 400, y: 120 },
      { x: 850, y: 180 },
      { x: 160, y: 470 },
      { x: 470, y: 430 },
    ],
    water: [
      { x: 80, y: 330, w: 300, h: 65 },
      { x: 580, y: 85, w: 100, h: 185 },
      { x: 860, y: 330, w: 180, h: 55 },
      { x: 340, y: 545, w: 80, h: 80 },
    ],
    paths: [
      { x: 100, y: 275, w: 930, h: 48 },
      { x: 690, y: 180, w: 110, h: 450 },
      { x: 450, y: 260, w: 64, h: 360 },
      { x: 100, y: 590, w: 240, h: 42 },
      { x: 420, y: 590, w: 620, h: 42 },
    ],
    trees: [
      { x: 90, y: 440 },
      { x: 600, y: 620 },
      { x: 1030, y: 100 },
      { x: 340, y: 180 },
    ],
  },
  {
    id: "canopy-small",
    name: "Rainforest Canopy",
    ground: 0x3f6358,
    lawn: 0x78977a,
    accent: 0x94775a,
    rooms: [
      { x: 80, y: 400 },
      { x: 820, y: 90 },
    ],
    desks: [
      { x: 140, y: 130 },
      { x: 420, y: 230 },
      { x: 460, y: 490 },
      { x: 860, y: 460 },
    ],
    water: [],
    paths: [
      { x: 190, y: 280, w: 810, h: 38 },
      { x: 355, y: 180, w: 46, h: 430 },
      { x: 380, y: 585, w: 640, h: 40 },
      { x: 685, y: 280, w: 115, h: 335 },
    ],
    trees: [
      { x: 85, y: 310 },
      { x: 580, y: 140 },
      { x: 985, y: 370 },
      { x: 620, y: 650 },
      { x: 1030, y: 640 },
    ],
  },
  {
    id: "lakeside-small",
    name: "Misty Lakeside",
    ground: 0x769593,
    lawn: 0xb3c6b4,
    accent: 0x899aab,
    rooms: [
      { x: 70, y: 90 },
      { x: 410, y: 80 },
    ],
    desks: [
      { x: 150, y: 370 },
      { x: 430, y: 400 },
      { x: 120, y: 540 },
      { x: 850, y: 460 },
    ],
    water: [
      { x: 830, y: 90, w: 230, h: 255 },
      { x: 600, y: 610, w: 445, h: 40 },
    ],
    paths: [
      { x: 130, y: 280, w: 670, h: 44 },
      { x: 690, y: 310, w: 110, h: 295 },
      { x: 320, y: 300, w: 45, h: 335 },
      { x: 365, y: 555, w: 690, h: 48 },
    ],
    trees: [
      { x: 80, y: 350 },
      { x: 620, y: 500 },
      { x: 1020, y: 400 },
      { x: 700, y: 130 },
    ],
  },
  {
    id: "glasshouse-small",
    name: "Glasshouse Garden",
    ground: 0x859b7c,
    lawn: 0xd2d5b8,
    accent: 0x7c9e91,
    rooms: [
      { x: 70, y: 80 },
      { x: 70, y: 430 },
    ],
    desks: [
      { x: 450, y: 150 },
      { x: 850, y: 170 },
      { x: 440, y: 480 },
      { x: 850, y: 470 },
    ],
    water: [{ x: 460, y: 330, w: 150, h: 65 }],
    paths: [
      { x: 350, y: 80, w: 48, h: 560 },
      { x: 380, y: 275, w: 680, h: 42 },
      { x: 690, y: 100, w: 110, h: 550 },
      { x: 380, y: 595, w: 680, h: 38 },
    ],
    trees: [
      { x: 630, y: 180 },
      { x: 640, y: 550 },
      { x: 1020, y: 380 },
      { x: 420, y: 410 },
    ],
  },
];

export function retreatFor(id: string) {
  return NATURE_RETREATS.find((map) => map.id === id);
}
export function retreatZones(map: Retreat) {
  return [
    { ...ZONES[0], arrival: { x: 740, y: 350 } },
    ...map.rooms.map((room, i) => ({
      ...ZONES[i + 1],
      ...room,
      w: 240,
      h: 190,
      arrival: { x: room.x + 120, y: room.y + 160 },
    })),
  ];
}
function walls(map: Retreat) {
  return map.rooms.flatMap(({ x, y }) => [
    { x, y, w: 240, h: 10 },
    { x, y, w: 10, h: 190 },
    { x: x + 230, y, w: 10, h: 190 },
    { x, y: y + 180, w: 80, h: 10 },
    { x: x + 160, y: y + 180, w: 80, h: 10 },
  ]);
}
export function retreatBlocks(map: Retreat) {
  return [
    ...walls(map),
    ...(map.id === "glasshouse-small"
      ? [{ x: 850, y: 350, w: 100, h: 38 }]
      : []),
    ...map.water,
    ...map.desks.map((p) => ({ ...p, w: 116, h: 58 })),
    ...map.rooms.map((p) => ({ x: p.x + 70, y: p.y + 65, w: 100, h: 42 })),
    ...map.trees.map((p) => ({ x: p.x - 8, y: p.y, w: 16, h: 16 })),
  ];
}

export function drawNatureRetreat(
  map: Retreat,
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
  const canopy = map.id === "canopy-small",
    glass = map.id === "glasshouse-small";
  const timber =
    canopy || map.id === "mangrove-small" || map.id === "lakeside-small";
  rect(0, 0, 1120, 720, map.ground);
  rect(36, 48, 1050, 635, map.lawn);
  for (let i = 0; i < 140; i++) {
    const x = 50 + ((i * 139) % 1020),
      y = 65 + ((i * 83) % 600);
    rect(x, y, 3, 5, map.ground);
    if (i % 4 === 0) rect(x - 2, y, 7, 2, 0xe1d4ad);
  }
  if (map.id === "cloudpeak-small") {
    // Layered mountain silhouettes frame the raised meadow terraces.
    for (let i = 0; i < 8; i++) {
      const x = i * 150;
      for (let row = 0; row < 5; row++)
        rect(
          x + 60 - row * 14,
          row * 9,
          28 + row * 28,
          10,
          row < 2 ? 0xe4e4d5 : 0x9caea4,
        );
    }
    rect(350, 116, 370, 195, 0xa1b3a1);
    rect(125, 460, 535, 175, 0xa1b3a1);
    for (let i = 0; i < 3; i++) rect(655, 480 + i * 12, 40, 7, 0xd9d7bf);
  }
  if (glass) {
    rect(340, 68, 725, 584, 0xe2dfc7);
    for (let x = 340; x < 1065; x += 40) rect(x, 68, 1, 584, 0xc8cdb5);
    for (let y = 68; y < 652; y += 40) rect(340, y, 725, 1, 0xc8cdb5);
    for (let x = 380; x < 1080; x += 150) {
      rect(x, 45, 100, 19, 0xb5d3c1);
      rect(x, 45, 100, 3, map.accent);
      rect(x + 47, 45, 4, 19, map.accent);
    }
  }
  if (canopy) {
    // Rounded foliage beneath the raised decks gives the canopy depth.
    for (const p of [...map.desks, ...map.rooms]) {
      rect(p.x - 30, p.y - 34, 170, 160, 0x527c60);
      rect(p.x - 44, p.y - 8, 198, 104, 0x5f8867);
    }
  }
  for (const p of map.paths) {
    rect(p.x, p.y, p.w, p.h, timber ? 0xbda77e : 0xe2d6b4);
    if (timber)
      for (let y = p.y + 5; y < p.y + p.h; y += 12)
        rect(p.x + 3, y, p.w - 6, 1, 0x9e8969);
    if (canopy) {
      rect(p.x, p.y, p.w, 3, 0xe0cca0);
      rect(p.x, p.y + p.h - 3, p.w, 3, 0xe0cca0);
    }
  }
  for (const p of map.water) {
    rect(p.x - 5, p.y - 5, p.w + 10, p.h + 10, 0x9eb6a4);
    rect(p.x, p.y, p.w, p.h, 0x76a59c);
    rect(p.x + 6, p.y + 6, p.w - 12, p.h - 12, 0x87b3a6);
    for (let y = p.y + 15; y < p.y + p.h - 8; y += 28)
      for (let x = p.x + 10; x < p.x + p.w - 26; x += 60)
        waterRipple(rect, effect, x, y, 20, 3, 0xc7ddd0);
    for (let x = p.x + 12; x < p.x + p.w; x += 50) {
      rect(x, p.y - 9, 3, 12, 0x688d70);
      rect(x + 5, p.y - 5, 3, 8, 0x96aa7e);
    }
  }
  if (map.id === "cloudpeak-small") {
    rect(91, 289, 8, 49, 0x879f94);
    rect(137, 289, 8, 49, 0x879f94);
    for (let y = 294; y < 338; y += 10)
      waterRipple(rect, effect, 104, y, 27, 3, 0xe4ece0);
    rect(99, 338, 47, 6, 0xe4ece0);
  }
  if (glass) {
    rect(850, 350, 100, 38, 0x9f876a);
    rect(854, 354, 92, 8, 0xe1cfac);
    rect(863, 333, 23, 20, 0x526b60);
    rect(866, 337, 17, 5, 0xd8decb);
    for (const x of [904, 925]) {
      rect(x, 343, 9, 9, 0xf5ead1);
      rect(x + 9, 345, 3, 4, 0xf5ead1);
    }
    label("CAFE", 900, 414, 10, "#435e51");
    for (const x of [410, 550, 850, 990]) {
      rect(x, 80, 42, 22, 0xb09c78);
      for (let i = 0; i < 3; i++) {
        rect(x + 5 + i * 12, 68, 9, 18, 0x79996e);
        rect(x + 3 + i * 12, 67, 13, 6, i % 2 ? 0xd6b6bb : 0xc9cfa1);
      }
    }
  }
  for (const { x, y } of map.desks) {
    rect(x - 14, y - 18, 148, 129, timber ? 0xb29b76 : 0xb6c3a0);
    if (timber)
      for (let row = 0; row < 10; row++)
        rect(x - 10, y - 14 + row * 12, 140, 1, 0x9a8365);
    rect(x, y, 116, 58, 0x947f60);
    rect(x + 4, y + 4, 108, 46, 0xdfcba3);
    for (const dx of [18, 70]) {
      rect(x + dx, y + 9, 28, 21, 0x49645b);
      rect(x + dx + 3, y + 12, 22, 14, 0xa9cbb7);
      rect(x + dx, y + 35, 28, 4, 0xf1e8ce);
      rect(x + dx, y + 77, 28, 20, map.accent);
      rect(x + dx + 2, y + 78, 24, 4, 0xded2b1);
    }
    rect(x + 101, y - 12, 12, 12, 0xb39a78);
    rect(x + 99, y - 20, 16, 12, 0x799a70);
  }
  for (const [i, p] of map.rooms.entries()) {
    rect(p.x, p.y, 240, 190, glass ? 0xd8ddc1 : 0xd2c29e);
    for (let y = p.y + 16; y < p.y + 180; y += 16)
      rect(p.x + 10, y, 220, 1, 0xb8ad8f);
    rect(p.x - 5, p.y - 20, 250, 20, map.accent);
    for (let x = p.x; x < p.x + 240; x += 24)
      rect(x, p.y - 17, 15, 3, 0xc8b89c);
    for (const dx of [24, 186]) {
      rect(p.x + dx, p.y + 13, 28, 17, 0x88b1aa);
      rect(p.x + dx + 3, p.y + 16, 22, 3, 0xcce0d1);
    }
    label(i ? "THE LIBRARY" : "THE STUDIO", p.x + 120, p.y + 43, 11, "#435e51");
    rect(p.x + 70, p.y + 65, 100, 42, 0x927d5e);
    rect(p.x + 74, p.y + 69, 92, 34, 0xe2cfaa);
    for (const dx of [80, 140]) {
      rect(p.x + dx, p.y + 112, 20, 15, map.accent);
      rect(p.x + dx, p.y + 49, 20, 12, map.accent);
    }
    rect(p.x + 112, p.y + 78, 16, 12, 0xf3ecd6);
    label("↑", p.x + 120, p.y + 176, 14, "#435e51");
  }
  for (const p of walls(map)) {
    rect(p.x, p.y, p.w, p.h, map.accent);
    rect(p.x, p.y, p.w, 3, 0xe5d9b9);
  }
  for (const { x, y } of map.trees) {
    rect(x - 8, y - 30, 16, 46, 0x8e7758);
    if (map.id === "mangrove-small") {
      rect(x - 21, y + 7, 42, 5, 0x8e7758);
      rect(x - 15, y - 1, 30, 5, 0x8e7758);
    }
    rect(x - 36, y - 51, 72, 28, 0x4e7960);
    rect(x - 29, y - 70, 58, 32, 0x71936c);
    rect(x - 17, y - 81, 35, 26, 0x9cb183);
    effect?.({
      kind: "leaves",
      x,
      y: y - 60,
      spread: 28,
      fall: 86,
      color: 0xd0c695,
    });
  }
  // Corner foliage frames the scene without hiding the walking routes.
  for (const x of [16, 1100])
    for (let y = 90; y < 700; y += 95) {
      rect(x - 15, y, 35, 22, 0x547c61);
      rect(x - 10, y - 10, 25, 18, 0x87a277);
    }
  label(map.name.toUpperCase(), 560, 703, 15, "#edf0d9");
}
