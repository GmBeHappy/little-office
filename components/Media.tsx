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

type DeviceChoices = Record<MediaDeviceKind, string>;
const defaultDevices: DeviceChoices = {
  audioinput: "",
  audiooutput: "",
  videoinput: "",
};
type OutputPicker = MediaDevices & {
  selectAudioOutput?: (options?: {
    deviceId?: string;
  }) => Promise<MediaDeviceInfo>;
};

export function useOfficeMedia(
  self: Person | undefined,
  people: Person[],
  notify: (s: string) => void,
  userId?: string,
) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [revision, bump] = useState(0);
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [speaking, setSpeaking] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [chimeBlocked, setChimeBlocked] = useState(false);
  const chime = useRef<HTMLAudioElement | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [choices, setChoices] = useState<DeviceChoices>(defaultDevices);
  const preferences = useRef<DeviceChoices>(defaultDevices);
  const [outputSupported, setOutputSupported] = useState(false);
  const [outputPickerSupported, setOutputPickerSupported] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const deviceChange = useRef(false);
  const wanted = useRef({ mic: false, camera: false });
  const current = useRef<Room | null>(null);
  const pendingScreen = useRef<LocalTrack[]>([]);
  const preparing = useRef(false);
  function remember(kind: MediaDeviceKind, id: string) {
    const next = { ...preferences.current, [kind]: id };
    preferences.current = next;
    setChoices(next);
    try {
      if (userId)
        localStorage.setItem(`office-devices:${userId}`, JSON.stringify(next));
    } catch {
      notify(
        "Device changed, but this browser could not save your preference.",
      );
    }
  }
  useEffect(() => {
    wanted.current = { mic: false, camera: false };
    let saved: DeviceChoices = { ...defaultDevices };
    try {
      const value = JSON.parse(
        localStorage.getItem(`office-devices:${userId}`) || "{}",
      );
      for (const kind of Object.keys(saved) as MediaDeviceKind[])
        if (typeof value?.[kind] === "string") saved[kind] = value[kind];
    } catch {
      /* Unavailable storage uses system defaults. */
    }
    preferences.current = saved;
    setChoices(saved);
    setOutputSupported("setSinkId" in HTMLMediaElement.prototype);
    setOutputPickerSupported(
      typeof (navigator.mediaDevices as OutputPicker)?.selectAudioOutput ===
        "function",
    );
    const changed = () => void enumerate(false, true);
    navigator.mediaDevices?.addEventListener("devicechange", changed);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", changed);
      chime.current?.pause();
      chime.current = null;
    };
  }, [userId]);
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
    setConnecting(!!roomId);
    setSpeaking([]);
    setError("");
    setPlaybackBlocked(false);
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
        // Validate a saved output before remote tracks attach; unavailable devices use the default.
        if (
          preferences.current.audiooutput &&
          "setSinkId" in HTMLMediaElement.prototype
        ) {
          try {
            await new Audio().setSinkId(preferences.current.audiooutput);
          } catch {
            if (cancelled) return;
            remember("audiooutput", "");
            notify(
              "Your saved speaker is unavailable. Using system default; choose it again in Devices.",
            );
          }
        }
        if (cancelled) return;
        next = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            deviceId: preferences.current.audioinput || undefined,
          },
          audioOutput:
            "setSinkId" in HTMLMediaElement.prototype
              ? { deviceId: preferences.current.audiooutput }
              : undefined,
          videoCaptureDefaults: {
            deviceId: preferences.current.videoinput || undefined,
            resolution: { width: 640, height: 360, frameRate: 20 },
          },
        });
        current.current = next;
        next.on(RoomEvent.AudioPlaybackStatusChanged, () =>
          setPlaybackBlocked(!next!.canPlaybackAudio),
        );
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
          setConnecting(true);
          setSpeaking([]);
        });
        next.on(RoomEvent.Reconnected, () => {
          setConnected(true);
          setConnecting(false);
        });
        next.on(RoomEvent.Disconnected, () => {
          setConnected(false);
          setConnecting(false);
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
        void enumerate();
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
      } finally {
        if (!cancelled) setConnecting(false);
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
  }, [roomId, userId, attempt]);
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
      void enumerate();
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
  async function enumerate(requestAccess = false, resetMissing = false) {
    try {
      if (requestAccess) {
        // Reveal device names without publishing audio or leaving a capture running.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);
      if (resetMissing) {
        for (const kind of Object.keys(defaultDevices) as MediaDeviceKind[]) {
          const id = preferences.current[kind];
          if (
            id &&
            id !== "default" &&
            !list.some((d) => d.kind === kind && d.deviceId === id)
          ) {
            if (await switchDevice(kind, ""))
              notify("A selected device disconnected. Using system default.");
          }
        }
      }
    } catch (e) {
      notify(`Could not access devices: ${(e as Error).message}`);
    }
  }
  async function switchDevice(kind: MediaDeviceKind, id: string) {
    if (deviceChange.current) return false;
    deviceChange.current = true;
    setDeviceBusy(true);
    try {
      const target = current.current;
      if (kind === "audiooutput") {
        if (!("setSinkId" in HTMLMediaElement.prototype))
          throw new Error(
            "Choose your output device in your system sound settings.",
          );
        await new Audio().setSinkId(id);
      }
      if (
        target &&
        !(await target.switchActiveDevice(
          kind,
          id || (kind === "audiooutput" ? "" : "default"),
        ))
      )
        throw new Error(
          "The device could not be selected. Please choose another device.",
        );
      if (target !== current.current)
        throw new Error(
          "The conversation changed. Please choose your device again.",
        );
      remember(kind, id);
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      deviceChange.current = false;
      setDeviceBusy(false);
    }
  }
  async function chooseOutput() {
    try {
      const device = await (
        navigator.mediaDevices as OutputPicker
      ).selectAudioOutput?.({
        deviceId: preferences.current.audiooutput || undefined,
      });
      if (!device) return;
      await switchDevice("audiooutput", device.deviceId);
      await enumerate();
    } catch (e) {
      notify(`Speaker selection was not completed: ${(e as Error).message}`);
    }
  }
  async function playNudge() {
    chime.current?.pause();
    const sound = new Audio("/sounds/nudge.wav");
    sound.volume = 0.5;
    chime.current = sound;
    try {
      if (preferences.current.audiooutput && "setSinkId" in sound)
        await sound.setSinkId(preferences.current.audiooutput);
      await sound.play();
      setChimeBlocked(false);
    } catch {
      setChimeBlocked(true);
    }
  }
  async function enableSound() {
    try {
      await current.current?.startAudio();
      if (chimeBlocked && chime.current) await chime.current.play();
      setChimeBlocked(false);
      setPlaybackBlocked(false);
    } catch {
      notify("Sound could not start. Check your browser's audio permission.");
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
    retry: () => retry((v) => v + 1),
    playNudge,
    enableSound,
    soundBlocked: playbackBlocked || chimeBlocked,
    toggle,
    share,
    prepareShare,
    cancelShare,
    revision,
    devices,
    enumerate,
    switchDevice,
    input: choices.audioinput,
    output: choices.audiooutput,
    videoInput: choices.videoinput,
    outputSupported,
    outputPickerSupported,
    chooseOutput,
    deviceBusy: deviceBusy || connecting,
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
