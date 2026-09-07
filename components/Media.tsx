"use client";
import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  createLocalScreenTracks,
  type LocalTrack,
  type TrackPublication,
} from "livekit-client";
import { api } from "@/lib/api";
import { nearby, type Person } from "@/shared/world";

export function useOfficeMedia(
  self: Person | undefined,
  people: Person[],
  notify: (s: string) => void,
) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [revision, bump] = useState(0);
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [speaking, setSpeaking] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [input, setInput] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const wanted = useRef({ mic: false, camera: false });
  const current = useRef<Room | null>(null);
  const pendingScreen = useRef<LocalTrack[]>([]);
  const preparing = useRef(false);
  function cancelShare() {
    for (const track of pendingScreen.current) track.stop();
    pendingScreen.current = [];
    preparing.current = false;
  }
  const roomId = self?.room || "";
  useEffect(() => {
    let cancelled = false;
    let next: Room | undefined;
    setConnected(false);
    setSpeaking([]);
    setError("");
    setRoom(null);
    setMic(false);
    setCamera(false);
    if (!roomId) return;
    (async () => {
      try {
        const access = await api<{ token: string; url: string; room: string }>(
          "/media/token",
          {},
        );
        if (cancelled || access.room !== roomId) return;
        next = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            resolution: { width: 640, height: 360, frameRate: 20 },
          },
        });
        current.current = next;
        next.on(RoomEvent.ActiveSpeakersChanged, (participants) =>
          setSpeaking(participants.map((p) => p.identity)),
        );
        for (const event of [
          RoomEvent.TrackSubscribed,
          RoomEvent.TrackUnsubscribed,
          RoomEvent.TrackPublished,
          RoomEvent.LocalTrackPublished,
          RoomEvent.LocalTrackUnpublished,
          RoomEvent.ParticipantConnected,
          RoomEvent.ParticipantDisconnected,
          RoomEvent.TrackMuted,
          RoomEvent.TrackUnmuted,
        ])
          next.on(event, () => bump((v) => v + 1));
        next.on(RoomEvent.Reconnecting, () => {
          setConnected(false);
          setSpeaking([]);
        });
        next.on(RoomEvent.Reconnected, () => setConnected(true));
        next.on(RoomEvent.Disconnected, () => {
          setConnected(false);
          setSpeaking([]);
          setMic(false);
          setCamera(false);
        });
        await next.connect(access.url, access.token, { autoSubscribe: false });
        if (cancelled) {
          await next.disconnect();
          return;
        }
        setRoom(next);
        setConnected(true);
        try {
          if (wanted.current.mic) {
            await next.localParticipant.setMicrophoneEnabled(true);
            setMic(true);
          }
          if (wanted.current.camera) {
            await next.localParticipant.setCameraEnabled(true);
            setCamera(true);
          }
        } catch {
          wanted.current = { mic: false, camera: false };
          notify(
            "Device access was not granted. You can enable your microphone or camera from the toolbar.",
          );
        }
        bump((v) => v + 1);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      current.current = null;
      cancelShare();
      if (next) {
        next.removeAllListeners();
        void next.disconnect();
      }
    };
  }, [roomId]);
  useEffect(() => {
    if (!room || !self) return;
    for (const p of room.remoteParticipants.values()) {
      const person = people.find((m) => m.id === p.identity);
      const audible =
        !!person &&
        person.conversation === self.conversation &&
        (self.conversation !== "floor" || nearby(self, person, 190));
      for (const pub of p.trackPublications.values())
        pub.setSubscribed(audible);
      p.setVolume(
        audible && self.conversation === "floor" && person
          ? Math.max(
              0.15,
              1 - Math.hypot(self.x - person.x, self.y - person.y) / 220,
            )
          : 1,
      );
    }
  }, [room, self, people, revision]);
  async function toggle(kind: "mic" | "camera") {
    const active = kind === "mic" ? mic : camera;
    if (!current.current || !connected) {
      notify("Join nearby audio or a meeting room first.");
      return;
    }
    try {
      if (kind === "mic")
        await current.current.localParticipant.setMicrophoneEnabled(!active);
      else await current.current.localParticipant.setCameraEnabled(!active);
      wanted.current[kind] = !active;
      if (kind === "mic") setMic(!active);
      else setCamera(!active);
      bump((v) => v + 1);
    } catch (e) {
      notify(
        `Could not enable ${kind === "mic" ? "microphone" : "camera"}: ${(e as Error).message}`,
      );
    }
  }
  async function prepareShare() {
    if (preparing.current)
      throw new Error("A screen-share request is already in progress.");
    preparing.current = true;
    const target = current.current;
    try {
      const tracks = await createLocalScreenTracks({ audio: true });
      if (target !== current.current) {
        tracks.forEach((t) => t.stop());
        throw new Error("The conversation changed. Choose your screen again.");
      }
      pendingScreen.current = tracks;
    } catch (e) {
      preparing.current = false;
      throw e;
    }
  }
  async function share(enabled: boolean) {
    if (!current.current) {
      cancelShare();
      return;
    }
    if (enabled) {
      const tracks = pendingScreen.current;
      pendingScreen.current = [];
      try {
        for (const track of tracks)
          await current.current.localParticipant.publishTrack(track);
      } catch (e) {
        for (const track of tracks) {
          await current.current.localParticipant.unpublishTrack(track);
          track.stop();
        }
        throw e;
      } finally {
        preparing.current = false;
      }
    } else {
      cancelShare();
      await current.current.localParticipant.setScreenShareEnabled(false);
    }
    bump((v) => v + 1);
  }
  async function enumerate() {
    try {
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch {
      notify("Device information is unavailable.");
    }
  }
  async function switchDevice(kind: "audioinput" | "videoinput", id: string) {
    try {
      if (!room) return;
      await room.switchActiveDevice(kind, id);
      if (kind === "audioinput") setInput(id);
      else setVideoInput(id);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return {
    room,
    connected,
    mic,
    camera,
    speaking:
      connected && room?.name === roomId && self
        ? speaking.filter((id) => {
            if (id === self.id) return mic;
            const person = people.find((p) => p.id === id);
            return (
              !!person &&
              !!room.remoteParticipants.get(id)?.isMicrophoneEnabled &&
              person.conversation === self.conversation &&
              (self.conversation !== "floor" || nearby(self, person, 190))
            );
          })
        : [],
    error,
    toggle,
    share,
    prepareShare,
    cancelShare,
    revision,
    devices,
    enumerate,
    switchDevice,
    input,
    videoInput,
  };
}
export function SpeakingIndicator() {
  return (
    <span
      className="speaking-indicator"
      role="img"
      aria-label="Speaking"
      title="Speaking"
    >
      <i />
      <i />
      <i />
    </span>
  );
}
export function MediaTracks({
  room,
  revision,
  speaking,
}: {
  room: Room | null;
  revision: number;
  speaking: string[];
}) {
  const tracks: {
    pub: TrackPublication;
    name: string;
    local: boolean;
    identity: string;
  }[] = [];
  if (room) {
    for (const participant of [
      room.localParticipant,
      ...room.remoteParticipants.values(),
    ])
      for (const pub of participant.trackPublications.values())
        if (pub.track && !pub.isMuted)
          tracks.push({
            pub,
            name: participant.name || "Teammate",
            identity: participant.identity,
            local: participant === room.localParticipant,
          });
  }
  const screens = tracks.filter(
    (t) => t.pub.source === Track.Source.ScreenShare,
  );
  const cameras = tracks.filter((t) => t.pub.source === Track.Source.Camera);
  return (
    <>
      <div className="audio-tracks" aria-hidden="true">
        {tracks
          .filter((t) => t.pub.kind === Track.Kind.Audio && !t.local)
          .map((t) => (
            <AttachedTrack key={t.pub.trackSid} pub={t.pub} local={false} />
          ))}
      </div>
      {!!(screens.length || cameras.length) && (
        <div className={`video-strip ${screens.length ? "with-screen" : ""}`}>
          {[...screens, ...cameras].map((t) => (
            <div
              className={`video-tile ${t.pub.source === Track.Source.ScreenShare ? "screen-tile" : ""}`}
              data-speaking={speaking.includes(t.identity)}
              key={t.pub.trackSid}
            >
              <AttachedTrack pub={t.pub} local={t.local} />
              <span className="video-caption">
                {speaking.includes(t.identity) && <SpeakingIndicator />}
                {t.name}
                {t.local ? " · you" : ""}
                {t.pub.source === Track.Source.ScreenShare
                  ? " · presenting"
                  : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function AttachedTrack({
  pub,
  local,
}: {
  pub: TrackPublication;
  local: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const track = pub.track;
    if (!track || !host.current) return;
    const element = track.attach();
    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
      if (local) element.muted = true;
    }
    host.current.appendChild(element);
    void element.play().catch(() => {});
    return () => {
      track.detach(element);
      element.remove();
    };
  }, [pub.track, local]);
  return <div ref={host} className="track" />;
}
