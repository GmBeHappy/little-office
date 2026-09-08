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
] as const;
export const HATS = [
  "No hat",
  "Cap",
  "Beanie",
  "Sun hat",
  "Headphones",
  "Crown",
] as const;
export const OUTFITS = [
  { name: "Forest hoodie", color: 0x547d60, pants: 0x4c5148 },
  { name: "Denim overalls", color: 0xcd755a, pants: 0x4b647c },
  { name: "Golden jacket", color: 0xc7a44e, pants: 0x4a5946 },
  { name: "Ocean shirt", color: 0x668eb7, pants: 0x39485b },
  { name: "Lilac sweater", color: 0x8e6db0, pants: 0x50455f },
] as const;
type Choice = 0 | 1 | 2 | 3 | 4;
export type Appearance = {
  skin: Choice;
  hair: Choice;
  hat: Choice | 5;
  clothes: Choice;
};
export type AvatarId =
  | "sage"
  | "plum"
  | "coral"
  | "blue"
  | "gold"
  | "rose"
  | `custom:${Choice}:${Choice}:${Choice | 5}:${Choice}`;
export const AVATAR_PATTERN =
  "^(sage|plum|coral|blue|gold|rose|custom:[0-4]:[0-4]:[0-5]:[0-4])$";
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
