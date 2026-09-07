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
function clearPreviousProcessRooms() {
  if (!initialized)
    initialized = (async () => {
      for (const old of await client!.listRooms())
        if (old.name.startsWith("office-")) retired.add(old.name);
      await flushRetired();
    })().catch((error) => {
      initialized = undefined;
      throw error;
    });
  return initialized;
}
export function retireRoom(room: string) {
  retired.add(room);
  work = work.then(flushRetired).catch(() => {});
}
async function flushRetired() {
  if (!client) return;
  for (const room of retired) {
    try {
      await client.deleteRoom(room);
      retired.delete(room);
    } catch (error) {
      if ((error as { status?: number }).status === 404) retired.delete(room);
      else throw error;
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
