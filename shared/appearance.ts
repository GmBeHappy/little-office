export const SKIN_TONES = [
  { name: "Light", color: 0xf5d7bf },
  { name: "Medium light", color: 0xe7b18d },
  { name: "Medium", color: 0xc98d65 },
  { name: "Medium deep", color: 0x975e43 },
  { name: "Deep", color: 0x5b372b },
] as const;
export const HAIR_STYLES = [
  { name: "Short crop", color: 0x45372e },
  { name: "Soft curls", color: 0x292831 },
  { name: "Classic bob", color: 0x633d45 },
  { name: "Spiky hair", color: 0x795138 },
  { name: "Ponytail", color: 0x34323e },
  { name: "Buzz cut", color: 0x332c28 },
  { name: "Side part", color: 0x704b35 },
  { name: "Long waves", color: 0x3e2f32 },
  { name: "Twin tails", color: 0x5b3d35 },
  { name: "Mohawk", color: 0x9a4d56 },
  { name: "Afro", color: 0x2b292d },
  { name: "Top knot", color: 0x4d352c },
  { name: "Braids", color: 0x362c2a },
  { name: "Undercut", color: 0x67615c },
  { name: "Shaggy hair", color: 0x9b6b45 },
] as const;
export const HATS = [
  "No hat",
  "Cap",
  "Beanie",
  "Sun hat",
  "Headphones",
  "Crown",
  "Bucket hat",
  "Beret",
  "Cowboy hat",
  "Wizard hat",
  "Party hat",
  "Cat ears",
  "Flower crown",
  "Headband",
  "Halo",
] as const;
export const OUTFITS = [
  { name: "Forest hoodie", color: 0x547d60, pants: 0x4c5148 },
  { name: "Denim overalls", color: 0xcd755a, pants: 0x4b647c },
  { name: "Golden jacket", color: 0xc7a44e, pants: 0x4a5946 },
  { name: "Ocean shirt", color: 0x668eb7, pants: 0x39485b },
  { name: "Lilac sweater", color: 0x8e6db0, pants: 0x50455f },
  { name: "Red varsity jacket", color: 0xa94f4f, pants: 0x343b4b },
  { name: "White lab coat", color: 0xe8e6dc, pants: 0x4f6871 },
  { name: "Navy suit", color: 0x35465f, pants: 0x283549 },
  { name: "Sakura kimono", color: 0xd9889b, pants: 0x725068 },
  { name: "Space suit", color: 0xcbd4d2, pants: 0x59676f },
  { name: "Beach shirt", color: 0x54a9a3, pants: 0xd3a75c },
  { name: "Thai silk shirt", color: 0x8c5aa2, pants: 0x3e3549 },
  { name: "Camping vest", color: 0x9a7445, pants: 0x4b5941 },
  { name: "Black turtleneck", color: 0x34343b, pants: 0x282a31 },
  { name: "Rainbow tee", color: 0x5f83b6, pants: 0x414957 },
] as const;
type SkinChoice = 0 | 1 | 2 | 3 | 4;
type StyleChoice =
  0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type Appearance = {
  skin: SkinChoice;
  hair: StyleChoice;
  hat: StyleChoice;
  clothes: StyleChoice;
};
export type AvatarId =
  | "sage"
  | "plum"
  | "coral"
  | "blue"
  | "gold"
  | "rose"
  | `custom:${SkinChoice}:${StyleChoice}:${StyleChoice}:${StyleChoice}`;
export const AVATAR_PATTERN =
  "^(sage|plum|coral|blue|gold|rose|custom:[0-4]:(?:[0-9]|1[0-4]):(?:[0-9]|1[0-4]):(?:[0-9]|1[0-4]))$";
const avatarPattern = new RegExp(AVATAR_PATTERN);
export function isAvatar(value: unknown): value is AvatarId {
  return typeof value === "string" && avatarPattern.test(value);
}
export function customAppearance(value: string): Appearance | null {
  if (!value.startsWith("custom:") || !isAvatar(value)) return null;
  const [, skin, hair, hat, clothes] = value.split(":").map(Number);
  return { skin, hair, hat, clothes } as Appearance;
}
export function appearanceFor(value: string): Appearance {
  const custom = customAppearance(value);
  if (custom) return custom;
  const presets: Record<string, Appearance> = {
    sage: { skin: 1, hair: 3, hat: 0, clothes: 0 },
    blue: { skin: 3, hair: 0, hat: 2, clothes: 3 },
    coral: { skin: 2, hair: 2, hat: 0, clothes: 1 },
    gold: { skin: 2, hair: 0, hat: 1, clothes: 2 },
    plum: { skin: 0, hair: 4, hat: 0, clothes: 4 },
  };
  return presets[value] || presets.sage;
}
export function avatarId(value: Appearance): AvatarId {
  return `custom:${value.skin}:${value.hair}:${value.hat}:${value.clothes}`;
}
