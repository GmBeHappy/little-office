// Capture targets and encoder ceilings; browsers may negotiate lower values.
export const MEDIA_QUALITY = {
  maximum: {
    label: "Maximum · up to 4K / 60 fps",
    resolution: { width: 3840, height: 2160, frameRate: 60 },
    cameraBitrate: 20_000_000,
    screenBitrate: 30_000_000,
  },
  high: {
    label: "High · up to 1080p / 60 fps",
    resolution: { width: 1920, height: 1080, frameRate: 60 },
    cameraBitrate: 6_000_000,
    screenBitrate: 10_000_000,
  },
  balanced: {
    label: "Balanced · up to 720p / 30 fps",
    resolution: { width: 1280, height: 720, frameRate: 30 },
    cameraBitrate: 2_500_000,
    screenBitrate: 5_000_000,
  },
} as const;
export type MediaQuality = keyof typeof MEDIA_QUALITY;
