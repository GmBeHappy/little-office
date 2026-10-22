import XCTest

@testable import LittleOfficeKit

final class AvatarAnimationTests: XCTestCase {
  func testWalkingUsesFour110msFramesAndStopsAtRest() {
    var animation = AvatarAnimation()
    var indices: [Int] = []
    for tick in 1...44 {
      let frame = animation.update(
        time: Double(tick * 10), delta: 10, moving: true,
        pose: "stand", direction: "down", reducedMotion: false)
      if tick % 11 == 0 { indices.append(frame.index) }
    }
    XCTAssertEqual(indices, [1, 2, 3, 0])
    let idle = animation.update(
      time: 450, delta: 10, moving: false, pose: "stand", direction: "down", reducedMotion: false)
    XCTAssertEqual(idle.index, 0)
    XCTAssertEqual(idle.bob, 0)
  }
  func testJumpPeakLandingAndRecoveryMatchWeb() {
    var animation = AvatarAnimation()
    animation.jumpStart = 1000
    func sample(_ elapsed: Double) -> AvatarAnimation.Frame {
      animation.update(
        time: 1000 + elapsed, delta: 16, moving: false, pose: "stand", direction: "left",
        reducedMotion: false)
    }
    XCTAssertEqual(sample(0).height, 0)
    let peak = sample(260)
    XCTAssertEqual(peak.height, 28, accuracy: 0.00001)
    XCTAssertEqual(peak.index, 4)
    XCTAssertEqual(sample(520).height, 0)
    XCTAssertEqual(sample(585).squash, 0.16, accuracy: 0.00001)
    XCTAssertEqual(sample(650).squash, 0)
    XCTAssertEqual(sample(650).index, 0)
  }
  func testNudgeDirectionExpiryAndReducedMotion() {
    var animation = AvatarAnimation()
    animation.nudgeStart = 1000
    animation.nudgeSender = true
    let sender = animation.update(
      time: 1250, delta: 16, moving: false, pose: "stand", direction: "up", reducedMotion: false)
    XCTAssertEqual(sender.offsetX, 0)
    XCTAssertEqual(sender.offsetY, -8, accuracy: 0.00001)
    animation.nudgeSender = false
    let target = animation.update(
      time: 1250, delta: 16, moving: false, pose: "stand", direction: "down", reducedMotion: true)
    XCTAssertEqual(target.offsetX, 0)
    XCTAssertEqual(target.reaction, "!")
    XCTAssertEqual(target.nudgeOpacity, 0.5)
    let expired = animation.update(
      time: 1500, delta: 16, moving: false, pose: "stand", direction: "down", reducedMotion: false)
    XCTAssertEqual(expired.reaction, "")
    XCTAssertEqual(expired.nudgeOpacity, 0)
  }
  func testPoseSettleAndReactionPriority() {
    var animation = AvatarAnimation()
    animation.emote = "🎉"
    animation.emoteUntil = 3000
    animation.waveUntil = 4000
    let sitting = animation.update(
      time: 1000, delta: 16, moving: false, pose: "sit", direction: "down", reducedMotion: false)
    XCTAssertEqual(sitting.offsetY, -4)
    XCTAssertEqual(sitting.reaction, "🎉")
    let settled = animation.update(
      time: 1250, delta: 16, moving: false, pose: "sit", direction: "down", reducedMotion: false)
    XCTAssertEqual(settled.offsetY, 0)
    let sleeping = animation.update(
      time: 3000, delta: 16, moving: false, pose: "sleep", direction: "down", reducedMotion: true)
    XCTAssertEqual(sleeping.reaction, "Zzz")
    XCTAssertEqual(sleeping.offsetY, 0)
    let wave = animation.update(
      time: 3500, delta: 16, moving: false, pose: "stand", direction: "down", reducedMotion: false)
    XCTAssertEqual(wave.reaction, "👋")
    XCTAssertEqual(
      animation.update(
        time: 4000, delta: 16, moving: false, pose: "stand", direction: "down", reducedMotion: false
      ).reaction, "")
  }
  func testTouchDeadZoneAndDiagonalThresholdMatchWeb() {
    let idle = AvatarAnimation.touchDirection(x: 7, y: 7)
    XCTAssertEqual(idle.0, 0)
    XCTAssertEqual(idle.1, 0)
    let right = AvatarAnimation.touchDirection(x: 20, y: 7)
    XCTAssertEqual(right.0, 1)
    XCTAssertEqual(right.1, 0)
    let diagonal = AvatarAnimation.touchDirection(x: -20, y: 8)
    XCTAssertEqual(diagonal.0, -1)
    XCTAssertEqual(diagonal.1, 1)
  }
  func testFishingPixelsMatchActualWebRenderer() throws {
    struct Fixture: Decodable {
      let fishing: Fishing
      let time: Double
      let skin: UInt32
      let reducedMotion: Bool
      let rectangles: [DrawingRect]
    }
    let url = Bundle.module.url(
      forResource: "fishing", withExtension: "json", subdirectory: "Fixtures")!
    let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
    XCTAssertEqual(fixtures.count, 88)
    for fixture in fixtures {
      XCTAssertEqual(
        fixture.fishing.rectangles(
          at: fixture.time, skin: fixture.skin,
          reducedMotion: fixture.reducedMotion), fixture.rectangles,
        "\(fixture.fishing.direction) at \(fixture.time), reduced: \(fixture.reducedMotion)")
    }
  }
}
