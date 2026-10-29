import { advanceMovement, type MovementWorld } from "@/shared/movement";
import type { Command } from "@/shared/protocol";
import type { Person } from "@/shared/world";

type Move = Extract<Command, { type: "move" }>;
type Send = (command: Move) => void;

// Replay only unacknowledged input on top of authority. Each batch carries the
// same frame durations used locally; packet arrival time never adds walking time.
export class LocalMovement {
  private authority?: Person;
  private position?: Pick<Person, "x" | "y" | "zone">;
  private pending: Move[] = [];
  private steps: number[] = [];
  private dx = 0;
  private dy = 0;
  private seq = 0;
  private lastSnapshotAt = 0;
  private wasInputMoving = false;

  private flush(send: Send, marker = false) {
    if (!this.steps.length && !marker) return;
    const command: Move = {
      type: "move",
      dx: this.dx,
      dy: this.dy,
      seq: ++this.seq,
      steps: this.steps,
    };
    this.steps = [];
    this.pending.push(command);
    send(command);
  }

  // Blur/visibility changes must flush and stop even if rendering is suspended.
  stop(send: Send) {
    if (!(this.dx || this.dy)) return;
    this.flush(send);
    this.dx = this.dy = 0;
    this.flush(send, true);
  }

  step(
    person: Person,
    dx: number,
    dy: number,
    dt: number,
    now: number,
    world: MovementWorld,
    send: Send,
  ) {
    const previous = this.authority;
    const reset =
      !previous ||
      previous.id !== person.id ||
      person.seq < previous.seq ||
      // Server teleports/forced moves can change position without consuming input.
      (person.seq === previous.seq &&
        Math.hypot(person.x - previous.x, person.y - previous.y) > 0.01);
    if (reset) {
      this.pending = [];
      this.steps = [];
      this.dx = this.dy = 0;
    }
    this.seq = Math.max(this.seq, person.seq);
    if (person !== previous) {
      this.lastSnapshotAt = now;
      this.authority = person;
      this.pending = this.pending.filter((command) => command.seq > person.seq);
      this.position = { x: person.x, y: person.y, zone: person.zone };
      for (const command of this.pending)
        for (const elapsed of command.steps || [])
          this.position = advanceMovement(
            this.position,
            command.dx,
            command.dy,
            elapsed,
            world,
          );
      for (const elapsed of this.steps)
        this.position = advanceMovement(
          this.position,
          this.dx,
          this.dy,
          elapsed,
          world,
        );
    }
    // Quiet offices send no snapshots while idle. A new press gets one bounded
    // prediction window; holding a key during a stall cannot renew that window.
    const inputMoving = !!(dx || dy);
    if (inputMoving && !this.wasInputMoving) this.lastSnapshotAt = now;
    this.wasInputMoving = inputMoving;
    // Bound unacknowledged input during stalls; no seconds-long catch-up burst.
    if (now - this.lastSnapshotAt >= 1000) dx = dy = 0;
    if (dx !== this.dx || dy !== this.dy) {
      this.flush(send);
      this.dx = dx;
      this.dy = dy;
      this.flush(send, true);
    }
    const moving = !!(dx || dy);
    if (moving) {
      const elapsed = Math.min(Math.max(dt, 0), 0.1);
      this.position = advanceMovement(this.position!, dx, dy, elapsed, world);
      this.steps.push(elapsed);
      if (
        this.steps.length >= 32 ||
        this.steps.reduce((sum, step) => sum + step, 0) >= 0.08
      )
        this.flush(send);
    }
    return {
      ...person,
      ...this.position!,
      moving,
      direction: moving
        ? dx < 0
          ? ("left" as const)
          : dx > 0
            ? ("right" as const)
            : dy < 0
              ? ("up" as const)
              : ("down" as const)
        : person.direction,
      pose: moving ? ("stand" as const) : person.pose,
    };
  }
}
