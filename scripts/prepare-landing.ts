import { mkdir, writeFile } from "node:fs/promises";
import { MAPS, drawOfficeMap } from "../shared/maps";
import { drawCharacter } from "../shared/avatars";
import { drawWildlife } from "../shared/wildlife-art";
import { wildlifeAnimation } from "../shared/wildlife-animation";
await mkdir("public/landing", { recursive: true });
const svg = (w: number, h: number, shapes: string[], box = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${w}" height="${h}" shape-rendering="crispEdges">${shapes.join("")}</svg>`;
const painter =
  (shapes: string[]) =>
  (x: number, y: number, w: number, h: number, c: number) => {
    shapes.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#${c.toString(16).padStart(6, "0")}"/>`,
    );
  };
for (const id of ["zen-small", "beach-small", "camping-small", "space-small"]) {
  const shapes: string[] = [];
  drawOfficeMap(
    MAPS.find((m) => m.id === id)!,
    painter(shapes),
    () => {},
  );
  await writeFile(`public/landing/${id}.svg`, svg(1120, 720, shapes));
}
for (const id of ["sage", "gold"] as const) {
  const shapes: string[] = [];
  drawCharacter(id, "right", 0, painter(shapes));
  await writeFile(
    `public/landing/${id}.svg`,
    svg(46, 62, shapes, "-23 -44 46 62"),
  );
}
for (const id of ["cat", "rabbit"] as const) {
  const shapes: string[] = [];
  drawWildlife(id, wildlifeAnimation("idle", 0, 0), painter(shapes));
  await writeFile(
    `public/landing/${id}.svg`,
    svg(50, 48, shapes, "-25 -36 50 48"),
  );
}
