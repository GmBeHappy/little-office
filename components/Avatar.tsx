import { drawCharacter } from "@/shared/avatars";
import { isAvatar } from "@/shared/appearance";
import type { Person } from "@/shared/world";
import type { ReactNode } from "react";
export function Avatar({
  color = "sage",
  direction = "down",
}: {
  color?: string;
  direction?: Person["direction"];
}) {
  const id = isAvatar(color) ? color : "sage";
  const pixels: ReactNode[] = [];
  drawCharacter(id, direction, 0, (x, y, width, height, fill) => {
    pixels.push(
      <rect
        key={pixels.length}
        x={direction === "left" ? -x - width : x}
        y={y}
        width={width}
        height={height}
        fill={"#" + fill.toString(16).padStart(6, "0")}
      />,
    );
  });
  return (
    <svg
      className={`pixel-avatar avatar-${id.startsWith("custom:") ? "custom" : id}`}
      data-avatar={id}
      viewBox="-20 -50 40 64"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {pixels}
    </svg>
  );
}
