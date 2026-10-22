import LittleOfficeKit
import SwiftUI

@main
struct LittleOfficeApp: App {
  @StateObject private var model = AppModel()
  @Environment(\.scenePhase) private var phase
  var body: some Scene {
    WindowGroup {
      RootView(model: model)
        .frame(minWidth: 340, minHeight: 500)
        .onChange(of: phase) { _, value in
          if value == .background { Task { await model.office?.stop() } }
          if value == .active, let office = model.office, !office.connected { office.connect() }
        }
    }
  }
}
