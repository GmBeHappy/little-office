import { advanceMovement, type MovementWorld } from "@/shared/movement";
import type { Person } from "@/shared/world";

// Predict only the rendered local avatar. Authority still owns presence,
// collisions, room membership and media. Reconcile after a stop is acknowledged.
export class LocalMovement {
  private position?: Pick<Person, "x" | "y" | "zone">;
  private authority?: Person;
  private lastSnapshotAt = 0;
  private wasMoving = false;
  step(
    person: Person,
    dx: number,
    dy: number,
    intentSeq: number,
    dt: number,
    now: number,
    world: MovementWorld,
  ) {
    const moving = !!(dx || dy);
    const previous = this.authority;
    if (
      !this.position ||
      (this.position &&
        Math.hypot(person.x - this.position.x, person.y - this.position.y) >
          160) ||
      previous?.id !== person.id ||
      person.seq < (previous?.seq ?? 0) ||
      (previous &&
        Math.hypot(person.x - previous.x, person.y - previous.y) > 100) ||
      (previous &&
        person.zone !== previous.zone &&
        Math.hypot(person.x - this.position.x, person.y - this.position.y) > 48)
    ) {
      this.position = { x: person.x, y: person.y, zone: person.zone };
    }
    if (person !== previous || (moving && !this.wasMoving))
      this.lastSnapshotAt = now;
    this.authority = person;
    this.wasMoving = moving;
    // Stop extrapolating when the connection has stopped delivering snapshots.
    const predicting = moving && now - this.lastSnapshotAt < 1000;
    if (predicting)
      this.position = advanceMovement(this.position, dx, dy, dt, world);
    else if (!moving && person.seq >= intentSeq && !person.moving) {
      const weight = Math.min(1, dt / 0.08);
      this.position.x += (person.x - this.position.x) * weight;
      this.position.y += (person.y - this.position.y) * weight;
      this.position.zone = person.zone;
    }
    return {
      ...person,
      x: this.position.x,
      y: this.position.y,
      moving: predicting,
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
