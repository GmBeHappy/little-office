import LittleOfficeKit
import SwiftUI

private struct Member: Decodable, Identifiable {
  let id: String
  let name: String
  let email: String
  let role: String
}
private struct PendingInvite: Decodable, Identifiable {
  let id: String
  let email: String
  let role: String
}
private struct Detail: Decodable {
  let name: String
  let mapId: String
  let role: String
  let members: [Member]
  let invitations: [PendingInvite]
}
private struct MapChoice: Decodable, Identifiable {
  let id: String
  let name: String
}
private struct Catalog: Decodable { let maps: [MapChoice] }
private struct InviteResult: Decodable { let url: String }
private struct MutationResult: Decodable { let ok: Bool }
struct CreateWorkspaceView: View {
  let api: OfficeAPI
  let done: () -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var slug = ""
  @State private var error = ""
  @State private var invitation = ""
  @State private var busy = false
  var body: some View {
    NavigationStack {
      Form {
        Section("New workspace") {
          TextField("Name", text: $name)
          TextField("Address (lowercase letters and hyphens)", text: $slug).autocorrectionDisabled()
          Button("Create workspace") {
            Task {
              await run {
                let _: Workspace = try await api.call(
                  "/api/workspaces", method: "POST",
                  body: ["name": name, "slug": slug, "mapId": "nature-small"])
                done()
              }
            }
          }.disabled(busy)
        }
        Section("Join a workspace") {
          TextField("Paste invitation link", text: $invitation).autocorrectionDisabled()
          Button("Accept invitation") {
            Task {
              await run {
                let fragment = URL(string: invitation)?.fragment ?? ""
                let token =
                  fragment.hasPrefix("invite=") ? String(fragment.dropFirst(7)) : invitation
                let _: [String: String] = try await api.call(
                  "/api/invitations/accept", method: "POST", body: ["token": token])
                done()
              }
            }
          }.disabled(busy)
        }
        if !error.isEmpty { Text(error).foregroundStyle(.red) }
      }.formStyle(.grouped).navigationTitle("Your workspaces").toolbar {
        Button("Cancel") { dismiss() }
      }
    }.frame(minWidth: 340, minHeight: 400)
  }
  private func run(_ operation: () async throws -> Void) async {
    busy = true
    defer { busy = false }
    do { try await operation() } catch { self.error = error.localizedDescription }
  }
}
struct WorkspaceManagementView: View {
  let api: OfficeAPI
  let workspace: Workspace
  @Environment(\.dismiss) private var dismiss
  @State private var detail: Detail?
  @State private var maps: [MapChoice] = []
  @State private var name = ""
  @State private var mapId = "nature-small"
  @State private var email = ""
  @State private var role = "member"
  @State private var link = ""
  @State private var error = ""
  @State private var busy = false
  var body: some View {
    NavigationStack {
      Form {
        if let detail {
          if detail.role != "member" {
            Section("Workspace") {
              TextField("Name", text: $name)
              Picker("Map", selection: $mapId) { ForEach(maps) { Text($0.name).tag($0.id) } }
              Button("Save workspace") {
                mutate("", method: "PATCH", body: ["name": name, "mapId": mapId])
              }
            }
            Section("Invite a teammate") {
              TextField("Email address", text: $email).autocorrectionDisabled()
              Picker("Role", selection: $role) {
                Text("Member").tag("member")
                if detail.role == "owner" { Text("Admin").tag("admin") }
              }
              Button("Create invitation link") {
                Task {
                  await run {
                    let result: InviteResult = try await api.call(
                      api.workspacePath(workspace.id, "/invitations"), method: "POST",
                      body: ["email": email, "role": role])
                    link = result.url
                    try await refresh()
                  }
                }
              }
              if let url = URL(string: link), !link.isEmpty {
                ShareLink("Share invitation", item: url)
                Text(link).font(.caption).textSelection(.enabled)
              }
            }
          }
          Section("Members") {
            ForEach(detail.members) { member in
              HStack {
                VStack(alignment: .leading) {
                  Text(member.name)
                  Text(member.email).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if detail.role == "owner" {
                  Menu(member.role.capitalized) {
                    ForEach(["owner", "admin", "member"], id: \.self) { newRole in
                      Button(newRole.capitalized) {
                        mutate("/members/\(member.id)", method: "PATCH", body: ["role": newRole])
                      }
                    }
                    Button("Remove member", role: .destructive) {
                      mutate("/members/\(member.id)", method: "DELETE")
                    }
                  }
                } else {
                  Text(member.role.capitalized)
                }
              }
            }
          }
          if !detail.invitations.isEmpty {
            Section("Pending invitations") {
              ForEach(detail.invitations) { invite in
                HStack {
                  Text(invite.email)
                  Spacer()
                  Button("Revoke", role: .destructive) {
                    mutate("/invitations/\(invite.id)", method: "DELETE")
                  }
                }
              }
            }
          }
        } else {
          ProgressView()
        }
        if !error.isEmpty { Text(error).foregroundStyle(.red) }
      }.disabled(busy).formStyle(.grouped).navigationTitle("Manage workspace").toolbar {
        Button("Done") { dismiss() }
      }
      .task {
        await run {
          let catalog: Catalog = try await api.call("/api/saas/config")
          maps = catalog.maps
          try await refresh()
        }
      }
    }.frame(minWidth: 340, minHeight: 500)
  }
  private func refresh() async throws {
    let value: Detail = try await api.call(api.workspacePath(workspace.id, ""))
    detail = value
    name = value.name
    mapId = value.mapId
  }
  private func mutate(_ path: String, method: String, body: [String: Any]? = nil) {
    Task {
      await run {
        let _: MutationResult = try await api.call(
          api.workspacePath(workspace.id, path), method: method, body: body)
        try await refresh()
      }
    }
  }
  private func run(_ operation: () async throws -> Void) async {
    busy = true
    error = ""
    defer { busy = false }
    do { try await operation() } catch { self.error = error.localizedDescription }
  }
}
