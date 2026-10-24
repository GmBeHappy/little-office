import XCTest

@testable import LittleOfficeKit

final class ContractTests: XCTestCase {
  private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
    let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")!
    return try JSONDecoder().decode(type, from: Data(contentsOf: url))
  }
  func testWorkspaceAddressEntryPreservesOriginSecurity() throws {
    XCTAssertEqual(try OfficeDestination.workspaceSlug(" GMTech "), "gmtech")
    XCTAssertEqual(try OfficeDestination.workspaceSlug("https://gmtech.littleoffice.app"), "gmtech")
    XCTAssertEqual(
      try OfficeDestination.workspaceSlug("https://gmtech.littleoffice.app/"), "gmtech")
    XCTAssertThrowsError(try OfficeDestination.workspaceSlug("https://gmtech.littleoffice.app//"))
    XCTAssertThrowsError(
      try OfficeDestination.workspaceSlug("https://gmtech.littleoffice.app/?token=secret"))
    XCTAssertEqual(OfficeDestination.canonicalOrigin.host, "app.littleoffice.app")
    XCTAssertEqual(try OfficeDestination.origin("http://localhost:3000").port, 3000)
    for input in [
      "", "../escape", "http://example.com", "https://user:password@example.com",
      "https://example.com/path", "https://example.com?token=secret",
      "https://example.com#fragment",
    ] {
      XCTAssertThrowsError(try OfficeDestination.origin(input), input)
    }
    for input in [
      "app", "www", "api", "auth", "admin", "rtc", "turn", "stun", "livekit", "mail", "smtp",
      "status", "support", "cdn", "assets", "static", "localhost", "ab",
      String(repeating: "x", count: 49), "test--team", "-team", "team-", "https://evil.com",
      "http://gmtech.littleoffice.app", "gmtech.littleoffice.app/path",
    ] {
      XCTAssertThrowsError(try OfficeDestination.workspaceSlug(input), input)
    }
  }
  func testCaptureCompletionCannotOutliveRevocationOrRestart() {
    var authorization = CaptureAuthorization()
    let pendingPublish = authorization.begin(enabled: true)
    XCTAssertTrue(authorization.isCurrent(pendingPublish, enabled: true))
    let stop = authorization.begin(enabled: false)
    XCTAssertFalse(authorization.isCurrent(pendingPublish, enabled: true))
    XCTAssertTrue(authorization.isCurrent(stop, enabled: false))
    let nextPublish = authorization.begin(enabled: true)
    XCTAssertFalse(authorization.isCurrent(pendingPublish, enabled: true))
    XCTAssertFalse(authorization.isCurrent(stop, enabled: false))
    XCTAssertTrue(authorization.isCurrent(nextPublish, enabled: true))
  }
  func testOperatorControlsProtectSelfOwnerAndSSOAccounts() throws {
    func user(id: String, role: String = "member", approved: Bool = true, local: Bool = true) throws
      -> OperatorUser
    {
      let data = try JSONSerialization.data(withJSONObject: [
        "id": id, "name": "Fixture", "role": role, "approved": approved, "localPassword": local,
      ])
      return try JSONDecoder().decode(OperatorUser.self, from: data)
    }
    let own = try user(id: "actor", role: "owner")
    XCTAssertFalse(own.canDelete(actor: "actor"))
    XCTAssertFalse(own.canChangeRole(actor: "actor"))
    XCTAssertFalse(own.canChangeApproval(actor: "actor"))
    XCTAssertFalse(try user(id: "other", role: "owner").canDelete(actor: "actor"))
    XCTAssertFalse(try user(id: "pending", approved: false).canChangeRole(actor: "actor"))
    XCTAssertFalse(try user(id: "sso", local: false).canResetPassword(passwordEnabled: true))
    XCTAssertFalse(try user(id: "local").canResetPassword(passwordEnabled: false))
    XCTAssertTrue(try user(id: "local").canResetPassword(passwordEnabled: true))
    XCTAssertTrue(try user(id: "local").canDelete(actor: "actor"))
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
  func testNearbyAudioUsesWebDistanceAndConversationRules() throws {
    let snapshot = try fixture("snapshot", as: Snapshot.self)
    var source =
      try JSONSerialization.jsonObject(with: JSONEncoder().encode(snapshot.me!)) as! [String: Any]
    source["conversation"] = "floor"
    source["zone"] = "floor"
    source["x"] = 100
    source["y"] = 100
    func person(_ value: [String: Any]) throws -> Person {
      try JSONDecoder().decode(Person.self, from: JSONSerialization.data(withJSONObject: value))
    }
    let me = try person(source)
    var remote = source
    remote["x"] = 210
    XCTAssertEqual(me.volume(for: try person(remote)), 0.5, accuracy: 0.00001)
    remote["x"] = 290
    XCTAssertTrue(me.canHear(try person(remote)))
    XCTAssertEqual(me.volume(for: try person(remote)), 0.15, accuracy: 0.00001)
    remote["x"] = 290.001
    XCTAssertFalse(me.canHear(try person(remote)))
    remote["x"] = 100
    remote["zone"] = "studio"
    XCTAssertEqual(me.volume(for: try person(remote)), 0)
    source["conversation"] = "private-1"
    remote["conversation"] = "private-1"
    remote["x"] = 1000
    XCTAssertEqual(try person(source).volume(for: person(remote)), 1)
    remote["conversation"] = "private-2"
    XCTAssertFalse(try person(source).canHear(person(remote)))
  }

  func testOIDCBlankSecretPreservesExistingCredential() {
    let body = OIDCInput.body(
      issuer: "https://id.example", clientId: "office", domain: "example.com", clientSecret: "")
    XCTAssertNil(body["clientSecret"])
    XCTAssertEqual(body["issuer"], "https://id.example")
    XCTAssertEqual(
      OIDCInput.body(
        issuer: "https://id.example", clientId: "office", domain: "example.com",
        clientSecret: "new-secret")["clientSecret"], "new-secret")
  }

}
