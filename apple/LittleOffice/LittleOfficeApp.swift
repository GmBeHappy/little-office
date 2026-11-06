import CoreText
import LittleOfficeKit
import SwiftUI

@main
struct LittleOfficeApp: App {
  #if os(macOS)
    @NSApplicationDelegateAdaptor(PushAppDelegate.self) private var pushDelegate
  #else
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var pushDelegate
  #endif
  @StateObject private var model = AppModel()
  @AppStorage("officeLanguage") private var language =
    Locale.current.language.languageCode?.identifier == "th" ? "th" : "en"
  @Environment(\.scenePhase) private var phase
  init() {
    for weight in [400, 500, 600, 700] {
      if let url = Bundle.main.url(forResource: String(weight), withExtension: "ttf", subdirectory: "ibm-plex-sans-thai") {
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
      }
    }
  }
  var body: some Scene {
    WindowGroup {
      RootView(model: model)
        .officeFont(.body)
        .environment(\.locale, Locale(identifier: language))
        .frame(minWidth: 340, minHeight: 500)
        .onChange(of: phase) { _, value in
          if value == .background, model.office?.media.sharing != true,
            model.office?.media.broadcastPending != true
          {
            Task { await model.office?.stop() }
          }
          if value == .active { OfficePush.shared.becameActive() }
          if value == .active, let office = model.office, !office.connected { office.connect() }
        }
    }
  }
}
