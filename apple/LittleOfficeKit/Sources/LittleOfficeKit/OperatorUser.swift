import Foundation

public struct OperatorUser: Decodable, Identifiable {
  public let id: String
  public let name: String
  public let username: String?
  public let role: String
  public let approved: Bool
  public let localPassword: Bool
  public func canChangeApproval(actor: String) -> Bool { id != actor }
  public func canChangeRole(actor: String) -> Bool { id != actor && approved }
  public func canDelete(actor: String) -> Bool { id != actor && role == "member" }
  public func canResetPassword(passwordEnabled: Bool) -> Bool { passwordEnabled && localPassword }
}
