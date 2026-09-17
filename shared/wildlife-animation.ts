// The farm livestock and map wildlife share the same two-frame gait.
export type WildlifeMode = "walk" | "idle" | "graze";
export function wildlifeAnimation(
  mode: WildlifeMode,
  walkTime: number,
  poseTime: number,
) {
  const frame = Math.floor(walkTime / 160) % 2;
  return {
    frame,
    bob: mode === "walk" && frame ? -1 : 0,
    graze: mode === "graze" && Math.floor(poseTime / 240) % 2 ? 7 : 0,
    frontLift: mode === "walk" && frame ? 2 : 0,
    backLift: mode === "walk" && !frame ? 2 : 0,
  };
}
