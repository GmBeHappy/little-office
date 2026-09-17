import type { wildlifeAnimation } from "./wildlife-animation";

type Rect = (x: number, y: number, w: number, h: number, color: number) => void;
export type WildlifeSpecies =
  | "rabbit"
  | "cat"
  | "squirrel"
  | "goat"
  | "bird"
  | "duck"
  | "toucan"
  | "crab"
  | "robot";

// Species-specific silhouettes share only their gait, not a generic body.
export function drawWildlife(
  species: WildlifeSpecies,
  gait: ReturnType<typeof wildlifeAnimation>,
  r: Rect,
) {
  const { frontLift: f, backLift: b, graze: g } = gait;
  const ink = 0x39483f;
  switch (species) {
    case "rabbit":
      r(-9, 1, 8, 5 - f, 0xb9a7a0);
      r(7, 1, 5, 5 - b, 0xb9a7a0);
      r(-11, -10, 17, 13, 0xeee5db);
      r(-8, -14, 12, 6, 0xeee5db);
      r(-15, -6, 5, 5, 0xffffff);
      r(-7, -5, 8, 7, 0xd5c9c0);
      r(2, -16 + g, 12, 12, 0xf8f1e5);
      r(3, -31 + g, 4, 17, 0xeee5db);
      r(10, -28 + g, 4, 14, 0xf8f1e5);
      r(4, -28 + g, 2, 10, 0xd6a6aa);
      r(11, -25 + g, 2, 8, 0xd6a6aa);
      r(10, -12 + g, 2, 2, ink);
      r(14, -8 + g, 2, 2, 0xd6a6aa);
      break;
    case "cat":
      r(-8, 0, 4, 6 - f, 0x8b7062);
      r(7, 0, 4, 6 - b, 0x8b7062);
      r(-12, -9, 23, 11, 0xc69260);
      r(-8, -7, 3, 6, 0x966c4c);
      r(-1, -7, 3, 6, 0x966c4c);
      r(-17, -12, 6, 4, 0xc69260);
      r(-20, -21, 4, 12, 0xc69260);
      r(-19, -24, 5, 5, 0x966c4c);
      r(2, -18 + g, 14, 12, 0xd4a574);
      r(2, -23 + g, 4, 6, 0xc69260);
      r(12, -23 + g, 4, 6, 0xc69260);
      r(3, -21 + g, 2, 3, 0xe2b1a0);
      r(13, -21 + g, 2, 3, 0xe2b1a0);
      r(5, -14 + g, 3, 2, ink);
      r(12, -14 + g, 2, 2, ink);
      r(9, -10 + g, 2, 2, 0xaa7468);
      r(4, -8 + g, 11, 2, 0xf0ddbd);
      break;
    case "squirrel":
      r(-5, 1, 6, 5 - f, 0x79513c);
      r(7, 0, 4, 6 - b, 0x79513c);
      r(-21, -24, 10, 16, 0x9e643d);
      r(-18, -29, 10, 8, 0xb9804a);
      r(-16, -23, 8, 20, 0xb9804a);
      r(-19, -22, 4, 11, 0xd5a365);
      r(-10, -13, 16, 16, 0xb9804a);
      r(-3, -9, 8, 10, 0xe3bf83);
      r(2, -19 + g, 11, 11, 0xc59056);
      r(3, -24 + g, 4, 6, 0x9e643d);
      r(10, -15 + g, 2, 2, ink);
      r(13, -11 + g, 3, 2, 0x79513c);
      r(9, -5 + g, 5, 5, 0x896846);
      break;
    case "goat":
      r(-10, 0, 4, 7 - f, 0x736858);
      r(8, 0, 4, 7 - b, 0x736858);
      r(-13, -13, 25, 16, 0xd8d1b7);
      r(-9, -15, 15, 5, 0xe9e2cb);
      r(-16, -14, 5, 4, 0xe9e2cb);
      r(5, -21 + g, 11, 15, 0xc7bc9b);
      r(2, -19 + g, 5, 3, 0x9c9075);
      r(15, -18 + g, 5, 3, 0x9c9075);
      r(6, -28 + g, 3, 9, 0x827b68);
      r(13, -27 + g, 3, 8, 0x827b68);
      r(12, -17 + g, 2, 2, ink);
      r(11, -7 + g, 4, 7, 0xe9e2cb);
      r(14, -10 + g, 3, 3, 0x827b68);
      break;
    case "bird":
      r(-4, 0, 2, 5 - f, 0x966b40);
      r(4, 0, 2, 5 - b, 0x966b40);
      r(-13, -8, 7, 4, 0x74553c);
      r(-9, -11, 17, 12, 0xa77a50);
      r(-5, -4, 12, 5, 0xe0c5a0);
      r(-7, -9, 9, 6, 0x795c43);
      r(-6, -8, 6, 2, 0xd1b083);
      r(3, -16 + g, 10, 10, 0xb3895c);
      r(3, -17 + g, 10, 3, 0x75533d);
      r(5, -12 + g, 7, 3, 0xe2cfaa);
      r(9, -13 + g, 2, 2, ink);
      r(13, -11 + g, 4, 3, 0xb99249);
      break;
    case "duck":
      r(-6, 1, 6, 4 - f, 0xc38c45);
      r(5, 1, 6, 4 - b, 0xc38c45);
      r(-14, -8, 23, 11, 0xb5afa0);
      r(-17, -10, 6, 5, 0x8e8a7c);
      r(-10, -7, 13, 6, 0x8b9383);
      r(-4, -6, 7, 3, 0x648b94);
      r(5, -17 + g, 11, 12, 0x52745b);
      r(6, -7 + g, 8, 3, 0xf1e7c9);
      r(13, -14 + g, 2, 2, ink);
      r(16, -11 + g, 7, 4, 0xd1ac56);
      break;
    case "toucan":
      r(-5, 1, 3, 5 - f, 0x778881);
      r(4, 1, 3, 5 - b, 0x778881);
      r(-13, -8, 6, 13, 0x34484c);
      r(-10, -16, 19, 19, 0x34484c);
      r(-8, -13, 8, 12, 0x4d6260);
      r(2, -15, 8, 12, 0xebd9a4);
      r(0, -24 + g, 13, 13, 0x34484c);
      r(8, -20 + g, 3, 3, 0x9fc0a0);
      r(9, -20 + g, 2, 2, ink);
      r(12, -23 + g, 11, 8, 0xe5b65d);
      r(12, -23 + g, 10, 3, 0xe0cd76);
      r(21, -20 + g, 3, 5, 0xb77845);
      break;
    case "crab":
      for (const [side, lift] of [
        [-1, f],
        [1, b],
      ]) {
        r(side < 0 ? -17 : 10, 0 - lift, 7, 2, 0xa7634d);
        r(side < 0 ? -19 : 12, 4 - lift, 7, 2, 0xa7634d);
      }
      r(-12, -8, 24, 11, 0xc77d61);
      r(-8, -11, 16, 5, 0xdb9672);
      r(-8, -16, 3, 6, 0xc77d61);
      r(5, -16, 3, 6, 0xc77d61);
      r(-8, -17, 3, 3, ink);
      r(5, -17, 3, 3, ink);
      r(-19, -10, 7, 4, 0xc77d61);
      r(12, -10, 7, 4, 0xc77d61);
      r(-23, -17, 7, 7, 0xdb9672);
      r(16, -17, 7, 7, 0xdb9672);
      r(-23, -20, 2, 4, 0xdb9672);
      r(-18, -20, 2, 4, 0xdb9672);
      r(16, -20, 2, 4, 0xdb9672);
      r(21, -20, 2, 4, 0xdb9672);
      break;
    case "robot":
      r(-11, 0, 7, 6 - f, 0x4f626c);
      r(4, 0, 7, 6 - b, 0x4f626c);
      r(-12, -18, 24, 20, 0x8faeb5);
      r(-10, -16, 20, 11, 0x344c5a);
      r(-7, -13, 4, 3, 0xace0c2);
      r(4, -13, 4, 3, 0xace0c2);
      r(-3, -7, 6, 2, 0x6fa6a4);
      r(-1, -25, 2, 7, 0x8faeb5);
      r(-3, -28, 6, 4, 0xd4be79);
      r(-16, -11, 4, 9, 0x708e98);
      r(12, -11, 4, 9, 0x708e98);
      r(-4, -2, 8, 3, 0xd4be79);
      break;
  }
}
