import type { PoolClient } from "pg";
import type { Office } from "./office";
import { db } from "./db";
import {
  BOARD_MAX_BYTES,
  BOARD_MAX_ELEMENTS,
  BoardMessage,
  boardScope,
  mergeBoard,
  whiteboardEnabled,
  type BoardElement,
} from "../shared/whiteboard";
type Peer = {
  userId: string;
  sessionId: string;
  scope: string;
  send: (message: unknown) => void;
  close: () => void;
  pointer?: { x: number; y: number; button: "up" | "down" };
  rate: { at: number; count: number };
  writing: boolean;
};
export class Whiteboards {
  peers = new Map<string, Peer>();
  constructor(private office: Office) {}
  allowed(peer: Peer) {
    const member = this.office.members.get(peer.userId);
    return (
      whiteboardEnabled(this.office.workspace) &&
      !!member &&
      member.sessionId === peer.sessionId &&
      member.expires > Date.now() &&
      boardScope(this.office.workspace.mapId, member) === peer.scope
    );
  }
  async open(
    key: string,
    userId: string,
    sessionId: string,
    send: Peer["send"],
    close: Peer["close"],
  ) {
    const member = this.office.members.get(userId);
    if (!member || member.sessionId !== sessionId)
      throw new Error("Join the office before opening a whiteboard.");
    const peer: Peer = {
      userId,
      sessionId,
      scope: boardScope(this.office.workspace.mapId, member),
      send,
      close,
      rate: { at: Date.now(), count: 0 },
      writing: false,
    };
    if (!this.allowed(peer)) throw new Error("Whiteboard access ended.");
    for (const [oldKey, old] of this.peers)
      if (old.userId === userId) {
        this.remove(oldKey);
        old.close();
      }
    this.peers.set(key, peer);
    try {
      const result = await db.query(
        "SELECT elements FROM office_whiteboards WHERE id=$1",
        [peer.scope],
      );
      if (!this.allowed(peer) || this.peers.get(key) !== peer) {
        close();
        return;
      }
      send({
        type: "ready",
        scope: peer.scope,
        elements: result.rows[0]?.elements || [],
      });
      this.presence(peer.scope);
    } catch (error) {
      this.remove(key);
      throw error;
    }
  }
  broadcast(scope: string, message: unknown) {
    for (const peer of this.peers.values())
      if (peer.scope === scope && this.allowed(peer)) peer.send(message);
  }
  presence(scope: string) {
    const people = [...this.peers.values()]
      .filter((peer) => peer.scope === scope && this.allowed(peer))
      .map((peer) => ({
        id: peer.userId,
        name: this.office.members.get(peer.userId)!.name,
        pointer: peer.pointer,
      }));
    this.broadcast(scope, { type: "presence", people });
  }
  remove(key: string) {
    const peer = this.peers.get(key);
    if (peer) {
      this.peers.delete(key);
      this.presence(peer.scope);
    }
  }
  prune() {
    for (const [key, peer] of this.peers)
      if (!this.allowed(peer)) {
        this.remove(key);
        peer.close();
      }
  }
  async message(key: string, raw: unknown) {
    const peer = this.peers.get(key);
    if (!peer) return;
    if (!this.allowed(peer)) {
      this.remove(key);
      peer.close();
      return;
    }
    if (Date.now() - peer.rate.at > 1000)
      peer.rate = { at: Date.now(), count: 0 };
    if (++peer.rate.count > 30) {
      this.remove(key);
      peer.close();
      return;
    }
    const parsed = BoardMessage.safeParse(raw);
    if (!parsed.success)
      throw new Error(
        "Unsupported whiteboard content or drawing limit reached.",
      );
    const message = parsed.data;
    if (message.type === "ping") return;
    if (message.type === "pointer") {
      peer.pointer = message;
      this.presence(peer.scope);
      return;
    }
    if (peer.writing) throw new Error("Wait for the current whiteboard save.");
    peer.writing = true;
    let connection: PoolClient | undefined;
    try {
      connection = await db.connect();
      await connection.query("BEGIN");
      await connection.query(
        "INSERT INTO office_whiteboards (id) VALUES ($1) ON CONFLICT DO NOTHING",
        [peer.scope],
      );
      const result = await connection.query(
        "SELECT elements FROM office_whiteboards WHERE id=$1 FOR UPDATE",
        [peer.scope],
      );
      if (!this.allowed(peer)) throw new Error("Whiteboard access ended.");
      const elements = mergeBoard(
        result.rows[0].elements as BoardElement[],
        message.elements,
      );
      const encoded = JSON.stringify(elements);
      if (
        elements.length > BOARD_MAX_ELEMENTS ||
        Buffer.byteLength(encoded) > BOARD_MAX_BYTES
      )
        throw new Error(
          "Whiteboard limit reached. Export a copy to keep your work.",
        );
      await connection.query(
        "UPDATE office_whiteboards SET elements=$2::jsonb, updated_at=now() WHERE id=$1",
        [peer.scope, encoded],
      );
      await connection.query("COMMIT");
      // Acknowledgement only follows a durable database commit.
      if (this.allowed(peer))
        peer.send({ type: "saved", batch: message.batch, elements });
      this.broadcast(peer.scope, { type: "scene", elements });
    } catch (error) {
      await connection?.query("ROLLBACK");
      throw error;
    } finally {
      connection?.release();
      peer.writing = false;
    }
  }
}
