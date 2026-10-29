// Bounded, observed intervals: a process restart cannot turn an open session into
// hours of attendance. Only flushed observation time is retained.
export type AttendanceInterval = {
  id: string;
  userId: string;
  visitId: string;
  startedAt: number;
  endedAt: number;
  active: boolean;
};
export class AttendanceTracker {
  private visits = new Map<
    string,
    { id: string; current?: AttendanceInterval }
  >();
  private pending = new Map<string, AttendanceInterval>();
  private flushing?: Promise<void>;
  start(userId: string, now: number) {
    this.leave(userId, now);
    this.visits.set(userId, { id: crypto.randomUUID() });
    this.observe(userId, now, now + 300000);
  }
  observe(userId: string, now: number, activeUntil: number) {
    const visit = this.visits.get(userId);
    if (!visit) return;
    let current = visit.current;
    if (current && now < current.endedAt) return;
    const active = now < activeUntil;
    if (current && current.active !== active) {
      const boundary = active
        ? now
        : Math.max(current.endedAt, Math.min(now, activeUntil));
      current.endedAt = boundary;
      this.pending.set(current.id, current);
      visit.current = current = undefined;
      this.open(userId, visit, boundary, active);
    } else if (!current) this.open(userId, visit, now, active);
    visit.current!.endedAt = now;
    this.pending.set(visit.current!.id, visit.current!);
  }
  private open(
    userId: string,
    visit: { id: string; current?: AttendanceInterval },
    now: number,
    active: boolean,
  ) {
    visit.current = {
      id: crypto.randomUUID(),
      userId,
      visitId: visit.id,
      startedAt: now,
      endedAt: now,
      active,
    };
  }
  pause(userId: string, now: number) {
    const visit = this.visits.get(userId);
    if (!visit?.current) return;
    visit.current.endedAt = Math.max(visit.current.endedAt, now);
    this.pending.set(visit.current.id, visit.current);
    visit.current = undefined;
  }
  leave(userId: string, now: number) {
    this.pause(userId, now);
    this.visits.delete(userId);
  }
  async flush(
    save: (intervals: AttendanceInterval[]) => Promise<void>,
  ): Promise<void> {
    if (this.flushing) {
      await this.flushing;
      return this.flush(save);
    }
    const batch = [...this.pending.values()].map((row) => ({ ...row }));
    if (!batch.length) return;
    this.flushing = save(batch);
    try {
      await this.flushing;
      for (const row of batch)
        if (this.pending.get(row.id)?.endedAt === row.endedAt)
          this.pending.delete(row.id);
    } finally {
      this.flushing = undefined;
    }
  }
}
