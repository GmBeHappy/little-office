"use client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  BarChart3,
  Grid2X2,
  Maximize2,
  Minimize2,
  Monitor,
  PanelTop,
  PanelTopClose,
  Pin,
  PinOff,
} from "lucide-react";
import {
  Room,
  RoomEvent,
  Track,
  createLocalScreenTracks,
  ScreenSharePresets,
  getBrowser,
  type LocalTrack,
  type TrackPublication,
} from "livekit-client";
import { api } from "@/lib/api";
import { MEDIA_QUALITY, type MediaQuality } from "@/lib/media-quality";
import { nearby, type Person } from "@/shared/world";
import { ScreenViewers } from "./ScreenViewers";

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
  const [capturePermissions, setCapturePermissions] = useState<
    Partial<Record<"microphone" | "camera", PermissionState>>
  >({});
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    for (const name of ["microphone", "camera"] as const) {
      void navigator.permissions
        ?.query({ name: name as PermissionName })
        .then((status) => {
          if (disposed) return;
          const changed = () =>
            setCapturePermissions((current) => ({
              ...current,
              [name]: status.state,
            }));
          changed();
          status.addEventListener("change", changed);
          cleanups.push(() => status.removeEventListener("change", changed));
        })
        .catch(() => {
          /* Unsupported permission queries fall back to device labels. */
        });
    }
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);
  const microphoneAllowed = capturePermissions.microphone
    ? capturePermissions.microphone === "granted"
    : mic ||
      devices.some((device) => device.kind === "audioinput" && !!device.label);
  const cameraAllowed = capturePermissions.camera
    ? capturePermissions.camera === "granted"
    : camera ||
      devices.some((device) => device.kind === "videoinput" && !!device.label);
  const [quality, setQuality] = useState<MediaQuality>("maximum");
  const qualityPreference = useRef<MediaQuality>("maximum");
  const pendingScreenQuality = useRef<MediaQuality>("maximum");
  const [choices, setChoices] = useState<DeviceChoices>(defaultDevices);
  const preferences = useRef<DeviceChoices>(defaultDevices);
  const activeDevices = useRef<DeviceChoices>(defaultDevices);
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
    let savedQuality: MediaQuality = "maximum";
    try {
      const value = localStorage.getItem(`office-media-quality:${userId}`);
      if (value && Object.hasOwn(MEDIA_QUALITY, value))
        savedQuality = value as MediaQuality;
    } catch {
      /* Use maximum quality when storage is unavailable. */
    }
    qualityPreference.current = savedQuality;
    setQuality(savedQuality);
    preferences.current = saved;
    activeDevices.current = saved;
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
        let audioOutput = preferences.current.audiooutput;
        if (audioOutput && "setSinkId" in HTMLMediaElement.prototype) {
          try {
            await new Audio().setSinkId(audioOutput);
          } catch {
            if (cancelled) return;
            audioOutput = "";
            activeDevices.current.audiooutput = "";
            notify(
              "Your saved speaker is unavailable. Using system default until it reconnects.",
            );
          }
        }
        if (cancelled) return;
        next = new Room({
          adaptiveStream: { pixelDensity: "screen" },
          dynacast: true,
          // Release browser microphone capture while muted; LiveKit reacquires it on unmute.
          publishDefaults: { stopMicTrackOnMute: true },
          audioCaptureDefaults: {
            deviceId: preferences.current.audioinput || undefined,
          },
          audioOutput:
            "setSinkId" in HTMLMediaElement.prototype
              ? { deviceId: audioOutput }
              : undefined,
          videoCaptureDefaults: {
            deviceId: preferences.current.videoinput || undefined,
            resolution: MEDIA_QUALITY[qualityPreference.current].resolution,
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
        void enumerate(false, true);
        try {
          if (wanted.current.mic) {
            await next.localParticipant.setMicrophoneEnabled(true);
            setMic(true);
          }
          if (wanted.current.camera) {
            await enableCamera(next);
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
  function chooseQuality(value: string) {
    if (!Object.hasOwn(MEDIA_QUALITY, value)) return;
    qualityPreference.current = value as MediaQuality;
    setQuality(value as MediaQuality);
    try {
      if (userId) localStorage.setItem(`office-media-quality:${userId}`, value);
    } catch {
      notify(
        "Quality changed, but this browser could not save your preference.",
      );
    }
  }
  async function enableCamera(target: Room) {
    const profile = MEDIA_QUALITY[qualityPreference.current];
    // A muted publication retains its old encoder limits. Recreate only the camera.
    const old = target.localParticipant.getTrackPublication(
      Track.Source.Camera,
    )?.track;
    if (old) await target.localParticipant.unpublishTrack(old);
    await target.localParticipant.setCameraEnabled(
      true,
      {
        deviceId: preferences.current.videoinput || undefined,
        resolution: profile.resolution,
      },
      {
        simulcast: true,
        videoEncoding: {
          maxBitrate: profile.cameraBitrate,
          maxFramerate: profile.resolution.frameRate,
        },
      },
    );
  }
  async function toggle(kind: "mic" | "camera") {
    const active = kind === "mic" ? mic : camera;
    if (!current.current || !connected) {
      notify("Join nearby audio or a meeting room first.");
      return;
    }
    try {
      if (kind === "mic")
        await current.current.localParticipant.setMicrophoneEnabled(!active);
      else if (active)
        await current.current.localParticipant.setCameraEnabled(false);
      else await enableCamera(current.current);
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
      pendingScreenQuality.current = qualityPreference.current;
      const profile = MEDIA_QUALITY[pendingScreenQuality.current];
      const browser = getBrowser();
      // Retain LiveKit's uncapped capture workaround for Safari/iOS 17.
      const safari17 =
        (browser?.name === "Safari" && parseInt(browser.version) === 17) ||
        (browser?.os === "iOS" && parseInt(browser.osVersion || "") === 17);
      const tracks = await createLocalScreenTracks({
        audio: true,
        resolution: safari17 ? undefined : profile.resolution,
      });
      for (const track of tracks)
        if (track.source === Track.Source.ScreenShare)
          track.mediaStreamTrack.contentHint = "detail";
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
    const target = current.current;
    if (!target) {
      cancelShare();
      return;
    }
    if (enabled) {
      const tracks = pendingScreen.current;
      pendingScreen.current = [];
      if (!tracks.length) {
        preparing.current = false;
        return;
      }
      try {
        const participant = target.localParticipant;
        const allowed = () => {
          const permission = participant.permissions;
          return (
            permission?.canPublish &&
            (!permission.canPublishSources.length ||
              tracks.every((track) =>
                permission.canPublishSources.includes(
                  Track.sourceToProto(track.source),
                ),
              ))
          );
        };
        // The office acknowledgement can arrive before LiveKit's permission update.
        if (!allowed())
          await new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
              clearTimeout(timer);
              target.off(RoomEvent.ParticipantPermissionsChanged, changed);
              target.off(RoomEvent.Disconnected, disconnected);
              if (error) reject(error);
              else resolve();
            };
            const changed = () => {
              if (allowed()) finish();
            };
            const disconnected = () =>
              finish(
                new Error(
                  "The conversation changed. Choose your screen again.",
                ),
              );
            const timer = setTimeout(
              () =>
                finish(
                  new Error(
                    "Could not update screen-sharing permission. Please try again.",
                  ),
                ),
              5000,
            );
            target.on(RoomEvent.ParticipantPermissionsChanged, changed);
            target.on(RoomEvent.Disconnected, disconnected);
            changed();
          });
        const profile = MEDIA_QUALITY[pendingScreenQuality.current];
        for (const track of tracks)
          await target.localParticipant.publishTrack(track, {
            simulcast: true,
            screenShareEncoding: {
              maxBitrate: profile.screenBitrate,
              maxFramerate: profile.resolution.frameRate,
            },
            screenShareSimulcastLayers: [ScreenSharePresets.h720fps30],
          });
      } catch (e) {
        for (const track of tracks) {
          await target.localParticipant.unpublishTrack(track);
          track.stop();
        }
        throw e;
      } finally {
        preparing.current = false;
      }
    } else {
      cancelShare();
      await target.localParticipant.setScreenShareEnabled(false);
    }
    bump((v) => v + 1);
  }
  async function enumerate(
    requestAccess: boolean | "videoinput" = false,
    resetMissing = false,
  ) {
    try {
      if (requestAccess) {
        // Reveal device names without publishing audio or leaving a capture running.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: requestAccess !== "videoinput",
          video: requestAccess === "videoinput",
        });
        stream.getTracks().forEach((track) => track.stop());
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);
      if (resetMissing) {
        for (const kind of Object.keys(defaultDevices) as MediaDeviceKind[]) {
          const id = preferences.current[kind];
          if (id && id !== "default") {
            const available = list.some(
              (device) => device.kind === kind && device.deviceId === id,
            );
            if (await switchDevice(kind, available ? id : "", false)) {
              if (!available)
                notify("A selected device disconnected. Using system default.");
            }
          }
        }
      }
    } catch (e) {
      notify(`Could not access devices: ${(e as Error).message}`);
    }
  }
  async function switchDevice(
    kind: MediaDeviceKind,
    id: string,
    savePreference = true,
  ) {
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
      activeDevices.current = { ...activeDevices.current, [kind]: id };
      if (savePreference) remember(kind, id);
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
      if (activeDevices.current.audiooutput && "setSinkId" in sound)
        await sound.setSinkId(activeDevices.current.audiooutput);
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
    quality,
    chooseQuality,
    outputSupported,
    outputPickerSupported,
    microphoneAllowed,
    cameraAllowed,
    chooseOutput,
    deviceBusy: deviceBusy || connecting,
  };
}
export function SpeakingIndicator() {
  const { t } = useI18n();
  return (
    <span
      className="speaking-indicator"
      role="img"
      aria-label={t("Speaking")}
      title={t("Speaking")}
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
  people,
  active = true,
  onScreenView,
}: {
  room: Room | null;
  revision: number;
  speaking: string[];
  people: Person[];
  active?: boolean;
  onScreenView: (room: string, publisher: string | null) => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"grid" | "screen" | null>(null);
  const [screenId, setScreenId] = useState("");
  const [pinnedScreenId, setPinnedScreenId] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const back = useRef<HTMLButtonElement>(null);
  const ownsFullscreen = useRef(false);
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
            name: participant.name || t("Teammate"),
            identity: participant.identity,
            local: participant === room.localParticipant,
          });
  }
  const screens = tracks.filter(
    (item) => item.pub.source === Track.Source.ScreenShare,
  );
  const cameras = tracks.filter(
    (item) => item.pub.source === Track.Source.Camera,
  );
  const screen =
    screens.find((item) => item.pub.trackSid === pinnedScreenId) ||
    screens.find((item) => item.pub.trackSid === screenId) ||
    screens[0];
  useEffect(() => {
    const changed = () => setPageVisible(!document.hidden);
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  const watchedPublisher =
    active &&
    pageVisible &&
    view === "screen" &&
    screen &&
    !screen.local &&
    people.some((person) => person.id === screen.identity && person.sharing)
      ? screen.identity
      : null;
  useEffect(() => {
    if (!room) return;
    onScreenView(room.name, watchedPublisher);
    return () => onScreenView(room.name, null);
  }, [room, watchedPublisher, onScreenView]);
  function closeView() {
    setView(null);
    setChromeHidden(false);
    if (ownsFullscreen.current && document.fullscreenElement) {
      ownsFullscreen.current = false;
      void document.exitFullscreen().catch(() => {});
    }
  }
  useEffect(() => {
    closeView();
  }, [room]);
  useEffect(() => {
    if (view === "screen" && !screen) setView(cameras.length ? "grid" : null);
    else if (view === "grid" && !cameras.length)
      setView(screens.length ? "screen" : null);
  }, [view, !!screen, cameras.length, screens.length]);
  useEffect(() => {
    if (
      pinnedScreenId &&
      !screens.some((item) => item.pub.trackSid === pinnedScreenId)
    )
      setPinnedScreenId("");
    if (screenId && !screens.some((item) => item.pub.trackSid === screenId))
      setScreenId("");
  }, [pinnedScreenId, screenId, screens]);
  const expanded = view !== null;
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement;
    back.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector('[role="dialog"]')
      )
        closeView();
    };
    const changed = () => {
      setFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) ownsFullscreen.current = false;
    };
    changed();
    window.addEventListener("keydown", escape);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      if (ownsFullscreen.current && document.fullscreenElement) {
        ownsFullscreen.current = false;
        void document.exitFullscreen().catch(() => {});
      }
      window.removeEventListener("keydown", escape);
      document.removeEventListener("fullscreenchange", changed);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
      else
        document
          .querySelector<HTMLElement>("[data-video-expand], .pixel-map")
          ?.focus({ preventScroll: true });
    };
  }, [expanded]);
  async function toggleFullscreen() {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        const shell = document.querySelector<HTMLElement>(".app-shell");
        if (!shell?.requestFullscreen)
          throw new Error("Unsupported fullscreen");
        await shell.requestFullscreen();
        ownsFullscreen.current = true;
      }
    } catch {
      setFullscreenError(true);
    }
  }
  function openScreen(id: string) {
    setScreenId(id);
    setView("screen");
  }
  function togglePin() {
    if (!screen) return;
    setPinnedScreenId((current) =>
      current === screen.pub.trackSid ? "" : screen.pub.trackSid,
    );
  }
  function tile(
    item: (typeof tracks)[number],
    expandable = false,
    selectable = false,
    expandedStats = false,
  ) {
    const shared = item.pub.source === Track.Source.ScreenShare;
    return (
      <div
        className={`video-tile ${shared ? "screen-tile" : ""} ${
          selectable && screen?.pub.trackSid === item.pub.trackSid
            ? "selected-source"
            : ""
        }`}
        data-speaking={speaking.includes(item.identity)}
        key={item.pub.trackSid}
        onClick={selectable ? () => openScreen(item.pub.trackSid) : undefined}
        onKeyDown={
          selectable
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openScreen(item.pub.trackSid);
                }
              }
            : undefined
        }
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : undefined}
      >
        <AttachedTrack pub={item.pub} local={item.local} />
        <span className="video-caption">
          {speaking.includes(item.identity) && <SpeakingIndicator />}
          {item.name}
          {item.local ? t(" · you") : ""}
          {shared ? t(" · presenting") : ""}
        </span>
        {shared && <TrackStats pub={item.pub} expanded={expandedStats} />}
        {shared && expandable && (
          <ScreenViewers
            people={people}
            publisher={item.identity}
            name={item.name}
            compact
          />
        )}
        {expandable && (
          <Button
            variant="plain"
            className="video-expand"
            data-video-expand
            aria-label={
              shared ? t("Expand shared screen") : t("Open camera grid")
            }
            title={shared ? t("Expand shared screen") : t("Open camera grid")}
            onClick={() =>
              shared ? openScreen(item.pub.trackSid) : setView("grid")
            }
          >
            {shared ? <Maximize2 size={17} /> : <Grid2X2 size={17} />}
          </Button>
        )}
      </div>
    );
  }
  const chromeToggle = (
    <Button
      variant="plain"
      className={chromeHidden ? "media-chrome-toggle" : "media-view-button"}
      aria-label={
        chromeHidden ? t("Show media controls") : t("Hide media controls")
      }
      title={chromeHidden ? t("Show media controls") : t("Hide media controls")}
      onClick={() => setChromeHidden((hidden) => !hidden)}
    >
      {chromeHidden ? <PanelTop size={18} /> : <PanelTopClose size={18} />}
    </Button>
  );
  return (
    <>
      <div className="audio-tracks" aria-hidden="true">
        {tracks
          .filter((item) => item.pub.kind === Track.Kind.Audio && !item.local)
          .map((item) => (
            <AttachedTrack
              key={item.pub.trackSid}
              pub={item.pub}
              local={false}
            />
          ))}
      </div>
      {!expanded && !!(screens.length || cameras.length) && (
        <div className={`video-strip ${screens.length ? "with-screen" : ""}`}>
          {[...screens, ...cameras].map((item) => tile(item, true))}
        </div>
      )}
      {expanded &&
        createPortal(
          <section
            className={`media-expanded ${chromeHidden ? "media-chrome-hidden" : ""}`}
            role="region"
            aria-label={t("Expanded video")}
          >
            {chromeHidden && chromeToggle}
            <header className="media-view-header">
              <Button
                variant="plain"
                ref={back}
                className="media-view-button"
                onClick={closeView}
              >
                <ArrowLeft size={18} />
                {t("Back to map")}
              </Button>
              <div className="media-view-title">
                <h2>
                  {view === "screen" && screen
                    ? t("{name}'s screen", { name: screen.name })
                    : t("Camera grid")}
                </h2>
                <span>
                  {view === "screen" && screen
                    ? t("{count} shared screens · {cameras} cameras", {
                        count: screens.length,
                        cameras: cameras.length,
                      })
                    : t("{count} cameras", { count: cameras.length })}
                </span>
              </div>
              <div className="media-view-actions">
                {view === "screen" && screen && (
                  <ScreenViewers
                    people={people}
                    publisher={screen.identity}
                    name={screen.name}
                  />
                )}
                {!!cameras.length && (
                  <Button
                    variant="plain"
                    className="media-view-button"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    <Grid2X2 size={18} />
                    <span>{t("Camera grid")}</span>
                  </Button>
                )}
                {!!screens.length && (
                  <Button
                    variant="plain"
                    className="media-view-button"
                    aria-pressed={view === "screen"}
                    onClick={() =>
                      openScreen(
                        screen?.pub.trackSid || screens[0].pub.trackSid,
                      )
                    }
                  >
                    <Monitor size={18} />
                    <span>{t("Shared screen")}</span>
                  </Button>
                )}
                {view === "screen" && screen && (
                  <Button
                    variant="plain"
                    className="media-view-button"
                    aria-pressed={pinnedScreenId === screen.pub.trackSid}
                    onClick={togglePin}
                  >
                    {pinnedScreenId === screen.pub.trackSid ? (
                      <PinOff size={18} />
                    ) : (
                      <Pin size={18} />
                    )}
                    <span>
                      {pinnedScreenId === screen.pub.trackSid
                        ? t("Unpin screen")
                        : t("Pin screen")}
                    </span>
                  </Button>
                )}
                <Button
                  variant="plain"
                  className="media-view-button"
                  aria-label={
                    fullscreen ? t("Exit fullscreen") : t("Enter fullscreen")
                  }
                  title={
                    fullscreen ? t("Exit fullscreen") : t("Enter fullscreen")
                  }
                  onClick={() => void toggleFullscreen()}
                >
                  {fullscreen ? (
                    <Minimize2 size={19} />
                  ) : (
                    <Maximize2 size={19} />
                  )}
                </Button>
                {!chromeHidden && chromeToggle}
              </div>
            </header>
            {fullscreenError && (
              <p className="media-view-message" role="status">
                {t(
                  "Browser fullscreen is unavailable. You can still use this expanded view.",
                )}
              </p>
            )}
            {view === "screen" && screen ? (
              <div
                className={`media-screen-stage ${
                  cameras.length || screens.length > 1 ? "has-rail" : ""
                }`}
              >
                <div className="media-spotlight">
                  {tile(screen, false, false, true)}
                </div>
                {!!(cameras.length || screens.length > 1) && (
                  <div className="media-camera-rail">
                    {screens.length > 1 && (
                      <div
                        className="media-share-rail"
                        aria-label={t("Shared screens")}
                      >
                        {screens.map((item) => tile(item, false, true))}
                      </div>
                    )}
                    {cameras.map((item) => tile(item))}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="media-grid"
                style={
                  {
                    "--video-columns":
                      cameras.length <= 1
                        ? 1
                        : cameras.length <= 4
                          ? 2
                          : cameras.length <= 9
                            ? 3
                            : 4,
                    "--mobile-columns": cameras.length <= 2 ? 1 : 2,
                  } as React.CSSProperties
                }
              >
                {cameras.map((item) => tile(item))}
              </div>
            )}
          </section>,
          document.querySelector(".app-shell") || document.body,
        )}
    </>
  );
}
function formatBitrate(bits: number) {
  if (!bits) return "—";
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(bits / 1_000)} Kbps`;
}
function TrackStats({
  pub,
  expanded = false,
}: {
  pub: TrackPublication;
  expanded?: boolean;
}) {
  const { t } = useI18n();
  const [stats, setStats] = useState({
    width: 0,
    height: 0,
    fps: 0,
    bitrate: 0,
  });
  useEffect(() => {
    let disposed = false;
    const read = async () => {
      const track = pub.track;
      if (!track) return;
      const settings = track.mediaStreamTrack.getSettings();
      let width = settings.width || pub.dimensions?.width || 0;
      let height = settings.height || pub.dimensions?.height || 0;
      let fps = settings.frameRate || 0;
      let bitrate = track.currentBitrate || 0;
      try {
        const report = await track.getRTCStatsReport();
        report?.forEach((entry) => {
          const stat = entry as RTCInboundRtpStreamStats &
            RTCOutboundRtpStreamStats & {
              frameWidth?: number;
              frameHeight?: number;
              framesPerSecond?: number;
              mediaType?: string;
            };
          if (stat.type !== "inbound-rtp" && stat.type !== "outbound-rtp")
            return;
          if (stat.kind && stat.kind !== "video" && stat.mediaType !== "video")
            return;
          width = stat.frameWidth || width;
          height = stat.frameHeight || height;
          fps = stat.framesPerSecond || fps;
          const bytes = stat.bytesReceived ?? stat.bytesSent;
          if (typeof bytes === "number" && typeof stat.timestamp === "number")
            bitrate = track.currentBitrate || bitrate;
        });
      } catch {
        /* Stats can disappear while a remote publication is being replaced. */
      }
      if (!disposed) setStats({ width, height, fps, bitrate });
    };
    void read();
    const timer = setInterval(() => void read(), 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [pub, pub.track]);
  const resolution =
    stats.width && stats.height ? `${stats.width}×${stats.height}` : t("Auto");
  return (
    <span
      className={`video-stats ${expanded ? "video-stats-expanded" : ""}`}
      title={t("Resolution, frame rate, and current bitrate")}
    >
      <BarChart3 size={12} />
      <span>{resolution}</span>
      {stats.fps ? <span>{Math.round(stats.fps)} fps</span> : null}
      <span>{formatBitrate(stats.bitrate)}</span>
    </span>
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
