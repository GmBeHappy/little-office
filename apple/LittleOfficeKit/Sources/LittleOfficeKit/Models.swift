import Foundation

public struct Workspace: Codable, Identifiable, Hashable {
  public let id: String
  public let slug: String
  public let name: String
  public let mapId: String
  public let role: String
}
public struct WorkspaceSettings: Codable {
  public let name: String
  public let mapId: String
  public let revision: Int
  public let features: Features?
  public let dailyMap: DailyMap?
  public struct DailyMap: Codable {
    public let enabled: Bool
    public let date: String?
  }
  public struct Features: Codable {
    public let whiteboard: Bool
    public let wildlife: Bool?
    public let activities: Bool?
  }
}
public struct OfficeConfig: Decodable {
  public let workspace: WorkspaceSettings
  public let workspaceId: String
  public let protocolVersion: Int
  public let mediaConfigured: Bool
  public let storageConfigured: Bool
}
public struct Person: Codable, Identifiable {
  public let id: String
  public let name: String
  public let avatar: String
  public let x: Double
  public let y: Double
  public let direction: String
  public let moving: Bool
  public let pose: String
  public let fishing: Fishing?
  public let microphone: Bool
  public let status: String
  public let statusText: String
  public let statusIcon: String?
  public let sharing: Bool?
  public let watching: String?
  public let whiteboard: Bool?
  public let zone: String
  public let conversation: String
  public let room: String
  public let seq: Int
  public var presence: Presence {
    Presence(
      status: status, text: statusText, icon: statusIcon ?? "", sharing: sharing == true,
      whiteboard: whiteboard == true)
  }
  public func volume(for other: Person) -> Double {
    guard canHear(other) else { return 0 }
    if conversation != "floor" { return 1 }
    return max(0.15, 1 - hypot(x - other.x, y - other.y) / 220)
  }
  public func canHear(_ other: Person) -> Bool {
    conversation == other.conversation
      && (conversation != "floor" || (zone == other.zone && hypot(x - other.x, y - other.y) <= 190))
  }
}
public struct Snapshot: Decodable {
  public let type: String
  public let protocolVersion: Int
  public let workspaceId: String
  public let workspace: WorkspaceSettings
  public let epoch: String
  public let selfId: String
  public let people: [Person]
  public let presenters: [String: [String]]
  public let locks: [String: Bool]
  public let habitat: HabitatState?
  public var me: Person? { people.first { $0.id == selfId } }
  enum CodingKeys: String, CodingKey {
    case type, protocolVersion, workspaceId, workspace, epoch, people, presenters, locks, habitat
    case selfId = "self"
  }
}
public struct Invitation: Decodable, Identifiable {
  public let id: String
  public let kind: String
  public let fromName: String
  public let expires: Double
}
public struct DrawingRect: Codable, Equatable {
  public let x: Double
  public let y: Double
  public let w: Double
  public let h: Double
  public let color: UInt32
  public let alpha: Double?
  public init(x: Double, y: Double, w: Double, h: Double, color: UInt32, alpha: Double? = nil) {
    self.x = x
    self.y = y
    self.w = w
    self.h = h
    self.color = color
    self.alpha = alpha
  }
}
public struct SceneManifest: Decodable {
  public let version: Int
  public let mapId: String
  public let revision: Int
  public let width: Double
  public let height: Double
  public let rectangles: [DrawingRect]
  public let animation: MapAnimation?
  public let blocks: [WorldBounds]?
  public let labels: [Label]
  public let zones: [Zone]
  public struct Label: Decodable {
    public let text: String
    public let x: Double
    public let y: Double
    public let size: Double
    public let color: String
  }
  public struct Zone: Decodable, Identifiable {
    public let id: String
    public let name: String
  }
}
public struct AvatarManifest: Decodable {
  public let version: Int
  public let appearance: String
  public let skin: UInt32?
  public let frames: [String: [DrawingRect]]
}
public struct MediaAccess: Decodable {
  public let token: String
  public let url: String
  public let room: String
}
public struct Account: Decodable {
  public let id: String
  public let name: String
  public let email: String
  public let workspaceId: String?
}
public struct Credential: Codable {
  public let token: String
  public let expiresAt: String
  public let cookieName: String
}
public struct APIError: Error, LocalizedError {
  public let status: Int
  public let message: String
  public init(status: Int, message: String) {
    self.status = status
    self.message = message
  }
  public var errorDescription: String? { message }
}
