import { readFileSync } from "node:fs";
export const pushPlatforms = ["web", "ios", "macos", "android"] as const;
export type PushPlatform = (typeof pushPlatforms)[number];
type Client = {
  projectId: string;
  appId: string;
  apiKey: string;
  messagingSenderId: string;
  authDomain: string;
};
type Settings = Partial<Record<PushPlatform, Client>> & { vapidKey?: string };
let settings: Settings = {};
if (process.env.FCM_CLIENT_CONFIG_FILE) {
  settings = JSON.parse(
    readFileSync(process.env.FCM_CLIENT_CONFIG_FILE, "utf8"),
  );
}
export const pushProject = process.env.FCM_PROJECT_ID || "";
const enabled = new Set(
  (process.env.FCM_PLATFORMS || "").split(",").map((p) => p.trim()),
);
export function pushConfig(platform: PushPlatform) {
  const firebase = settings[platform];
  const valid =
    !!firebase &&
    firebase.projectId === pushProject &&
    !!firebase.appId &&
    !!firebase.apiKey &&
    !!firebase.messagingSenderId;
  const vapidKey = platform === "web" ? (settings.vapidKey ?? null) : null;
  return {
    enabled:
      !!pushProject &&
      enabled.has(platform) &&
      valid &&
      (platform !== "web" || !!vapidKey?.match(/^B[A-Za-z0-9_-]{86}$/)),
    firebase: valid ? firebase : null,
    vapidKey,
  };
}
export const pushConfigured = pushPlatforms.some((p) => pushConfig(p).enabled);
