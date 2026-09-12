"use client";
import { FormProvider, useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  loginSchema,
  passwordChangeSchema,
  profileSchema,
} from "@/shared/forms";
import { FormInput, FormError } from "./FormInput";
import { Field, FieldLabel } from "./ui/field";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { ActivityLog } from "./ActivityLog";
import {
  CreateMemberForm,
  MemberActionForm,
  MemberRoleForm,
} from "./MemberForms";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Check,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Hand,
  Headphones,
  HelpCircle,
  CodeXml,
  Home,
  Leaf,
  Lock,
  LogOut,
  Maximize2,
  Minimize2,
  MessageCircle,
  Mic,
  MicOff,
  Monitor,
  MonitorUp,
  MoreHorizontal,
  Plus,
  PencilRuler,
  Search,
  Settings,
  Shield,
  Smile,
  Users,
  Video,
  VideoOff,
  VolumeX,
  X,
} from "lucide-react";
import { MEDIA_QUALITY } from "@/lib/media-quality";
import { api, type User, type AppConfig } from "@/lib/api";
import {
  JUMP_DURATION,
  canNudge,
  ZONES,
  nearby,
  type Invitation,
  type Person,
  type Snapshot,
  type Availability,
} from "@/shared/world";
import type { Command } from "@/shared/protocol";
import { MediaTracks, SpeakingIndicator, useOfficeMedia } from "./Media";
import { Select } from "./Select";
import { boardScope, whiteboardEnabled } from "@/shared/whiteboard";
import { Avatar } from "./Avatar";
import { AvatarEditor } from "./AvatarEditor";
import { DeviceSelect } from "./DeviceSelect";
import { ToolbarMenu } from "./ToolbarMenu";
import { WorkspaceSettings } from "./WorkspaceSettings";
import {
  DEFAULT_WORKSPACE,
  getMap,
  type WorkspaceSettings as Workspace,
} from "@/shared/maps";
const PixelMap = dynamic(() => import("./PixelMap"), {
  ssr: false,
  loading: MapLoading,
});
const Whiteboard = dynamic(() => import("./Whiteboard"), { ssr: false });
const EmotePicker = dynamic(() => import("./EmotePicker"), { ssr: false });
const statusLabel = {
  available: "Available",
  busy: "Busy",
  dnd: "Do not disturb",
  away: "Away",
};
type AdminUser = {
  localPassword: boolean;
  id: string;
  name: string;
  username: string;
  role: string;
  approved: boolean;
};

export default function OfficeApp() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AppConfig | null>(null),
    [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const [mapEffectsPreference, setMapEffectsPreference] = useState<
    string | null
  >(null);
  const [reduceMapMotion, setReduceMapMotion] = useState(true);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMapMotion(motion.matches);
    update();
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);
  const mapEffectsEnabled =
    mapEffectsPreference === "on" ||
    (mapEffectsPreference !== "off" && !reduceMapMotion);
  useEffect(() => {
    let preference: string | null = null;
    try {
      if (user)
        preference = localStorage.getItem(`office-map-effects:${user.id}`);
    } catch {
      /* Browser storage may be unavailable. */
    }
    setMapEffectsPreference(preference);
  }, [user?.id]);
  const changeMapEffects = (enabled: boolean) => {
    setMapEffectsPreference(enabled ? "on" : "off");
    try {
      if (user)
        localStorage.setItem(
          `office-map-effects:${user.id}`,
          enabled ? "on" : "off",
        );
    } catch {
      /* The preference still applies for this visit. */
    }
  };
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [connection, setConnection] = useState("Connecting"),
    [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<"people" | "rooms">("people"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState("");
  const [modal, setModal] = useState<"settings" | "profile" | "help" | null>(
      null,
    ),
    [invites, setInvites] = useState<Invitation[]>([]),
    [waves, setWaves] = useState<Record<string, number>>({}),
    [emotes, setEmotes] = useState<
      Record<string, { emoji: string; until: number }>
    >({}),
    [jumps, setJumps] = useState<Record<string, number>>({}),
    [nudges, setNudges] = useState<
      Record<string, { start: number; sender: boolean }>
    >({});
  const [settingsTab, setSettingsTab] = useState<"workspace" | "members">(
    "workspace",
  );
  const [whiteboard, setWhiteboard] = useState<{
    scope: string;
    name: string;
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 700px)");
    const resize = () => {
      if (narrow.matches) setSidebarOpen(false);
    };
    const changed = () => setFullscreen(!!document.fullscreenElement);
    resize();
    narrow.addEventListener("change", resize);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      narrow.removeEventListener("change", resize);
      document.removeEventListener("fullscreenchange", changed);
    };
  }, []);
  const socket = useRef<WebSocket | null>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6500);
  }, []);
  const refresh = useCallback(async () => {
    try {
      setConfig(await api<AppConfig>("/config"));
      try {
        const me = await api<{ user: User }>("/me");
        setUser(me.user);
      } catch {
        setUser(null);
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const send = useCallback((command: Command) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(command));
  }, []);
  const self = snapshot?.people.find((p) => p.id === user?.id);
  const people = snapshot?.people || [];
  const workspace =
    snapshot?.workspace || config?.workspace || DEFAULT_WORKSPACE;
  const media = useOfficeMedia(self, people, notify, user?.id);
  const mediaRef = useRef(media);
  mediaRef.current = media;
  useEffect(() => {
    if (!self || connection !== "Connected") return;
    send({
      type: "microphone",
      room: self.room,
      enabled: media.connected && media.room?.name === self.room && media.mic,
    });
  }, [
    self?.room,
    connection,
    media.connected,
    media.room?.name,
    media.mic,
    send,
  ]);
  useEffect(() => {
    if (!user?.approved || user.mustChangePassword) return;
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      attempt = 0,
      takeover = true;
    function connect() {
      if (disposed) return;
      setConnection("Connecting");
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/office${takeover ? "?takeover=1" : ""}`,
      );
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        takeover = false;
        setConnection("Connected");
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "snapshot") setSnapshot(message);
        else if (message.type === "error" || message.type === "notice") {
          if (message.type === "error") mediaRef.current.cancelShare();
          notify(message.message);
        } else if (message.type === "wave") {
          setWaves((v) => ({ ...v, [message.from]: Date.now() + 2600 }));
          if (message.to === user?.id && !message.silent)
            notify(`${message.name} waved at you. Say hello!`);
        } else if (message.type === "emote") {
          const now = Date.now();
          setEmotes((previous) => ({
            ...Object.fromEntries(
              Object.entries(previous).filter(([, value]) => value.until > now),
            ),
            [message.from]: { emoji: message.emoji, until: now + 3000 },
          }));
        } else if (message.type === "jump") {
          const now = performance.now();
          setJumps((previous) => ({
            ...Object.fromEntries(
              Object.entries(previous).filter(
                ([, start]) => now - start < JUMP_DURATION,
              ),
            ),
            [message.from]: now,
          }));
        } else if (message.type === "nudge-animation") {
          const now = performance.now();
          setNudges((previous) => ({
            ...Object.fromEntries(
              Object.entries(previous).filter(
                ([, nudge]) => now - nudge.start < 600,
              ),
            ),
            [message.from]: { start: now, sender: true },
            [message.to]: { start: now, sender: false },
          }));
        } else if (message.type === "nudge-sent") {
          void mediaRef.current.playNudge();
        } else if (message.type === "nudge") {
          notify(`${message.name} nudged you. They're nearby!`);
          void mediaRef.current.playNudge();
        } else if (message.type === "invitation")
          setInvites((v) => [...v, message.invitation]);
        else if (message.type === "invitation-ended")
          setInvites((v) => v.filter((i) => i.id !== message.id));
        else if (message.type === "user-updated") void refresh();
        else if (message.type === "presenter" && message.enabled) {
          void mediaRef.current.share(true).catch((e) => {
            send({ type: "present", enabled: false });
            notify((e as Error).message);
          });
        }
      };
      ws.onclose = async (event) => {
        if (disposed) return;
        setConnection("Reconnecting");
        setSnapshot(null);
        setInvites([]);
        setJumps({});
        setNudges({});
        setEmotes({});
        if (event.code === 4001) {
          setConnection("Opened elsewhere");
          return;
        }
        try {
          await api("/me");
          if (!disposed)
            timer = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
        } catch {
          setUser(null);
          setConnection("Disconnected");
        }
      };
    }
    connect();
    const ping = setInterval(() => send({ type: "ping" }), 10000);
    return () => {
      disposed = true;
      clearInterval(ping);
      clearTimeout(timer);
      socket.current?.close();
      socket.current = null;
      setSnapshot(null);
    };
  }, [
    user?.id,
    user?.approved,
    user?.mustChangePassword,
    notify,
    send,
    refresh,
  ]);
  const wasSharing = useRef(false);
  const isSharing = !!media.room?.localParticipant.isScreenShareEnabled;
  useEffect(() => {
    if (connection !== "Connected" || !self?.room) return;
    send({
      type: "screen-share",
      room: self.room,
      enabled: isSharing && media.room?.name === self.room && media.connected,
    });
  }, [
    connection,
    self?.room,
    isSharing,
    media.room?.name,
    media.connected,
    send,
  ]);
  useEffect(() => {
    if (wasSharing.current && !isSharing)
      send({ type: "present", enabled: false });
    wasSharing.current = isSharing;
  }, [isSharing, send]);
  async function logout() {
    try {
      await api("/auth/sign-out", {});
      setUser(null);
      setSnapshot(null);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const currentZone = ZONES.find((z) => z.id === self?.zone) || ZONES[0];
  const audience = self
    ? people.filter(
        (p) =>
          p.id !== self.id &&
          p.conversation === self.conversation &&
          self.conversation &&
          (self.conversation !== "floor" || nearby(self, p)),
      )
    : [];
  const filtered = people.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const chosen = people.find((p) => p.id === selected);
  const voicePeople = media.connected
    ? audience.filter((p) => media.room?.remoteParticipants.has(p.id))
    : [];

  if (loading)
    return (
      <main className="loading-page">
        <Brand />
        <span>{t("Opening the office…")}</span>
      </main>
    );
  if (!user)
    return (
      <>
        <Login config={config} refresh={refresh} notify={notify} />
        {notice && <Toast text={notice} close={() => setNotice("")} />}
      </>
    );
  if (user.mustChangePassword) return <PasswordChange onDone={refresh} />;
  if (!user.approved)
    return (
      <main className="login-page">
        <div className="login-language">
          <LanguageToggle />
        </div>
        <div className="login-card">
          <Brand />
          <h1>{t("Almost home.")}</h1>
          <p>
            {t(
              "Your SSO account is ready. An office owner needs to approve your membership.",
            )}
          </p>
          <Button variant="default" className="primary" onClick={refresh}>
            {t("Check approval")}
          </Button>
          <Button variant="link" className="text-button" onClick={logout}>
            {t("Sign out")}
          </Button>
        </div>
      </main>
    );
  return (
    <div
      className={`app-shell immersive-office ${sidebarOpen ? "panel-open" : ""}`}
    >
      <header className="topbar">
        <Brand />
        <span className="header-divider" />
        <div className="workspace-name">{workspace.name}</div>
        <div
          className="nav-location map-topline"
          aria-label={t("Current location")}
        >
          {self?.zone === "floor" ? <Leaf size={16} /> : <DoorOpen size={16} />}
          <strong>{t(currentZone.name)}</strong>
          <span className="nav-location-kind">
            {self?.zone === "floor" ? t("OPEN SPACE") : t("MEETING ROOM")}
          </span>
        </div>
        <div className="header-end">
          <span
            className={`connection ${connection === "Connected" ? "good" : ""}`}
          >
            <i />
            {t(connection)}
          </span>
          <span className="header-divider" />
          <LanguageToggle />
          <Button
            variant="ghost"
            size="icon"
            className="icon-button nav-fullscreen"
            aria-label={
              fullscreen ? t("Exit fullscreen") : t("Enter fullscreen")
            }
            onClick={() => {
              const el = document.querySelector(".app-shell");
              const action = document.fullscreenElement
                ? document.exitFullscreen()
                : el?.requestFullscreen?.();
              if (action)
                void action.catch(() =>
                  notify(
                    "Fullscreen is unavailable in this browser. The map already fills the window.",
                  ),
                );
            }}
          >
            {fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </Button>
          <a
            className="icon-button github-link"
            href="https://github.com/GmBeHappy/little-office"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("GitHub repository")}
            title={t("GitHub repository")}
          >
            <CodeXml size={21} />
            <span className="visually-hidden">GitHub</span>
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="icon-button"
            aria-label={t("Help")}
            onClick={() => setModal("help")}
          >
            <HelpCircle size={19} />
          </Button>
          <Button
            variant="plain"
            className="header-avatar"
            onClick={() => setModal("profile")}
            aria-label={t("Your profile")}
          >
            <Avatar color={user.avatar} />
          </Button>
        </div>
      </header>
      <div className="body-shell">
        <nav className="rail" aria-label={t("Office navigation")}>
          <Button
            variant="plain"
            className="rail-item active"
            aria-label={t("Office")}
            onClick={() => {
              setSidebarOpen(false);
              setSelected("");
            }}
          >
            <Home size={22} />
            <span>{t("Office")}</span>
          </Button>
          <Button
            variant="plain"
            className={`rail-item ${panel === "rooms" ? "sub-active" : ""}`}
            aria-label={t("Rooms")}
            aria-expanded={sidebarOpen && panel === "rooms"}
            onClick={() => {
              setSidebarOpen(!sidebarOpen || panel !== "rooms");
              setPanel("rooms");
            }}
          >
            <DoorOpen size={22} />
            <span>{t("Rooms")}</span>
          </Button>
          <Button
            variant="plain"
            className="rail-item"
            aria-label={t("People")}
            aria-expanded={sidebarOpen && panel === "people"}
            onClick={() => {
              setSidebarOpen(!sidebarOpen || panel !== "people");
              setPanel("people");
            }}
          >
            <Users size={22} />
            <span>{t("People")}</span>
          </Button>
          <div className="rail-bottom">
            <Button
              variant="plain"
              className="rail-item"
              onClick={() => {
                setSettingsTab("workspace");
                setModal("settings");
              }}
              aria-label={t("Settings")}
            >
              <Settings size={21} />
              <span>{t("Settings")}</span>
            </Button>
            <Button
              variant="plain"
              className="rail-item"
              onClick={logout}
              aria-label={t("Sign out")}
            >
              <LogOut size={20} />
              <span>{t("Leave")}</span>
            </Button>
          </div>
        </nav>
        <main className="office-main">
          <h1 className="visually-hidden">
            {t("{workspace} virtual office", { workspace: workspace.name })}
          </h1>
          <div className="map-card">
            <div className="location-card">
              {self?.conversation && (
                <section
                  className="voice-roster"
                  aria-label={
                    self.conversation === "floor"
                      ? t("Nearby voice")
                      : t("Conversation participants")
                  }
                >
                  <div className="voice-roster-heading">
                    <Headphones size={14} />
                    <strong>
                      {self.conversation === "floor"
                        ? t("Nearby voice")
                        : t("In this conversation")}
                    </strong>
                    <span>
                      {media.connected
                        ? t("{count} joined", { count: voicePeople.length + 1 })
                        : media.error
                          ? t("Audio unavailable")
                          : t("Connecting…")}
                    </span>
                  </div>
                  <div className="voice-roster-people">
                    {voicePeople.map((p) => (
                      <Button
                        variant="plain"
                        className="voice-person"
                        key={p.id}
                        data-speaking={media.speaking.includes(p.id)}
                        onClick={() => {
                          setSelected(p.id);
                          setPanel("people");
                          setSidebarOpen(true);
                        }}
                      >
                        <Avatar color={p.avatar} />
                        <span>{p.name}</span>
                        {media.speaking.includes(p.id) && <SpeakingIndicator />}
                      </Button>
                    ))}
                    {media.connected && !voicePeople.length && (
                      <span className="muted">
                        {self.conversation === "floor"
                          ? t("No one nearby")
                          : t("Waiting for teammates")}
                      </span>
                    )}
                  </div>
                </section>
              )}
            </div>
            <div className="map-stage">
              <PixelMap
                mapId={workspace.mapId}
                effectsEnabled={mapEffectsEnabled}
                people={people}
                self={user.id}
                speaking={media.speaking}
                waves={waves}
                emotes={emotes}
                jumps={jumps}
                nudges={nudges}
                send={send}
                select={(id) => {
                  setSelected(id);
                  setPanel("people");
                  setSidebarOpen(true);
                }}
              />
              <div className="map-hint">
                <span className="key keyboard-walk-hint">W</span>
                <span className="key keyboard-walk-hint">A</span>
                <span className="key keyboard-walk-hint">S</span>
                <span className="key keyboard-walk-hint">D</span>
                <span className="keyboard-walk-hint">{t("to move ·")}</span>
                <span className="touch-walk-hint">{t("Drag to walk ·")}</span>
                <Button
                  variant="plain"
                  className="key"
                  aria-label={t("Jump")}
                  title={t("Jump (Space)")}
                  onClick={() => send({ type: "jump" })}
                >
                  Space
                </Button>
                <span>{t("to jump")}</span>
                <Button
                  variant="plain"
                  className="key"
                  aria-label={t("Nudge teammate in front")}
                  title={t("Nudge teammate in front (Z)")}
                  onClick={() => send({ type: "nudge" })}
                >
                  Z
                </Button>
                <span>{t("to nudge")}</span>
                <Button
                  variant="plain"
                  className="key"
                  aria-label={t(self?.pose === "sit" ? "Stand up" : "Sit")}
                  title={t("Sit / stand (1)")}
                  aria-pressed={self?.pose === "sit"}
                  onClick={() =>
                    send({
                      type: "pose",
                      pose: self?.pose === "sit" ? "stand" : "sit",
                    })
                  }
                >
                  1
                </Button>
                <span>{t("to sit")}</span>
                <Button
                  variant="plain"
                  className="key"
                  aria-label={t(self?.pose === "sleep" ? "Wake up" : "Sleep")}
                  title={t("Sleep / wake (2)")}
                  aria-pressed={self?.pose === "sleep"}
                  onClick={() =>
                    send({
                      type: "pose",
                      pose: self?.pose === "sleep" ? "stand" : "sleep",
                    })
                  }
                >
                  2
                </Button>
                <span>{t("to sleep")}</span>
                <Button
                  variant="plain"
                  className="key"
                  aria-label={t(
                    self?.pose === "fish" ? "Stop fishing" : "Fish",
                  )}
                  title={t("Fish / stop (3)")}
                  aria-pressed={self?.pose === "fish"}
                  onClick={() =>
                    send({
                      type: "pose",
                      pose: self?.pose === "fish" ? "stand" : "fish",
                    })
                  }
                >
                  3
                </Button>
                <span>{t("to fish")}</span>
              </div>
              <div className="map-weather">
                {getMap(workspace.mapId).theme === "space" ? "✦" : "☀"}{" "}
                <span>{t(getMap(workspace.mapId).name)}</span>
              </div>
              <MediaTracks
                room={media.room}
                revision={media.revision}
                speaking={media.speaking}
              />
            </div>
            <div className="map-bottomline">
              <span>
                <i className="green-dot" />
                {self?.conversation.startsWith("call:")
                  ? t("Private call")
                  : self?.zone !== "floor"
                    ? t("Meeting room audio")
                    : self?.status === "dnd"
                      ? t("Do not disturb · audio paused")
                      : t("Nearby voice · automatic")}
                <span className="muted">
                  {" "}
                  ·{" "}
                  {audience.length
                    ? t("{count} in your conversation", {
                        count: audience.length,
                      })
                    : t("a little room to focus")}
                </span>
              </span>
              <Button
                variant="link"
                className="text-button"
                onClick={() => setModal("help")}
              >
                {t("How it works")}
                <ArrowUpRight size={13} />
              </Button>
            </div>
          </div>
          {media.error && (
            <div className="media-error">
              <Headphones size={16} />
              <span>
                {t("Media connection:")}
                {t(media.error)}
              </span>
              <Button variant="plain" onClick={media.retry}>
                {t("Retry audio")}
              </Button>
            </div>
          )}
        </main>
        {sidebarOpen && (
          <aside className="sidebar" aria-label={t("People and rooms")}>
            <div className="sidebar-tabs">
              <Button
                variant="plain"
                className={panel === "people" ? "selected" : ""}
                onClick={() => setPanel("people")}
              >
                {t("People")}
                <span>{people.length}</span>
              </Button>
              <Button
                variant="plain"
                className={panel === "rooms" ? "selected" : ""}
                onClick={() => setPanel("rooms")}
              >
                {t("Rooms")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="icon-button"
                aria-label={t("Office settings")}
                onClick={() => {
                  setSettingsTab("workspace");
                  setModal("settings");
                }}
              >
                <MoreHorizontal size={19} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="icon-button"
                aria-label={t("Close people and rooms")}
                onClick={() => setSidebarOpen(false)}
              >
                <X size={18} />
              </Button>
            </div>
            {user.role === "owner" && (
              <Button
                variant="plain"
                className="invite-button"
                onClick={() => {
                  setSettingsTab("members");
                  setModal("settings");
                }}
              >
                <Plus size={16} />
                {t("Invite teammate")}
              </Button>
            )}
            <div className="sidebar-content">
              {panel === "people" ? (
                <>
                  <label className="search">
                    <Search size={16} />
                    <Input
                      className="min-h-0 rounded-none border-0 bg-transparent p-0 text-[11px] shadow-none focus-visible:ring-0"
                      aria-label={t("Find your people")}
                      placeholder={t("Find your people")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="section-title">
                    {t("IN THE OFFICE")}
                    <span>{filtered.length}</span>
                  </div>
                  <div className="people-list">
                    {filtered.map((p) => (
                      <Button
                        variant="plain"
                        key={p.id}
                        className={`person ${selected === p.id ? "person-selected" : ""}`}
                        data-speaking={media.speaking.includes(p.id)}
                        data-in-voice={voicePeople.some(
                          (person) => person.id === p.id,
                        )}
                        onClick={() =>
                          setSelected(selected === p.id ? "" : p.id)
                        }
                      >
                        <div className="avatar-wrap">
                          <Avatar color={p.avatar} />
                          <i className={`status-dot ${p.status}`} />
                        </div>
                        <div className="person-copy">
                          <strong>
                            {p.name}{" "}
                            {p.id === user.id && <small>{t("(you)")}</small>}
                          </strong>
                          <span>
                            {p.statusText || t(statusLabel[p.status])}
                          </span>
                        </div>
                        {media.speaking.includes(p.id) ? (
                          <SpeakingIndicator />
                        ) : voicePeople.some((person) => person.id === p.id) ? (
                          <Headphones
                            size={15}
                            aria-label={t("In your voice conversation")}
                            className="in-voice-icon"
                          />
                        ) : p.conversation ? (
                          <Headphones size={15} className="muted" />
                        ) : (
                          <span className="person-room">
                            {p.zone === "floor"
                              ? t("Commons")
                              : p.zone === "studio"
                                ? t("Studio")
                                : t("Library")}
                          </span>
                        )}
                      </Button>
                    ))}
                  </div>
                  {chosen && chosen.id !== user.id && (
                    <div className="person-actions">
                      <strong>
                        {t("Say hello to {name}", {
                          name: chosen.name.split(" ")[0],
                        })}
                      </strong>
                      <div>
                        <Button
                          variant="plain"
                          onClick={() =>
                            send({ type: "wave", target: chosen.id })
                          }
                        >
                          <Hand size={16} />
                          {t("Wave")}
                        </Button>
                        <Button
                          variant="plain"
                          disabled={
                            !self ||
                            !canNudge(self, chosen) ||
                            chosen.status === "dnd"
                          }
                          onClick={() =>
                            send({ type: "nudge", target: chosen.id })
                          }
                        >
                          <BellRing size={16} />
                          {t("Nudge")}
                        </Button>
                        <Button
                          variant="plain"
                          onClick={() =>
                            send({
                              type: "invite",
                              target: chosen.id,
                              kind: "summon",
                            })
                          }
                        >
                          <ArrowUpRight size={16} />
                          {t("Summon")}
                        </Button>
                        <Button
                          variant="plain"
                          onClick={() =>
                            send({
                              type: "invite",
                              target: chosen.id,
                              kind: "call",
                            })
                          }
                        >
                          <Video size={16} />
                          {t("Call")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {!people.length && (
                    <p className="empty-note">
                      {t("Connecting you to the office…")}
                    </p>
                  )}
                  <div className="sidebar-divider" />
                  <div className="section-title">
                    {t("A SPACE FOR EVERY MOMENT")}
                  </div>
                  <RoomCards
                    people={people}
                    self={self}
                    locks={snapshot?.locks || {}}
                    send={send}
                  />
                </>
              ) : (
                <>
                  <div className="section-title room-list-title">
                    {t("FIND YOUR SPACE")}
                  </div>
                  <p className="sidebar-note">
                    {t(
                      "Walk into a room, or join from here. Your conversation follows you.",
                    )}
                  </p>
                  <RoomCards
                    people={people}
                    self={self}
                    locks={snapshot?.locks || {}}
                    send={send}
                  />
                  <Button
                    variant="plain"
                    className="commons-button"
                    onClick={() => send({ type: "zone", zone: "floor" })}
                  >
                    <Leaf size={17} />
                    {t("Back to the commons")} <ArrowRight size={14} />
                  </Button>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      <footer className="controlbar" data-media-connected={media.connected}>
        <Button
          variant="plain"
          className="self-control"
          onClick={() => setModal("profile")}
        >
          <Avatar color={self?.avatar || user.avatar} />
          <div>
            <strong>{user.name}</strong>
            <span>
              <i
                className={`status-dot-inline ${self?.status || "available"}`}
              />
              {t(statusLabel[self?.status || "available"])}
            </span>
          </div>
          <ChevronDown size={15} />
        </Button>
        <div className="media-controls">
          <div className="device-control">
            <Control
              icon={
                media.speaking.includes(user.id) ? (
                  <SpeakingIndicator />
                ) : media.mic ? (
                  <Mic />
                ) : (
                  <MicOff />
                )
              }
              label={t("Microphone")}
              speaking={media.speaking.includes(user.id)}
              on={media.mic}
              onClick={() => void media.toggle("mic")}
            />
            <ToolbarMenu
              label={t("Audio devices")}
              onOpen={() => void media.enumerate()}
            >
              {() => (
                <>
                  <DeviceSelect media={media} kind="audioinput" />
                  <DeviceSelect media={media} kind="audiooutput" />
                  {!media.outputSupported && (
                    <p className="muted">
                      {t(
                        "This browser uses your system output. Select your speakers or headphones in your system sound settings.",
                      )}
                    </p>
                  )}
                  {media.outputSupported && media.outputPickerSupported && (
                    <Button
                      variant="secondary"
                      className="secondary"
                      disabled={media.deviceBusy}
                      onClick={() => void media.chooseOutput()}
                    >
                      {t("Choose another speaker…")}
                    </Button>
                  )}
                  {!media.microphoneAllowed && (
                    <Button
                      variant="secondary"
                      className="secondary"
                      disabled={media.deviceBusy}
                      onClick={() => void media.enumerate(true)}
                    >
                      {t("Allow microphone access & refresh devices")}
                    </Button>
                  )}
                </>
              )}
            </ToolbarMenu>
          </div>
          <div className="device-control">
            <Control
              icon={media.camera ? <Video /> : <VideoOff />}
              label={t("Camera")}
              on={media.camera}
              onClick={() => void media.toggle("camera")}
            />
            <ToolbarMenu
              label={t("Camera devices")}
              onOpen={() => void media.enumerate()}
            >
              {() => (
                <>
                  <DeviceSelect media={media} kind="videoinput" />
                  {!media.cameraAllowed && (
                    <Button
                      variant="secondary"
                      className="secondary"
                      disabled={media.deviceBusy}
                      onClick={() => void media.enumerate("videoinput")}
                    >
                      {t("Allow camera access & refresh devices")}
                    </Button>
                  )}
                </>
              )}
            </ToolbarMenu>
          </div>
          <Control
            icon={<MonitorUp />}
            label={isSharing ? t("Stop sharing") : t("Share screen")}
            on={isSharing}
            onClick={() => {
              if (isSharing) {
                void media.share(false);
                send({ type: "present", enabled: false });
              } else if (!media.connected)
                notify("Join a conversation before sharing your screen.");
              else
                void media
                  .prepareShare()
                  .then(() => send({ type: "present", enabled: true }))
                  .catch((e) => notify((e as Error).message));
            }}
          />
          {whiteboardEnabled(workspace) && (
            <Control
              icon={<PencilRuler />}
              label={t("Whiteboard")}
              on={!!whiteboard}
              onClick={() => {
                if (self && !whiteboard)
                  setWhiteboard({
                    scope: boardScope(workspace.mapId, self),
                    name: currentZone.name,
                  });
              }}
            />
          )}
          <span className="control-divider" />
          <ToolbarMenu label={t("Emote")} icon={<Smile />}>
            {(close) => (
              <EmotePicker
                choose={(emoji) => {
                  send({ type: "emote", emoji });
                  close();
                }}
              />
            )}
          </ToolbarMenu>
        </div>
        <div className="audio-control">
          {media.soundBlocked && (
            <Button
              variant="secondary"
              className="secondary enable-sound"
              onClick={() => void media.enableSound()}
            >
              {t("Enable sound")}
            </Button>
          )}
          {self?.conversation && self.conversation !== "floor" && (
            <Button
              variant="ghost"
              size="icon"
              className="icon-button leave-call"
              aria-label={t("Leave conversation")}
              onClick={() => send({ type: "leave" })}
            >
              <LogOut size={17} />
            </Button>
          )}
        </div>
      </footer>
      {whiteboard && (
        <Whiteboard
          scope={whiteboard.scope}
          name={whiteboard.name}
          userId={user.id}
          enabled={whiteboardEnabled(workspace)}
          storageConfigured={!!config?.storageConfigured}
          active={
            whiteboardEnabled(workspace) &&
            !!self &&
            connection === "Connected" &&
            whiteboard.scope === boardScope(workspace.mapId, self)
          }
          onClose={() => setWhiteboard(null)}
        />
      )}
      {notice && <Toast text={notice} close={() => setNotice("")} />}
      {connection === "Opened elsewhere" && (
        <div className="session-taken-over" role="status">
          <strong>
            {t("This office is now open in another tab or device.")}
          </strong>
          <span>
            {t(
              "This tab has disconnected. Reload it to use the office here again.",
            )}
          </span>
        </div>
      )}
      {invites[0] && (
        <div
          className="invitation-card"
          role="dialog"
          aria-modal="true"
          aria-label={t("Conversation invitation")}
        >
          <div className="invitation-icon">
            {invites[0].kind === "summon" ? <Hand /> : <Video />}
          </div>
          <h3>
            {invites[0].fromName}{" "}
            {invites[0].kind === "summon"
              ? t("is waving you over")
              : t("is calling")}
          </h3>
          <p>
            {invites[0].kind === "summon"
              ? t("Join them in {room}.", {
                  room: t(
                    ZONES.find((z) => z.id === invites[0].destination)?.name ||
                      "The commons",
                  ),
                })
              : t("A little face-to-face time?")}{" "}
            {self?.conversation &&
              t("Accepting changes your current conversation.")}
          </p>
          <div>
            <Button
              variant="secondary"
              className="secondary"
              onClick={() =>
                send({ type: "respond", id: invites[0].id, accept: false })
              }
            >
              {t("Not now")}
            </Button>
            <Button
              variant="default"
              className="primary"
              onClick={() =>
                send({ type: "respond", id: invites[0].id, accept: true })
              }
            >
              {t("Join them")}
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        {modal && (
          <DialogContent
            className={`modal ${modal === "settings" ? "max-w-[920px]" : modal === "profile" ? "max-w-[740px]" : ""}`}
            closeLabel={t("Close dialog")}
          >
            <DialogTitle className="sr-only">
              {modal === "settings"
                ? t("Office settings")
                : modal === "profile"
                  ? t("Your profile")
                  : t("Office guide")}
            </DialogTitle>
            {modal === "help" ? (
              <>
                <div className="eyebrow">
                  {t("WELCOME TO YOUR LITTLE OFFICE")}
                </div>
                <h2>{t("Make yourself at home.")}</h2>
                <div className="help-grid">
                  <p>
                    <strong>{t("Walk & talk")}</strong>
                    {t(
                      "Use WASD or the arrow keys. On mobile, touch and drag the map to walk; release to stop. Press Space to jump. Nearby voice joins automatically; enable your mic to talk. The nearby voice list shows who can hear you.",
                    )}
                  </p>
                  <p>
                    <strong>{t("Make some room")}</strong>
                    {t(
                      "Join the Studio or Library for a meeting. Lock a room from its card; people inside can summon others in.",
                    )}
                  </p>
                  <p>
                    <strong>{t("A friendly nudge")}</strong>
                    {t(
                      "Face someone nearby and press Z to nudge them. Both of you hear a chime, and the avatars react. Press 1 to sit or 2 to sleep; move or jump to stand up. These poses do not change your voice or availability.",
                    )}{" "}
                    {t(
                      "Face nearby water and press 3 to fish. Press 3 again, move, or jump to stop. After catching a fish, you return to idle.",
                    )}
                  </p>
                  <p>
                    <strong>{t("Farm break")}</strong>
                    {t(
                      "On the Sunny Acres map there are no desks — press E near the hen yard to collect eggs, at the crop field to plant and harvest wheat, and face the pond to fish with 3. Reel in the moment you see a bite!",
                    )}
                  </p>
                  <p>
                    <strong>{t("Your space, your choice")}</strong>
                    {t(
                      "Mic and camera start off. Do not disturb quiets interruptions. Open-floor audio is public; use a meeting room for private conversations.",
                    )}
                  </p>
                </div>
              </>
            ) : modal === "profile" ? (
              <Profile
                user={user}
                self={self}
                send={send}
                saved={async () => {
                  await refresh();
                  setModal(null);
                }}
              />
            ) : (
              <SettingsPanel
                key={user.role}
                workspace={workspace}
                initialTab={settingsTab}
                mapEffectsEnabled={mapEffectsEnabled}
                changeMapEffects={changeMapEffects}
                user={user}
                config={config!}
                refresh={refresh}
                notify={notify}
                media={media}
              />
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>
        little<span className="brand-light">office</span>
        <sup>✦</sup>
      </span>
    </div>
  );
}
function Control({
  icon,
  label,
  on,
  onClick,
  speaking = false,
}: {
  icon: React.ReactNode;
  label: string;
  on?: boolean;
  onClick: () => void;
  speaking?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Button
      variant="plain"
      className={`control ${on ? "control-on" : ""}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={t(label)}
      data-speaking={speaking}
    >
      <span>{icon}</span>
      <small>{speaking ? t("Speaking") : t(label)}</small>
    </Button>
  );
}
function Toast({ text, close }: { text: string; close: () => void }) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // Keep notifications within the active dialog's pointer and focus boundary.
    const root = document.querySelector(".app-shell");
    if (!root) return;
    const update = () =>
      setDialog(
        Array.from(
          root.querySelectorAll<HTMLElement>('[data-slot="dialog-content"]'),
        ).at(-1) ?? null,
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true });
    return () => observer.disconnect();
  }, []);
  const content = (
    <div className="toast" data-in-dialog={!!dialog} role="status">
      <Leaf size={17} />
      <span>{t(text)}</span>
      <Button variant="plain" onClick={close} aria-label={t("Dismiss")}>
        <X size={16} />
      </Button>
    </div>
  );
  return dialog ? createPortal(content, dialog) : content;
}
function RoomCards({
  people,
  self,
  locks,
  send,
}: {
  people: Person[];
  self?: Person;
  locks: Record<string, boolean>;
  send: (c: Command) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="room-cards">
      {ZONES.filter((z) => z.id !== "floor").map((z) => (
        <div
          className={`room-card ${z.id} ${self?.zone === z.id ? "in-room" : ""}`}
          key={z.id}
        >
          <div className="room-illustration">
            <div className="mini-table" />
            <div className="mini-chair one" />
            <div className="mini-chair two" />
            <div className="mini-plant" />
          </div>
          <div className="room-card-copy">
            <strong>{t(z.name)}</strong>
            <span>
              {t("{count} here · {seats} seats", {
                count: people.filter((p) => p.zone === z.id).length,
                seats: z.id === "studio" ? 8 : 6,
              })}
            </span>
          </div>
          {self?.zone === z.id ? (
            <Button
              variant="ghost"
              size="icon"
              className="icon-button"
              aria-label={t(locks[z.id] ? "Unlock {room}" : "Lock {room}", {
                room: t(z.name),
              })}
              onClick={() =>
                send({
                  type: "lock",
                  zone: z.id as "studio" | "library",
                  locked: !locks[z.id],
                })
              }
            >
              {locks[z.id] ? <Lock size={16} /> : <DoorOpen size={16} />}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="icon-button"
              aria-label={t("Join {room}", { room: t(z.name) })}
              onClick={() => send({ type: "zone", zone: z.id })}
            >
              {locks[z.id] ? <Lock size={16} /> : <ChevronRight size={16} />}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
function Login({
  config,
  refresh,
  notify,
}: {
  config: AppConfig | null;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const { t } = useI18n();
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const busy = form.formState.isSubmitting;
  async function login(values: z.infer<typeof loginSchema>) {
    form.clearErrors("root");
    try {
      await api("/auth/sign-in/username", values);
      await refresh();
    } catch (error) {
      form.setError("root", { message: (error as Error).message });
    }
  }
  return (
    <main className="login-page">
      <div className="login-language">
        <LanguageToggle />
      </div>
      <div className="login-art">
        <div className="login-sun" />
        <div className="login-window">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="login-desk">
          <div className="login-monitor" />
          <div className="login-coffee" />
        </div>
        <div className="login-plant">✿</div>
        <div className="login-art-copy">
          <span>{t("YOUR PEOPLE. YOUR PLACE.")}</span>
          <h2>
            {t("A little closer.")}
            <br />
            {t("Even from afar.")}
          </h2>
          <p>
            {t("A cozy corner of the internet")}
            <br />
            {t("to do good work, together.")}
          </p>
        </div>
      </div>
      <div className="login-card">
        <Brand />
        <div className="eyebrow">{t("MAKE YOURSELF AT HOME")}</div>
        <h1>
          {t("Your office,")}
          <br />
          {t("wherever you are.")}
        </h1>
        <p>{t("Step inside. Your people are just a few pixels away.")}</p>
        {config?.password && (
          <FormProvider {...form}>
            <form
              noValidate
              onSubmit={form.handleSubmit(login)}
              className="space-y-5"
            >
              <FormInput
                name="username"
                label={t("Username")}
                autoComplete="username"
                required
                placeholder={t("Your username")}
              />
              <FormInput
                name="password"
                label={t("Password")}
                type="password"
                autoComplete="current-password"
                required
                placeholder={t("Your password")}
              />
              <FormError />
              <Button type="submit" className="primary w-full" disabled={busy}>
                {busy ? t("Opening the door…") : t("Enter the office")}
                <ArrowRight size={17} />
              </Button>
            </form>
          </FormProvider>
        )}
        {config?.sso && (
          <>
            <div className="login-or">{config.password ? t("or") : ""}</div>
            <Button
              variant="secondary"
              className="secondary sso-button"
              onClick={async () => {
                try {
                  const r = await api<{ url: string }>("/auth/sign-in/social", {
                    provider: config.provider,
                    callbackURL: location.origin,
                  });
                  location.assign(r.url);
                } catch (error) {
                  notify((error as Error).message);
                }
              }}
            >
              <Shield size={17} />
              {t("Sign in with SSO")}
            </Button>
          </>
        )}
        {!config && (
          <p className="error-text">
            {t(
              "The office server is unavailable. Start the API and database, then reload.",
            )}
          </p>
        )}
        <p className="login-footnote">
          {t("A private space for your team.")}
          <br />
          {t("Need an account? Ask your office owner.")}
        </p>
      </div>
    </main>
  );
}
function PasswordChange({ onDone }: { onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const form = useForm({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  return (
    <main className="login-page">
      <div className="login-language">
        <LanguageToggle />
      </div>
      <FormProvider {...form}>
        <form
          noValidate
          className="login-card space-y-5"
          onSubmit={form.handleSubmit(
            async ({ currentPassword, newPassword }) => {
              form.clearErrors("root");
              try {
                await api("/auth/change-password", {
                  currentPassword,
                  newPassword,
                  revokeOtherSessions: true,
                });
                await onDone();
              } catch (error) {
                form.setError("root", { message: (error as Error).message });
              }
            },
          )}
        >
          <Brand />
          <h1>{t("Make it yours.")}</h1>
          <p>
            {t("Replace your temporary password before entering the office.")}
          </p>
          <FormInput
            name="currentPassword"
            label={t("Temporary password")}
            type="password"
            autoComplete="current-password"
            required
          />
          <FormInput
            name="newPassword"
            label={t("New password")}
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
            description={t("Use 12–128 characters.")}
          />
          <FormInput
            name="confirmPassword"
            label={t("Confirm new password")}
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
          />
          <FormError />
          <Button
            type="submit"
            className="primary"
            disabled={form.formState.isSubmitting}
          >
            {t("Save password")}
            <ArrowRight size={16} />
          </Button>
        </form>
      </FormProvider>
    </main>
  );
}
function Profile({
  user,
  self,
  send,
  saved,
}: {
  user: User;
  self?: Person;
  send: (c: Command) => void;
  saved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
      avatar: user.avatar,
      status: self?.status || "available",
      statusText: self?.statusText || "",
    },
  });
  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit(
          async ({ name, avatar, status, statusText }) => {
            form.clearErrors("root");
            try {
              await api("/profile", { name, avatar }, "PATCH");
              send({ type: "status", status, text: statusText });
              await saved();
            } catch (error) {
              form.setError("root", { message: (error as Error).message });
            }
          },
        )}
      >
        <div className="eyebrow">{t("A LITTLE BIT OF YOU")}</div>
        <h2>{t("Your office self.")}</h2>
        <Controller
          control={form.control}
          name="avatar"
          render={({ field }) => (
            <AvatarEditor value={field.value} onChange={field.onChange} />
          )}
        />
        <FormInput
          name="name"
          label={t("Your name")}
          maxLength={40}
          required
          autoComplete="name"
        />
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="profile-availability">
                {t("Availability")}
              </FieldLabel>
              <Select
                id="profile-availability"
                label={t("Availability")}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                options={Object.entries(statusLabel).map(([value, text]) => ({
                  value,
                  label: t(text),
                }))}
              />
            </Field>
          )}
        />
        <FormInput
          name="statusText"
          label={t("A little status")}
          placeholder={t("Making something good…")}
          maxLength={80}
        />
        <FormError />
        <Button
          type="submit"
          className="primary"
          disabled={form.formState.isSubmitting}
        >
          {t("Save changes")}
          <Check size={16} />
        </Button>
      </form>
    </FormProvider>
  );
}
function SettingsPanel({
  mapEffectsEnabled,
  changeMapEffects,
  workspace,
  initialTab,
  user,
  config,
  refresh,
  notify,
  media,
}: {
  mapEffectsEnabled: boolean;
  changeMapEffects: (enabled: boolean) => void;
  workspace: Workspace;
  initialTab: "workspace" | "members";
  user: User;
  config: AppConfig;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  media: ReturnType<typeof useOfficeMedia>;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<
      "audio" | "display" | "auth" | "members" | "workspace" | "activity"
    >(user.role === "owner" ? initialTab : "audio"),
    [users, setUsers] = useState<AdminUser[]>([]),
    [busy, setBusy] = useState(false);
  const [memberAction, setMemberAction] = useState<{
    user: AdminUser;
    kind: "delete" | "reset" | "role";
  } | null>(null);
  const loadUsers = useCallback(async () => {
    try {
      setUsers(await api<AdminUser[]>("/admin/users"));
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    if (tab === "members" && user.role === "owner") void loadUsers();
    if (tab === "audio") void media.enumerate();
  }, [tab, loadUsers, user.role]);
  async function toggle(method: "password" | "sso") {
    setBusy(true);
    try {
      await api(
        "/admin/auth",
        {
          password: method === "password" ? !config.password : config.password,
          sso: method === "sso" ? !config.sso : config.sso,
        },
        "PATCH",
      );
      await refresh();
      notify("Login methods updated.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <div className="eyebrow">{t("KEEP THINGS FEELING RIGHT")}</div>
      <h2>{t("Office settings.")}</h2>
      <TabsList
        className="settings-tabs justify-start rounded-none bg-transparent p-0"
        aria-label={t("Office settings")}
      >
        {user.role === "owner" && (
          <TabsTrigger value="workspace">{t("Workspace")}</TabsTrigger>
        )}
        <TabsTrigger value="audio">{t("Devices")}</TabsTrigger>
        <TabsTrigger value="display">{t("Display")}</TabsTrigger>
        {user.role === "owner" && (
          <>
            <TabsTrigger value="members">{t("Members")}</TabsTrigger>
            <TabsTrigger value="activity">{t("Activity")}</TabsTrigger>
            <TabsTrigger value="auth">{t("Authentication")}</TabsTrigger>
          </>
        )}
      </TabsList>
      <TabsContent value={tab} className="mt-0">
        {tab === "display" && (
          <div className="workspace-feature-card">
            <div className="workspace-feature-icon">
              <Leaf size={25} />
            </div>
            <div>
              <h4 id="map-effects-label">{t("Map effects")}</h4>
              <p id="map-effects-description">
                {t(
                  "Moving water and falling leaves or petals. Saved for your account on this browser.",
                )}
              </p>
              <small>
                {t(
                  "Off by default when your device requests reduced motion. You can turn effects on here.",
                )}
              </small>
            </div>
            <Switch
              className="feature-switch"
              aria-labelledby="map-effects-label"
              aria-describedby="map-effects-description"
              checked={mapEffectsEnabled}
              onCheckedChange={changeMapEffects}
            />
          </div>
        )}
        {tab === "activity" && user.role === "owner" && <ActivityLog />}
        {tab === "workspace" && (
          <WorkspaceSettings
            workspace={workspace}
            refresh={refresh}
            notify={notify}
          />
        )}
        {tab === "audio" && (
          <div>
            <p className="muted">
              {t(
                "Choose your microphone and speakers before or during a conversation. Choices are saved for your account on this browser.",
              )}
            </p>
            {!media.microphoneAllowed && (
              <>
                <Button
                  variant="secondary"
                  className="secondary"
                  disabled={media.deviceBusy}
                  onClick={() => void media.enumerate(true)}
                >
                  {t("Allow microphone access & refresh devices")}
                </Button>
                <p className="muted">
                  {t(
                    "This reveals device names without turning your call microphone on.",
                  )}
                </p>
              </>
            )}
            <DeviceSelect media={media} kind="audioinput" />
            <DeviceSelect media={media} kind="audiooutput" />
            {!media.outputSupported && (
              <p className="muted">
                {t(
                  "This browser uses your system output. Select your speakers or headphones in your system sound settings.",
                )}
              </p>
            )}
            {media.outputSupported && media.outputPickerSupported && (
              <Button
                variant="secondary"
                className="secondary"
                disabled={media.deviceBusy}
                onClick={() => void media.chooseOutput()}
              >
                {t("Choose another speaker…")}
              </Button>
            )}
            <DeviceSelect media={media} kind="videoinput" />
            <label>
              {t("Video & screen quality")}
              <Select
                label={t("Video & screen quality")}
                value={media.quality}
                onChange={media.chooseQuality}
                options={Object.entries(MEDIA_QUALITY).map(
                  ([value, profile]) => ({ value, label: t(profile.label) }),
                )}
              />
            </label>
            <p className="muted">
              {t(
                "Applies the next time you turn on your camera or start sharing. Your microphone and current call stay connected.",
              )}
            </p>
            <p className="muted">
              {t(
                "Maximum uses more bandwidth and processing power. Actual resolution and frame rate depend on your device, browser, shared content, and connection. Choose Balanced if video stutters.",
              )}
            </p>
            {config.sso && (
              <Button
                variant="secondary"
                className="secondary"
                onClick={async () => {
                  try {
                    const result = await api<{ url: string }>(
                      "/auth/link-social",
                      {
                        provider: config.provider,
                        callbackURL: location.origin,
                      },
                    );
                    location.assign(result.url);
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <Shield size={16} />
                {t("Link your SSO account")}
              </Button>
            )}
          </div>
        )}
        {tab === "auth" && (
          <>
            <p className="muted">
              {t(
                "Choose how your team enters the office. Disabled methods also end their existing sessions.",
              )}
            </p>
            {(["password", "sso"] as const).map((method) => (
              <div className="setting-row" key={method}>
                <div>
                  <strong>
                    {method === "password"
                      ? t("Username & password")
                      : t("OIDC single sign-on")}
                  </strong>
                  <p>
                    {method === "password"
                      ? t("Local accounts for your team.")
                      : config.ssoConfigured
                        ? t("Your identity provider is configured.")
                        : t(
                            "Add your OIDC issuer and client credentials to the server first.",
                          )}
                  </p>
                </div>
                <Switch
                  aria-label={t(
                    method === "password"
                      ? "Enable username/password login"
                      : "Enable OIDC SSO login",
                  )}
                  checked={config[method]}
                  disabled={busy || (method === "sso" && !config.ssoConfigured)}
                  onCheckedChange={() => void toggle(method)}
                />
              </div>
            ))}
            <div className="settings-note">
              <Shield size={17} />
              <p>
                {t(
                  "Sign in as an owner through SSO before switching passwords off. At least one working owner login stays enabled.",
                )}
              </p>
            </div>
          </>
        )}
        {tab === "members" && (
          <>
            <div className="admin-users">
              {users.map((u) => (
                <div key={u.id} data-member-id={u.id}>
                  <Avatar color="sage" />
                  <span>
                    <strong>{u.name}</strong>
                    <small>
                      {u.username || t("SSO account")} · {t(u.role)}
                      {!u.localPassword && u.username
                        ? ` · ${t("SSO account")}`
                        : ""}
                    </small>
                  </span>
                  {u.id !== user.id && (
                    <div className="member-actions">
                      <Button
                        variant="link"
                        className="text-button"
                        disabled={busy || !u.approved}
                        onClick={() =>
                          setMemberAction({ user: u, kind: "role" })
                        }
                      >
                        {t("Change role")}
                      </Button>
                      <Button
                        variant="link"
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            await api(
                              `/admin/users/${u.id}`,
                              { approved: !u.approved },
                              "PATCH",
                            );
                            await loadUsers();
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                      >
                        {u.approved ? t("Disable") : t("Approve")}
                      </Button>
                      {u.localPassword && (
                        <Button
                          variant="link"
                          className="text-button"
                          disabled={busy || !config.password}
                          onClick={() =>
                            setMemberAction({ user: u, kind: "reset" })
                          }
                        >
                          {t("Reset password")}
                        </Button>
                      )}
                      {u.role === "member" && (
                        <Button
                          variant="link"
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            setMemberAction({ user: u, kind: "delete" })
                          }
                        >
                          {t("Delete member")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {memberAction?.kind === "role" && (
              <MemberRoleForm
                key={memberAction.user.id}
                user={memberAction.user}
                onCancel={() => setMemberAction(null)}
                saved={async () => {
                  setMemberAction(null);
                  await loadUsers();
                }}
              />
            )}
            {memberAction && memberAction.kind !== "role" && (
              <MemberActionForm
                key={`${memberAction.kind}:${memberAction.user.id}`}
                action={{ kind: memberAction.kind, user: memberAction.user }}
                onCancel={() => setMemberAction(null)}
                saved={async () => {
                  setMemberAction(null);
                  await loadUsers();
                }}
                notify={notify}
              />
            )}
            <details className="add-member">
              <summary>
                <Plus size={16} />
                {t("Add a teammate")}
              </summary>
              <CreateMemberForm
                passwordEnabled={config.password}
                saved={loadUsers}
                notify={notify}
              />
            </details>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

function MapLoading() {
  const { t } = useI18n();
  return (
    <div className="map-loading">
      <Leaf />
      {t("Growing your little office…")}
    </div>
  );
}
