import XCTest

@testable import LittleOfficeKit

final class PushDestinationTests: XCTestCase {
  func testTapOnlyOpensTheEnrolledRecipientDeviceAndWorkspace() {
    let workspace = UUID().uuidString
    let installation = UUID().uuidString
    let data: [AnyHashable: Any] = [
      "type": "office-notification", "workspaceId": workspace.lowercased(), "recipientId": "person",
      "installationId": installation.lowercased(), "url": "https://outside.invalid",
    ]
    func resolve(_ payload: [AnyHashable: Any]) -> String? {
      pushInboxWorkspace(
        payload: payload, recipient: "person", installation: installation, workspace: workspace)
    }
    XCTAssertEqual(resolve(data), workspace)
    for key in ["recipientId", "installationId", "workspaceId", "type"] {
      var other = data
      other[key] = UUID().uuidString
      XCTAssertNil(resolve(other), key)
      other[key] = nil
      XCTAssertNil(resolve(other), key)
    }
  }
}
