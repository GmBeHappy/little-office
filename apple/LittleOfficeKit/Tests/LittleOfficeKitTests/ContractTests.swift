import XCTest

@testable import LittleOfficeKit

final class ContractTests: XCTestCase {
  private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
    let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")!
    return try JSONDecoder().decode(type, from: Data(contentsOf: url))
  }
  func testDecodeActualServerSnapshot() throws {
    let snapshot = try fixture("snapshot", as: Snapshot.self)
    XCTAssertEqual(snapshot.protocolVersion, 1)
    XCTAssertEqual(snapshot.me?.id, "fixture-user")
    XCTAssertEqual(snapshot.workspaceId, "00000000-0000-4000-8000-000000000001")
    XCTAssertEqual(snapshot.people.count, 1)
  }
  func testSharedMapAndAvatarExports() throws {
    let scene = try fixture("scene", as: SceneManifest.self)
    XCTAssertEqual(scene.width, 1120)
    XCTAssertFalse(scene.rectangles.isEmpty)
    XCTAssertEqual(Set(scene.zones.map(\.id)), ["floor", "studio", "library"])
    let avatar = try fixture("avatar", as: AvatarManifest.self)
    XCTAssertEqual(avatar.frames.count, 80)
    XCTAssertFalse(avatar.frames["down-stand-0"]!.isEmpty)
  }
  func testPKCECallbackRequiresMatchingStateAndScheme() throws {
    let pkce = try PKCE()
    let other = try PKCE()
    XCTAssertEqual(pkce.challenge.count, 43)
    XCTAssertNotEqual(pkce.state, other.state)
    let code = String(repeating: "c", count: 43)
    XCTAssertEqual(
      try pkce.code(from: URL(string: "littleoffice://auth?code=\(code)&state=\(pkce.state)")!),
      code)
    XCTAssertThrowsError(
      try pkce.code(from: URL(string: "littleoffice://auth?code=\(code)&state=\(other.state)")!))
    XCTAssertThrowsError(
      try pkce.code(from: URL(string: "https://auth?code=\(code)&state=\(pkce.state)")!))
  }
  func testCredentialsCannotBeSentToAnotherOrigin() throws {
    let api = try OfficeAPI(origin: URL(string: "https://office.example")!)
    XCTAssertThrowsError(try api.request("//attacker.example/api/workspaces"))
    XCTAssertThrowsError(try api.request("https://attacker.example/api/workspaces"))
    XCTAssertEqual(try api.request("/api/workspaces").url?.host, "office.example")
    XCTAssertThrowsError(try OfficeAPI(origin: URL(string: "http://office.example")!))
    XCTAssertNoThrow(try OfficeAPI(origin: URL(string: "http://localhost:3000")!))
  }
}
