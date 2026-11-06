import Foundation

/// A push opens only the enrolled inbox. Ignore supplied URLs and check membership again when navigating.
public func pushInboxWorkspace(
  payload: [AnyHashable: Any], recipient: String, installation: String, workspace: String
) -> String? {
  guard payload["type"] as? String == "office-notification",
    payload["recipientId"] as? String == recipient,
    let target = payload["installationId"] as? String, let targetID = UUID(uuidString: target),
    UUID(uuidString: installation) == targetID,
    let id = payload["workspaceId"] as? String, let workspaceID = UUID(uuidString: id),
    UUID(uuidString: workspace) == workspaceID
  else { return nil }
  return workspace
}
