import {
  AVATARS,
  WORLD,
  JUMP_DURATION,
  NUDGE_RADIUS,
  ZONES,
  nearby,
  walkable,
  zoneAt,
  type Person,
  type Invitation,
  type ZoneId,
  type Snapshot,
} from "../shared/world";
import type { Command } from "../shared/protocol";
import {
  DEFAULT_WORKSPACE,
  getMap,
  mapBlocks,
  type WorkspaceSettings,
} from "../shared/maps";
type Member = Person & {
  send: (event: unknown) => void;
  close: () => void;
  input: { dx: number; dy: number; at: number };
  seen: number;
  activity: number;
  manualStatus: Person["status"];
  role: string;
  sessionId: string;
  expires: number;
};
export class Office {
  workspace: WorkspaceSettings = { ...DEFAULT_WORKSPACE };
  blocks = mapBlocks(getMap(DEFAULT_WORKSPACE.mapId));
  configureWorkspace(next: WorkspaceSettings) {
    if (next.revision <= this.workspace.revision) return;
    const changedMap = next.mapId !== this.workspace.mapId;
    this.workspace = { ...next };
    if (changedMap) {
      this.blocks = mapBlocks(getMap(next.mapId));
      for (const room of new Set(
        [...this.members.values()].map((m) => m.room).filter(Boolean),
      ))
        this.retire(room);
      this.generations.clear();
      this.presenters = {};
      this.locks = { studio: false, library: false };
      for (const invite of this.invites.values())
        this.members
          .get(invite.to)
          ?.send({ type: "invitation-ended", id: invite.id });
      this.invites.clear();
      let i = 0;
      for (const member of this.members.values()) {
        member.x = WORLD.spawn.x + (i % 2) * 32;
        member.y = WORLD.spawn.y + (Math.floor(i / 2) % 8) * 32;
        i++;
        member.zone = "floor";
        member.conversation = "";
        member.room = "";
        this.syncConversation(member);
        member.moving = false;
        member.input = { dx: 0, dy: 0, at: 0 };
        member.send({
          type: "notice",
          message: `Welcome to ${getMap(next.mapId).name}. Nearby voice reconnects automatically.`,
        });
      }
    }
    this.broadcast();
  }
  readonly epoch = crypto.randomUUID();
  members = new Map<string, Member>();
  invites = new Map<string, Invitation>();
  generations = new Map<string, string>();
  presenters: Record<string, string> = {};
  locks: Record<string, boolean> = { studio: false, library: false };
  cooldowns = new Map<string, number>();
  dirty = false;
  constructor(
    private retire: (room: string) => void = () => {},
    private permissions: (
      room: string,
      id: string,
      present: boolean,
    ) => Promise<void> = async () => {},
  ) {}
  room(group: string) {
    if (!group) return "";
    if (!this.generations.has(group))
      this.generations.set(group, crypto.randomUUID());
    return `office-${this.epoch}-${this.generations.get(group)}`;
  }
  add(
    user: {
      id: string;
      name: string;
      avatar?: string;
      role: string;
      availability?: string;
      statusText?: string;
    },
    sessionId: string,
    expires: number,
    send: Member["send"],
    close: Member["close"],
  ) {
    if (this.members.has(user.id))
      throw new Error(
        "You already have an active office tab. Leave it before joining here.",
      );
    const status = ["available", "busy", "dnd", "away"].includes(
      user.availability || "",
    )
      ? (user.availability as Person["status"])
      : "available";
    const member: Member = {
      id: user.id,
      name: user.name,
      avatar: AVATARS.includes(user.avatar as never)
        ? (user.avatar as Person["avatar"])
        : "sage",
      ...WORLD.spawn,
      direction: "down",
      moving: false,
      status,
      statusText: user.statusText || "",
      zone: "floor",
      conversation: "",
      room: "",
      seq: 0,
      send,
      close,
      input: { dx: 0, dy: 0, at: 0 },
      seen: Date.now(),
      activity: Date.now(),
      manualStatus: status,
      role: user.role,
      sessionId,
      expires,
    };
    this.members.set(user.id, member);
    this.syncConversation(member);
    this.broadcast();
    return member;
  }
  rotate(group: string) {
    if (!group) return;
    const old = this.room(group);
    this.generations.set(group, crypto.randomUUID());
    delete this.presenters[group];
    this.retire(old);
    for (const member of this.members.values())
      if (member.conversation === group) member.room = this.room(group);
  }
  assign(member: Member, group: string) {
    const old = member.conversation;
    if (old === group) return;
    member.conversation = group;
    member.room = this.room(group);
    if (old) {
      if (this.presenters[old] === member.id) delete this.presenters[old];
      this.rotate(old);
      // A one-person direct call ends when its counterpart leaves.
      if (old.startsWith("call:"))
        for (const other of this.members.values())
          if (other.conversation === old) {
            other.conversation = "";
            other.room = "";
            this.syncConversation(other);
          }
    }
    this.dirty = true;
  }
  syncConversation(m: Member) {
    if (m.conversation.startsWith("call:")) return;
    this.assign(
      m,
      m.zone !== "floor" ? `zone:${m.zone}` : m.status !== "dnd" ? "floor" : "",
    );
  }
  remove(id: string) {
    const member = this.members.get(id);
    if (!member) return;
    this.members.delete(id);
    member.close();
    if (member.conversation) this.rotate(member.conversation);
    if (member.conversation.startsWith("call:"))
      for (const m of this.members.values())
        if (m.conversation === member.conversation) {
          m.conversation = "";
          m.room = "";
          this.syncConversation(m);
        }
    for (const [key, invite] of this.invites)
      if (invite.from === id || invite.to === id) {
        this.invites.delete(key);
        this.members
          .get(invite.to)
          ?.send({ type: "invitation-ended", id: key });
      }
    for (const zone of ["studio", "library"])
      if (![...this.members.values()].some((m) => m.zone === zone))
        this.locks[zone] = false;
    this.broadcast();
  }
  revokeSession(sessionId: string) {
    for (const m of [...this.members.values()])
      if (m.sessionId === sessionId) this.remove(m.id);
  }
  go(m: Member, zone: ZoneId, invited = false) {
    if (zone !== "floor" && this.locks[zone] && !invited && m.zone !== zone)
      throw new Error(
        "This meeting room is locked. Ask someone inside to summon you.",
      );
    if (
      zone !== "floor" &&
      m.zone !== zone &&
      [...this.members.values()].filter((p) => p.zone === zone).length >=
        (zone === "studio" ? 8 : 6)
    )
      throw new Error("This meeting room is full.");
    const target = ZONES.find((z) => z.id === zone)!;
    const arrival = [
      [0, 0],
      [36, 0],
      [0, 36],
      [36, 36],
      [-36, 0],
      [0, -36],
    ]
      .map(([dx, dy]) => ({
        x: target.arrival.x + dx,
        y: target.arrival.y + dy,
      }))
      .find(
        (p) =>
          walkable(p.x, p.y, this.blocks) &&
          zoneAt(p.x, p.y) === zone &&
          ![...this.members.values()].some(
            (other) =>
              other.id !== m.id &&
              Math.hypot(other.x - p.x, other.y - p.y) < 28,
          ),
      );
    if (!arrival)
      throw new Error("The arrival area is occupied. Try again in a moment.");
    m.x = arrival.x;
    m.y = arrival.y;
    m.zone = zone;
    m.input = { dx: 0, dy: 0, at: 0 };
    if (m.conversation.startsWith("call:")) this.assign(m, "");
    this.syncConversation(m);
    this.dirty = true;
  }
  handle(id: string, command: Command, now = Date.now()) {
    const m = this.members.get(id);
    if (!m) return;
    m.seen = now;
    if (command.type === "ping") return;
    if (command.type !== "move" || command.dx || command.dy) {
      m.activity = now;
      if (m.status === "away" && m.manualStatus !== "away")
        m.status = m.manualStatus;
    }
    switch (command.type) {
      case "jump": {
        const key = `jump:${id}`;
        if (now < (this.cooldowns.get(key) || 0)) return;
        this.cooldowns.set(key, now + JUMP_DURATION);
        for (const person of this.members.values())
          person.send({ type: "jump", from: id });
        break;
      }
      case "move":
        if (command.seq > m.seq) {
          m.seq = command.seq;
          m.input = { dx: command.dx, dy: command.dy, at: now };
        }
        break;
      case "status":
        m.status = m.manualStatus = command.status;
        m.statusText = command.text;
        this.syncConversation(m);
        break;
      case "zone":
        this.go(m, command.zone);
        break;
      case "leave":
        if (m.zone !== "floor") this.go(m, "floor");
        else {
          this.assign(m, "");
          this.syncConversation(m);
        }
        break;
      case "nudge": {
        const distance = (p: Member) => Math.hypot(m.x - p.x, m.y - p.y);
        const target = command.target
          ? this.members.get(command.target)
          : [...this.members.values()]
              .filter(
                (p) =>
                  p.id !== id &&
                  p.zone === m.zone &&
                  distance(p) <= NUDGE_RADIUS,
              )
              .sort(
                (a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id),
              )[0];
        if (
          !target ||
          target.id === id ||
          target.zone !== m.zone ||
          distance(target) > NUDGE_RADIUS
        )
          throw new Error("Move next to a teammate to nudge them.");
        if (target.status === "dnd")
          throw new Error("They have Do not disturb enabled.");
        const senderKey = `nudge-from:${id}`,
          targetKey = `nudge-to:${target.id}`;
        if (
          now <
          Math.max(
            this.cooldowns.get(senderKey) || 0,
            this.cooldowns.get(targetKey) || 0,
          )
        )
          throw new Error("Give them a moment before nudging again.");
        this.cooldowns.set(senderKey, now + 5000);
        this.cooldowns.set(targetKey, now + 5000);
        target.send({ type: "nudge", from: id, name: m.name });
        m.send({ type: "notice", message: `Nudged ${target.name}.` });
        break;
      }
      case "wave": {
        const target = this.members.get(command.target);
        if (!target) throw new Error("That person is offline.");
        const key = `wave:${id}:${target.id}`;
        if (now < (this.cooldowns.get(key) || 0))
          throw new Error("Give them a moment before waving again.");
        this.cooldowns.set(key, now + 5000);
        for (const p of this.members.values())
          p.send({
            type: "wave",
            from: id,
            to: target.id,
            name: m.name,
            silent: target.status === "dnd",
          });
        break;
      }
      case "invite": {
        const target = this.members.get(command.target);
        if (!target || target.id === id)
          throw new Error("Choose someone online.");
        if (target.status === "dnd")
          throw new Error("They have Do not disturb enabled.");
        if (
          command.kind === "call" &&
          (target.conversation.startsWith("call:") ||
            m.conversation.startsWith("call:"))
        )
          throw new Error("One of you is already in a call.");
        const key = `invite:${id}:${target.id}`;
        if (now < (this.cooldowns.get(key) || 0))
          throw new Error("An invitation was sent recently.");
        this.cooldowns.set(key, now + 15000);
        const invite: Invitation = {
          id: crypto.randomUUID(),
          kind: command.kind,
          from: id,
          to: target.id,
          fromName: m.name,
          destination: m.zone,
          expires: now + 30000,
        };
        this.invites.set(invite.id, invite);
        target.send({ type: "invitation", invitation: invite });
        m.send({
          type: "notice",
          message: `${command.kind === "call" ? "Call" : "Summon"} invitation sent to ${target.name}.`,
        });
        break;
      }
      case "respond": {
        const invite = this.invites.get(command.id);
        if (!invite || invite.to !== id)
          throw new Error("That invitation is no longer available.");
        this.invites.delete(invite.id);
        m.send({ type: "invitation-ended", id: invite.id });
        if (!command.accept) {
          this.members.get(invite.from)?.send({
            type: "notice",
            message: `${m.name} declined the invitation.`,
          });
          break;
        }
        const from = this.members.get(invite.from);
        if (now >= invite.expires || !from)
          throw new Error("That invitation has expired.");
        if (m.status === "dnd")
          throw new Error("Turn off Do not disturb to accept.");
        if (invite.kind === "summon") {
          if (from.zone !== invite.destination)
            throw new Error("The inviter moved. Ask for a new invitation.");
          this.go(m, invite.destination, true);
          if (
            invite.destination === "floor" &&
            walkable(from.x + 35, from.y, this.blocks)
          ) {
            m.x = from.x + 35;
            m.y = from.y;
          }
        } else {
          if (
            from.conversation.startsWith("call:") ||
            m.conversation.startsWith("call:")
          )
            throw new Error("One of you is already in a call.");
          const group = `call:${crypto.randomUUID()}`;
          this.assign(m, group);
          this.assign(from, group);
        }
        break;
      }
      case "present": {
        if (!m.conversation)
          throw new Error("Join a conversation before sharing.");
        const presenter = this.presenters[m.conversation];
        if (command.enabled && presenter && presenter !== id)
          throw new Error("Someone is already presenting.");
        if (command.enabled) this.presenters[m.conversation] = id;
        else if (presenter === id) delete this.presenters[m.conversation];
        const group = m.conversation,
          room = m.room;
        this.permissions(room, id, command.enabled)
          .then(() => {
            if (
              m.room === room &&
              (!command.enabled || this.presenters[group] === id)
            )
              m.send({ type: "presenter", enabled: command.enabled });
          })
          .catch(() => {
            if (this.presenters[group] === id) delete this.presenters[group];
            m.send({
              type: "error",
              message:
                "Could not update screen-sharing permission. Please try again.",
            });
            this.dirty = true;
          });
        break;
      }
      case "lock": {
        if (m.zone !== command.zone && m.role !== "owner")
          throw new Error("Enter the meeting room to lock it.");
        this.locks[command.zone] = command.locked;
        break;
      }
    }
    this.dirty = true;
  }
  tick(dt: number, now = Date.now()) {
    for (const m of [...this.members.values()]) {
      if (now > m.expires || now - m.seen > 35000) {
        this.remove(m.id);
        continue;
      }
      if (
        now - m.activity > 300000 &&
        (!m.conversation || m.conversation === "floor") &&
        m.manualStatus === "available"
      )
        m.status = "away";
      const { dx, dy, at } = m.input;
      m.moving = now - at < 300 && !!(dx || dy);
      if (!m.moving) continue;
      const scale = (160 * Math.min(dt, 0.1)) / Math.max(1, Math.hypot(dx, dy));
      let x = m.x + dx * scale,
        y = m.y + dy * scale;
      if (!walkable(x, m.y, this.blocks)) x = m.x;
      if (!walkable(x, y, this.blocks)) y = m.y;
      const zone = zoneAt(x, y);
      if (
        zone !== m.zone &&
        zone !== "floor" &&
        (this.locks[zone] ||
          [...this.members.values()].filter((p) => p.zone === zone).length >=
            (zone === "studio" ? 8 : 6))
      ) {
        x = m.x;
        y = m.y;
      }
      m.direction = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
      m.x = x;
      m.y = y;
      m.zone = zoneAt(x, y);
      this.syncConversation(m);
      this.dirty = true;
    }
    for (const [id, invite] of this.invites)
      if (now >= invite.expires) {
        this.invites.delete(id);
        this.members.get(invite.to)?.send({ type: "invitation-ended", id });
      }
    for (const [key, expiry] of this.cooldowns)
      if (now > expiry) this.cooldowns.delete(key);
    for (const zone of ["studio", "library"])
      if (![...this.members.values()].some((m) => m.zone === zone))
        this.locks[zone] = false;
  }
  people(): Person[] {
    return [...this.members.values()].map(
      ({
        id,
        name,
        avatar,
        x,
        y,
        direction,
        moving,
        status,
        statusText,
        zone,
        conversation,
        room,
        seq,
      }) => ({
        id,
        name,
        avatar,
        x,
        y,
        direction,
        moving,
        status,
        statusText,
        zone,
        conversation,
        room,
        seq,
      }),
    );
  }
  broadcast() {
    const people = this.people();
    for (const m of this.members.values()) {
      const snapshot: Snapshot = {
        workspace: this.workspace,
        type: "snapshot",
        epoch: this.epoch,
        self: m.id,
        people,
        presenters: { ...this.presenters },
        locks: { ...this.locks },
      };
      m.send(snapshot);
    }
    this.dirty = false;
  }
  audience(id: string) {
    const self = this.members.get(id);
    return self
      ? [...this.members.values()].filter(
          (m) =>
            m.id !== id &&
            m.conversation === self.conversation &&
            self.conversation &&
            (self.conversation !== "floor" || nearby(self, m)),
        )
      : [];
  }
}
