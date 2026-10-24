import LittleOfficeKit
import SwiftUI

struct WorkspaceSecurityView: View {
  let api: OfficeAPI
  let workspace: Workspace
  @Environment(\.openURL) private var openURL
  @State private var state: OIDCState?
  @State private var issuer = ""
  @State private var clientId = ""
  @State private var secret = ""
  @State private var domain = ""
  @State private var busy = false
  @State private var error = ""
  private var path: String { api.workspacePath(workspace.id, "/oidc") }
  var body: some View {
    Form {
      if let state {
        if state.canConfigure {
          Section("Organization sign-in") {
            TextField("Issuer HTTPS URL", text: $issuer).autocorrectionDisabled()
            TextField("Client ID", text: $clientId).autocorrectionDisabled()
            SecureField(
              state.connection?.hasClientSecret == true
                ? "New secret (blank keeps existing)" : "Client secret", text: $secret)
            TextField("Organization email domain", text: $domain).autocorrectionDisabled()
            Button("Save disabled connection") {
              run {
                let _: OIDCConnection = try await api.call(
                  path, method: "PUT",
                  body: OIDCInput.body(
                    issuer: issuer, clientId: clientId, domain: domain, clientSecret: secret))
                secret = ""
                try await refresh()
              }
            }
            Text(
              "Saving changes disables SSO and ends existing SSO sessions. Members need a personal recovery login before the provider identity can change."
            ).font(.caption)
          }
          if let connection = state.connection {
            Section("Verify domain") {
              if let redirect = connection.redirectURI {
                LabeledContent("Callback", value: redirect).textSelection(.enabled)
              }
              if let name = connection.dnsName {
                LabeledContent("TXT name", value: name).textSelection(.enabled)
              }
              if let value = connection.dnsValue {
                LabeledContent("TXT value", value: value).textSelection(.enabled)
              }
              Label(
                connection.verified == true ? "Domain verified" : "Verification required",
                systemImage: connection.verified == true ? "checkmark.seal" : "clock")
              Button("Verify DNS record") {
                run {
                  let _: OIDCConnection = try await api.call(
                    path + "/verify", method: "POST", body: [:])
                  try await refresh()
                }
              }
              Button(connection.enabled ? "Disable SSO" : "Verify and enable SSO") {
                run {
                  let _: OIDCConnection = try await api.call(
                    path, method: "PATCH", body: ["enabled": !connection.enabled])
                  try await refresh()
                }
              }
            }
          }
        } else {
          Text("Use the owner's personal account to configure organization sign-in.")
        }
        Section("Personal account & recovery") {
          Text(
            state.linked
              ? "Organization login connected."
              : "Organization login is not connected to this account.")
          Button("Open secure account linking") {
            openURL(
              URL(string: "/workspaces?workspace=\(workspace.id)", relativeTo: api.origin)!
                .absoluteURL)
          }
          Text(
            "Sign in in your browser to link your organization login or add a personal recovery login. If a change requires recent authentication, sign in again from the workspace switcher, then retry."
          ).font(.caption)
        }
      } else {
        ProgressView()
      }
      if !error.isEmpty { Text(error).foregroundStyle(.red) }
    }.formStyle(.grouped).navigationTitle("Organization SSO").disabled(busy)
      .task { run { try await refresh() } }
  }
  private func refresh() async throws {
    let response: OIDCState = try await api.call(path)
    state = response
    issuer = response.connection?.issuer ?? ""
    clientId = response.connection?.clientId ?? ""
    domain = response.connection?.domain ?? ""
    secret = ""
  }
  private func run(_ operation: @escaping () async throws -> Void) {
    busy = true
    error = ""
    Task {
      defer { busy = false }
      do { try await operation() } catch { self.error = error.localizedDescription }
    }
  }
}
private struct OIDCState: Decodable {
  let connection: OIDCConnection?
  let linked: Bool
  let canConfigure: Bool
  let canLink: Bool
}
private struct OIDCConnection: Decodable {
  let enabled: Bool
  let domain: String
  let issuer: String?
  let clientId: String?
  let hasClientSecret: Bool?
  let verified: Bool?
  let redirectURI: String?
  let dnsName: String?
  let dnsValue: String?
}
struct WorkspaceActivityView: View {
  let api: OfficeAPI
  let workspace: Workspace
  @State private var action = ""
  @State private var entries: [ActivityEntry] = []
  @State private var mapNames: [String: String] = [:]
  @State private var cursor: String?
  @State private var busy = false
  @State private var error = ""
  private let actions = [
    "office.join", "office.leave", "screen.start", "screen.stop", "nudge", "member.role",
  ]
  var body: some View {
    List {
      Picker("Filter", selection: $action) {
        Text("All activity").tag("")
        ForEach(actions, id: \.self) { Text(LocalizedStringKey(activityLabel($0))).tag($0) }
      }
      ForEach(entries) { entry in
        VStack(alignment: .leading, spacing: 4) {
          Text(entry.actorName).fontWeight(.medium)
          Text(LocalizedStringKey(activityLabel(entry.action)))
          if let target = entry.targetName { Text(target).font(.caption) }
          if let from = entry.details?["from"], let to = entry.details?["to"],
            entry.action == "member.role"
          {
            HStack {
              Text(LocalizedStringKey(from.capitalized))
              Text("→")
              Text(LocalizedStringKey(to.capitalized))
            }.font(.caption)
          }
          if let map = entry.details?["mapId"], let name = mapNames[map] {
            Text(LocalizedStringKey(name)).font(.caption)
          }
          if let date = entry.date {
            Text(date, format: .dateTime.year().month().day().hour().minute()).font(.caption)
              .foregroundStyle(.secondary)
          }
        }
      }
      if cursor != nil {
        Button("Load older activity") { Task { await load(reset: false) } }.disabled(busy)
      }
      if busy { ProgressView() }
      if !error.isEmpty { Text(error).foregroundStyle(.red) }
    }.navigationTitle("Activity log").task(id: action) { await load(reset: true) }
  }
  private func load(reset: Bool) async {
    busy = true
    error = ""
    defer { busy = false }
    let selected = action
    var query = URLComponents()
    query.queryItems = [URLQueryItem(name: "action", value: selected)]
    if !reset, let cursor { query.queryItems?.append(URLQueryItem(name: "before", value: cursor)) }
    do {
      if mapNames.isEmpty {
        let catalog: ActivityMapCatalog = try await api.call("/api/saas/config")
        mapNames = Dictionary(
          uniqueKeysWithValues: (catalog.allMaps ?? catalog.maps).map { ($0.id, $0.name) })
      }
      let page: ActivityPage = try await api.call(
        api.workspacePath(workspace.id, "/admin/activity?\(query.percentEncodedQuery ?? "")"))
      guard !Task.isCancelled, selected == action else { return }
      entries = reset ? page.entries : entries + page.entries
      cursor = page.nextCursor
    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
  }
}
private func activityLabel(_ action: String) -> String {
  [
    "office.join": "Joined the office", "office.leave": "Left the office",
    "screen.start": "Started screen sharing", "screen.stop": "Stopped screen sharing",
    "nudge": "Nudged a teammate", "member.role": "Changed a member's role",
  ][action] ?? "Account activity"
}
private struct ActivityMapCatalog: Decodable {
  let maps: [Map]
  let allMaps: [Map]?
  struct Map: Decodable {
    let id: String
    let name: String
  }
}
private struct ActivityPage: Decodable {
  let entries: [ActivityEntry]
  let nextCursor: String?
}
private struct ActivityEntry: Decodable, Identifiable {
  let id: String
  let actorName: String
  let action: String
  let targetName: String?
  let createdAt: String
  let details: [String: String]?
  var date: Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: createdAt) ?? ISO8601DateFormatter().date(from: createdAt)
  }
}
struct StorageSettingsView: View {
  let api: OfficeAPI
  @State private var storage: StorageInfo?
  @State private var message = ""
  @State private var busy = false
  var body: some View {
    Form {
      if let storage {
        LabeledContent("Storage", value: storage.configured ? "Configured" : "Not configured")
        LabeledContent("Provider", value: storage.provider)
        LabeledContent("Endpoint", value: storage.endpoint)
        LabeledContent("Bucket", value: storage.bucket)
        Button("Check upload, read and delete") {
          busy = true
          Task {
            defer { busy = false }
            do {
              let _: [String: Bool] = try await api.call(
                "/api/admin/storage/check", method: "POST", body: [:])
              message = "Storage check passed."
            } catch { message = error.localizedDescription }
          }
        }.disabled(busy || !storage.configured)
      }
      if !message.isEmpty { Text(message) }
    }.formStyle(.grouped).navigationTitle("Storage")
      .task {
        do { storage = try await api.call("/api/admin/storage") } catch {
          message = error.localizedDescription
        }
      }
  }
}
private struct StorageInfo: Decodable {
  let configured: Bool
  let provider: String
  let endpoint: String
  let bucket: String
}

// Global operator actions deliberately use canonical /api/admin routes. Tenant roles do not grant access.
struct OperatorSettingsView: View {
  let api: OfficeAPI
  @State private var users: [OperatorUser] = []
  @State private var actor = ""
  @State private var allowed = false
  @State private var passwordEnabled = true
  @State private var sso = false
  @State private var ssoConfigured = false
  @State private var username = ""
  @State private var name = ""
  @State private var password = ""
  @State private var resetUser: OperatorUser?
  @State private var pending: OperatorAction?
  @State private var busy = false
  @State private var error = ""
  var body: some View {
    Form {
      if allowed {
        Section("Login methods") {
          Toggle("Password login", isOn: $passwordEnabled)
          Toggle("Organization SSO", isOn: $sso).disabled(!ssoConfigured)
          Button("Save login methods") {
            pending = OperatorAction(
              title: "Change login methods?",
              message:
                "Sessions using a disabled method will end. The server checks that an owner can still sign in.",
              path: "/api/admin/auth", method: "PATCH",
              body: ["password": passwordEnabled, "sso": sso])
          }.disabled(!passwordEnabled && !sso)
        }
        Section("Create local account") {
          TextField("Username", text: $username).autocorrectionDisabled()
          TextField("Name", text: $name)
          SecureField("Temporary password (12–128 characters)", text: $password)
          Button("Create account") {
            pending = OperatorAction(
              title: "Create local account?",
              message: "The new member must change this temporary password when they sign in.",
              path: "/api/admin/users", method: "POST",
              body: ["username": username, "name": name, "password": password])
          }.disabled(
            !passwordEnabled || !validPassword || name.isEmpty || name.count > 40
              || username.range(of: "^[a-zA-Z0-9_]{3,30}$", options: .regularExpression) == nil)
        }
        Section("All accounts") {
          ForEach(users) { user in
            HStack {
              VStack(alignment: .leading) {
                Text(user.name)
                Text(
                  [
                    user.username ?? "SSO", user.role,
                    user.approved ? "Approved" : "Disabled / pending",
                  ].joined(separator: " · ")
                ).font(.caption).foregroundStyle(.secondary)
              }
              Spacer()
              Menu("Manage") {
                if user.canChangeApproval(actor: actor) {
                  Button(user.approved ? "Disable account" : "Approve account") {
                    pending = OperatorAction(
                      title: user.approved ? "Disable account?" : "Approve account?",
                      message: user.approved
                        ? "This ends all sessions for \(user.name)."
                        : "Allow \(user.name) to sign in.", path: "/api/admin/users/\(user.id)",
                      method: "PATCH", body: ["approved": !user.approved])
                  }
                }
                if user.canChangeRole(actor: actor) {
                  Button(user.role == "owner" ? "Make member" : "Make owner") {
                    pending = OperatorAction(
                      title: "Change global account role?",
                      message: "This changes \(user.name)'s role across the operator system.",
                      path: "/api/admin/users/\(user.id)/role", method: "PATCH",
                      body: ["role": user.role == "owner" ? "member" : "owner"])
                  }
                }
                if user.canResetPassword(passwordEnabled: passwordEnabled) {
                  Button("Reset password") {
                    password = ""
                    resetUser = user
                  }
                }
                if user.canDelete(actor: actor) {
                  Button("Delete account", role: .destructive) {
                    pending = OperatorAction(
                      title: "Permanently delete account?",
                      message:
                        "Delete \(user.name) and end all their sessions. This cannot be undone.",
                      path: "/api/admin/users/\(user.id)", method: "DELETE", body: nil)
                  }
                }
              }
            }
          }
        }
        NavigationLink("Storage") { StorageSettingsView(api: api) }
        Text(
          "Sensitive changes require a recent personal sign-in. If requested, sign in again from the workspace switcher and retry."
        ).font(.caption)
      } else if busy {
        ProgressView()
      }
      if !error.isEmpty { Text(error).foregroundStyle(.red) }
    }.formStyle(.grouped).navigationTitle("System administration").disabled(busy)
      .task { await load() }
      .alert(item: $pending) { action in
        Alert(
          title: Text(action.title), message: Text(action.message),
          primaryButton: .destructive(Text("Confirm"), action: { Task { await perform(action) } }),
          secondaryButton: .cancel { password = "" })
      }
      .sheet(item: $resetUser) { user in
        NavigationStack {
          Form {
            Text("Reset password for \(user.name)")
            SecureField("Temporary password (12–128 characters)", text: $password)
            Text("This ends their sessions and requires a password change at next sign-in.")
            Button("Reset password", role: .destructive) {
              let action = OperatorAction(
                title: "Reset password", message: "", path: "/api/admin/reset-password",
                method: "POST", body: ["userId": user.id, "password": password])
              resetUser = nil
              Task { await perform(action) }
            }.disabled(!validPassword)
          }.formStyle(.grouped).navigationTitle("Reset password")
            .toolbar {
              Button("Cancel") {
                resetUser = nil
                password = ""
              }
            }
        }.frame(minWidth: 340, minHeight: 280).onDisappear { password = "" }
      }
      .onDisappear {
        password = ""
        pending = nil
      }
  }
  private var validPassword: Bool { (12...128).contains(password.count) }
  private func load() async {
    busy = true
    error = ""
    defer { busy = false }
    do {
      let account: Account = try await api.call("/api/account")
      let profile: ProfileResponse = try await api.call("/api/me")
      guard account.workspaceId == nil, profile.operator == true else {
        allowed = false
        error = "Use an operator's personal account on the main server."
        return
      }
      actor = account.id
      let config: OperatorConfig = try await api.call("/api/config")
      users = try await api.call("/api/admin/users")
      passwordEnabled = config.password
      sso = config.sso
      ssoConfigured = config.ssoConfigured
      allowed = true
    } catch {
      allowed = false
      self.error = error.localizedDescription
    }
  }
  private func perform(_ action: OperatorAction) async {
    guard allowed, !busy else { return }
    busy = true
    password = ""
    error = ""
    do {
      let _: OperatorMutation = try await api.call(
        action.path, method: action.method, body: action.body)
      username = ""
      name = ""
      await load()
    } catch { self.error = error.localizedDescription }
    busy = false
  }
}
private struct OperatorConfig: Decodable {
  let password: Bool
  let sso: Bool
  let ssoConfigured: Bool
}
private struct OperatorMutation: Decodable { let ok: Bool }
private struct OperatorAction: Identifiable {
  let id = UUID()
  let title: String
  let message: String
  let path: String
  let method: String
  let body: [String: Any]?
}
