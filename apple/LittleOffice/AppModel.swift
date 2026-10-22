import AuthenticationServices
import LittleOfficeKit
import SwiftUI

@MainActor
final class AppModel: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
  @Published var serverAddress =
    UserDefaults.standard.string(forKey: "serverAddress") ?? "http://localhost:3000"
  @Published var account: Account?
  @Published var workspaces: [Workspace] = []
  @Published var office: WorkspaceSession?
  @Published var error = ""
  @Published var busy = false
  private(set) var api: OfficeAPI?
  private var browser: ASWebAuthenticationSession?
  private var selection = UUID()
  override init() {
    super.init()
    Task { await restore() }
  }
  func restore() async {
    do {
      guard let origin = URL(string: serverAddress),
        let credential = CredentialStore.load(origin: origin)
      else { return }
      let client = try OfficeAPI(origin: origin, credential: credential)
      try await load(client)
    } catch { self.error = error.localizedDescription }
  }
  private func load(_ client: OfficeAPI) async throws {
    let account: Account = try await client.call("/api/account")
    let workspaces: [Workspace] = try await client.call("/api/workspaces")
    api = client
    self.account = account
    self.workspaces = workspaces
    UserDefaults.standard.set(client.origin.absoluteString, forKey: "serverAddress")
  }
  func refresh() async {
    guard let api else { return }
    do { try await load(api) } catch { self.error = error.localizedDescription }
  }
  func signIn() {
    guard !busy else { return }
    do {
      guard let origin = URL(string: serverAddress) else {
        throw APIError(status: 0, message: "Enter your server address.")
      }
      let client = try OfficeAPI(origin: origin)
      let pkce = try PKCE()
      let url = URL(
        string: "/native/authorize?challenge=\(pkce.challenge)&state=\(pkce.state)",
        relativeTo: origin)!.absoluteURL
      busy = true
      error = ""
      browser = ASWebAuthenticationSession(url: url, callbackURLScheme: "littleoffice") {
        [weak self] callback, failure in
        Task { @MainActor in
          guard let self else { return }
          defer {
            self.busy = false
            self.browser = nil
          }
          do {
            if let failure { throw failure }
            guard let callback else { throw APIError(status: 0, message: "Sign-in was cancelled.") }
            let credential: Credential = try await client.call(
              "/api/native/exchange", method: "POST",
              body: ["code": try pkce.code(from: callback), "verifier": pkce.verifier])
            try CredentialStore.save(credential, origin: origin)
            try await self.load(OfficeAPI(origin: origin, credential: credential))
          } catch { self.error = error.localizedDescription }
        }
      }
      browser?.presentationContextProvider = self
      if browser?.start() != true {
        busy = false
        error = "Unable to open browser sign-in."
      }
    } catch { self.error = error.localizedDescription }
  }
  func select(_ workspace: Workspace) async {
    guard let api else { return }
    let generation = UUID()
    selection = generation
    let previous = office
    office = nil
    await previous?.stop()
    guard selection == generation else { return }
    let next = WorkspaceSession(workspace: workspace, api: api)
    office = next
    next.connect()
  }
  func leave() async {
    selection = UUID()
    let previous = office
    office = nil
    await previous?.stop()
  }
  func logout() async {
    await leave()
    if let api {
      do {
        let _: [String: Bool] = try await api.call("/api/auth/sign-out", method: "POST", body: [:])
      } catch {
        self.error =
          "Signed out on this device; server sign-out failed: \(error.localizedDescription)"
      }
      CredentialStore.delete(origin: api.origin)
    }
    api = nil
    account = nil
    workspaces = []
  }
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    #if os(macOS)
      return NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first
        ?? ASPresentationAnchor()
    #else
      return UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(
        \.windows
      ).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    #endif
  }
}
