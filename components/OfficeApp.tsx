"use client";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import dynamic from "next/dynamic";
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
import {
  CHARACTER_LOOKS,
  characterLook,
  drawCharacter,
} from "@/shared/avatars";
import type { Command } from "@/shared/protocol";
import { MediaTracks, SpeakingIndicator, useOfficeMedia } from "./Media";
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
    [jumps, setJumps] = useState<Record<string, number>>({}),
    [nudges, setNudges] = useState<
      Record<string, { start: number; sender: boolean }>
    >({});
  const [settingsTab, setSettingsTab] = useState<"workspace" | "members">(
    "workspace",
  );
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
      attempt = 0;
    function connect() {
      if (disposed) return;
      setConnection("Connecting");
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/office`,
      );
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
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
        else if (message.type === "presenter" && message.enabled) {
          void mediaRef.current.share(true).catch((e) => {
            send({ type: "present", enabled: false });
            notify((e as Error).message);
          });
        }
      };
      ws.onclose = async () => {
        if (disposed) return;
        setConnection("Reconnecting");
        setSnapshot(null);
        setInvites([]);
        setJumps({});
        setNudges({});
        try {
          await api("/me");
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
  }, [user?.id, user?.approved, user?.mustChangePassword, notify, send]);
  const wasSharing = useRef(false);
  const isSharing = !!media.room?.localParticipant.isScreenShareEnabled;
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
  if (user.mustChangePassword)
    return <PasswordChange onDone={refresh} notify={notify} />;
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
          <button className="primary" onClick={refresh}>
            {t("Check approval")}
          </button>
          <button className="text-button" onClick={logout}>
            {t("Sign out")}
          </button>
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
        <div className="header-end">
          <span
            className={`connection ${connection === "Connected" ? "good" : ""}`}
          >
            <i />
            {t(connection)}
          </span>
          <span className="header-divider" />
          <LanguageToggle />
          <button
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
          </button>
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
          <button
            className="icon-button"
            aria-label={t("Help")}
            onClick={() => setModal("help")}
          >
            <HelpCircle size={19} />
          </button>
          <button
            className="header-avatar"
            onClick={() => setModal("profile")}
            aria-label={t("Your profile")}
          >
            <Avatar color={user.avatar} />
          </button>
        </div>
      </header>
      <div className="body-shell">
        <nav className="rail" aria-label={t("Office navigation")}>
          <button
            className="rail-item active"
            aria-label={t("Office")}
            onClick={() => {
              setSidebarOpen(false);
              setSelected("");
            }}
          >
            <Home size={22} />
            <span>{t("Office")}</span>
          </button>
          <button
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
          </button>
          <button
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
          </button>
          <div className="rail-bottom">
            <button
              className="rail-item"
              onClick={() => {
                setSettingsTab("workspace");
                setModal("settings");
              }}
              aria-label={t("Settings")}
            >
              <Settings size={21} />
              <span>{t("Settings")}</span>
            </button>
            <button
              className="rail-item"
              onClick={logout}
              aria-label={t("Sign out")}
            >
              <LogOut size={20} />
              <span>{t("Leave")}</span>
            </button>
          </div>
        </nav>
        <main className="office-main">
          <h1 className="visually-hidden">
            {t("{workspace} virtual office", { workspace: workspace.name })}
          </h1>
          <div className="map-card">
            <div className="location-card">
              <div className="map-topline">
                <div>
                  <span className="map-icon">
                    <Leaf size={15} />
                  </span>
                  <strong>{t(currentZone.name)}</strong>
                  <span className="room-tag">
                    {self?.zone === "floor"
                      ? t("OPEN SPACE")
                      : t("MEETING ROOM")}
                  </span>
                </div>
                <div className="map-top-actions">
                  <span>
                    <Users size={14} />{" "}
                    {t("{count} here", { count: people.length })}
                  </span>
                </div>
              </div>
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
                    {media.connected && (
                      <span
                        className="voice-person"
                        title={
                          media.mic
                            ? t("Your microphone is on")
                            : t("Your microphone is muted")
                        }
                      >
                        <Avatar color={self.avatar} />
                        <span>{t("You")}</span>
                        {media.mic ? <Mic size={12} /> : <MicOff size={12} />}
                      </span>
                    )}
                    {voicePeople.map((p) => (
                      <button
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
                      </button>
                    ))}
                    {media.connected && !voicePeople.length && (
                      <span className="muted">
                        {self.conversation === "floor"
                          ? t("Move closer to a teammate to talk.")
                          : t("Waiting for someone to join.")}
                      </span>
                    )}
                  </div>
                </section>
              )}
            </div>
            <div className="map-stage">
              <PixelMap
                mapId={workspace.mapId}
                people={people}
                self={user.id}
                speaking={media.speaking}
                waves={waves}
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
                <button
                  className="key"
                  aria-label={t("Jump")}
                  title={t("Jump (Space)")}
                  onClick={() => send({ type: "jump" })}
                >
                  Space
                </button>
                <span>{t("to jump")}</span>
                <button
                  className="key"
                  aria-label={t("Nudge teammate in front")}
                  title={t("Nudge teammate in front (Z)")}
                  onClick={() => send({ type: "nudge" })}
                >
                  Z
                </button>
                <span>{t("to nudge")}</span>
                <button
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
                </button>
                <span>{t("to sit")}</span>
                <button
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
                </button>
                <span>{t("to sleep")}</span>
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
              <button className="text-button" onClick={() => setModal("help")}>
                {t("How it works")}
                <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
          {media.error && (
            <div className="media-error">
              <Headphones size={16} />
              <span>
                {t("Media connection:")}
                {t(media.error)}
              </span>
              <button onClick={media.retry}>{t("Retry audio")}</button>
            </div>
          )}
        </main>
        {sidebarOpen && (
          <aside className="sidebar" aria-label={t("People and rooms")}>
            <div className="sidebar-tabs">
              <button
                className={panel === "people" ? "selected" : ""}
                onClick={() => setPanel("people")}
              >
                {t("People")}
                <span>{people.length}</span>
              </button>
              <button
                className={panel === "rooms" ? "selected" : ""}
                onClick={() => setPanel("rooms")}
              >
                {t("Rooms")}
              </button>
              <button
                className="icon-button"
                aria-label={t("Office settings")}
                onClick={() => {
                  setSettingsTab("workspace");
                  setModal("settings");
                }}
              >
                <MoreHorizontal size={19} />
              </button>
              <button
                className="icon-button"
                aria-label={t("Close people and rooms")}
                onClick={() => setSidebarOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            {user.role === "owner" && (
              <button
                className="invite-button"
                onClick={() => {
                  setSettingsTab("members");
                  setModal("settings");
                }}
              >
                <Plus size={16} />
                {t("Invite teammate")}
              </button>
            )}
            <div className="sidebar-content">
              {panel === "people" ? (
                <>
                  <label className="search">
                    <Search size={16} />
                    <input
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
                      <button
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
                      </button>
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
                        <button
                          onClick={() =>
                            send({ type: "wave", target: chosen.id })
                          }
                        >
                          <Hand size={16} />
                          {t("Wave")}
                        </button>
                        <button
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
                        </button>
                        <button
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
                        </button>
                        <button
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
                        </button>
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
                  <button
                    className="commons-button"
                    onClick={() => send({ type: "zone", zone: "floor" })}
                  >
                    <Leaf size={17} />
                    {t("Back to the commons")} <ArrowRight size={14} />
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      <footer className="controlbar" data-media-connected={media.connected}>
        <button className="self-control" onClick={() => setModal("profile")}>
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
        </button>
        <div className="media-controls">
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
          <Control
            icon={media.camera ? <Video /> : <VideoOff />}
            label={t("Camera")}
            on={media.camera}
            onClick={() => void media.toggle("camera")}
          />
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
          <span className="control-divider" />
          <Control
            icon={<Hand />}
            label={t("Wave")}
            onClick={() => {
              if (selected && selected !== user.id)
                send({ type: "wave", target: selected });
              else {
                setWaves((v) => ({ ...v, [user.id]: Date.now() + 2600 }));
                notify("Select a teammate to send them a wave.");
              }
            }}
          />
          <Control
            icon={<Smile />}
            label={t("Status")}
            onClick={() => setModal("profile")}
          />
        </div>
        <div className="audio-control">
          {media.soundBlocked && (
            <button
              className="secondary enable-sound"
              onClick={() => void media.enableSound()}
            >
              {t("Enable sound")}
            </button>
          )}
          {self?.conversation && self.conversation !== "floor" && (
            <button
              className="icon-button leave-call"
              aria-label={t("Leave conversation")}
              onClick={() => send({ type: "leave" })}
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </footer>
      {notice && <Toast text={notice} close={() => setNotice("")} />}
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
            <button
              className="secondary"
              onClick={() =>
                send({ type: "respond", id: invites[0].id, accept: false })
              }
            >
              {t("Not now")}
            </button>
            <button
              className="primary"
              onClick={() =>
                send({ type: "respond", id: invites[0].id, accept: true })
              }
            >
              {t("Join them")}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "settings"
                ? t("Office settings")
                : modal === "profile"
                  ? t("Your profile")
                  : t("Office guide")
            }
          >
            <button
              className="modal-close icon-button"
              onClick={() => setModal(null)}
              aria-label={t("Close dialog")}
            >
              <X size={19} />
            </button>
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
                notify={notify}
                saved={async () => {
                  await refresh();
                  setModal(null);
                }}
              />
            ) : (
              <SettingsPanel
                workspace={workspace}
                initialTab={settingsTab}
                user={user}
                config={config!}
                refresh={refresh}
                notify={notify}
                media={media}
              />
            )}
          </section>
        </div>
      )}
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
export function Avatar({ color = "sage" }: { color?: string }) {
  const look = characterLook(color);
  const pixels: React.ReactNode[] = [];
  drawCharacter(look.id, "down", 0, (x, y, width, height, fill) => {
    pixels.push(
      <rect
        key={pixels.length}
        x={x}
        y={y}
        width={width}
        height={height}
        fill={"#" + fill.toString(16).padStart(6, "0")}
      />,
    );
  });
  return (
    <svg
      className={"pixel-avatar avatar-" + look.id}
      viewBox="-20 -48 40 60"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {pixels}
    </svg>
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
    <button
      className={`control ${on ? "control-on" : ""}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={t(label)}
      data-speaking={speaking}
    >
      <span>{icon}</span>
      <small>{speaking ? t("Speaking") : t(label)}</small>
    </button>
  );
}
function Toast({ text, close }: { text: string; close: () => void }) {
  const { t } = useI18n();
  return (
    <div className="toast" role="status">
      <Leaf size={17} />
      <span>{t(text)}</span>
      <button onClick={close} aria-label={t("Dismiss")}>
        <X size={16} />
      </button>
    </div>
  );
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
            <button
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
            </button>
          ) : (
            <button
              className="icon-button"
              aria-label={t("Join {room}", { room: t(z.name) })}
              onClick={() => send({ type: "zone", zone: z.id })}
            >
              {locks[z.id] ? <Lock size={16} /> : <ChevronRight size={16} />}
            </button>
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
  const [busy, setBusy] = useState(false);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/auth/sign-in/username", {
        username: form.get("username"),
        password: form.get("password"),
      });
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
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
          <form onSubmit={login}>
            <label>
              {t("Username")}
              <input
                name="username"
                autoComplete="username"
                required
                placeholder={t("Your username")}
              />
            </label>
            <label>
              {t("Password")}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder={t("Your password")}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? t("Opening the door…") : t("Enter the office")}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        {config?.sso && (
          <>
            <div className="login-or">{config.password ? t("or") : ""}</div>
            <button
              className="secondary sso-button"
              onClick={async () => {
                try {
                  const r = await api<{ url: string }>("/auth/sign-in/social", {
                    provider: config.provider,
                    callbackURL: location.origin,
                  });
                  location.assign(r.url);
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <Shield size={17} />
              {t("Sign in with SSO")}
            </button>
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
function PasswordChange({
  onDone,
  notify,
}: {
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  return (
    <main className="login-page">
      <div className="login-language">
        <LanguageToggle />
      </div>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api("/auth/change-password", {
              currentPassword: f.get("current"),
              newPassword: f.get("next"),
              revokeOtherSessions: true,
            });
            await onDone();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Brand />
        <h1>{t("Make it yours.")}</h1>
        <p>
          {t("Replace your temporary password before entering the office.")}
        </p>
        <label>
          {t("Temporary password")}
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          {t("New password")}
          <input
            name="next"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <p className="error-text">{t(error)}</p>}
        <button className="primary">
          {t("Save password")}
          <ArrowRight size={16} />
        </button>
      </form>
    </main>
  );
}
function Profile({
  user,
  self,
  send,
  notify,
  saved,
}: {
  user: User;
  self?: Person;
  send: (c: Command) => void;
  notify: (s: string) => void;
  saved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [avatar, setAvatar] = useState(user.avatar),
    [status, setStatus] = useState<Availability>(self?.status || "available");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          await api("/profile", { name: f.get("name"), avatar }, "PATCH");
          send({
            type: "status",
            status,
            text: String(f.get("statusText") || ""),
          });
          await saved();
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    >
      <div className="eyebrow">{t("A LITTLE BIT OF YOU")}</div>
      <h2>{t("Your office self.")}</h2>
      <div className="character-preview">
        <Avatar color={avatar} />
        <div>
          <span className="eyebrow">{t("YOUR CHARACTER")}</span>
          <h3>{t(characterLook(avatar).name)}</h3>
          <p>{t(characterLook(avatar).description)}</p>
        </div>
      </div>
      <p className="character-picker-label">
        {t("Choose your look. Save to wear it in the office.")}
      </p>
      <div
        className="avatar-picker"
        role="group"
        aria-label={t("Character skins")}
      >
        {CHARACTER_LOOKS.map((look) => (
          <button
            type="button"
            key={look.id}
            className={avatar === look.id ? "picked" : ""}
            aria-label={t("{name} skin", { name: t(look.name) })}
            aria-pressed={avatar === look.id}
            onClick={() => setAvatar(look.id)}
          >
            <Avatar color={look.id} />
            <span>{t(look.name)}</span>
            {avatar === look.id && <Check className="skin-check" size={13} />}
          </button>
        ))}
      </div>
      <label>
        {t("Your name")}
        <input name="name" defaultValue={user.name} maxLength={40} required />
      </label>
      <label>
        {t("Availability")}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Availability)}
        >
          {Object.entries(statusLabel).map(([value, text]) => (
            <option value={value} key={value}>
              {t(text)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("A little status")}
        <input
          name="statusText"
          placeholder={t("Making something good…")}
          defaultValue={self?.statusText || ""}
          maxLength={80}
        />
      </label>
      <button className="primary">
        {t("Save changes")}
        <Check size={16} />
      </button>
    </form>
  );
}
function SettingsPanel({
  workspace,
  initialTab,
  user,
  config,
  refresh,
  notify,
  media,
}: {
  workspace: Workspace;
  initialTab: "workspace" | "members";
  user: User;
  config: AppConfig;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  media: ReturnType<typeof useOfficeMedia>;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"audio" | "auth" | "members" | "workspace">(
      user.role === "owner" ? initialTab : "audio",
    ),
    [users, setUsers] = useState<AdminUser[]>([]),
    [busy, setBusy] = useState(false);
  const [memberAction, setMemberAction] = useState<{
    user: AdminUser;
    kind: "delete" | "reset";
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
    <>
      <div className="eyebrow">{t("KEEP THINGS FEELING RIGHT")}</div>
      <h2>{t("Office settings.")}</h2>
      <div className="settings-tabs">
        {user.role === "owner" && (
          <button
            className={tab === "workspace" ? "active" : ""}
            onClick={() => setTab("workspace")}
          >
            {t("Workspace")}
          </button>
        )}
        <button
          className={tab === "audio" ? "active" : ""}
          onClick={() => setTab("audio")}
        >
          {t("Devices")}
        </button>
        {user.role === "owner" && (
          <>
            <button
              className={tab === "members" ? "active" : ""}
              onClick={() => setTab("members")}
            >
              {t("Members")}
            </button>
            <button
              className={tab === "auth" ? "active" : ""}
              onClick={() => setTab("auth")}
            >
              {t("Authentication")}
            </button>
          </>
        )}
      </div>
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
          <button
            className="secondary"
            disabled={media.deviceBusy}
            onClick={() => void media.enumerate(true)}
          >
            {t("Allow microphone access & refresh devices")}
          </button>
          <p className="muted">
            {t(
              "This reveals device names without turning your call microphone on.",
            )}
          </p>
          <label>
            {t("Microphone")}
            <select
              aria-label={t("Microphone")}
              value={media.input}
              disabled={media.deviceBusy}
              onChange={(e) =>
                void media.switchDevice("audioinput", e.target.value)
              }
            >
              <option value="">{t("System default")}</option>
              {media.input &&
                !media.devices.some(
                  (d) => d.kind === "audioinput" && d.deviceId === media.input,
                ) && (
                  <option value={media.input}>
                    {t("Saved microphone · allow access or reconnect it")}
                  </option>
                )}
              {media.devices
                .filter(
                  (d) =>
                    d.kind === "audioinput" &&
                    d.deviceId &&
                    d.deviceId !== "default",
                )
                .map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || t("Microphone {number}", { number: i + 1 })}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t("Speakers / headphones")}
            <select
              aria-label={t("Speakers / headphones")}
              value={media.output}
              disabled={!media.outputSupported || media.deviceBusy}
              onChange={(e) =>
                void media.switchDevice("audiooutput", e.target.value)
              }
            >
              <option value="">{t("System default")}</option>
              {media.output &&
                !media.devices.some(
                  (d) =>
                    d.kind === "audiooutput" && d.deviceId === media.output,
                ) && (
                  <option value={media.output}>
                    {t("Saved speaker · allow access or reconnect it")}
                  </option>
                )}
              {media.devices
                .filter(
                  (d) =>
                    d.kind === "audiooutput" &&
                    d.deviceId &&
                    d.deviceId !== "default",
                )
                .map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("Speaker {number}", { number: i + 1 })}
                  </option>
                ))}
            </select>
          </label>
          {!media.outputSupported && (
            <p className="muted">
              {t(
                "This browser uses your system output. Select your speakers or headphones in your system sound settings.",
              )}
            </p>
          )}
          {media.outputSupported && media.outputPickerSupported && (
            <button
              className="secondary"
              disabled={media.deviceBusy}
              onClick={() => void media.chooseOutput()}
            >
              {t("Choose another speaker…")}
            </button>
          )}
          <label>
            {t("Camera")}
            <select
              aria-label={t("Camera")}
              value={media.videoInput}
              disabled={media.deviceBusy}
              onChange={(e) =>
                void media.switchDevice("videoinput", e.target.value)
              }
            >
              <option value="">{t("System default")}</option>
              {media.videoInput &&
                !media.devices.some(
                  (d) =>
                    d.kind === "videoinput" && d.deviceId === media.videoInput,
                ) && (
                  <option value={media.videoInput}>
                    {t("Saved camera · allow access or reconnect it")}
                  </option>
                )}
              {media.devices
                .filter(
                  (d) =>
                    d.kind === "videoinput" &&
                    d.deviceId &&
                    d.deviceId !== "default",
                )
                .map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || t("Camera {number}", { number: i + 1 })}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t("Video & screen quality")}
            <select
              aria-label={t("Video & screen quality")}
              value={media.quality}
              onChange={(e) => media.chooseQuality(e.target.value)}
            >
              {Object.entries(MEDIA_QUALITY).map(([value, profile]) => (
                <option key={value} value={value}>
                  {t(profile.label)}
                </option>
              ))}
            </select>
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
            <button
              className="secondary"
              onClick={async () => {
                try {
                  const result = await api<{ url: string }>(
                    "/auth/link-social",
                    { provider: config.provider, callbackURL: location.origin },
                  );
                  location.assign(result.url);
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <Shield size={16} />
              {t("Link your SSO account")}
            </button>
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
              <button
                className={`toggle ${config[method] ? "on" : ""}`}
                role="switch"
                aria-label={t(
                  method === "password"
                    ? "Enable username/password login"
                    : "Enable OIDC SSO login",
                )}
                aria-checked={config[method]}
                disabled={busy || (method === "sso" && !config.ssoConfigured)}
                onClick={() => void toggle(method)}
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
                    <button
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
                    </button>
                    {u.localPassword && (
                      <button
                        className="text-button"
                        disabled={busy || !config.password}
                        onClick={() =>
                          setMemberAction({ user: u, kind: "reset" })
                        }
                      >
                        {t("Reset password")}
                      </button>
                    )}
                    {u.role === "member" && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          setMemberAction({ user: u, kind: "delete" })
                        }
                      >
                        {t("Delete member")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {memberAction && (
            <form
              className="member-action-form"
              key={`${memberAction.kind}:${memberAction.user.id}`}
              aria-label={t(
                memberAction.kind === "delete"
                  ? "Delete member"
                  : "Reset password",
              )}
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const action = memberAction;
                const password = new FormData(form).get("password");
                setBusy(true);
                try {
                  if (action.kind === "delete")
                    await api(
                      `/admin/users/${action.user.id}`,
                      undefined,
                      "DELETE",
                    );
                  else
                    await api("/admin/reset-password", {
                      userId: action.user.id,
                      password,
                    });
                  form.reset();
                  setMemberAction(null);
                  await loadUsers();
                  notify(
                    action.kind === "delete"
                      ? "Member deleted."
                      : "Password reset. Give the temporary password to the member; they must change it on their next login.",
                  );
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <strong>{memberAction.user.name}</strong>
              <p>
                {t(
                  memberAction.kind === "delete"
                    ? "Delete this member and sign them out? This cannot be undone. Their SSO identity is not deleted; signing in again requires approval."
                    : "Set a temporary password with at least 12 characters. The member will be signed out and must change it on their next login.",
                )}
              </p>
              {memberAction.kind === "reset" && (
                <label>
                  {t("Temporary password")}
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    disabled={busy}
                  />
                </label>
              )}
              <div className="member-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => setMemberAction(null)}
                >
                  {t("Cancel")}
                </button>
                <button className="primary" disabled={busy}>
                  {t(
                    memberAction.kind === "delete"
                      ? "Confirm deletion"
                      : "Reset password",
                  )}
                </button>
              </div>
            </form>
          )}
          <details className="add-member">
            <summary>
              <Plus size={16} />
              {t("Add a teammate")}
            </summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                setBusy(true);
                try {
                  await api("/admin/users", {
                    username: f.get("username"),
                    name: f.get("name"),
                    password: f.get("password"),
                  });
                  form.reset();
                  await loadUsers();
                  notify(
                    "Teammate added. They will change their temporary password on first login.",
                  );
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {t("Name")}
                <input name="name" required maxLength={40} />
              </label>
              <label>
                {t("Username")}
                <input name="username" required pattern="[a-zA-Z0-9_]{3,30}" />
              </label>
              <label>
                {t("Temporary password")}
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                />
              </label>
              <button className="primary" disabled={busy || !config.password}>
                {t("Create account")}
                <Plus size={16} />
              </button>
            </form>
          </details>
        </>
      )}
    </>
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
