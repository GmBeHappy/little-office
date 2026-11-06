import Foundation

/// The office server acknowledges these sequence numbers and simulates the same frame durations.
public struct WalkCommand {
  public let seq: Int
  public let dx: Int
  public let dy: Int
  public let steps: [Double]
  public var message: [String: Any] {
    ["type": "move", "seq": seq, "dx": dx, "dy": dy, "steps": steps]
  }
}

public struct WalkFrame {
  public let position: WorldPoint
  public let moving: Bool
  public let direction: String
}

public struct OfficeMovement {
  private var snapshot: Snapshot?
  private var manifest: SceneManifest?
  private var point = WorldPoint(x: 0, y: 0)
  private var zone = "floor"
  private var facing = "down"
  private var seq = 0
  private var dx = 0, dy = 0
  private var pending: [WalkCommand] = []
  private var steps: [Double] = []
  private var liveUntil = 0.0
  private var stalled = false
  public init() {}

  public mutating func receive(_ next: Snapshot, manifest: SceneManifest, now: Double) {
    guard let me = next.me, next.workspace.mapId == manifest.mapId else {
      self = OfficeMovement()
      return
    }
    let old = snapshot?.me
    if old?.id != me.id || snapshot?.epoch != next.epoch
      || snapshot?.workspace.mapId != next.workspace.mapId || me.seq < (old?.seq ?? 0)
      || (me.seq == old?.seq && (me.x != old?.x || me.y != old?.y))
    {
      pending.removeAll()
      steps.removeAll()
      dx = 0
      dy = 0
      seq = me.seq
    }
    snapshot = next
    self.manifest = manifest
    seq = max(seq, me.seq)
    liveUntil = now + 1
    stalled = false
    pending.removeAll { $0.seq <= me.seq }
    point = WorldPoint(x: me.x, y: me.y)
    zone = me.zone
    if pending.isEmpty && steps.isEmpty { facing = me.direction }
    for command in pending {
      for dt in command.steps { advance(command.dx, command.dy, dt) }
    }
    for dt in steps { advance(dx, dy, dt) }
  }

  public mutating func input(_ x: Int, _ y: Int, now: Double, send: (WalkCommand) -> Void) {
    guard snapshot != nil, x != dx || y != dy else { return }
    flush(send)
    if dx == 0 && dy == 0 { liveUntil = now + 1; stalled = false }
    dx = x
    dy = y
    if x != 0 || y != 0 {
      facing = x < 0 ? "left" : x > 0 ? "right" : y < 0 ? "up" : "down"
    }
    flush(send, marker: true)
  }

  public mutating func frame(delta: Double, now: Double, send: (WalkCommand) -> Void) -> WalkFrame? {
    guard snapshot != nil else { return nil }
    let moving = (dx != 0 || dy != 0) && now < liveUntil
    if moving {
      let dt = min(max(delta, 0), 0.1)
      advance(dx, dy, dt)
      steps.append(dt)
      if steps.count >= 32 || steps.reduce(0, +) >= 0.08 { flush(send) }
    } else if (dx != 0 || dy != 0) && !stalled {
      flush(send)
      seq += 1
      send(WalkCommand(seq: seq, dx: 0, dy: 0, steps: []))
      stalled = true
    }
    return WalkFrame(position: point, moving: moving, direction: facing)
  }

  private mutating func flush(_ send: (WalkCommand) -> Void, marker: Bool = false) {
    guard marker || !steps.isEmpty else { return }
    seq += 1
    let command = WalkCommand(seq: seq, dx: dx, dy: dy, steps: steps)
    if !steps.isEmpty { pending.append(command) }
    steps.removeAll(keepingCapacity: true)
    send(command)
  }

  private mutating func advance(_ xInput: Int, _ yInput: Int, _ dt: Double) {
    guard let manifest, let snapshot else { return }
    // Mirror shared/movement.ts so replay respects walls, room locks, and capacity.
    func walkable(_ x: Double, _ y: Double) -> Bool {
      x >= 42 && x <= 1080 && y >= 68 && y <= 660 && !(manifest.blocks ?? []).contains {
        x > $0.x - 10 && x < $0.x + $0.w + 10 && y > $0.y - 5 && y < $0.y + $0.h + 10
      }
    }
    let scale = 160 * dt / max(1, hypot(Double(xInput), Double(yInput)))
    var x = point.x + Double(xInput) * scale
    var y = point.y + Double(yInput) * scale
    if !walkable(x, point.y) { x = point.x }
    if !walkable(x, y) { y = point.y }
    let nextZone = manifest.zones.first {
      $0.id != "floor" && x >= $0.x - 4 && x <= $0.x + $0.w && y >= $0.y && y <= $0.y + $0.h
    }?.id ?? "floor"
    if zone != nextZone && nextZone != "floor"
      && (snapshot.locks[nextZone] == true
        || snapshot.people.filter { $0.zone == nextZone }.count >= (nextZone == "studio" ? 8 : 6))
    { return }
    point = WorldPoint(x: x, y: y)
    zone = nextZone
  }
}

/// Interpolate each remote update at walking pace. Snap across teleports and reconnect gaps.
public struct RemoteWalk {
  private var from: WorldPoint?
  private var to: WorldPoint?
  private var started = 0.0
  private var duration = 0.0
  public init() {}
  public mutating func position(toward target: WorldPoint, now: Double) -> WorldPoint {
    if target != to {
      let current = sample(now: now) ?? target
      let distance = hypot(target.x - current.x, target.y - current.y)
      duration = distance > 80 ? 0 : min(0.15, distance / 160)
      started = now
      from = current
      to = target
    }
    return sample(now: now) ?? target
  }
  private func sample(now: Double) -> WorldPoint? {
    guard let from, let to, duration > 0 else { return to }
    let elapsed = min(1, max(0, (now - started) / duration))
    return WorldPoint(x: from.x + (to.x - from.x) * elapsed, y: from.y + (to.y - from.y) * elapsed)
  }
}
