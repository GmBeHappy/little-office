import LittleOfficeKit
import SwiftUI

@main
struct LittleOfficeApp: App {
  @StateObject private var model = AppModel()
  @AppStorage("officeLanguage") private var language =
    Locale.current.language.languageCode?.identifier == "th" ? "th" : "en"
  @Environment(\.scenePhase) private var phase
  var body: some Scene {
    WindowGroup {
      RootView(model: model)
        .environment(\.locale, Locale(identifier: language))
        .frame(minWidth: 340, minHeight: 500)
        .onChange(of: phase) { _, value in
          if value == .background, model.office?.media.sharing != true,
            model.office?.media.broadcastPending != true
          {
            Task { await model.office?.stop() }
          }
          if value == .active, let office = model.office, !office.connected { office.connect() }
        }
    }
  }
}
