import Foundation

/// Millisecond timing and transforms shared with components/PixelMap.tsx.
/// Coordinates here use the web's downward Y axis; the scene converts them to SpriteKit.
public struct AvatarAnimation {
  public var jumpStart: Double?
  public var nudgeStart: Double?
  public var nudgeSender = false
  public var emote = ""
  public var emoteUntil = 0.0
  public var waveUntil = 0.0
  private var walkTime = 0.0
  private var pose = "stand"
  private var poseSince = 0.0
  public init() {}

  public struct Frame {
    public let index: Int
    public let height: Double
    public let squash: Double
    public let bob: Double
    public let offsetX: Double
    public let offsetY: Double
    public let nudgeMotion: Double
    public let nudgeOpacity: Double
    public let reaction: String
  }
  public mutating func update(
    time: Double, delta: Double, moving: Bool, pose nextPose: String,
    direction: String, reducedMotion: Bool
  ) -> Frame {
    walkTime = moving ? walkTime + min(max(delta, 0), 50) : 0
    let step = Int(walkTime / 110) % 4
    if pose != nextPose {
      pose = nextPose
      poseSince = time
    }
    let settle =
      reducedMotion || pose == "stand" || pose == "fish"
      ? 0 : -4 * max(0, 1 - (time - poseSince) / 250)
    let breathe = !reducedMotion && pose == "sleep" ? sin(time / 650) : 0
    let elapsed = jumpStart.map { time - $0 } ?? 650
    let airborne = elapsed >= 0 && elapsed < 520
    let height = airborne ? 28 * 4 * (elapsed / 520) * (1 - elapsed / 520) : 0
    let squash = elapsed >= 520 && elapsed < 650 ? 0.16 * sin((elapsed - 520) / 130 * .pi) : 0
    let nudgeTime = nudgeStart.map { time - $0 } ?? 500
    let reacting = nudgeTime >= 0 && nudgeTime < 500
    let motion = !reducedMotion && reacting ? sin(nudgeTime / 500 * .pi) : 0
    let push = nudgeSender ? motion * 8 : motion * sin(nudgeTime / 35) * 4
    let nx = nudgeSender ? (direction == "left" ? -push : direction == "right" ? push : 0) : push
    let ny = nudgeSender ? (direction == "up" ? -push : direction == "down" ? push : 0) : 0
    let reaction =
      reacting && !nudgeSender
      ? "!"
      : emoteUntil > time
        ? emote
        : pose == "sleep" ? "Zzz" : waveUntil > time ? "👋" : ""
    return Frame(
      index: airborne ? 4 : step, height: height, squash: squash,
      bob: airborne ? 0 : step % 2 == 1 ? -1 : 0,
      offsetX: nx, offsetY: ny + settle + breathe,
      nudgeMotion: motion, nudgeOpacity: reacting ? 1 - nudgeTime / 500 : 0,
      reaction: reaction)
  }

  public static func touchDirection(x: Double, y: Double) -> (Int, Int) {
    guard hypot(x, y) >= 10 else { return (0, 0) }
    let threshold = max(abs(x), abs(y)) * 0.4
    return (
      abs(x) >= threshold ? (x > 0 ? 1 : -1) : 0,
      abs(y) >= threshold ? (y > 0 ? 1 : -1) : 0
    )
  }
}

public struct OfficeEffect: Decodable {
  public let type: String
  public let from: String
  public let to: String?
  public let emoji: String?
}
