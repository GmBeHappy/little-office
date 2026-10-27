import { serverLog, diagnosticRef, errorKind } from "./diagnostics";
import type { DiagnosticReason } from "../shared/diagnostics";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import { config } from "./config";
export const mediaConfigured = !!(
  config.livekitUrl &&
  config.livekitKey &&
  config.livekitSecret
);
const client = mediaConfigured
  ? new RoomServiceClient(
      config.livekitInternal,
      config.livekitKey,
      config.livekitSecret,
    )
  : null;
// A failed retirement blocks new media admission until it can be retried safely.
const retired = new Set<string>();
let work: Promise<void> = Promise.resolve();
let initialized: Promise<void> | undefined;
const uuid = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
// Match the complete workspace/epoch/generation suffix so namespace prefixes cannot overlap.
const deploymentRoom = new RegExp(`^${config.mediaNamespace}(?:-${uuid}){3}$`);
function clearPreviousProcessRooms() {
  if (!initialized)
    initialized = (async () => {
      for (const old of await client!.listRooms())
        if (deploymentRoom.test(old.name)) {
          retired.add(old.name);
          serverLog("media.retire", {
            roomRef: diagnosticRef(old.name),
            reason: "process_cleanup",
          });
        }
      await flushRetired();
    })().catch((error) => {
      initialized = undefined;
      throw error;
    });
  return initialized;
}
export function retireRoom(
  room: string,
  reason: DiagnosticReason = "unspecified",
) {
  serverLog("media.retire", { roomRef: diagnosticRef(room), reason });
  retired.add(room);
  work = work.then(flushRetired).catch(() => {});
}
export async function flushRetired() {
  if (!client) return;
  for (const room of retired) {
    try {
      await client.deleteRoom(room);
      retired.delete(room);
      serverLog("media.deleted", { roomRef: diagnosticRef(room) });
    } catch (error) {
      if ((error as { status?: number }).status === 404) retired.delete(room);
      else {
        serverLog(
          "media.delete_failed",
          { roomRef: diagnosticRef(room), errorKind: errorKind(error) },
          "error",
        );
        throw error;
      }
    }
  }
}
export async function tokenFor(
  room: string,
  id: string,
  name: string,
  present: boolean,
) {
  if (!client)
    throw new Error(
      "Media is not configured. Set the LiveKit variables on the server.",
    );
  await clearPreviousProcessRooms();
  await work;
  await flushRetired();
  if (retired.has(room)) throw new Error("This conversation has ended.");
  const token = new AccessToken(config.livekitKey, config.livekitSecret, {
    identity: id,
    name,
    ttl: "2m",
  });
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: sources(present),
  });
  return { token: await token.toJwt(), url: config.livekitUrl, room };
}
function sources(present: boolean) {
  return [
    TrackSource.MICROPHONE,
    TrackSource.CAMERA,
    ...(present
      ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : []),
  ];
}
export async function setPresenter(room: string, id: string, present: boolean) {
  if (client)
    await client.updateParticipant(room, id, {
      permission: {
        canPublish: true,
        canSubscribe: true,
        canPublishSources: sources(present),
      },
    });
}
