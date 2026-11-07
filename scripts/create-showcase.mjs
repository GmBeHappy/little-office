// Render fictional demo screens with repository artwork, then encode with FFmpeg.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("@playwright/test");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const media = join(root, "docs/media");
const temp = await mkdtemp(join(tmpdir(), "little-office-showcase-"));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed`);
}
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (let i = 0; i < 4; i++) {
    const url = pathToFileURL(join(media, "showcase.html"));
    url.searchParams.set("scene", String(i));
    await page.goto(url.href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
    });
    assert.equal(await page.locator("h1").count(), 1);
    assert.deepEqual(errors, [], "Showcase must render without script errors");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      1600,
      "Unexpected horizontal overflow",
    );
    await page.screenshot({ path: join(temp, `scene-${i}.png`) });
  }
  await browser.close();
  browser = undefined;
  await copyFile(
    join(temp, "scene-0.png"),
    join(media, "workspace-mockup.png"),
  );
  // Six seconds per chapter, with half-second dissolves: 22.5 seconds total.
  const inputs = Array.from({ length: 4 }, (_, i) => [
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    join(temp, `scene-${i}.png`),
  ]).flat();
  const filters =
    Array.from(
      { length: 4 },
      (_, i) =>
        `[${i}:v]scale=1920:1080,zoompan=z='1+0.012*on/180':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=180:s=1600x900:fps=30,trim=duration=6,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[v${i}]`,
    ).join(";") +
    ";[v0][v1]xfade=transition=fade:duration=0.5:offset=5.5[a];[a][v2]xfade=transition=fade:duration=0.5:offset=11[b];[b][v3]xfade=transition=fade:duration=0.5:offset=16.5[out]";
  run(process.env.FFMPEG || "ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    ...inputs,
    "-filter_complex",
    filters,
    "-map",
    "[out]",
    "-t",
    "22.5",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    join(media, "workspace-showcase.mp4"),
  ]);
  run(process.env.FFPROBE || "ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height,pix_fmt,r_frame_rate:format=duration,size",
    "-of",
    "json",
    join(media, "workspace-showcase.mp4"),
  ]);
  console.log(
    "Created docs/media/workspace-mockup.png and workspace-showcase.mp4",
  );
} finally {
  await browser?.close();
  await rm(temp, { recursive: true, force: true });
}
