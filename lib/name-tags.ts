export type NameTagPreferences = { size: number; opacity: number };
export const DEFAULT_NAME_TAGS: NameTagPreferences = { size: 10, opacity: 85 };

export function readNameTagPreferences(value: unknown): NameTagPreferences {
  const source =
    value && typeof value === "object"
      ? (value as Partial<NameTagPreferences>)
      : {};
  const clamp = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.round(value)))
      : fallback;
  return {
    size: clamp(source.size, DEFAULT_NAME_TAGS.size, 8, 16),
    opacity: clamp(source.opacity, DEFAULT_NAME_TAGS.opacity, 0, 100),
  };
}

export function nameTagColors(
  preferences: NameTagPreferences,
  speaking = false,
) {
  const lightText = speaking && preferences.opacity >= 50;
  return {
    background: `rgba(${speaking ? "40, 121, 79" : "250, 247, 233"}, ${preferences.opacity / 100})`,
    text: lightText ? "#ffffff" : speaking ? "#205e3e" : "#3b4839",
    outline: preferences.opacity < 50 ? 2 : 0,
    lightText,
  };
}
