import LittleOfficeKit
import SwiftUI

struct ProfileResponse: Decodable {
  let user: Profile
  let method: String?
  let `operator`: Bool?
  struct Profile: Decodable {
    let name: String
    let avatar: String
    let role: String
    let availability: String
    let statusText: String
    let statusIcon: String?
  }
}
struct ProfileSettings: View {
  @ObservedObject var office: WorkspaceSession
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var avatar = "sage"
  @State private var status = "available"
  @State private var statusText = ""
  @State private var statusIcon = ""
  @State private var personal = false
  @State private var loaded = false
  @State private var busy = false
  @State private var error = ""
  var body: some View {
    NavigationStack {
      Form {
        Section("Profile") {
          TextField("Your name", text: $name).disabled(!personal)
        }
        Section("Appearance") {
          if loaded {
            AvatarEditor(office: office, avatar: $avatar, editable: personal)
            if !personal {
              Text("Sign in with your personal account to change your name or avatar.").officeFont(.caption)
              Link("Open personal profile", destination: office.api.origin.appendingPathComponent("profile")
                .appending(queryItems: [URLQueryItem(name: "workspace", value: office.workspace.id)]))
            }
          } else if error.isEmpty { ProgressView() }
        }
        Section("Status") {
          Picker("Availability", selection: $status) {
            ForEach(["available", "busy", "dnd", "away"], id: \.self) {
              Text(Presence.labels[$0] ?? $0).tag($0)
            }
          }
          TextField("What are you doing?", text: $statusText)
            .onChange(of: statusText) { _, value in statusText = String(value.prefix(80)) }
          Picker("Icon", selection: $statusIcon) {
            ForEach(Presence.icons, id: \.self) { Text($0.isEmpty ? "Automatic" : $0).tag($0) }
          }
          ForEach(Array(Presence.presets.enumerated()), id: \.offset) { _, preset in
            Button("\(preset.icon) \(preset.text)") {
              status = preset.status
              statusIcon = preset.icon
              statusText = preset.text
            }
          }
        }
        if !error.isEmpty { Text(error).foregroundStyle(.red) }
      }.formStyle(.grouped).disabled(busy)
        .navigationTitle("Profile & status")
        .toolbar {
          Button("Cancel") { dismiss() }
          Button("Save") { Task { await save() } }.disabled(
            busy || name.trimmingCharacters(in: .whitespaces).isEmpty || name.count > 40)
        }
        .task {
          do {
            let account: Account = try await office.api.call("/api/account")
            personal = account.workspaceId == nil
            let response: ProfileResponse = try await office.api.call(
              office.api.workspacePath(office.workspace.id, "/me"))
            name = response.user.name
            avatar = response.user.avatar
            status = response.user.availability
            statusText = response.user.statusText
            statusIcon = response.user.statusIcon ?? ""
            loaded = true
          } catch { self.error = error.localizedDescription }
        }
    }.frame(minWidth: 340, minHeight: 520)
  }
  private func save() async {
    busy = true
    defer { busy = false }
    do {
      let _: [String: Bool] = try await office.api.call(
        office.api.workspacePath(office.workspace.id, "/profile"), method: "PATCH",
        body: [
          "name": name.trimmingCharacters(in: .whitespaces), "avatar": avatar, "status": status,
          "statusText": statusText, "statusIcon": statusIcon,
        ])
      dismiss()
    } catch { self.error = error.localizedDescription }
  }
}
struct AvatarPreview: View {
  let rectangles: [DrawingRect]
  var body: some View {
    Canvas { context, size in
      context.scaleBy(x: size.width / 72, y: size.height / 80)
      for rect in rectangles {
        context.fill(
          Path(CGRect(x: rect.x + 36, y: rect.y + 52, width: rect.w, height: rect.h)),
          with: .color(
            Color(
              red: Double((rect.color >> 16) & 255) / 255,
              green: Double((rect.color >> 8) & 255) / 255, blue: Double(rect.color & 255) / 255)))
      }
    }.accessibilityLabel("Avatar preview")
  }
}
struct DisplaySettings: View {
  @Environment(\.dismiss) private var dismiss
  @AppStorage("nameTagSize") private var size = 10.0
  @AppStorage("nameTagOpacity") private var opacity = 85.0
  @AppStorage("mapMotion") private var motion = true
  @AppStorage("officeLanguage") private var language =
    Locale.current.language.languageCode?.identifier == "th" ? "th" : "en"
  var body: some View {
    NavigationStack {
      Form {
        Section("Display") {
          Slider(value: $size, in: 8...16, step: 1) { Text("Name tag size") }
          Text("Name tag size: \(Int(size))")
          Slider(value: $opacity, in: 0...100, step: 1) { Text("Name tag opacity") }
          Text("Name tag opacity: \(Int(opacity))%")
          Toggle("Animate map", isOn: $motion)
          Text("System Reduce Motion also reduces animation.").officeFont(.caption)
          Picker("Language", selection: $language) {
            Text("English").tag("en")
            Text("ไทย").tag("th")
          }
        }
        Section("Help & shortcuts") {
          Text(
            "WASD / arrow keys: move\nSpace: jump\nZ: nudge nearby\n1: sit · 2: sleep · 3: fish\nTap a teammate to see their actions.\nDrag the map to walk. Release to stop."
          )
        }
      }.formStyle(.grouped).navigationTitle("Display & help").toolbar {
        Button("Done") { dismiss() }
      }
    }.frame(minWidth: 340, minHeight: 450)
  }
}
