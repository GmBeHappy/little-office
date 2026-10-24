import Foundation

public struct Presence: Equatable {
  public let status: String
  public let label: String
  public let icon: String
  public let text: String
  public init(status: String, text: String, icon: String, sharing: Bool, whiteboard: Bool) {
    let activity = sharing || whiteboard
    self.status = activity && status != "dnd" ? "busy" : status
    label =
      sharing && whiteboard
      ? "Sharing screen · Using whiteboard"
      : sharing ? "Sharing screen" : whiteboard ? "Using whiteboard" : Self.labels[status] ?? status
    self.icon =
      sharing
      ? "🖥️"
      : whiteboard
        ? "✏️" : icon.isEmpty ? ["busy": "💻", "dnd": "⛔", "away": "☕"][status] ?? "" : icon
    self.text = activity ? "" : text.trimmingCharacters(in: .whitespacesAndNewlines)
  }
  public static let labels = [
    "available": "Available", "busy": "Busy", "dnd": "Do not disturb", "away": "Away",
  ]
  public static let icons = ["", "💻", "🎧", "📅", "⛔", "☕", "🍽️", "🚶", "🌙", "🚿", "⏳"]
  public static let presets: [(status: String, icon: String, text: String)] = [
    ("busy", "💻", "Making something good…"), ("busy", "📅", "In a meeting"),
    ("dnd", "🎧", "Deep work"), ("dnd", "⛔", "Please do not interrupt"),
    ("away", "⏳", "Back in 10 minutes"), ("away", "🍽️", "Out for lunch"),
    ("away", "☕", "Quick break"), ("away", "🚿", "Showering"),
  ]
}
public struct Appearance: Equatable {
  public var skin: Int
  public var hair: Int
  public var hat: Int
  public var clothes: Int
  public static let presets = ["sage", "plum", "coral", "blue", "gold", "rose"]
  public init(_ value: String) {
    let presets = [
      "sage": [1, 3, 0, 0], "blue": [3, 0, 2, 3], "coral": [2, 2, 0, 1], "gold": [2, 0, 1, 2],
      "plum": [0, 4, 0, 4],
    ]
    let fields = value.split(separator: ":").dropFirst().compactMap { Int($0) }
    let valid =
      value.hasPrefix("custom:") && fields.count == 4 && (0...4).contains(fields[0])
      && fields.dropFirst().allSatisfy { (0...14).contains($0) }
    let chosen = valid ? fields : presets[value] ?? presets["sage"]!
    skin = chosen[0]
    hair = chosen[1]
    hat = chosen[2]
    clothes = chosen[3]
  }
  public var id: String { "custom:\(skin):\(hair):\(hat):\(clothes)" }
  public static let skins = ["Light", "Medium light", "Medium", "Medium deep", "Deep"]
  public static let hairStyles = [
    "Short crop", "Soft curls", "Classic bob", "Spiky hair", "Ponytail", "Buzz cut", "Side part",
    "Long waves", "Twin tails", "Mohawk", "Afro", "Top knot", "Braids", "Undercut", "Shaggy hair",
  ]
  public static let hats = [
    "No hat", "Cap", "Beanie", "Sun hat", "Headphones", "Crown", "Bucket hat", "Beret",
    "Cowboy hat", "Wizard hat", "Party hat", "Cat ears", "Flower crown", "Headband", "Halo",
  ]
  public static let outfits = [
    "Forest hoodie", "Denim overalls", "Golden jacket", "Ocean shirt", "Lilac sweater",
    "Red varsity jacket", "White lab coat", "Navy suit", "Sakura kimono", "Space suit",
    "Beach shirt", "Thai silk shirt", "Camping vest", "Black turtleneck", "Rainbow tee",
  ]
}
