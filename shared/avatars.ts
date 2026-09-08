import {
  customAppearance,
  SKIN_TONES,
  HAIR_STYLES,
  OUTFITS,
} from "./appearance";
import { COLORS, type Person } from "./world";

export const CHARACTER_LOOKS = [
  {
    id: "sage",
    name: "Scout",
    description: "Forest hoodie · tousled hair",
    skin: 0xe8b787,
    hair: 0x60483c,
    pants: 0x4c5148,
  },
  {
    id: "blue",
    name: "Maker",
    description: "Ocean knit · amber beanie",
    skin: 0x9d6245,
    hair: 0x302d32,
    pants: 0x39485b,
  },
  {
    id: "coral",
    name: "Artist",
    description: "Coral tee · denim overalls",
    skin: 0xc58b67,
    hair: 0x633d45,
    pants: 0x4b647c,
  },
  {
    id: "gold",
    name: "Explorer",
    description: "Golden jacket · green cap",
    skin: 0xb77c54,
    hair: 0x392f28,
    pants: 0x4a5946,
  },
  {
    id: "plum",
    name: "Stargazer",
    description: "Lilac sweater · round glasses",
    skin: 0xf0cbb0,
    hair: 0x34323e,
    pants: 0x50455f,
  },
] as const;

export function characterLook(id: string) {
  const custom = customAppearance(id);
  if (custom)
    return {
      ...CHARACTER_LOOKS[custom.clothes],
      name: "Custom character",
      description: "Made by you",
      skin: SKIN_TONES[custom.skin].color,
      hair: HAIR_STYLES[custom.hair].color,
      pants: OUTFITS[custom.clothes].pants,
    };
  return CHARACTER_LOOKS.find((look) => look.id === id) || CHARACTER_LOOKS[2];
}

// Both the map and profile portraits draw these same pixel shapes.
// Left-facing callers mirror x coordinates so hats and faces turn together.
export function drawCharacter(
  id: Person["avatar"],
  direction: Person["direction"],
  stride: number,
  pixel: (x: number, y: number, w: number, h: number, color: number) => void,
  pose: Person["pose"] = "stand",
) {
  const custom = customAppearance(id);
  const look = characterLook(id);
  const { skin, hair, pants } = look;
  const draw = pixel;
  if (pose === "sit") {
    draw(-16, 9, 32, 5, 0x879774);
    draw(-13, 4, 26, 8, pants);
    draw(-15, 8, 9, 4, 0x343d37);
    draw(6, 8, 9, 4, 0x343d37);
    pixel = (x, y, w, h, color) => {
      if (y < 0) draw(x, y + 8, w, Math.min(h, -y), color);
    };
  } else if (pose === "sleep") {
    draw(-26, 10, 53, 5, 0x879774);
    draw(12, -11, 19, 21, 0xeee4c9);
    pixel = (x, y, w, h, color) => draw(-y - h - 18, x, h, w, color);
    direction = "down";
    stride = 0;
  }
  const shirt = custom
    ? OUTFITS[custom.clothes].color
    : parseInt(COLORS[look.id].slice(1), 16);
  const side = direction === "left" || direction === "right";
  const longHair = custom ? custom.hair === 2 : look.id === "coral";
  if (side) {
    pixel(-4 - stride, -1, 6, 8, pants);
    pixel(-4 - stride, 5, 9, 3, 0x343d37);
    pixel(-7, -18, 15, 20, shirt);
    pixel(-3 + stride, 0, 6, 8, pants);
    pixel(-3 + stride, 5, 10, 3, 0x343d37);
    pixel(-3 - stride, -15, 5, 14, skin);
    pixel(-4 - stride, -17, 7, 6, shirt);
    pixel(-10, -38, 18, 22, hair);
    pixel(-2, -34, 11, 17, skin);
    pixel(8, -27, 4, 5, skin);
    pixel(5, -29, 3, 3, 0x332f30);
    pixel(6, -20, 3, 2, 0xb76c5a);
    pixel(-10, -38, 20, 7, hair);
    pixel(-10, -33, 8, longHair ? 23 : 13, hair);
    pixel(-3, -28, 4, 5, skin);
  } else {
    const step = stride / 2;
    pixel(-10, -18, 20, 20, shirt);
    pixel(-13, -16 + step, 5, 14, skin);
    pixel(8, -16 - step, 5, 14, skin);
    pixel(-8, 1 - step, 6, 7, pants);
    pixel(2, 1 + step, 6, 7, pants);
    pixel(-10, -38, 20, 21, hair);
    pixel(-8, -34, 17, 18, skin);
    pixel(-11, -38, 23, 7, hair);
    pixel(-11, -33, 5, 10, hair);
    if (direction === "down") {
      pixel(
        0,
        -27,
        pose === "sleep" ? 4 : 3,
        pose === "sleep" ? 1 : 3,
        0x332f30,
      );
      pixel(
        6,
        -27,
        pose === "sleep" ? 4 : 3,
        pose === "sleep" ? 1 : 3,
        0x332f30,
      );
      pixel(1, -20, 4, 2, 0xb76c5a);
    } else pixel(-8, -34, 17, 15, hair);
    if (longHair) {
      pixel(-12, -33, 5, 23, hair);
      pixel(9, -30, 5, 20, hair);
    }
  }
  if (custom) {
    // Outfit details are independent from the hairstyle and hat.
    if (custom.clothes === 0 && direction !== "up") {
      pixel(side ? 4 : -4, -15, 2, 7, 0xdce5c8);
      if (!side) pixel(3, -15, 2, 7, 0xdce5c8);
      pixel(side ? 2 : -5, -5, side ? 5 : 11, 3, 0x3e664c);
    } else if (custom.clothes === 1) {
      pixel(side ? 3 : -7, -17, 3, 10, pants);
      if (!side) pixel(5, -17, 3, 10, pants);
      pixel(side ? 1 : -7, -10, side ? 6 : 15, 12, pants);
      if (direction !== "up") pixel(side ? 3 : -2, -6, 4, 4, 0x8da7b8);
    } else if (custom.clothes === 2 && direction !== "up") {
      pixel(side ? 6 : 0, -17, 2, 18, 0xf1d894);
      pixel(side ? 1 : -7, -11, 4, 5, 0xa78039);
    } else if (custom.clothes === 3 && direction !== "up") {
      pixel(side ? 5 : 0, -17, 2, 18, 0xc9dfdf);
      pixel(side ? 0 : -7, -13, 4, 4, 0x385b81);
      pixel(side ? 3 : -5, -18, 5, 4, 0xe6ebdb);
    } else if (custom.clothes === 4) {
      pixel(side ? -7 : -10, -9, side ? 15 : 20, 3, 0xcdb8e5);
      pixel(side ? -7 : -10, -2, side ? 15 : 20, 3, 0x684f85);
    }
    if (custom.hair === 1) {
      for (const [x, y] of [
        [-12, -39],
        [-5, -42],
        [3, -41],
        [8, -37],
      ])
        pixel(x, y, 8, 7, hair);
      pixel(-12, -33, 5, 8, hair);
    } else if (custom.hair === 2) {
      pixel(-10, -40, 20, 7, hair);
      pixel(side ? -11 : 8, -28, 6, 16, hair);
    } else if (custom.hair === 3) {
      pixel(-8, -43, 5, 7, hair);
      pixel(-1, -45, 5, 8, hair);
      pixel(6, -42, 5, 6, hair);
    } else if (custom.hair === 4) {
      pixel(side ? -16 : -13, -37, 7, 17, hair);
      pixel(side ? -16 : -13, -32, 7, 3, 0xc5a7da);
      pixel(-7, -40, 16, 5, hair);
    }
    if (custom.hat === 1) {
      pixel(-11, -40, 21, 8, 0x587960);
      pixel(-8, -43, 15, 5, 0x739477);
      pixel(side ? 1 : -12, -33, side ? 15 : 25, 4, 0x3f614e);
    } else if (custom.hat === 2) {
      pixel(-11, -41, 22, 9, 0xc79b53);
      pixel(-7, -45, 14, 5, 0xddb56e);
      pixel(-12, -34, 24, 5, 0xe6c486);
    } else if (custom.hat === 3) {
      pixel(-9, -43, 18, 10, 0xe1c080);
      pixel(-10, -36, 20, 4, 0xb68c4d);
      pixel(-17, -33, 34, 4, 0xf0d699);
    } else if (custom.hat === 4) {
      pixel(-10, -41, 20, 3, 0x445769);
      pixel(-13, -38, 3, 14, 0x445769);
      pixel(10, -38, 3, 14, 0x445769);
      pixel(-14, -30, 6, 10, 0x8fb3c2);
      if (!side || direction === "up") pixel(9, -30, 6, 10, 0x8fb3c2);
    } else if (custom.hat === 5) {
      pixel(-11, -41, 22, 8, 0xe7bd52);
      pixel(-11, -46, 5, 7, 0xf6d779);
      pixel(-2, -47, 5, 8, 0xf6d779);
      pixel(6, -46, 5, 7, 0xf6d779);
      pixel(-1, -38, 3, 3, 0xc86b76);
    }
  } else if (look.id === "sage") {
    pixel(-7, -41, 7, 5, hair);
    pixel(3, -40, 7, 4, hair);
    if (direction !== "up") {
      pixel(side ? 4 : -4, -15, 2, 7, 0xdce5c8);
      if (!side) pixel(3, -15, 2, 7, 0xdce5c8);
      pixel(side ? 2 : -5, -5, side ? 5 : 11, 3, 0x3e664c);
    }
  } else if (look.id === "blue") {
    pixel(-10, -40, 20, 9, 0xc79b53);
    pixel(-7, -43, 14, 5, 0xddb56e);
    pixel(-12, -34, 24, 5, 0xe6c486);
    pixel(side ? 6 : 4, -33, 3, 3, 0xf9e8c1);
    pixel(side ? -7 : -10, -8, side ? 15 : 20, 3, 0x9cbccc);
  } else if (look.id === "coral") {
    pixel(-8, -41, 8, 5, hair);
    pixel(1, -40, 9, 4, hair);
    pixel(side ? 3 : -7, -17, 3, 10, pants);
    if (!side) pixel(5, -17, 3, 10, pants);
    pixel(side ? 1 : -7, -10, side ? 6 : 15, 12, pants);
    pixel(side ? 4 : -4, -9, 2, 2, 0xeecf88);
    if (direction !== "up") pixel(side ? 3 : -2, -6, 4, 4, 0x8da7b8);
  } else if (look.id === "gold") {
    pixel(-11, -40, 21, 8, 0x587960);
    pixel(-8, -43, 15, 5, 0x739477);
    pixel(side ? 1 : -12, -33, side ? 15 : 25, 4, 0x3f614e);
    if (direction !== "up") {
      pixel(side ? 6 : 0, -17, 2, 18, 0xf1d894);
      pixel(side ? 1 : -7, -11, 4, 5, 0xa78039);
    }
  } else if (look.id === "plum") {
    pixel(side ? -13 : -5, -44, 10, 8, hair);
    pixel(side ? -12 : -4, -38, 8, 2, 0xc5a7da);
    if (direction !== "up") {
      const lens = (x: number) => {
        pixel(x, -29, 7, 7, 0x514858);
        pixel(x + 1, -28, 5, 5, 0xc6c9d3);
        pixel(x + 3, -27, 2, 3, 0x332f30);
      };
      lens(side ? 3 : -5);
      if (!side) {
        lens(4);
        pixel(2, -27, 2, 2, 0x514858);
      }
      pixel(side ? 4 : 2, -12, 2, 7, 0xf0d584);
      pixel(side ? 2 : 0, -10, 6, 2, 0xf0d584);
    }
  }
}
