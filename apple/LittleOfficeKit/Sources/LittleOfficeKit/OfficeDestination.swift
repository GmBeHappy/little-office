import Foundation

public enum OfficeDestination {
  public static let canonicalOrigin = URL(string: "https://app.littleoffice.app")!
  public static func workspaceSlug(_ input: String) throws -> String {
    var value = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if value.hasPrefix("https://") { value = String(value.dropFirst(8)) }
    if value.hasSuffix(".littleoffice.app/") { value.removeLast() }
    if value.hasSuffix(".littleoffice.app") {
      value = String(value.dropLast(".littleoffice.app".count))
    }
    let reserved: Set<String> = [
      "app", "www", "api", "auth", "admin", "rtc", "turn", "stun", "livekit", "mail", "smtp",
      "status", "support", "cdn", "assets", "static", "localhost",
    ]
    guard (3...48).contains(value.count), !reserved.contains(value),
      value.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil
    else { throw APIError(status: 0, message: "Enter the workspace name from your invitation.") }
    return value
  }
  /// Custom hosts are an explicit choice, never inferred from a workspace name.
  public static func origin(_ input: String) throws -> URL {
    let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: value) else {
      throw APIError(status: 0, message: "Enter a valid server address.")
    }
    return try OfficeAPI(origin: url).origin
  }
}
