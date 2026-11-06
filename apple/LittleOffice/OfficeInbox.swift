import LittleOfficeKit
import SwiftUI

private struct InboxPage: Decodable {
  let items: [InboxEntry]
  let unreadCount: Int
  let nextCursor: Int?
}

struct InboxEntry: Decodable, Identifiable {
  let id: Int
  let kind: String
  let actorName: String
  let createdAt: String
  let readAt: String?

  var message: Text {
    switch kind {
    case "summon": Text("\(actorName) summoned you")
    case "call": Text("\(actorName) invited you to a call")
    case "wave": Text("\(actorName) waved at you")
    default: Text("\(actorName) nudged you")
    }
  }
}

@MainActor
final class OfficeInbox: ObservableObject {
  @Published private(set) var items: [InboxEntry] = []
  @Published private(set) var unreadCount = 0
  @Published private(set) var nextCursor: Int?
  @Published private(set) var loading = false
  @Published private(set) var error = ""
  private let path: String
  private let api: OfficeAPI
  private var generation = 0

  init(workspaceId: String, api: OfficeAPI) {
    self.api = api
    self.path = api.workspacePath(workspaceId, "/notifications")
  }

  func load(more: Bool = false) async {
    if more && (loading || nextCursor == nil) { return }
    let cursor = more ? nextCursor : nil
    generation += 1
    let request = generation
    loading = true
    defer { if generation == request { loading = false } }
    do {
      let page: InboxPage = try await api.call(path + (cursor.map { "?before=\($0)" } ?? ""))
      guard generation == request else { return }
      items = more ? items + page.items : page.items
      unreadCount = page.unreadCount
      nextCursor = page.nextCursor
      error = ""
    } catch {
      if generation == request { self.error = error.localizedDescription }
    }
  }

  func markRead(_ id: Int? = nil) async {
    struct Result: Decodable { let ok: Bool }
    do {
      let _: Result = try await api.call(path + (id.map { "/\($0)/read" } ?? "/read-all"), method: "POST")
      await load()
    } catch { self.error = error.localizedDescription }
  }
}

struct InboxButton: View {
  @ObservedObject var inbox: OfficeInbox
  let open: () -> Void
  var body: some View {
    Button(action: open) {
      Image(systemName: "bell").frame(minWidth: 36, minHeight: 44)
        .overlay(alignment: .topTrailing) {
          if inbox.unreadCount > 0 {
            Text(verbatim: inbox.unreadCount > 99 ? "99+" : "\(inbox.unreadCount)")
              .officeFont(.caption2, weight: .bold).monospacedDigit().foregroundStyle(.white)
              .padding(.horizontal, 3).frame(minWidth: 16, minHeight: 16)
              .background(.red, in: Capsule()).offset(x: 4).allowsHitTesting(false)
          }
        }
        .contentShape(Rectangle())
    }
    .accessibilityLabel("Notifications").accessibilityValue(Text("\(inbox.unreadCount) unread"))
  }
}

struct InboxPanel: View {
  @ObservedObject var inbox: OfficeInbox
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        if !inbox.error.isEmpty {
          Text(verbatim: inbox.error)
          Button("Try again") { Task { await inbox.load() } }
        }
        if inbox.loading && inbox.items.isEmpty { ProgressView() }
        if inbox.items.isEmpty && !inbox.loading && inbox.error.isEmpty {
          Text("No notifications yet").foregroundStyle(.secondary)
        }
        ForEach(inbox.items) { item in
          Button {
            if item.readAt == nil { Task { await inbox.markRead(item.id) } }
          } label: {
            HStack {
              Circle().fill(item.readAt == nil ? Color.red : .clear).frame(width: 7, height: 7)
              VStack(alignment: .leading, spacing: 4) {
                item.message.officeFont(.body, weight: item.readAt == nil ? .semibold : .regular)
                if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(item.createdAt) {
                  Text(date, style: .relative).officeFont(.caption).foregroundStyle(.secondary)
                }
              }
              Spacer()
            }.contentShape(Rectangle())
          }.buttonStyle(.plain)
            .accessibilityValue(item.readAt == nil ? Text("Unread") : Text("Read"))
        }
        if inbox.nextCursor != nil { Button("Load more") { Task { await inbox.load(more: true) } }.disabled(inbox.loading) }
      }
      .navigationTitle("Notifications")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
        ToolbarItem(placement: .primaryAction) {
          Button("Mark all read") { Task { await inbox.markRead() } }.disabled(inbox.unreadCount == 0)
        }
      }
    }
    .task { await inbox.load() }
    #if os(macOS)
      .frame(minWidth: 380, minHeight: 420)
    #endif
  }
}
