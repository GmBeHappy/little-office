import Foundation

public struct WorldPoint: Codable, Equatable {
  public let x: Double
  public let y: Double
  public init(x: Double, y: Double) {
    self.x = x
    self.y = y
  }
}
public struct WorldBounds: Decodable {
  public let x: Double
  public let y: Double
  public let w: Double
  public let h: Double
  public func contains(x: Double, y: Double, padding: Double = 0) -> Bool {
    x > self.x - padding && x < self.x + w + padding && y > self.y - padding
      && y < self.y + h + padding
  }
}
public struct HabitatState: Decodable {
  public let revision: Int
  public let step: Int
  public let updatedAt: Double
  public let animal: Int
  public let affectionUntil: Double
}
public struct MapAnimation: Decodable {
  public let version: Int
  public let background: [DrawingRect]
  public let effects: [MapEffect]
  public let water: [WorldBounds]
  public let habitat: Habitat
  public let farm: FarmManifest?
  public struct MapEffect: Decodable {
    public let kind: String
    public let x: Double
    public let y: Double
    public let color: UInt32
    public let w: Double?
    public let h: Double?
    public let spread: Double?
    public let fall: Double?
  }
  public struct Habitat: Decodable {
    public let style: Style
    public let station: Station
    public let animals: [Animal]
    public let atlas: [String: [DrawingRect]]
    public let shadow: [DrawingRect]
    public let affection: [DrawingRect]
    public let interactionRadius: Double
    public let resetMs: Double
    public let cooldownMs: Double
    public let affectionMs: Double
    public struct Style: Decodable {
      public let animal: String
      public let quick: String
      public let activity: String
      public let stages: [String]
      public let color: UInt32
    }
    public struct Station: Decodable {
      public let x: Double
      public let y: Double
      public let stages: [Stage]
    }
    public struct Stage: Decodable {
      public let rectangles: [DrawingRect]
      public let motions: [Motion]
    }
    public struct Motion: Decodable {
      public let rectangles: [DrawingRect]
      public let axis: String
      public let amplitude: Double
      public let periodMs: Double
      public let roundOffset: Bool
      public let before: Int
    }
    public struct Animal: Decodable {
      public let target: Int
      public let species: String
      public let route: [WorldPoint]
      public let speed: Double
      public let pauseMs: Double
      public let phaseOffsetMs: Double
      public func position(at time: Double, still: Bool = false) -> AnimalPosition {
        guard let home = route.first else {
          return AnimalPosition(
            x: 0, y: 0, right: true, moving: false, mode: "idle", walkTime: 0, poseTime: 0)
        }
        let durations = zip(route, route.dropFirst()).map {
          hypot($1.x - $0.x, $1.y - $0.y) / speed * 1000
        }
        let total = durations.reduce(0) { $0 + $1 + pauseMs }
        var phase =
          still || total == 0
          ? 0
          : ((time + phaseOffsetMs).truncatingRemainder(dividingBy: total) + total)
            .truncatingRemainder(dividingBy: total)
        var segment = 0
        while segment < durations.count - 1 && phase >= durations[segment] + pauseMs {
          phase -= durations[segment] + pauseMs
          segment += 1
        }
        let a = route[segment]
        let b = route[min(segment + 1, route.count - 1)]
        let duration = durations.isEmpty ? 1 : max(1, durations[segment])
        let t = still ? 0 : min(1, phase / duration)
        let moving = !still && !durations.isEmpty && phase < duration
        return AnimalPosition(
          x: still ? home.x : a.x + (b.x - a.x) * t, y: still ? home.y : a.y + (b.y - a.y) * t,
          right: still ? true : b.x == a.x ? (target - 1) % 2 == 0 : b.x > a.x, moving: moving,
          mode: moving ? "walk" : !still && (segment + target - 1) % 2 == 0 ? "graze" : "idle",
          walkTime: still ? 0 : min(phase, duration), poseTime: still ? 0 : max(0, phase - duration)
        )
      }
    }
  }
  public func effectRects(at time: Double, still: Bool) -> [DrawingRect] {
    var result: [DrawingRect] = []
    for effect in effects {
      let seed = effect.x * 0.13 + effect.y * 0.07
      if effect.kind == "ripple" {
        let phase = time / 1100 + seed
        result.append(
          DrawingRect(
            x: floor(effect.x + (still ? 0 : sin(phase) * 4) + 0.5), y: effect.y, w: effect.w ?? 0,
            h: effect.h ?? 0, color: effect.color, alpha: still ? 1 : 0.7 + sin(phase + 1) * 0.25))
      } else if !still {
        for i in 0..<4 {
          let phase = (time / (6500 + Double(i) * 700) + seed + Double(i) * 0.27)
            .truncatingRemainder(dividingBy: 1)
          let sway = sin(phase * .pi * 4 + seed + Double(i))
          result.append(
            DrawingRect(
              x: floor(
                effect.x + (Double(i) / 3 * 2 - 1) * (effect.spread ?? 0) + sway * 7 + phase * 9
                  + 0.5), y: floor(effect.y + phase * (effect.fall ?? 0) + 0.5),
              w: abs(sway) > 0.5 ? 4 : 2, h: 2, color: effect.color,
              alpha: min(1, phase * 8, (1 - phase) * 5)))
        }
      }
    }
    return result
  }
  public func habitatRects(
    state: HabitatState?, at time: Double, wildlife: Bool, activities: Bool, still: Bool
  ) -> [DrawingRect] {
    var result: [DrawingRect] = []
    if activities {
      let step = state.map { time - $0.updatedAt < habitat.resetMs ? $0.step : 0 } ?? 0
      let station = habitat.station
      if station.stages.indices.contains(step) {
        let stage = station.stages[step]
        for i in 0...stage.rectangles.count {
          for motion in stage.motions where motion.before == i {
            var offset = still ? 0 : sin(time * .pi * 2 / motion.periodMs) * motion.amplitude
            if motion.roundOffset { offset = floor(offset + 0.5) }
            result += motion.rectangles.map {
              $0.offset(
                x: station.x + (motion.axis == "x" ? offset : 0),
                y: station.y + (motion.axis == "y" ? offset : 0))
            }
          }
          if i < stage.rectangles.count {
            result.append(stage.rectangles[i].offset(x: station.x, y: station.y))
          }
        }
      }
    }
    if wildlife {
      for animal in habitat.animals {
        // Web wildlife continues roaming when Reduce Motion freezes ambient effects.
        let position = animal.position(at: time)
        let frame =
          position.mode == "walk"
          ? Int(floor(position.walkTime / 160)) % 2
          : position.mode == "graze" ? Int(floor(position.poseTime / 240)) % 2 : 0
        let x = floor(position.x + 0.5)
        let y = floor(position.y + 0.5)
        result += habitat.shadow.map { $0.offset(x: x, y: y) }
        result += (habitat.atlas["\(position.mode)-\(frame)"] ?? []).map {
          $0.offset(x: x, y: y, mirrored: !position.right)
        }
        if activities, state?.animal == animal.target - 1, (state?.affectionUntil ?? 0) > time {
          result += habitat.affection.map {
            $0.offset(
              x: x, y: y + (position.mode == "walk" && frame == 1 ? -1 : 0),
              mirrored: !position.right)
          }
        }
      }
    }
    return result
  }
  public func target(
    x: Double, y: Double, zone: String, time: Double, wildlife: Bool, activities: Bool
  ) -> Int? {
    guard zone == "floor", activities else { return nil }
    var target: Int?
    var distance = habitat.interactionRadius
    let points =
      [(0, habitat.station.x, habitat.station.y)]
      + (wildlife
        ? habitat.animals.map { animal in
          let p = animal.position(at: time)
          return (animal.target, p.x, p.y)
        } : [])
    for (index, px, py) in points {
      let d = hypot(px - x, py - y)
      if d < distance {
        target = index
        distance = d
      }
    }
    return target
  }
}
public struct AnimalPosition: Decodable {
  public let x: Double
  public let y: Double
  public let right: Bool
  public let moving: Bool
  public let mode: String
  public let walkTime: Double
  public let poseTime: Double
}
extension DrawingRect {
  public func offset(x: Double, y: Double, mirrored: Bool = false) -> DrawingRect {
    DrawingRect(
      x: x + (mirrored ? -self.x - w : self.x), y: y + self.y, w: w, h: h, color: color,
      alpha: alpha)
  }
}
public struct FarmManifest: Decodable {
  public let growthMs: Double
  public let eggLifetimeMs: Double
  public let eggRadius: Double
  public let cropRadius: Double
  public let maxEggs: Int
  public let firstEggMs: Double
  public let eggIntervalMs: Double
  public let eggIntervalJitterMs: Double
  public let eggPickupDelayMs: Double
  public let maxStepMs: Double
  public let henSpeed: Double
  public let henFastSpeed: Double
  public let cowSpeed: Double
  public let sheepSpeed: Double
  public let henScatterRadius: Double
  public let henScatterX: Double
  public let henScatterY: Double
  public let pond: WorldBounds
  public let henYard: WorldBounds
  public let eggSpots: [WorldPoint]
  public let plots: [WorldPoint]
  public let hens: [Hen]
  public let animals: [Animal]
  public let atlas: [String: [DrawingRect]]
  public let shadows: [String: [DrawingRect]]
  public let iconEmojis: [String: String]?
  public struct Hen: Decodable {
    public let x: Double
    public let y: Double
    public let variant: String
    public let until: Double
  }
  public struct Animal: Decodable {
    public let x: Double
    public let y: Double
    public let kind: String
  }
  public func target(x: Double, y: Double, eggs: [Int: Double], planted: [Double], time: Double)
    -> FarmTarget?
  {
    var best: FarmTarget?
    var distance = Double.infinity
    func consider(kind: String, index: Int, point: WorldPoint, radius: Double) {
      let d = hypot(x - point.x, y - point.y)
      if d < radius && d < distance {
        distance = d
        best = FarmTarget(kind: kind, index: index, x: point.x, y: point.y)
      }
    }
    for (index, until) in eggs.sorted(by: { $0.key < $1.key })
    where until > time && eggSpots.indices.contains(index) {
      consider(kind: "egg", index: index, point: eggSpots[index], radius: eggRadius)
    }
    for (index, date) in planted.enumerated() where plots.indices.contains(index) {
      if date == 0 {
        consider(kind: "plant", index: index, point: plots[index], radius: cropRadius)
      } else if time - date >= growthMs {
        consider(kind: "harvest", index: index, point: plots[index], radius: cropRadius)
      }
    }
    return best
  }
}
public struct FarmTarget {
  public let kind: String
  public let index: Int
  public let x: Double
  public let y: Double
}
