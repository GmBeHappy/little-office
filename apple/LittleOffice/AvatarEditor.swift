import LittleOfficeKit
import SwiftUI

struct AvatarEditor: View {
  let office: WorkspaceSession
  @Binding var avatar: String
  let editable: Bool
  @State private var category: Category = .skin
  @State private var facing = 0
  @State private var cache = AvatarPreviews()
  private let directions = ["down", "left", "up", "right"]
  private let sage = Color(red: 0.39, green: 0.47, blue: 0.34)
  private var appearance: Appearance { Appearance(avatar) }

  private enum Category: String, CaseIterable {
    case skin = "Skin tone"
    case hair = "Hair"
    case hat = "Hat"
    case clothes = "Clothes"
    case presets = "Presets"
  }

  var body: some View {
    VStack(spacing: 12) {
      thumbnail(avatar, direction: directions[facing], retry: true)
        .frame(width: 116, height: 128)
        .frame(maxWidth: .infinity)
        .background(sage.opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
      HStack {
        Button("Rotate preview", systemImage: "rotate.right") {
          facing = (facing + 1) % directions.count
        }
        if editable {
          Button("Randomize", systemImage: "dice") {
            var next = appearance
            next.skin = Int.random(in: Appearance.skins.indices)
            next.hair = Int.random(in: Appearance.hairStyles.indices)
            next.hat = Int.random(in: Appearance.hats.indices)
            next.clothes = Int.random(in: Appearance.outfits.indices)
            if next.id == avatar { next.hair = (next.hair + 1) % Appearance.hairStyles.count }
            avatar = next.id
          }
        }
      }.buttonStyle(.bordered)
      if editable {
        ScrollView(.horizontal) {
          HStack(spacing: 6) {
            ForEach(Category.allCases, id: \.self) { tab in
              Button {
                category = tab
              } label: {
                Text(LocalizedStringKey(tab.rawValue)).officeFont(.caption, weight: .semibold)
                  .padding(.horizontal, 12).frame(minHeight: 38)
                  .background(category == tab ? sage.opacity(0.22) : .clear, in: Capsule())
              }
              .accessibilityAddTraits(category == tab ? .isSelected : [])
            }
          }
        }.scrollIndicators(.hidden)
        switch category {
        case .skin: swatches
        case .hair: carousel(Appearance.hairStyles, key: \.hair)
        case .hat: carousel(Appearance.hats, key: \.hat)
        case .clothes: carousel(Appearance.outfits, key: \.clothes)
        case .presets:
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 74))]) {
            ForEach(Appearance.presets, id: \.self) { id in
              choice(
                id, title: Appearance.presetNames[id] ?? id.capitalized, selected: avatar == id
              ) { avatar = id }
            }
          }
        }
      }
    }.buttonStyle(.plain)
  }

  private var swatches: some View {
    let colors = [0xf5d7bf, 0xe7b18d, 0xc98d65, 0x975e43, 0x5b372b]
    return LazyVGrid(columns: [GridItem(.adaptive(minimum: 46))]) {
      ForEach(colors.indices, id: \.self) { i in
        let rgb = colors[i]
        Button {
          var next = appearance
          next.skin = i
          avatar = next.id
        } label: {
          Circle()
            .fill(
              Color(
                red: Double(rgb >> 16) / 255, green: Double((rgb >> 8) & 255) / 255,
                blue: Double(rgb & 255) / 255)
            )
            .frame(width: 32, height: 32)
            .overlay {
              if appearance.skin == i {
                Image(systemName: "checkmark").foregroundStyle(i < 2 ? Color.black : Color.white)
              }
            }
            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
        }
        .accessibilityLabel(Text(LocalizedStringKey(Appearance.skins[i])))
        .accessibilityAddTraits(appearance.skin == i ? .isSelected : [])
      }
    }
  }

  private func carousel(_ options: [String], key: WritableKeyPath<Appearance, Int>) -> some View {
    let selected = appearance[keyPath: key]
    let indices = [-1, 0, 1].map { (selected + $0 + options.count) % options.count }
    func select(_ i: Int) {
      var next = appearance
      next[keyPath: key] = i
      avatar = next.id
    }
    return HStack(spacing: 3) {
      Button {
        select(indices[0])
      } label: {
        Image(systemName: "chevron.left").frame(width: 44, height: 48)
      }
      .accessibilityLabel("Previous option")
      ForEach(indices, id: \.self) { i in
        var candidate: Appearance {
          var result = appearance
          result[keyPath: key] = i
          if category == .hair { result.hat = 0 }
          return result
        }
        choice(candidate.id, title: options[i], selected: selected == i) { select(i) }
      }
      Button {
        select(indices[2])
      } label: {
        Image(systemName: "chevron.right").frame(width: 44, height: 48)
      }
      .accessibilityLabel("Next option")
    }
  }

  private func choice(_ id: String, title: String, selected: Bool, action: @escaping () -> Void)
    -> some View
  {
    Button(action: action) {
      VStack(spacing: 2) {
        thumbnail(id).frame(width: 54, height: 60)
        Text(LocalizedStringKey(title)).officeFont(.caption2).lineLimit(2).multilineTextAlignment(
          .center)
      }
      .frame(maxWidth: .infinity, minHeight: 88)
      .background(sage.opacity(selected ? 0.2 : 0.06), in: RoundedRectangle(cornerRadius: 10))
      .overlay(alignment: .topTrailing) {
        if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(sage).padding(3) }
      }
    }.accessibilityLabel(Text(LocalizedStringKey(title))).accessibilityAddTraits(
      selected ? .isSelected : [])
  }

  private func thumbnail(_ id: String, direction: String = "down", retry: Bool = false) -> some View
  {
    AvatarThumbnail(office: office, cache: cache, id: id, direction: direction, allowRetry: retry)
  }
}

// Scope cached artwork to the current editor/workspace and coalesce identical preview requests.
@MainActor
private final class AvatarPreviews {
  private final class Cached {
    let frames: [String: [DrawingRect]]
    init(_ frames: [String: [DrawingRect]]) { self.frames = frames }
  }
  private let cache = NSCache<NSString, Cached>()
  private var loading: [String: Task<[String: [DrawingRect]], Error>] = [:]
  init() { cache.countLimit = 48 }
  func frames(_ id: String, office: WorkspaceSession) async throws -> [String: [DrawingRect]] {
    if let frames = office.avatars[id]?.frames { return frames }
    if let entry = cache.object(forKey: id as NSString) { return entry.frames }
    if let task = loading[id] { return try await task.value }
    let task = Task {
      let manifest: AvatarManifest = try await office.api.call(
        office.api.workspacePath(office.workspace.id, "/avatar?appearance=\(id)&preview=1"))
      // Older servers return the complete animation atlas; keep only the editor frames.
      return manifest.frames.filter { $0.key.hasSuffix("-stand-0") }
    }
    loading[id] = task
    defer { loading[id] = nil }
    let frames = try await task.value
    cache.setObject(Cached(frames), forKey: id as NSString)
    return frames
  }
}

private struct AvatarThumbnail: View {
  let office: WorkspaceSession
  let cache: AvatarPreviews
  let id: String
  let direction: String
  let allowRetry: Bool
  @State private var frames: [String: [DrawingRect]] = [:]
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    Group {
      if let rects = frames["\(direction)-stand-0"] {
        AvatarPreview(rectangles: rects)
      } else if failed {
        if allowRetry {
          Button("Retry preview") { attempt += 1 }
        } else {
          Image(systemName: "exclamationmark.triangle").accessibilityLabel("Preview unavailable")
        }
      } else {
        ProgressView().controlSize(.small)
      }
    }
    .task(id: "\(id)/\(attempt)") {
      frames = [:]
      failed = false
      do {
        let result = try await cache.frames(id, office: office)
        guard !Task.isCancelled else { return }
        frames = result
        failed = result.isEmpty
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}
