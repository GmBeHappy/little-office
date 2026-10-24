import Foundation

public final class FarmSimulation {
  public let manifest: FarmManifest
  public private(set) var eggs: [Int: Double] = [:]
  public private(set) var planted: [Double]
  public private(set) var collectedEggs = 0
  public private(set) var harvestedCrops = 0
  private var nextEgg: Double
  private var creatures: [Creature]
  private let blocks: [WorldBounds]
  private var random: () -> Double
  private struct Creature {
    var x: Double
    var y: Double
    var tx: Double
    var ty: Double
    var kind: String
    var variant: String
    var until: Double
    var mode = "idle"
    var fast = false
    var since = 0.0
    var walkTime = 0.0
    var right = true
  }
  public init(
    manifest: FarmManifest, blocks: [WorldBounds],
    random: @escaping () -> Double = { Double.random(in: 0..<1) }
  ) {
    self.manifest = manifest
    self.blocks = blocks
    self.random = random
    planted = Array(repeating: 0, count: manifest.plots.count)
    nextEgg = manifest.firstEggMs
    creatures = manifest.hens.map {
      Creature(
        x: $0.x, y: $0.y, tx: $0.x, ty: $0.y, kind: "hen", variant: $0.variant, until: $0.until)
    }
    creatures += manifest.animals.map {
      Creature(
        x: $0.x, y: $0.y, tx: $0.x, ty: $0.y, kind: $0.kind, variant: "",
        until: 2000 + random() * 3000)
    }
  }
  public func target(x: Double, y: Double, time: Double) -> FarmTarget? {
    manifest.target(x: x, y: y, eggs: eggs, planted: planted, time: time)
  }
  @discardableResult public func interact(x: Double, y: Double, time: Double) -> String? {
    guard let target = target(x: x, y: y, time: time) else { return nil }
    switch target.kind {
    case "egg":
      eggs.removeValue(forKey: target.index)
      collectedEggs += 1
      nextEgg = min(nextEgg, time + manifest.eggPickupDelayMs)
      return "🥚"
    case "plant":
      planted[target.index] = time
      return "🌱"
    case "harvest":
      planted[target.index] = 0
      harvestedCrops += 1
      return "🌾"
    default: return nil
    }
  }
  public func update(time: Double, delta: Double, person: WorldPoint?, wildlife: Bool) {
    let step = min(delta, manifest.maxStepMs)
    if eggs.count < manifest.maxEggs && time > nextEgg {
      let free = manifest.eggSpots.indices.filter { eggs[$0] == nil }
      if !free.isEmpty {
        eggs[free[min(free.count - 1, Int(random() * Double(free.count)))]] =
          time + manifest.eggLifetimeMs
      }
      nextEgg = time + manifest.eggIntervalMs + random() * manifest.eggIntervalJitterMs
    }
    eggs = eggs.filter { $0.value >= time }
    guard wildlife else { return }
    for i in creatures.indices {
      var c = creatures[i]
      if c.kind == "hen", c.mode != "walk", let person,
        hypot(person.x - c.x, person.y - c.y) < manifest.henScatterRadius
      {
        let yard = manifest.henYard
        c.tx = max(
          yard.x,
          min(
            yard.x + yard.w,
            c.x + (c.x - person.x >= 0 ? manifest.henScatterX : -manifest.henScatterX)))
        c.ty = max(
          yard.y,
          min(
            yard.y + yard.h,
            c.y + (c.y - person.y >= 0 ? manifest.henScatterY : -manifest.henScatterY)))
        c.mode = "walk"
        c.fast = true
      }
      if c.mode == "walk" {
        let dx = c.tx - c.x
        let dy = c.ty - c.y
        let distance = hypot(dx, dy)
        let speed =
          (c.kind == "hen"
            ? (c.fast ? manifest.henFastSpeed : manifest.henSpeed)
            : c.kind == "cow" ? manifest.cowSpeed : manifest.sheepSpeed) * step / 1000
        if distance <= speed {
          c.x = c.tx
          c.y = c.ty
          c.mode =
            random() < (c.kind == "hen" ? 0.45 : 0.5)
            ? (c.kind == "hen" ? "peck" : "graze") : "idle"
          c.until = time + (c.kind == "hen" ? 900 + random() * 2800 : 1500 + random() * 4000)
          c.since = time
          c.fast = false
        } else {
          let nx = c.x + dx / distance * speed
          let ny = c.y + dy / distance * speed
          if c.kind == "hen" || walkable(x: nx, y: ny) {
            c.x = nx
            c.y = ny
            c.walkTime += step
            c.right = dx >= 0
          } else {
            c.mode = "idle"
            c.until = time + 600
          }
        }
      } else if time > c.until {
        if c.kind == "hen" {
          c.tx = manifest.henYard.x + random() * manifest.henYard.w
          c.ty = manifest.henYard.y + random() * manifest.henYard.h
        } else {
          for _ in 0..<24 {
            let x = 70 + random() * 980
            let y = 100 + random() * 540
            if walkable(x: x, y: y) {
              c.tx = x
              c.ty = y
              break
            }
          }
        }
        c.mode = "walk"
      }
      creatures[i] = c
    }
  }
  private func walkable(x: Double, y: Double) -> Bool {
    for dx in [-22.0, 0, 22] {
      for dy in [-8.0, 0, 8] {
        let px = x + dx
        let py = y + dy
        if px < 42 || px > 1080 || py < 68 || py > 660
          || blocks.contains(where: {
            px > $0.x - 10 && px < $0.x + $0.w + 10 && py > $0.y - 5 && py < $0.y + $0.h + 10
          })
        {
          return false
        }
      }
    }
    return true
  }
  public func rectangles(time: Double, wildlife: Bool) -> [DrawingRect] {
    var rects: [DrawingRect] = []
    for (index, _) in eggs.sorted(by: { $0.key < $1.key }) {
      let point = manifest.eggSpots[index]
      rects += (manifest.atlas["egg"] ?? []).map { $0.offset(x: point.x, y: point.y) }
    }
    for (index, date) in planted.enumerated() where date > 0 {
      let point = manifest.plots[index]
      let age = (time - date) / manifest.growthMs
      let stage = age < 0.25 ? 0 : age < 0.55 ? 1 : age < 1 ? 2 : 3
      rects += (manifest.atlas["crop-\(stage)"] ?? []).map { $0.offset(x: point.x, y: point.y) }
    }
    if wildlife {
      for c in creatures {
        rects += animalRects(
          kind: c.kind, variant: c.variant, x: c.x, y: c.y, mode: c.mode, right: c.right,
          walkTime: c.walkTime, since: c.since, time: time)
      }
    }
    return rects
  }
  public func animalRects(
    kind: String, variant: String, x: Double, y: Double, mode: String, right: Bool,
    walkTime: Double, since: Double, time: Double
  ) -> [DrawingRect] {
    var frame = 0
    var offsetY = 0.0
    if kind == "hen" {
      frame =
        mode == "walk"
        ? Int(floor(walkTime / 120)) % 2
        : mode == "peck" ? Int(floor((time - since) / 160)) % 2 : sin(time / 400 + x) > 0.6 ? 1 : 0
      if mode == "peck" { offsetY = sin(time / 400 + x) > 0.6 ? -1 : 0 }
    } else {
      frame =
        mode == "walk"
        ? Int(floor(walkTime / 160)) % 2
        : mode == "graze" ? Int(floor((time - since) / 240)) % 2 : 0
    }
    let key = kind == "hen" ? "hen-\(variant)-\(mode)-\(frame)" : "\(kind)-\(mode)-\(frame)"
    return (manifest.shadows[kind] ?? []).map { $0.offset(x: x, y: y) }
      + (manifest.atlas[key] ?? []).map { $0.offset(x: x, y: y + offsetY, mirrored: !right) }
  }
}
