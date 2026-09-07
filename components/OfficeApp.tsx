"use client";
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
import { api, type User, type AppConfig } from "@/lib/api";
import {
  JUMP_DURATION,
  NUDGE_RADIUS,
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
  loading: () => (
    <div className="map-loading">
      <Leaf />
      Growing your little office…
    </div>
  ),
});
const statusLabel = {
  available: "Available",
  busy: "Busy",
  dnd: "Do not disturb",
  away: "Away",
};
type AdminUser = {
  id: string;
  name: string;
  username: string;
  role: string;
  approved: boolean;
};

export default function OfficeApp() {
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
    [jumps, setJumps] = useState<Record<string, number>>({});
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
        <span>Opening the office…</span>
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
        <div className="login-card">
          <Brand />
          <h1>Almost home.</h1>
          <p>
            Your SSO account is ready. An office owner needs to approve your
            membership.
          </p>
          <button className="primary" onClick={refresh}>
            Check approval
          </button>
          <button className="text-button" onClick={logout}>
            Sign out
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
            {connection}
          </span>
          <span className="header-divider" />
          <button
            className="icon-button"
            aria-label="Help"
            onClick={() => setModal("help")}
          >
            <HelpCircle size={19} />
          </button>
          <button
            className="header-avatar"
            onClick={() => setModal("profile")}
            aria-label="Your profile"
          >
            <Avatar color={user.avatar} />
          </button>
        </div>
      </header>
      <div className="body-shell">
        <nav className="rail" aria-label="Office navigation">
          <button
            className="rail-item active"
            aria-label="Office"
            onClick={() => {
              setSidebarOpen(false);
              setSelected("");
            }}
          >
            <Home size={22} />
            <span>Office</span>
          </button>
          <button
            className={`rail-item ${panel === "rooms" ? "sub-active" : ""}`}
            aria-label="Rooms"
            aria-expanded={sidebarOpen && panel === "rooms"}
            onClick={() => {
              setSidebarOpen(!sidebarOpen || panel !== "rooms");
              setPanel("rooms");
            }}
          >
            <DoorOpen size={22} />
            <span>Rooms</span>
          </button>
          <button
            className="rail-item"
            aria-label="People"
            aria-expanded={sidebarOpen && panel === "people"}
            onClick={() => {
              setSidebarOpen(!sidebarOpen || panel !== "people");
              setPanel("people");
            }}
          >
            <Users size={22} />
            <span>People</span>
          </button>
          <div className="rail-bottom">
            <button
              className="rail-item"
              onClick={() => {
                setSettingsTab("workspace");
                setModal("settings");
              }}
              aria-label="Settings"
            >
              <Settings size={21} />
              <span>Settings</span>
            </button>
            <button
              className="rail-item"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={20} />
              <span>Leave</span>
            </button>
          </div>
        </nav>
        <main className="office-main">
          <h1 className="visually-hidden">{workspace.name} virtual office</h1>
          <div className="map-card">
            <div className="map-topline">
              <div>
                <span className="map-icon">
                  <Leaf size={15} />
                </span>
                <strong>{currentZone.name}</strong>
                <span className="room-tag">
                  {self?.zone === "floor" ? "OPEN SPACE" : "MEETING ROOM"}
                </span>
              </div>
              <div className="map-top-actions">
                <span>
                  <Users size={14} /> {people.length} here
                </span>
                <button
                  className="icon-button"
                  aria-label={
                    fullscreen ? "Exit fullscreen" : "Enter fullscreen"
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
                  {fullscreen ? (
                    <Minimize2 size={15} />
                  ) : (
                    <Maximize2 size={15} />
                  )}
                </button>
              </div>
            </div>
            <div className="map-stage">
              <PixelMap
                mapId={workspace.mapId}
                people={people}
                self={user.id}
                speaking={media.speaking}
                waves={waves}
                jumps={jumps}
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
                <span className="keyboard-walk-hint">to move ·</span>
                <span className="touch-walk-hint">Drag to walk ·</span>
                <button
                  className="key"
                  aria-label="Jump"
                  onClick={() => send({ type: "jump" })}
                >
                  Space
                </button>
                <span>to jump</span>
                <button
                  className="key"
                  aria-label="Nudge nearest teammate"
                  title="Nudge nearest teammate (Z)"
                  onClick={() => send({ type: "nudge" })}
                >
                  Z
                </button>
                <span>to nudge</span>
              </div>
              <div className="map-weather">
                {getMap(workspace.mapId).theme === "space" ? "✦" : "☀"}{" "}
                <span>{getMap(workspace.mapId).name}</span>
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
                  ? "Private call"
                  : self?.zone !== "floor"
                    ? "Meeting room audio"
                    : self?.status === "dnd"
                      ? "Do not disturb · audio paused"
                      : "Nearby voice · automatic"}
                <span className="muted">
                  {" "}
                  ·{" "}
                  {audience.length
                    ? `${audience.length} in your conversation`
                    : "a little room to focus"}
                </span>
              </span>
              <button className="text-button" onClick={() => setModal("help")}>
                How it works <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
          {self?.conversation && (
            <section
              className="voice-roster"
              aria-label={
                self.conversation === "floor"
                  ? "Nearby voice"
                  : "Conversation participants"
              }
            >
              <div className="voice-roster-heading">
                <Headphones size={14} />
                <strong>
                  {self.conversation === "floor"
                    ? "Nearby voice"
                    : "In this conversation"}
                </strong>
                <span>
                  {media.connected
                    ? `${voicePeople.length + 1} joined`
                    : media.error
                      ? "Audio unavailable"
                      : "Connecting…"}
                </span>
              </div>
              <div className="voice-roster-people">
                {media.connected && (
                  <span
                    className="voice-person"
                    title={
                      media.mic
                        ? "Your microphone is on"
                        : "Your microphone is muted"
                    }
                  >
                    {media.mic ? <Mic size={12} /> : <MicOff size={12} />}You
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
                    {media.speaking.includes(p.id) ? (
                      <SpeakingIndicator />
                    ) : (
                      <Headphones size={12} />
                    )}
                    {p.name}
                  </button>
                ))}
                {media.connected && !voicePeople.length && (
                  <span className="muted">
                    {self.conversation === "floor"
                      ? "Move closer to a teammate to talk."
                      : "Waiting for someone to join."}
                  </span>
                )}
              </div>
            </section>
          )}
          {media.error && (
            <div className="media-error">
              <Headphones size={16} />
              <span>Media connection: {media.error}</span>
              <button onClick={media.retry}>Retry audio</button>
            </div>
          )}
        </main>
        {sidebarOpen && (
          <aside className="sidebar" aria-label="People and rooms">
            <div className="sidebar-tabs">
              <button
                className={panel === "people" ? "selected" : ""}
                onClick={() => setPanel("people")}
              >
                People <span>{people.length}</span>
              </button>
              <button
                className={panel === "rooms" ? "selected" : ""}
                onClick={() => setPanel("rooms")}
              >
                Rooms
              </button>
              <button
                className="icon-button"
                aria-label="Office settings"
                onClick={() => {
                  setSettingsTab("workspace");
                  setModal("settings");
                }}
              >
                <MoreHorizontal size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Close people and rooms"
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
                <Plus size={16} /> Invite teammate
              </button>
            )}
            <div className="sidebar-content">
              {panel === "people" ? (
                <>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Find your people"
                      placeholder="Find your people"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="section-title">
                    IN THE OFFICE <span>{filtered.length}</span>
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
                            {p.name} {p.id === user.id && <small>(you)</small>}
                          </strong>
                          <span>{p.statusText || statusLabel[p.status]}</span>
                        </div>
                        {media.speaking.includes(p.id) ? (
                          <SpeakingIndicator />
                        ) : voicePeople.some((person) => person.id === p.id) ? (
                          <Headphones
                            size={15}
                            aria-label="In your voice conversation"
                            className="in-voice-icon"
                          />
                        ) : p.conversation ? (
                          <Headphones size={15} className="muted" />
                        ) : (
                          <span className="person-room">
                            {p.zone === "floor"
                              ? "Commons"
                              : p.zone === "studio"
                                ? "Studio"
                                : "Library"}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {chosen && chosen.id !== user.id && (
                    <div className="person-actions">
                      <strong>Say hello to {chosen.name.split(" ")[0]}</strong>
                      <div>
                        <button
                          onClick={() =>
                            send({ type: "wave", target: chosen.id })
                          }
                        >
                          <Hand size={16} /> Wave
                        </button>
                        <button
                          disabled={
                            !self ||
                            self.zone !== chosen.zone ||
                            Math.hypot(self.x - chosen.x, self.y - chosen.y) >
                              NUDGE_RADIUS ||
                            chosen.status === "dnd"
                          }
                          onClick={() =>
                            send({ type: "nudge", target: chosen.id })
                          }
                        >
                          <BellRing size={16} /> Nudge
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
                          <ArrowUpRight size={16} /> Summon
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
                          <Video size={16} /> Call
                        </button>
                      </div>
                    </div>
                  )}
                  {!people.length && (
                    <p className="empty-note">Connecting you to the office…</p>
                  )}
                  <div className="sidebar-divider" />
                  <div className="section-title">A SPACE FOR EVERY MOMENT</div>
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
                    FIND YOUR SPACE
                  </div>
                  <p className="sidebar-note">
                    Walk into a room, or join from here. Your conversation
                    follows you.
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
                    <Leaf size={17} /> Back to the commons{" "}
                    <ArrowRight size={14} />
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
              {statusLabel[self?.status || "available"]}
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
            label="Microphone"
            speaking={media.speaking.includes(user.id)}
            on={media.mic}
            onClick={() => void media.toggle("mic")}
          />
          <Control
            icon={media.camera ? <Video /> : <VideoOff />}
            label="Camera"
            on={media.camera}
            onClick={() => void media.toggle("camera")}
          />
          <Control
            icon={<MonitorUp />}
            label={isSharing ? "Stop sharing" : "Share screen"}
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
            label="Wave"
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
            label="Status"
            onClick={() => setModal("profile")}
          />
        </div>
        <div className="audio-control">
          {media.soundBlocked && (
            <button
              className="secondary enable-sound"
              onClick={() => void media.enableSound()}
            >
              Enable sound
            </button>
          )}
          {self?.conversation && self.conversation !== "floor" && (
            <button
              className="icon-button leave-call"
              aria-label="Leave conversation"
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
          aria-label="Conversation invitation"
        >
          <div className="invitation-icon">
            {invites[0].kind === "summon" ? <Hand /> : <Video />}
          </div>
          <h3>
            {invites[0].fromName}{" "}
            {invites[0].kind === "summon" ? "is waving you over" : "is calling"}
          </h3>
          <p>
            {invites[0].kind === "summon"
              ? `Join them in ${ZONES.find((z) => z.id === invites[0].destination)?.name}.`
              : "A little face-to-face time?"}{" "}
            {self?.conversation &&
              "Accepting changes your current conversation."}
          </p>
          <div>
            <button
              className="secondary"
              onClick={() =>
                send({ type: "respond", id: invites[0].id, accept: false })
              }
            >
              Not now
            </button>
            <button
              className="primary"
              onClick={() =>
                send({ type: "respond", id: invites[0].id, accept: true })
              }
            >
              Join them <ArrowRight size={15} />
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
                ? "Office settings"
                : modal === "profile"
                  ? "Your profile"
                  : "Office guide"
            }
          >
            <button
              className="modal-close icon-button"
              onClick={() => setModal(null)}
              aria-label="Close dialog"
            >
              <X size={19} />
            </button>
            {modal === "help" ? (
              <>
                <div className="eyebrow">WELCOME TO YOUR LITTLE OFFICE</div>
                <h2>Make yourself at home.</h2>
                <div className="help-grid">
                  <p>
                    <strong>Walk & talk</strong>Use WASD or the arrow keys. On
                    mobile, touch and drag the map to walk; release to stop.
                    Press Space to jump. Nearby voice joins automatically;
                    enable your mic to talk. The nearby voice list shows who can
                    hear you.
                  </p>
                  <p>
                    <strong>Make some room</strong>Join the Studio or Library
                    for a meeting. Lock a room from its card; people inside can
                    summon others in.
                  </p>
                  <p>
                    <strong>A friendly nudge</strong>Press Z to nudge the
                    closest teammate, or select someone next to you and choose
                    Nudge. They'll hear a chime and see your name. Summons and
                    calls still need acceptance.
                  </p>
                  <p>
                    <strong>Your space, your choice</strong>Mic and camera start
                    off. Do not disturb quiets interruptions. Open-floor audio
                    is public; use a meeting room for private conversations.
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
  return (
    <button
      className={`control ${on ? "control-on" : ""}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      data-speaking={speaking}
    >
      <span>{icon}</span>
      <small>{speaking ? "Speaking" : label}</small>
    </button>
  );
}
function Toast({ text, close }: { text: string; close: () => void }) {
  return (
    <div className="toast" role="status">
      <Leaf size={17} />
      <span>{text}</span>
      <button onClick={close} aria-label="Dismiss">
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
            <strong>{z.name}</strong>
            <span>
              {people.filter((p) => p.zone === z.id).length} here ·{" "}
              {z.id === "studio" ? "8" : "6"} seats
            </span>
          </div>
          {self?.zone === z.id ? (
            <button
              className="icon-button"
              aria-label={`${locks[z.id] ? "Unlock" : "Lock"} ${z.name}`}
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
              aria-label={`Join ${z.name}`}
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
          <span>YOUR PEOPLE. YOUR PLACE.</span>
          <h2>
            A little closer.
            <br />
            Even from afar.
          </h2>
          <p>
            A cozy corner of the internet
            <br />
            to do good work, together.
          </p>
        </div>
      </div>
      <div className="login-card">
        <Brand />
        <div className="eyebrow">MAKE YOURSELF AT HOME</div>
        <h1>
          Your office,
          <br />
          wherever you are.
        </h1>
        <p>Step inside. Your people are just a few pixels away.</p>
        {config?.password && (
          <form onSubmit={login}>
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                required
                placeholder="Your username"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Your password"
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Opening the door…" : "Enter the office"}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        {config?.sso && (
          <>
            <div className="login-or">{config.password ? "or" : ""}</div>
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
              <Shield size={17} /> Sign in with SSO
            </button>
          </>
        )}
        {!config && (
          <p className="error-text">
            The office server is unavailable. Start the API and database, then
            reload.
          </p>
        )}
        <p className="login-footnote">
          A private space for your team.
          <br />
          Need an account? Ask your office owner.
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
  const [error, setError] = useState("");
  return (
    <main className="login-page">
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
        <h1>Make it yours.</h1>
        <p>Replace your temporary password before entering the office.</p>
        <label>
          Temporary password
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          New password
          <input
            name="next"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary">
          Save password <ArrowRight size={16} />
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
      <div className="eyebrow">A LITTLE BIT OF YOU</div>
      <h2>Your office self.</h2>
      <div className="character-preview">
        <Avatar color={avatar} />
        <div>
          <span className="eyebrow">YOUR CHARACTER</span>
          <h3>{characterLook(avatar).name}</h3>
          <p>{characterLook(avatar).description}</p>
        </div>
      </div>
      <p className="character-picker-label">
        Choose your look. Save to wear it in the office.
      </p>
      <div className="avatar-picker" role="group" aria-label="Character skins">
        {CHARACTER_LOOKS.map((look) => (
          <button
            type="button"
            key={look.id}
            className={avatar === look.id ? "picked" : ""}
            aria-label={`${look.name} skin`}
            aria-pressed={avatar === look.id}
            onClick={() => setAvatar(look.id)}
          >
            <Avatar color={look.id} />
            <span>{look.name}</span>
            {avatar === look.id && <Check className="skin-check" size={13} />}
          </button>
        ))}
      </div>
      <label>
        Your name
        <input name="name" defaultValue={user.name} maxLength={40} required />
      </label>
      <label>
        Availability
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Availability)}
        >
          {Object.entries(statusLabel).map(([value, text]) => (
            <option value={value} key={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <label>
        A little status
        <input
          name="statusText"
          placeholder="Making something good…"
          defaultValue={self?.statusText || ""}
          maxLength={80}
        />
      </label>
      <button className="primary">
        Save changes <Check size={16} />
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
  const [tab, setTab] = useState<"audio" | "auth" | "members" | "workspace">(
      user.role === "owner" ? initialTab : "audio",
    ),
    [users, setUsers] = useState<AdminUser[]>([]),
    [busy, setBusy] = useState(false);
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
      <div className="eyebrow">KEEP THINGS FEELING RIGHT</div>
      <h2>Office settings.</h2>
      <div className="settings-tabs">
        {user.role === "owner" && (
          <button
            className={tab === "workspace" ? "active" : ""}
            onClick={() => setTab("workspace")}
          >
            Workspace
          </button>
        )}
        <button
          className={tab === "audio" ? "active" : ""}
          onClick={() => setTab("audio")}
        >
          Devices
        </button>
        {user.role === "owner" && (
          <>
            <button
              className={tab === "members" ? "active" : ""}
              onClick={() => setTab("members")}
            >
              Members
            </button>
            <button
              className={tab === "auth" ? "active" : ""}
              onClick={() => setTab("auth")}
            >
              Authentication
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
            Choose your microphone and speakers before or during a conversation.
            Choices are saved for your account on this browser.
          </p>
          <button
            className="secondary"
            disabled={media.deviceBusy}
            onClick={() => void media.enumerate(true)}
          >
            Allow microphone access & refresh devices
          </button>
          <p className="muted">
            This reveals device names without turning your call microphone on.
          </p>
          <label>
            Microphone
            <select
              value={media.input}
              disabled={media.deviceBusy}
              onChange={(e) =>
                void media.switchDevice("audioinput", e.target.value)
              }
            >
              <option value="">System default</option>
              {media.input &&
                !media.devices.some(
                  (d) => d.kind === "audioinput" && d.deviceId === media.input,
                ) && (
                  <option value={media.input}>
                    Saved microphone · allow access or reconnect it
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
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Speakers / headphones
            <select
              value={media.output}
              disabled={!media.outputSupported || media.deviceBusy}
              onChange={(e) =>
                void media.switchDevice("audiooutput", e.target.value)
              }
            >
              <option value="">System default</option>
              {media.output &&
                !media.devices.some(
                  (d) =>
                    d.kind === "audiooutput" && d.deviceId === media.output,
                ) && (
                  <option value={media.output}>
                    Saved speaker · allow access or reconnect it
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
                    {d.label || `Speaker ${i + 1}`}
                  </option>
                ))}
            </select>
          </label>
          {!media.outputSupported && (
            <p className="muted">
              This browser uses your system output. Select your speakers or
              headphones in your system sound settings.
            </p>
          )}
          {media.outputSupported && media.outputPickerSupported && (
            <button
              className="secondary"
              disabled={media.deviceBusy}
              onClick={() => void media.chooseOutput()}
            >
              Choose another speaker…
            </button>
          )}
          <label>
            Camera
            <select
              value={media.videoInput}
              disabled={media.deviceBusy}
              onChange={(e) =>
                void media.switchDevice("videoinput", e.target.value)
              }
            >
              <option value="">System default</option>
              {media.videoInput &&
                !media.devices.some(
                  (d) =>
                    d.kind === "videoinput" && d.deviceId === media.videoInput,
                ) && (
                  <option value={media.videoInput}>
                    Saved camera · allow access or reconnect it
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
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
            </select>
          </label>
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
              <Shield size={16} /> Link your SSO account
            </button>
          )}
        </div>
      )}
      {tab === "auth" && (
        <>
          <p className="muted">
            Choose how your team enters the office. Disabled methods also end
            their existing sessions.
          </p>
          {(["password", "sso"] as const).map((method) => (
            <div className="setting-row" key={method}>
              <div>
                <strong>
                  {method === "password"
                    ? "Username & password"
                    : "OIDC single sign-on"}
                </strong>
                <p>
                  {method === "password"
                    ? "Local accounts for your team."
                    : config.ssoConfigured
                      ? "Your identity provider is configured."
                      : "Add your OIDC issuer and client credentials to the server first."}
                </p>
              </div>
              <button
                className={`toggle ${config[method] ? "on" : ""}`}
                role="switch"
                aria-label={`Enable ${method === "password" ? "username/password" : "OIDC SSO"} login`}
                aria-checked={config[method]}
                disabled={busy || (method === "sso" && !config.ssoConfigured)}
                onClick={() => void toggle(method)}
              />
            </div>
          ))}
          <div className="settings-note">
            <Shield size={17} />
            <p>
              Sign in as an owner through SSO before switching passwords off. At
              least one working owner login stays enabled.
            </p>
          </div>
        </>
      )}
      {tab === "members" && (
        <>
          <div className="admin-users">
            {users.map((u) => (
              <div key={u.id}>
                <Avatar color="sage" />
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {u.username || "SSO account"} · {u.role}
                  </small>
                </span>
                {u.id !== user.id && (
                  <button
                    className="text-button"
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
                    {u.approved ? "Disable" : "Approve"}
                  </button>
                )}
              </div>
            ))}
          </div>
          <details className="add-member">
            <summary>
              <Plus size={16} /> Add a teammate
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
                Name
                <input name="name" required maxLength={40} />
              </label>
              <label>
                Username
                <input name="username" required pattern="[a-zA-Z0-9_]{3,30}" />
              </label>
              <label>
                Temporary password
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
                Create account <Plus size={16} />
              </button>
            </form>
          </details>
        </>
      )}
    </>
  );
}
