import FirebaseCore
import FirebaseMessaging
import LittleOfficeKit
import SwiftUI
import UserNotifications

private struct PushConfig: Decodable {
  let enabled: Bool
  let firebase: Client?
  struct Client: Decodable { let apiKey, appId, projectId, messagingSenderId: String }
}
private struct PushResult: Decodable { let ok: Bool }
private struct PushScope: Codable, Equatable {
  let user: String
  let origin: String
  let workspace: String
}

// One installation subscribes to one workspace. The socket may stop in the background;
// push remains active until the person disables it, changes workspace, or signs out.
@MainActor
final class OfficePush: NSObject, ObservableObject, MessagingDelegate,
  UNUserNotificationCenterDelegate
{
  static let shared = OfficePush()
  #if os(macOS)
    private let platform = "macos"
  #else
    private let platform = "ios"
  #endif
  private let consentKey = "office.push.scope"
  private var scope: PushScope? {
    didSet {
      if let scope {
        UserDefaults.standard.set(try? JSONEncoder().encode(scope), forKey: consentKey)
      } else {
        UserDefaults.standard.removeObject(forKey: consentKey)
      }
      subscribedWorkspace = scope?.workspace
    }
  }
  private let installation: String
  private var user: String?
  private var api: OfficeAPI?
  private var deviceToken: Data?
  private var removing = false
  private var pendingWrite: Task<Void, Never>?
  private(set) var pendingTap: String?
  var onTap: (() -> Void)?
  @Published private(set) var subscribedWorkspace: String?
  @Published private(set) var busy = false
  @Published private(set) var message: LocalizedStringKey?

  override private init() {
    if let value = UserDefaults.standard.string(forKey: "office.push.installation") {
      installation = value
    } else {
      installation = UUID().uuidString
      UserDefaults.standard.set(installation, forKey: "office.push.installation")
    }
    if let data = UserDefaults.standard.data(forKey: "office.push.scope") {
      scope = try? JSONDecoder().decode(PushScope.self, from: data)
    }
    subscribedWorkspace = scope?.workspace
    super.init()
  }

  func attach(api: OfficeAPI, user: String, workspaces: [Workspace]) {
    self.api = api
    self.user = user
    guard let scope else { return }
    if matchesAccount(scope), workspaces.contains(where: { $0.id == scope.workspace }) {
      Task { await restore(scope) }
    } else {
      clear()
    }
  }

  private func matchesAccount(_ scope: PushScope) -> Bool {
    scope.user == user && scope.origin == api?.origin.absoluteString
  }

  private func configure(_ workspace: String, api: OfficeAPI) async throws {
    let config: PushConfig = try await api.call(
      api.workspacePath(workspace, "/notifications/push-config?platform=" + platform))
    guard config.enabled, let client = config.firebase else {
      throw PushError.unavailable
    }
    if let existing = FirebaseApp.app() {
      guard
        existing.options.googleAppID == client.appId
          && existing.options.projectID == client.projectId
          && existing.options.gcmSenderID == client.messagingSenderId
      else { throw PushError.differentProject }
    } else {
      let options = FirebaseOptions(
        googleAppID: client.appId, gcmSenderID: client.messagingSenderId)
      options.apiKey = client.apiKey
      options.projectID = client.projectId
      FirebaseApp.configure(options: options)
    }
    Messaging.messaging().delegate = self
  }

  private enum PushError: Error { case unavailable, differentProject }

  private func describe(_ error: Error) {
    if let pushError = error as? PushError {
      switch pushError {
      case .unavailable: message = "System notifications aren’t configured for this workspace."
      case .differentProject:
        message = "Restart Little Office to connect this notification service."
      }
    } else {
      message = "Couldn’t connect notifications. Check your connection and try again."
    }
  }

  func enable(_ workspace: String) async {
    guard !busy, let user, let api else { return }
    if let scope, scope.workspace != workspace { await disable() }
    guard scope == nil else { return }
    let desired = PushScope(user: user, origin: api.origin.absoluteString, workspace: workspace)
    busy = true
    defer { busy = false }
    message = nil
    do {
      try await configure(workspace, api: api)
      guard matchesAccount(desired) else { return }
      guard
        try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
      else {
        message = "Allow notifications for Little Office in system settings."
        return
      }
      guard matchesAccount(desired) else { return }
      scope = desired
      register()
    } catch { describe(error) }
  }

  func becameActive() {
    guard let scope, matchesAccount(scope), !busy else { return }
    Task { await restore(scope) }
  }

  private func restore(_ desired: PushScope) async {
    guard let api, matchesAccount(desired), scope == desired else { return }
    do {
      let settings = await UNUserNotificationCenter.current().notificationSettings()
      guard scope == desired else { return }
      guard [.authorized, .provisional].contains(settings.authorizationStatus) else {
        await disable()
        return
      }
      try await configure(desired.workspace, api: api)
      guard scope == desired, matchesAccount(desired) else { return }
      register()
    } catch { if scope == desired { describe(error) } }
  }

  private func register() {
    message = "Connecting system notifications…"
    #if os(macOS)
      NSApplication.shared.registerForRemoteNotifications()
    #else
      UIApplication.shared.registerForRemoteNotifications()
    #endif
  }

  func receivedAPNs(_ data: Data) {
    guard FirebaseApp.app() != nil, let scope, matchesAccount(scope) else { return }
    deviceToken = data
    Messaging.messaging().apnsToken = data
    Task {
      do {
        // The shared send endpoint targets message.token. register() yields an FID,
        // not the FCM registration token used by web, Android and this endpoint.
        let token = try await Messaging.messaging().token()
        if self.scope == scope { submit(token) }
      } catch { if self.scope == scope { describe(error) } }
    }
  }

  func failedAPNs() {
    guard scope != nil else { return }
    message = "Couldn’t register this device for notifications. Try again on a signed device build."
  }

  nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken token: String?) {
    guard let token else { return }
    Task { @MainActor in self.submit(token) }
  }

  private func submit(_ token: String) {
    guard !removing, deviceToken != nil, !token.isEmpty, let api, let scope, matchesAccount(scope)
    else { return }
    let previous = pendingWrite
    pendingWrite = Task {
      await previous?.value
      guard self.scope == scope, self.matchesAccount(scope) else { return }
      do {
        let language =
          UserDefaults.standard.string(forKey: "officeLanguage")
          ?? Locale.current.language.languageCode?.identifier
        let _: PushResult = try await api.call(
          api.workspacePath(scope.workspace, "/notifications/push-device"),
          method: "PUT",
          body: [
            "installationId": installation, "token": token, "platform": platform,
            "locale": language == "th" ? "th" : "en",
          ])
        if self.scope == scope { message = nil }
      } catch { if self.scope == scope { describe(error) } }
    }
  }

  func disable() async {
    guard !removing, let scope, let api, matchesAccount(scope) else { return }
    busy = true
    removing = true
    defer {
      removing = false
      busy = false
    }
    // Do not remove local consent until the server confirms revocation.
    await pendingWrite?.value
    do {
      let _: PushResult = try await api.call(
        api.workspacePath(scope.workspace, "/notifications/push-device"),
        method: "DELETE", body: ["installationId": installation])
      if self.scope == scope { clear() }
    } catch { describe(error) }
  }

  func leaveSubscription(ifSwitchingTo workspace: String) async {
    guard let scope, scope.workspace != workspace else { return }
    await disable()
  }

  func logout() async {
    await disable()
    clear()
    api = nil
    user = nil
    if FirebaseApp.app() != nil { try? await Messaging.messaging().deleteToken() }
  }

  private func clear() {
    scope = nil
    deviceToken = nil
    pendingTap = nil
    message = nil
    UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    #if os(macOS)
      NSApplication.shared.unregisterForRemoteNotifications()
    #else
      UIApplication.shared.unregisterForRemoteNotifications()
    #endif
  }

  private func workspace(from notification: UNNotification) -> String? {
    guard let scope else { return nil }
    return pushInboxWorkspace(
      payload: notification.request.content.userInfo, recipient: scope.user,
      installation: installation, workspace: scope.workspace)
  }

  func takeTap() -> String? {
    defer { pendingTap = nil }
    guard let scope, matchesAccount(scope), pendingTap == scope.workspace else { return nil }
    return pendingTap
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    workspace(from: notification) == nil ? [] : [.banner, .list, .sound]
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
  ) async {
    guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
      let id = workspace(from: response.notification)
    else { return }
    pendingTap = id
    onTap?()
  }
}

#if os(macOS)
  final class PushAppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
      UNUserNotificationCenter.current().delegate = OfficePush.shared
    }
    func application(
      _ application: NSApplication,
      didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
      OfficePush.shared.receivedAPNs(deviceToken)
    }
    func application(
      _ application: NSApplication, didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
      OfficePush.shared.failedAPNs()
    }
  }
#else
  final class PushAppDelegate: NSObject, UIApplicationDelegate {
    func application(
      _ application: UIApplication,
      didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
      UNUserNotificationCenter.current().delegate = OfficePush.shared
      return true
    }
    func application(
      _ application: UIApplication,
      didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
      OfficePush.shared.receivedAPNs(deviceToken)
    }
    func application(
      _ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
      OfficePush.shared.failedAPNs()
    }
  }
#endif
