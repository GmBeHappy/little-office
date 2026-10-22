import Foundation

/// The same fishing geometry as shared/fishing.ts, checked against generated web fixtures.
public struct Fishing: Codable {
  public let x: Double
  public let y: Double
  public let direction: String
  public let target: Target
  public let start: Double
  public let bite: Double
  public struct Target: Codable {
    public let x: Double
    public let y: Double
  }
  public func phase(at time: Double) -> String {
    if time < start || time >= bite + 1800 { return "idle" }
    if time < start + 600 { return "cast" }
    return time < bite ? "wait" : "catch"
  }
  public func rectangles(at time: Double, skin: UInt32, reducedMotion: Bool) -> [DrawingRect] {
    let phase = phase(at: time)
    guard phase != "idle" else { return [] }
    var result: [DrawingRect] = []
    func pixel(_ x: Double, _ y: Double, _ w: Double, _ h: Double, _ color: UInt32) {
      // JavaScript Math.round rounds negative halves toward positive infinity.
      result.append(DrawingRect(x: floor(x + 0.5), y: floor(y + 0.5), w: w, h: h, color: color))
    }
    func line(
      _ x: Double, _ y: Double, _ tx: Double, _ ty: Double, _ width: Double, _ color: UInt32
    ) {
      let steps = Int(ceil(max(abs(tx - x), abs(ty - y))))
      for i in 0...steps {
        let t = steps == 0 ? 0 : Double(i) / Double(steps)
        pixel(x + (tx - x) * t, y + (ty - y) * t, width, width, color)
      }
    }
    let side = direction == "left" ? -1.0 : 1.0
    let handX = side * 10
    let handY = -12.0
    let targetX = target.x - x
    let targetY = target.y - y
    let cast = reducedMotion ? 1 : min(1, (time - start) / 600)
    let reel = phase == "catch" ? (reducedMotion ? 1 : min(1, (time - bite) / 700)) : 0
    let tipX = handX + (targetX - handX) * 0.8 * cast - side * reel * 8
    let tipY = -38 + targetY * 0.45 * cast - reel * 14
    let bob = reducedMotion ? 0 : sin(time / 260) * 1.5
    let hookX = handX + (targetX - handX) * cast + (side * 25 - targetX) * reel
    let hookY = handY + (targetY - handY) * cast - (targetY + 30) * reel + bob * (1 - reel)
    line(side * 10, -8, handX, handY, 4, skin)
    line(handX, handY, tipX, tipY, 3, 0x79543e)
    line(handX, handY, tipX, tipY, 1, 0xe1bd7d)
    line(tipX, tipY, hookX, hookY, 1, 0xfaf4d8)
    if phase != "catch" {
      if cast == 1 {
        let ripple = reducedMotion ? 0 : floor((time / 180).truncatingRemainder(dividingBy: 4))
        pixel(targetX - 6 - ripple, targetY + 3, 12 + ripple * 2, 1, 0xd8f1df)
      }
      pixel(hookX - 2, hookY - 5, 4, 4, 0xd66854)
      pixel(hookX - 2, hookY - 1, 4, 3, 0xfff4d8)
    } else {
      let wiggle = reducedMotion ? 0 : sin((time - bite) / 65) * 2
      pixel(hookX - 4, hookY + 1, 9, 6, 0x437f87)
      pixel(hookX - 3, hookY + 2, 7, 3, 0xb8e2cd)
      pixel(hookX - 2 + wiggle, hookY + 7, 5, 3, 0xe3a663)
      pixel(hookX + 2, hookY + 2, 2, 2, 0x253c45)
      if reel < 1 {
        for sign in [-1.0, 1.0] {
          pixel(targetX + sign * (5 + reel * 12), targetY - sin(reel * .pi) * 12, 3, 3, 0xe7f6df)
        }
      } else {
        pixel(hookX - 12, hookY - 3, 3, 3, 0xf5cf70)
        pixel(hookX + 10, hookY + 6, 3, 3, 0xf5cf70)
      }
    }
    return result
  }
}
