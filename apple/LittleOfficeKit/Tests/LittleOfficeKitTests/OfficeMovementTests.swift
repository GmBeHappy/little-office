import XCTest

@testable import LittleOfficeKit

final class OfficeMovementTests: XCTestCase {
  private func fixture(_ name: String) throws -> Data {
    try Data(contentsOf: Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")!)
  }
  private func snapshot(x: Double, y: Double = 350, seq: Int, locked: Bool = false) throws -> Snapshot {
    var json = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("snapshot")) as? [String: Any])
    var people = try XCTUnwrap(json["people"] as? [[String: Any]])
    people[0]["x"] = x
    people[0]["y"] = y
    people[0]["seq"] = seq
    json["people"] = people
    json["locks"] = ["studio": locked]
    return try JSONDecoder().decode(Snapshot.self, from: JSONSerialization.data(withJSONObject: json))
  }

  func testLocalWalkStartsBeforeSnapshotAndStaysAtReleaseAcrossDelayedAcknowledgment() throws {
    let map = try JSONDecoder().decode(SceneManifest.self, from: fixture("scene"))
    var walk = OfficeMovement(), commands: [WalkCommand] = []
    walk.receive(try snapshot(x: 720, seq: 0), manifest: map, now: 0)
    // A quiet office may have gone several minutes without a snapshot.
    walk.input(1, 0, now: 300) { commands.append($0) }
    let first = try XCTUnwrap(walk.frame(delta: 0.05, now: 300.05) { commands.append($0) })
    XCTAssertEqual(first.position.x, 728)
    XCTAssertTrue(first.moving)
    _ = walk.frame(delta: 0.05, now: 300.10) { commands.append($0) }
    _ = walk.frame(delta: 0.05, now: 300.15) { commands.append($0) }
    walk.input(0, 0, now: 300.15) { commands.append($0) }
    XCTAssertEqual(commands.map(\.dx), [1, 1, 1, 0])
    XCTAssertEqual(commands.map(\.steps), [[], [0.05, 0.05], [0.05], []])
    walk.receive(try snapshot(x: 736, seq: commands[1].seq), manifest: map, now: 300.5)
    let released = try XCTUnwrap(walk.frame(delta: 0.05, now: 300.55) { commands.append($0) })
    XCTAssertEqual(released.position.x, 744)
    XCTAssertFalse(released.moving)
    walk.receive(try snapshot(x: 744, seq: commands[3].seq), manifest: map, now: 300.7)
    XCTAssertEqual(walk.frame(delta: 0.05, now: 300.75) { commands.append($0) }?.position.x, 744)
  }

  func testWalkRespectsRoomLockAndAuthoritativeTeleportWithUnacknowledgedInput() throws {
    let map = try JSONDecoder().decode(SceneManifest.self, from: fixture("scene"))
    var walk = OfficeMovement()
    walk.receive(try snapshot(x: 834, y: 220, seq: 4, locked: true), manifest: map, now: 10)
    walk.input(1, 0, now: 10) { _ in }
    XCTAssertEqual(walk.frame(delta: 0.05, now: 10.05) { _ in }?.position.x, 834)
    walk.receive(try snapshot(x: 400, y: 500, seq: 4), manifest: map, now: 10.1)
    let after = try XCTUnwrap(walk.frame(delta: 0.05, now: 10.15) { _ in })
    XCTAssertEqual(after.position, WorldPoint(x: 400, y: 500))
    XCTAssertFalse(after.moving)
  }

  func testTeammateWalksAtSteadyPaceBetweenUpdatesAndSnapsOnTeleport() {
    var walk = RemoteWalk()
    let start = WorldPoint(x: 720, y: 350), target = WorldPoint(x: 736, y: 350)
    XCTAssertEqual(walk.position(toward: start, now: 0), start)
    XCTAssertEqual(walk.position(toward: target, now: 0.1), start)
    XCTAssertEqual(walk.position(toward: target, now: 0.15).x, 728, accuracy: 0.001)
    XCTAssertEqual(walk.position(toward: target, now: 0.2), target)
    let teleported = WorldPoint(x: 950, y: 150)
    XCTAssertEqual(walk.position(toward: teleported, now: 0.21), teleported)
  }
}
