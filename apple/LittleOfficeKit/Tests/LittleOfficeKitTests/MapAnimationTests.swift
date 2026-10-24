import XCTest

@testable import LittleOfficeKit

final class MapAnimationTests: XCTestCase {
  private func fixture() throws -> [String: Any] {
    let url = Bundle.module.url(
      forResource: "native-animation", withExtension: "json", subdirectory: "Fixtures")!
    return try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
  }
  private func decode<T: Decodable>(_ value: Any, as: T.Type) throws -> T {
    try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: value))
  }
  private func scenes(_ root: [String: Any]) throws -> [String: MapAnimation] {
    try Dictionary(
      uniqueKeysWithValues: (root["scenes"] as! [[String: Any]]).map {
        ($0["mapId"] as! String, try decode($0["animation"]!, as: MapAnimation.self))
      })
  }
  private func assertRects(
    _ actual: [DrawingRect], _ expected: [DrawingRect], context: String,
    file: StaticString = #filePath, line: UInt = #line
  ) {
    XCTAssertEqual(actual.count, expected.count, context, file: file, line: line)
    for (a, b) in zip(actual, expected) {
      XCTAssertEqual(a.x, b.x, accuracy: 0.0001, context, file: file, line: line)
      XCTAssertEqual(a.y, b.y, accuracy: 0.0001, context, file: file, line: line)
      XCTAssertEqual(a.w, b.w, context, file: file, line: line)
      XCTAssertEqual(a.h, b.h, context, file: file, line: line)
      XCTAssertEqual(a.color, b.color, context, file: file, line: line)
      XCTAssertEqual(a.alpha ?? 1, b.alpha ?? 1, accuracy: 0.0001, context, file: file, line: line)
    }
  }
  func testEveryWebAnimalRouteAndPose() throws {
    let root = try fixture()
    let maps = try scenes(root)
    XCTAssertEqual(maps.count, 15)
    for vector in root["animals"] as! [[String: Any]] {
      let mapId = vector["mapId"] as! String
      let index = vector["index"] as! Int
      let time = vector["time"] as! Double
      let expected = try decode(vector["expected"]!, as: AnimalPosition.self)
      let actual = maps[mapId]!.habitat.animals[index].position(at: time)
      XCTAssertEqual(actual.x, expected.x, accuracy: 0.00001)
      XCTAssertEqual(actual.y, expected.y, accuracy: 0.00001)
      XCTAssertEqual(actual.mode, expected.mode)
      XCTAssertEqual(actual.right, expected.right)
      XCTAssertEqual(actual.moving, expected.moving)
      XCTAssertEqual(actual.walkTime, expected.walkTime, accuracy: 0.00001)
      XCTAssertEqual(actual.poseTime, expected.poseTime, accuracy: 0.00001)
    }
  }
  func testEveryHabitatFrameAndReduceMotionMatchesWebPixels() throws {
    let root = try fixture()
    let maps = try scenes(root)
    for vector in root["habitat"] as! [[String: Any]] {
      let id = vector["mapId"] as! String
      let actual = maps[id]!.habitatRects(
        state: try decode(vector["state"]!, as: HabitatState.self), at: vector["time"] as! Double,
        wildlife: true, activities: true, still: vector["still"] as! Bool)
      assertRects(actual, try decode(vector["expected"]!, as: [DrawingRect].self), context: id)
    }
  }
  func testAmbientEffectsMatchWebPixels() throws {
    let root = try fixture()
    let maps = try scenes(root)
    for vector in root["effects"] as! [[String: Any]] {
      let id = vector["mapId"] as! String
      let actual = maps[id]!.effectRects(
        at: vector["time"] as! Double, still: vector["still"] as! Bool)
      assertRects(actual, try decode(vector["expected"]!, as: [DrawingRect].self), context: id)
    }
  }
  func testInteractionBoundariesAndFeatureGates() throws {
    let root = try fixture()
    let maps = try scenes(root)
    for vector in root["targets"] as! [[String: Any]] {
      let id = vector["mapId"] as! String
      let person = vector["person"] as! [String: Any]
      let actual = maps[id]!.target(
        x: person["x"] as! Double, y: person["y"] as! Double, zone: person["zone"] as! String,
        time: vector["time"] as! Double, wildlife: vector["wildlife"] as! Bool,
        activities: vector["activities"] as! Bool)
      XCTAssertEqual(actual ?? -1, vector["expected"] as! Int, id)
    }
    let map = maps["nature-small"]!
    XCTAssertTrue(
      map.habitatRects(state: nil, at: 1000, wildlife: false, activities: false, still: false)
        .isEmpty)
  }
  func testFarmTargetAndDrawingsMatchWeb() throws {
    let root = try fixture()
    let maps = try scenes(root)
    let farm = maps["farm-small"]!.farm!
    let simulation = FarmSimulation(manifest: farm, blocks: [], random: { 0.2 })
    for vector in root["farmTargets"] as! [[String: Any]] {
      let person = vector["person"] as! [String: Double]
      let eggs = Dictionary(
        uniqueKeysWithValues: (vector["eggs"] as! [[Double]]).map { (Int($0[0]), $0[1]) })
      let actual = farm.target(
        x: person["x"]!, y: person["y"]!, eggs: eggs, planted: vector["plots"] as! [Double],
        time: vector["time"] as! Double)
      if let expected = vector["expected"] as? [String: Any] {
        XCTAssertEqual(actual?.kind, expected["kind"] as? String)
        XCTAssertEqual(actual?.x, expected["x"] as? Double)
        XCTAssertEqual(actual?.y, expected["y"] as? Double)
      } else {
        XCTAssertNil(actual)
      }
    }
    for vector in root["farmAnimals"] as! [[String: Any]] {
      let input = vector["input"] as! [String: Any]
      let kind = vector["kind"] as! String
      let actual = simulation.animalRects(
        kind: kind, variant: (input["body"] as? Int) == 0xc98d5a ? "dark" : "light",
        x: input["x"] as! Double, y: input["y"] as! Double, mode: input["mode"] as! String,
        right: input["direction"] as! String == "right", walkTime: input["walkTime"] as! Double,
        since: input["since"] as! Double, time: vector["time"] as! Double)
      assertRects(
        actual, try decode(vector["expected"]!, as: [DrawingRect].self),
        context: "\(kind) \(input["mode"]!) \(vector["time"]!)")
    }
    XCTAssertEqual(simulation.interact(x: farm.plots[0].x, y: farm.plots[0].y, time: 1000), "🌱")
    XCTAssertNil(simulation.interact(x: farm.plots[0].x, y: farm.plots[0].y, time: 1001))
    XCTAssertEqual(
      simulation.interact(x: farm.plots[0].x, y: farm.plots[0].y, time: 1000 + farm.growthMs), "🌾")
    XCTAssertEqual(simulation.harvestedCrops, 1)
  }
  func testPresencePriorityAndAppearanceBounds() {
    XCTAssertEqual(
      Presence(status: "away", text: "Lunch", icon: "☕", sharing: true, whiteboard: true),
      Presence(status: "busy", text: "", icon: "", sharing: true, whiteboard: true))
    XCTAssertEqual(
      Presence(status: "dnd", text: "Focus", icon: "", sharing: true, whiteboard: false).status,
      "dnd")
    XCTAssertEqual(
      Presence(status: "available", text: " Hello ", icon: "", sharing: false, whiteboard: false)
        .text, "Hello")
    XCTAssertEqual(Appearance("custom:4:14:14:14").id, "custom:4:14:14:14")
    XCTAssertEqual(Appearance("custom:5:14:14:14"), Appearance("sage"))
    XCTAssertEqual(Appearance("custom:4:15:0:0"), Appearance("sage"))
  }
}
