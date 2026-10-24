import LittleOfficeKit
import SwiftUI

private enum OfficeBrand {
  static let cream = Color(red: 247 / 255, green: 247 / 255, blue: 239 / 255)
  static let forest = Color(red: 48 / 255, green: 67 / 255, blue: 55 / 255)
  static let sage = Color(red: 96 / 255, green: 119 / 255, blue: 82 / 255)
}

struct WelcomeView: View {
  @ObservedObject var model: AppModel
  @State private var creating = false
  @State private var choosingAddress = false
  @AppStorage("officeLanguage") private var language = "en"
  var body: some View {
    GeometryReader { geometry in
      let wide = geometry.size.width >= 850
      ZStack {
        OfficeBrand.cream.ignoresSafeArea()
        ScrollView {
          VStack(alignment: .leading, spacing: wide ? 48 : 22) {
            header
            if let account = model.account {
              workspaceChooser(account, wide: wide)
            } else if wide {
              HStack(alignment: .center, spacing: 64) {
                welcomeStory(wide: true).frame(maxWidth: .infinity)
                connectionCard.frame(width: 390)
              }
            } else {
              connectionCard
              WorldPreview(compact: true)
            }
            HStack(spacing: 6) {
              Image(systemName: "leaf")
              Text("Made for being together.")
            }.font(.caption).foregroundStyle(OfficeBrand.forest.opacity(0.55))
              .frame(maxWidth: .infinity).padding(.top, 4)
          }.padding(wide ? 48 : 24).frame(maxWidth: 1180)
            .frame(maxWidth: .infinity)
        }.scrollDismissesKeyboard(.interactively)
      }.disabled(model.busy).foregroundStyle(OfficeBrand.forest).tint(OfficeBrand.sage)
        .sheet(isPresented: $choosingAddress) { ConnectionAddressView(model: model) }
        .sheet(isPresented: $creating) {
          if let api = model.api {
            CreateWorkspaceView(api: api) {
              creating = false
              Task { await model.refresh() }
            }
          }
        }
    }
  }
  private var header: some View {
    HStack {
      HStack(spacing: 9) {
        VStack(spacing: 3) {
          HStack(spacing: 3) {
            Rectangle()
            Rectangle().opacity(0.6)
          }
          HStack(spacing: 3) {
            Rectangle().opacity(0.6)
            Rectangle()
          }
        }.foregroundStyle(OfficeBrand.sage).frame(width: 23, height: 23).accessibilityHidden(true)
        (Text("little").fontWeight(.bold) + Text("office").fontWeight(.regular)
          + Text(" ✦").foregroundColor(OfficeBrand.sage))
          .font(.system(size: 23, design: .rounded)).accessibilityLabel("Little Office")
      }
      Spacer(minLength: 10)
      Menu {
        Button("English") { language = "en" }
        Button("ไทย") { language = "th" }
      } label: {
        Text(language == "th" ? "ไทย" : "EN").font(.caption.weight(.semibold)).padding(3)
      }
      .buttonStyle(.glass).accessibilityLabel("Language")
      if model.account != nil {
        Menu {
          Button("Refresh", systemImage: "arrow.clockwise") { Task { await model.refresh() } }
          Button("Sign in again", systemImage: "person.crop.circle.badge.checkmark") {
            model.signIn(fresh: true)
          }
          Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right") {
            Task { await model.logout() }
          }
        } label: {
          Image(systemName: "person.crop.circle").font(.title2)
        }.buttonStyle(.glass)
          .accessibilityLabel("Account")
      }
    }
  }
  private func welcomeStory(wide: Bool) -> some View {
    VStack(alignment: .leading, spacing: wide ? 22 : 14) {
      Text("YOUR PEOPLE. YOUR PLACE.").font(.system(size: 10, weight: .bold, design: .monospaced))
        .tracking(2).foregroundStyle(OfficeBrand.sage)
      VStack(alignment: .leading, spacing: 0) {
        Text("A little closer.")
        Text("Even from afar.").foregroundStyle(OfficeBrand.sage)
      }.font(.system(size: wide ? 49 : 34, weight: .semibold, design: .rounded))
        .fixedSize(horizontal: false, vertical: true)
      Text("A cozy corner of the internet to do good work, together.")
        .font(.system(size: 15)).foregroundStyle(OfficeBrand.forest.opacity(0.72))
        .fixedSize(horizontal: false, vertical: true)
      WorldPreview(compact: !wide)
      if wide {
        Text("Walk over. Say hello. Make yourself at home.")
          .font(.caption).foregroundStyle(OfficeBrand.forest.opacity(0.6))
      }
    }
  }
  private var connectionCard: some View {
    VStack(alignment: .leading, spacing: 22) {
      Label(connectionName, systemImage: "building.2")
        .font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 8)
        .background(OfficeBrand.sage.opacity(0.09), in: Capsule())
      VStack(alignment: .leading, spacing: 9) {
        Text("Welcome in.").font(.system(size: 31, weight: .semibold, design: .rounded))
        Text("Your people are just a few steps away.")
          .font(.subheadline).foregroundStyle(OfficeBrand.forest.opacity(0.65))
      }
      Button {
        model.signIn()
      } label: {
        HStack {
          Spacer()
          Text("Continue to Little Office").fontWeight(.semibold)
          Image(systemName: "arrow.right")
          Spacer()
        }
        .padding(.vertical, 7).foregroundStyle(.white)
      }.buttonStyle(.glassProminent).controlSize(.large).disabled(model.busy)
      if model.busy { ProgressView("Opening sign-in…").font(.caption).frame(maxWidth: .infinity) }
      Text("Sign in securely in your browser, then come right back here.")
        .font(.caption).foregroundStyle(OfficeBrand.forest.opacity(0.6)).fixedSize(
          horizontal: false, vertical: true)
      Rectangle().fill(OfficeBrand.sage.opacity(0.13)).frame(height: 1)
      Button {
        choosingAddress = true
      } label: {
        HStack {
          Text("Have a workspace address?")
          Spacer()
          Image(systemName: "arrow.up.right")
        }
        .font(.subheadline.weight(.medium))
      }.buttonStyle(.plain)
      if model.serverAddress != "https://app.littleoffice.app" {
        Text(URL(string: model.serverAddress)?.host ?? model.serverAddress)
          .font(.caption.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
      }
      failure
    }.padding(28).background(OfficeBrand.cream.opacity(0.8), in: RoundedRectangle(cornerRadius: 28))
      .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 28))
      .overlay(RoundedRectangle(cornerRadius: 28).stroke(.white.opacity(0.8), lineWidth: 1))
  }
  private var connectionName: String {
    if let name = model.workspaceName { return name }
    let host = URL(string: model.serverAddress)?.host ?? ""
    return host == "app.littleoffice.app" ? "Little Office" : host
  }
  private var failure: some View {
    Group {
      if !model.error.isEmpty {
        Label(model.error, systemImage: "exclamationmark.circle").font(.caption)
          .foregroundStyle(.red).textSelection(.enabled)
      }
    }
  }
  private func workspaceChooser(_ account: Account, wide: Bool) -> some View {
    VStack(alignment: .leading, spacing: 28) {
      HStack(alignment: .center, spacing: 28) {
        VStack(alignment: .leading, spacing: 10) {
          Text("YOUR LITTLE WORLD").font(.system(size: 10, weight: .bold, design: .monospaced))
            .tracking(2).foregroundStyle(OfficeBrand.sage)
          Text("Hello, \(account.name).")
            .font(.system(size: wide ? 42 : 30, weight: .semibold, design: .rounded))
          Text("Where shall we spend the day?").foregroundStyle(OfficeBrand.forest.opacity(0.65))
        }.frame(maxWidth: .infinity, alignment: .leading)
        if wide { WorldPreview(compact: true).frame(width: 280) }
      }
      failure
      if model.workspaces.isEmpty {
        VStack(alignment: .leading, spacing: 14) {
          Image(systemName: "door.left.hand.open").font(.largeTitle).foregroundStyle(
            OfficeBrand.sage)
          Text("Make yourself at home.").font(.title2.weight(.semibold))
          Text("Create a workspace or accept an invitation to get started.").foregroundStyle(
            .secondary)
          Button("Create or join a workspace") { creating = true }.buttonStyle(.glassProminent)
        }.padding(30).frame(maxWidth: .infinity, alignment: .leading)
          .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 26))
      } else {
        LazyVGrid(
          columns: [GridItem(.adaptive(minimum: wide ? 270 : 260), spacing: 20)], spacing: 20
        ) {
          ForEach(model.workspaces) { workspace in
            Button {
              Task { await model.select(workspace) }
            } label: {
              VStack(alignment: .leading, spacing: 0) {
                Image("WelcomeWorld").resizable().interpolation(.none).aspectRatio(
                  contentMode: .fill
                )
                .frame(height: 125).clipped().overlay(alignment: .topLeading) {
                  Text(LocalizedStringKey(workspace.role.capitalized)).font(
                    .caption.weight(.semibold)
                  )
                  .padding(.horizontal, 11).padding(.vertical, 7).glassEffect().padding(14)
                }
                VStack(alignment: .leading, spacing: 12) {
                  Text(workspace.name).font(.system(size: 22, weight: .semibold, design: .rounded))
                    .lineLimit(2)
                  HStack {
                    Text(workspace.slug).font(.caption).foregroundStyle(
                      OfficeBrand.forest.opacity(0.6))
                    Spacer()
                    Label("Enter office", systemImage: "arrow.right").font(
                      .caption.weight(.semibold))
                  }
                }.padding(22)
              }.frame(maxWidth: .infinity, alignment: .leading)
                .background(OfficeBrand.cream).clipShape(RoundedRectangle(cornerRadius: 25))
                .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 25))
                .contentShape(RoundedRectangle(cornerRadius: 25))
            }.buttonStyle(.plain).accessibilityLabel("Enter \(workspace.name)")
          }
        }
        Button {
          creating = true
        } label: {
          Label("Create or join a workspace", systemImage: "plus")
        }
        .buttonStyle(.glass).controlSize(.large)
      }
    }
  }
}

private struct WorldPreview: View {
  let compact: Bool
  var body: some View {
    VStack(spacing: 0) {
      if !compact {
        HStack(spacing: 5) {
          ForEach(0..<3) { _ in
            Circle().fill(OfficeBrand.sage.opacity(0.3)).frame(width: 6, height: 6)
          }
          Spacer()
          Text("A place to work together").font(.system(size: 10, weight: .medium))
          Spacer()
        }.padding(.horizontal, 15).padding(.vertical, 12)
      }
      Image("WelcomeWorld").resizable().interpolation(.none).aspectRatio(contentMode: .fill)
        .frame(height: compact ? 110 : 250).clipped()
      if !compact {
        Label("Good company. A little more focus.", systemImage: "circle.fill")
          .font(.system(size: 11)).foregroundStyle(OfficeBrand.sage).padding(12)
      }
    }.background(OfficeBrand.cream).clipShape(RoundedRectangle(cornerRadius: 20))
      .overlay(RoundedRectangle(cornerRadius: 20).stroke(OfficeBrand.sage.opacity(0.15)))
      .accessibilityElement(children: .ignore).accessibilityLabel(
        "A little pixel office surrounded by greenery")
  }
}

private struct ConnectionAddressView: View {
  @ObservedObject var model: AppModel
  @Environment(\.dismiss) private var dismiss
  @State private var address = ""
  @State private var advanced = false
  @State private var customAddress = ""
  @State private var error = ""
  @State private var checking = false
  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 22) {
        Label("YOUR WORKSPACE", systemImage: "building.2").font(.caption.weight(.semibold))
          .foregroundStyle(OfficeBrand.sage)
        Text("Find your people.").font(.system(size: 30, weight: .semibold, design: .rounded))
        Text("Use the workspace name or address from your invitation.").foregroundStyle(.secondary)
        HStack {
          TextField("gmtech", text: $address).autocorrectionDisabled()
          Text(".littleoffice.app").font(.caption).foregroundStyle(.secondary)
        }.padding(16).background(.white.opacity(0.65), in: RoundedRectangle(cornerRadius: 15))
        DisclosureGroup("Use another server", isExpanded: $advanced) {
          TextField("https://office.example.com", text: $customAddress).textFieldStyle(
            .roundedBorder
          )
          .autocorrectionDisabled().padding(.top, 12)
        }.font(.subheadline)
        if !error.isEmpty { Text(LocalizedStringKey(error)).font(.caption).foregroundStyle(.red) }
        Button {
          checking = true
          Task {
            defer { checking = false }
            do {
              if advanced {
                model.serverAddress = try OfficeDestination.origin(customAddress).absoluteString
                model.workspaceSlug = nil
                model.workspaceName = nil
              } else {
                try await model.chooseWorkspaceAddress(address)
              }
              model.error = ""
              dismiss()
            } catch { self.error = error.localizedDescription }
          }
        } label: {
          Text("Use this workspace").frame(maxWidth: .infinity).padding(.vertical, 6)
            .foregroundStyle(.white)
        }
        .buttonStyle(.glassProminent).controlSize(.large).disabled(checking)
        if checking { ProgressView("Finding your workspace…") }
        Button("Use my personal account") {
          model.serverAddress = OfficeDestination.canonicalOrigin.absoluteString
          model.workspaceSlug = nil
          model.workspaceName = nil
          model.error = ""
          dismiss()
        }
        .font(.subheadline).frame(maxWidth: .infinity)
        Spacer(minLength: 0)
      }.disabled(checking || model.busy).padding(28).background(OfficeBrand.cream).foregroundStyle(
        OfficeBrand.forest
      ).tint(
        OfficeBrand.sage
      )
      .navigationTitle("Workspace address").toolbar {
        Button("Cancel") { dismiss() }.disabled(checking)
      }
      .onAppear { customAddress = model.serverAddress }
    }.interactiveDismissDisabled(checking).frame(minWidth: 340, minHeight: 470)
  }
}
