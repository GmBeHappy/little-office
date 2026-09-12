type Pixel = (
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha?: number,
) => void;

export type MapEffect =
  | {
      kind: "ripple";
      x: number;
      y: number;
      w: number;
      h: number;
      color: number;
    }
  | {
      kind: "leaves";
      x: number;
      y: number;
      spread: number;
      fall: number;
      color: number;
    };

export type MapEffectSink = (effect: MapEffect) => void;

// Static previews keep their reflections; the live map animates these same pixels.
export function waterRipple(
  rect: Pixel,
  effect: MapEffectSink | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
) {
  if (effect) effect({ kind: "ripple", x, y, w, h, color });
  else rect(x, y, w, h, color);
}

export function drawMapEffects(
  effects: readonly MapEffect[],
  time: number,
  reducedMotion: boolean,
  rect: Pixel,
) {
  for (const effect of effects) {
    const seed = effect.x * 0.13 + effect.y * 0.07;
    if (effect.kind === "ripple") {
      const phase = time / 1100 + seed;
      rect(
        Math.round(effect.x + (reducedMotion ? 0 : Math.sin(phase) * 4)),
        effect.y,
        effect.w,
        effect.h,
        effect.color,
        reducedMotion ? 1 : 0.7 + Math.sin(phase + 1) * 0.25,
      );
    } else if (!reducedMotion) {
      // Four staggered leaves per tree: no accumulating particles or random resets.
      for (let i = 0; i < 4; i++) {
        const phase = (time / (6500 + i * 700) + seed + i * 0.27) % 1;
        const sway = Math.sin(phase * Math.PI * 4 + seed + i);
        rect(
          Math.round(
            effect.x + ((i / 3) * 2 - 1) * effect.spread + sway * 7 + phase * 9,
          ),
          Math.round(effect.y + phase * effect.fall),
          Math.abs(sway) > 0.5 ? 4 : 2,
          2,
          effect.color,
          Math.min(1, phase * 8, (1 - phase) * 5),
        );
      }
    }
  }
}
