import { BLOCKS, DESKS } from "./world";

export const MAPS = [
  {
    id: "nature-small",
    name: "Fern Grove",
    theme: "nature",
    size: "small",
    people: "4–8",
    description: "A leafy garden with picnic desks and quiet pavilions.",
  },
  {
    id: "camping-small",
    name: "Pine Camp",
    theme: "camping",
    size: "small",
    people: "4–8",
    description: "A cozy campsite with canvas shelters and a fire circle.",
  },
  {
    id: "space-small",
    name: "Lunar Outpost",
    theme: "space",
    size: "small",
    people: "4–8",
    description: "A moon base with glowing consoles and private crew pods.",
  },
  {
    id: "nature-large",
    name: "Willow Gardens",
    theme: "nature",
    size: "large",
    people: "10–12",
    description: "A spacious garden with twelve seats at outdoor workstations.",
  },
  {
    id: "camping-large",
    name: "Summit Basecamp",
    theme: "camping",
    size: "large",
    people: "10–12",
    description: "A larger expedition camp with twelve seats for your crew.",
  },
  {
    id: "space-large",
    name: "Orbital Station",
    theme: "space",
    size: "large",
    people: "10–12",
    description: "An expanded command deck for a full interstellar team.",
  },
] as const;
export type MapId = (typeof MAPS)[number]["id"];
export type OfficeMap = (typeof MAPS)[number];
export type WorkspaceSettings = {
  name: string;
  mapId: MapId;
  revision: number;
};
export const DEFAULT_WORKSPACE: WorkspaceSettings = {
  name: "Team workspace",
  mapId: "nature-small",
  revision: 0,
};
export function getMap(id: string): OfficeMap {
  return MAPS.find((map) => map.id === id) || MAPS[0];
}
export function mapDesks(map: OfficeMap) {
  return map.size === "small"
    ? DESKS
    : [110, 330, 550].flatMap((x) => [175, 405].map((y) => ({ x, y })));
}
export function mapBlocks(map: OfficeMap) {
  return [
    ...mapDesks(map).map((desk) => ({ ...desk, w: 116, h: 58 })),
    ...mapDesks(map).map(({ x, y }) =>
      map.theme === "camping"
        ? { x: x + 12, y: y - 81, w: 90, h: 43 }
        : { x: x - 17, y: y - 55, w: 150, h: 16 },
    ),
    ...[
      [65, 150],
      [65, 530],
      [688, 645],
      [1052, 264],
      [1052, 635],
    ].map(([x, y]) => ({ x: x - 10, y, w: 20, h: 20 })),
    ...(map.size === "small"
      ? BLOCKS.slice(DESKS.length, DESKS.length + 2)
      : []),
    ...BLOCKS.slice(DESKS.length + 2),
  ];
}

// The picker and live map share their artwork, dimensions, and furniture.
export function drawOfficeMap(
  map: OfficeMap,
  rect: (x: number, y: number, w: number, h: number, color: number) => void,
  label: (
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
  ) => void,
) {
  const space = map.theme === "space",
    camp = map.theme === "camping";
  const palette = space
    ? {
        ground: 0x171f38,
        floor: 0x293752,
        path: 0x435570,
        edge: 0x758cac,
        accent: 0x79d9d0,
        wood: 0x6580a0,
        top: 0xabc7d4,
        chair: 0x6387a4,
        ink: "#d9e7f6",
      }
    : camp
      ? {
          ground: 0x465e50,
          floor: 0x809477,
          path: 0xc2ac86,
          edge: 0x5d725a,
          accent: 0xedc086,
          wood: 0x836044,
          top: 0xc59763,
          chair: 0x8c6046,
          ink: "#3e4937",
        }
      : {
          ground: 0x6f9874,
          floor: 0xb2c99b,
          path: 0xe4d6af,
          edge: 0x7f9e73,
          accent: 0xf4e9bb,
          wood: 0x978365,
          top: 0xd3b88b,
          chair: 0x65856a,
          ink: "#425c46",
        };
  rect(0, 0, 1120, 720, palette.ground);
  rect(32, 40, 1060, 644, palette.edge);
  rect(40, 56, 1044, 620, palette.floor);
  // A clear central path connects both meeting rooms and every workstation.
  rect(42, 295, 773, 80, palette.path);
  rect(705, 67, 104, 593, palette.path);
  rect(42, 555, 765, 70, palette.path);
  if (space) {
    for (let x = 60; x < 1080; x += 80) rect(x, 57, 1, 618, 0x394a66);
    for (let y = 75; y < 670; y += 80) rect(42, y, 1040, 1, 0x394a66);
    for (let i = 0; i < 28; i++)
      rect((i * 173 + 12) % 1120, i % 2 ? 703 : 15, 2 + (i % 3), 2, 0xb2bfd8);
    rect(42, 58, 1040, 4, palette.accent);
    rect(42, 668, 1040, 3, palette.accent);
  } else {
    for (let i = 0; i < 55; i++) {
      const x = 50 + ((i * 113) % 630),
        y = 75 + ((i * 71) % 200);
      rect(x, y, 3, 7, palette.edge);
      rect(x - 3, y + 3, 9, 2, palette.edge);
    }
    for (let x = 70; x < 700; x += 65) {
      rect(x, 317, 32, 2, 0xa79372);
      rect(x + 20, 349, 25, 2, 0xa79372);
    }
  }
  const tree = (x: number, y: number) => {
    rect(x - 5, y, 10, 23, 0x775943);
    if (camp) {
      rect(x - 27, y - 8, 54, 12, 0x2f5548);
      rect(x - 21, y - 23, 42, 17, 0x3a6754);
      rect(x - 14, y - 36, 28, 16, 0x548069);
      rect(x - 6, y - 47, 12, 14, 0x648e71);
    } else {
      rect(x - 29, y - 25, 58, 29, 0x4c7957);
      rect(x - 23, y - 38, 45, 32, 0x689861);
      rect(x - 13, y - 46, 29, 29, 0x8bb16f);
      rect(x + 12, y - 13, 6, 6, 0xe6cf8b);
    }
  };
  for (const x of [23, 160, 365, 570, 775, 1097]) {
    if (!space) {
      tree(x, 35);
      tree(x, 689);
    } else {
      rect(x - 18, 10, 36, 26, 0x526079);
      rect(x - 12, 7, 22, 20, 0x728199);
      rect(x - 12, 690, 28, 13, 0x536882);
    }
  }
  const tent = (x: number, y: number, width: number) => {
    for (let row = 0; row < 6; row++)
      rect(
        x + width / 2 - ((row + 1) * width) / 12,
        y + row * 7,
        ((row + 1) * width) / 6,
        8,
        row < 3 ? 0xe5bc80 : 0xc58d53,
      );
    rect(x + width / 2 - 13, y + 23, 26, 20, 0x76553e);
    rect(x + 8, y + 43, width - 16, 3, 0x654f3b);
    rect(x + width / 2 - 1, y + 6, 2, 37, 0xf3d2a0);
  };
  for (const desk of mapDesks(map)) {
    const { x, y } = desk;
    rect(
      x - 16,
      y - 38,
      150,
      142,
      space ? 0x344562 : camp ? 0xa58e6c : 0xc2d2aa,
    );
    if (camp) tent(x + 12, y - 81, 90);
    else if (!space) {
      rect(x - 17, y - 49, 150, 7, 0x749467);
      rect(x - 13, y - 55, 30, 8, 0xd9cbdb);
      rect(x + 86, y - 55, 40, 8, 0xede3a4);
      for (const dx of [0, 22, 105]) {
        rect(x + dx, y - 63, 3, 13, 0x567d56);
        rect(x + dx - 4, y - 65, 10, 6, dx === 22 ? 0xe3b2b7 : 0xefe1a7);
      }
    } else {
      rect(x - 17, y - 55, 150, 16, 0x172940);
      for (let dx = -10; dx < 120; dx += 24) {
        rect(x + dx, y - 51, 14, 3, palette.accent);
        rect(x + dx, y - 45, 8, 2, 0x718fbc);
      }
    }
    rect(x + 5, y + 7, 116, 58, palette.edge);
    rect(x, y, 116, 58, palette.wood);
    rect(x + 3, y + 3, 110, 47, palette.top);
    rect(x + 7, y + 54, 8, 12, palette.wood);
    rect(x + 101, y + 54, 8, 12, palette.wood);
    for (const dx of [18, 70]) {
      rect(x + dx, y + 9, 29, 20, space ? 0x16233f : 0x455f58);
      rect(x + dx + 3, y + 12, 23, 14, space ? 0x75d7d7 : 0xabd0be);
      rect(x + dx + 5, y + 32, 22, 5, 0xf0e9d0);
      rect(x + dx, y + 74, 28, 23, palette.chair);
      rect(x + dx + 2, y + 74, 24, 5, palette.accent);
    }
  }
  if (map.size === "small") {
    if (space) {
      rect(550, 210, 130, 45, 0x557a9b);
      rect(555, 214, 120, 28, 0x263b57);
      rect(564, 220, 102, 3, palette.accent);
      rect(590, 330, 60, 45, 0x587898);
      rect(595, 335, 50, 35, 0x7dc7ce);
      rect(611, 342, 19, 18, 0xd2f1ed);
    } else if (camp) {
      rect(550, 210, 130, 45, 0x70553c);
      rect(555, 214, 120, 20, 0xac8254);
      rect(590, 330, 60, 45, 0x79796a);
      rect(597, 335, 46, 33, 0x494c41);
      rect(605, 343, 30, 16, 0xdd8b46);
      rect(611, 333, 18, 22, 0xefb95c);
      rect(617, 328, 7, 20, 0xffdfa1);
    } else {
      rect(550, 210, 130, 45, 0x91b7b0);
      rect(556, 216, 118, 32, 0xb4d6c3);
      rect(564, 231, 25, 4, 0xe6edd4);
      rect(649, 224, 19, 10, 0x76a176);
      rect(594, 239, 19, 7, 0x75a775);
      rect(603, 236, 6, 5, 0xe9c9d8);
      rect(635, 218, 20, 3, 0xd9eee0);
      rect(590, 330, 60, 45, 0xae9167);
      rect(593, 333, 54, 35, 0xdcc499);
      rect(612, 343, 17, 15, 0xf0e5c6);
    }
    label(
      space ? "OBSERVATION DECK" : camp ? "THE FIRE CIRCLE" : "THE LILY POND",
      618,
      155,
      11,
      palette.ink,
    );
  }
  // Private rooms use the same visible boundaries as server collision checks.
  for (const [y, name, accent] of [
    [60, "THE STUDIO", space ? 0x568894 : 0xa9b78b],
    [380, "THE LIBRARY", space ? 0x7767a0 : 0xb4a3b4],
  ] as const) {
    rect(838, y, 246, y === 60 ? 264 : 294, accent);
    rect(
      850,
      y + 24,
      222,
      y === 60 ? 224 : 254,
      space ? 0x33415f : camp ? 0xcbb48b : 0xd3d8b9,
    );
    if (camp) tent(906, y + 20, 95);
    else if (space) {
      rect(867, y + 27, 189, 6, palette.accent);
      rect(870, y + 57, 22, 11, 0x91d2da);
    } else {
      rect(850, y + 18, 222, 12, 0x779167);
      for (let x = 860; x < 1070; x += 27) rect(x, y + 21, 6, 15, 0xb4c896);
    }
    label(name, 964, y + (camp ? 75 : 49), 12, palette.ink);
  }
  for (const b of BLOCKS.filter((b) => b.x === 820)) {
    rect(b.x + 3, b.y + 5, b.w, b.h, palette.edge);
    rect(b.x, b.y, b.w, b.h, space ? 0x7086a2 : 0xb79770);
    rect(b.x, b.y, b.w, 4, palette.accent);
  }
  for (const b of BLOCKS.slice(DESKS.length + 2, DESKS.length + 4)) {
    rect(b.x, b.y, b.w, b.h, palette.wood);
    rect(b.x + 4, b.y + 4, b.w - 8, b.h - 8, palette.top);
    rect(b.x + 30, b.y + 20, 17, 13, palette.accent);
    for (const dx of [10, 62]) {
      rect(b.x + dx, b.y - 18, 20, 14, palette.chair);
      rect(b.x + dx, b.y + b.h + 5, 20, 14, palette.chair);
    }
  }
  for (const [x, y] of [
    [65, 150],
    [65, 530],
    [688, 645],
    [1052, 264],
    [1052, 635],
  ]) {
    if (!space && x < 800) tree(x, y);
    else if (!space) {
      rect(x - 10, y, 20, 20, 0xa47f58);
      rect(x - 13, y, 26, 6, 0xd2ae7a);
      rect(x - 3, y - 29, 5, 31, 0x567c55);
      rect(x - 19, y - 28, 22, 13, 0x7aa070);
      rect(x + 1, y - 17, 17, 12, 0x8eaf77);
    } else {
      rect(x - 10, y - 24, 20, 44, 0x506784);
      rect(x - 6, y - 20, 12, 21, 0x98dad9);
      rect(x - 4, y - 16, 8, 12, 0xd1eeeb);
      rect(x - 15, y + 14, 30, 6, 0x3b4f6c);
      rect(x - 7, y + 7, 5, 3, 0xcbb17c);
    }
  }
  label(
    map.name.toUpperCase(),
    map.size === "small" ? 272 : 400,
    77,
    15,
    palette.ink,
  );
  label(
    `${map.people} PEOPLE · ${map.size === "small" ? 8 : 12} WORK SEATS`,
    383,
    603,
    11,
    palette.ink,
  );
  label("→", 790, 221, 18, palette.ink);
  label("→", 790, 548, 18, palette.ink);
}
