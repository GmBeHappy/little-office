import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.APP_URL || "http://localhost:3000",
    headless: true,
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--auto-select-desktop-capture-source=Entire screen",
        "--enable-usermedia-screen-capturing",
      ],
    },
    permissions: ["microphone", "camera"],
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
