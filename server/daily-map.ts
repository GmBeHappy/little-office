import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { MAPS } from "../shared/maps";
import { db, workspaceSettings } from "./db";
import { workspaces } from "./schema";

export function mapDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// A persisted day and optimistic revision prevent repeat rolls across restarts
// and keep an owner's concurrent settings save from being overwritten.
export async function rotateDailyMap(now = new Date(), canRotate = () => true) {
  const current = await workspaceSettings();
  const date = mapDay(now);
  if (
    !current.dailyMap.enabled ||
    current.dailyMap.date >= date ||
    !canRotate()
  )
    return;
  const choices = MAPS.filter(
    (map) => map.size === "small" && map.id !== current.mapId,
  );
  if (!choices.length) return;
  const [next] = await db
    .update(workspaces)
    .set({
      mapId: choices[randomInt(choices.length)].id,
      dailyMap: { enabled: true, date },
      revision: sql`${workspaces.revision}+1`,
    })
    .where(and(eq(workspaces.id, 1), eq(workspaces.revision, current.revision)))
    .returning({
      name: workspaces.name,
      mapId: workspaces.mapId,
      revision: workspaces.revision,
      features: workspaces.features,
      dailyMap: workspaces.dailyMap,
    });
  return next;
}
