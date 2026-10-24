import LittleOfficeKit
import LiveKit
import SpriteKit
import SwiftUI

struct RootView: View {
  @ObservedObject var model: AppModel
  var body: some View {
    if let office = model.office {
      OfficeView(office: office, leave: { Task { await model.leave() } }).id(office.id)
    } else {
      WelcomeView(model: model)
    }
  }
}
struct OfficeView: View {
  @ObservedObject var office: WorkspaceSession
  @ObservedObject private var media: OfficeMedia
  let leave: () -> Void
  @State private var scene = OfficeScene(size: CGSize(width: 1120, height: 720))
  @State private var managing = false
  @State private var profile = false
  @State private var display = false
  @State private var mediaSettings = false
  @AppStorage("nameTagSize") private var nameTagSize = 10.0
  @AppStorage("nameTagOpacity") private var nameTagOpacity = 85.0
  @AppStorage("mapMotion") private var mapMotion = true
  @State private var panel = "People"
  @State private var panelOpen = true
  @State private var search = ""
  @State private var movementVisible = false
  @State private var emojiDraft = ""
  @State private var interactionPrompt = ""
  @State private var interactionEnabled = true
  @FocusState private var searchFocused: Bool
  @Environment(\.accessibilityReduceMotion) private var reducedMotion
  @Environment(\.scenePhase) private var scenePhase

  init(office: WorkspaceSession, leave: @escaping () -> Void) {
    self.office = office
    self.media = office.media
    self.leave = leave
  }
  private var title: String { office.snapshot?.workspace.name ?? office.workspace.name }
  private var zoneName: String {
    office.manifest?.zones.first { $0.id == office.snapshot?.me?.zone }?.name ?? "The commons"
  }
  private var layout: some View {
    GeometryReader { geometry in
      let compact = geometry.size.width < 700
      ZStack {
        SpriteView(scene: scene)
          .ignoresSafeArea()
          .accessibilityLabel("Office map. Use arrow keys, WASD, or the movement controls to walk.")
        if office.manifest == nil { ProgressView("Opening office…").padding().glassEffect() }
        VStack(spacing: 12) {
          header(compact: compact)
          HStack(alignment: .top, spacing: 12) {
            rail(compact: compact)
            VStack(alignment: .leading, spacing: 12) {
              Label(
                media.connected ? "Nearby voice" : "Connecting audio…", systemImage: "headphones"
              )
              .font(.caption.weight(.medium)).padding(10).glassEffect()
              if !media.videos.isEmpty { MediaPanel(media: media, compact: compact) }
              Spacer(minLength: 0)
              if movementVisible {
                GlassEffectContainer(spacing: 12) {
                  DirectionPad { office.move($0, $1) }
                }.disabled(!office.connected)
              }
            }
            Spacer(minLength: 0)
            if panelOpen && !compact {
              peopleAndRooms.frame(width: 280).frame(
                maxHeight: min(520, geometry.size.height - 210))
            }
          }.frame(maxHeight: .infinity)
          if !interactionPrompt.isEmpty {
            Button(LocalizedStringKey(interactionPrompt)) { scene.performInteraction() }
              .buttonStyle(.glassProminent).disabled(!interactionEnabled || !office.connected)
          }
          notices
          OfficeDock(office: office, media: media, compact: compact)
          #if os(macOS)
            if !compact {
              Text("W A S D / arrows: move · Space: jump · Z: nudge · 1: sit · 2: sleep · 3: fish")
                .font(.caption2).padding(.horizontal, 10).padding(.vertical, 5)
                .background(.regularMaterial, in: .capsule)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
          #endif
        }.padding(compact ? 10 : 16)
        if compact && panelOpen {
          peopleAndRooms.frame(width: min(300, geometry.size.width - 82))
            .frame(maxHeight: max(180, geometry.size.height - 170))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .padding(.top, 76).padding(.trailing, 10).padding(.bottom, 85)
        }
      }
      .onAppear {
        if compact { panelOpen = false }
        #if os(iOS)
          movementVisible = true
        #endif
      }
    }
  }
  private var panels: some View {
    layout
      .sheet(isPresented: $office.showingBoard) {
        NavigationStack {
          WhiteboardPanel(api: office.api, workspaceId: office.workspace.id) {
            office.showingBoard = false
          }
          .frame(minWidth: 340, maxWidth: .infinity, minHeight: 400, maxHeight: .infinity)
          .navigationTitle("Whiteboard")

        }.frame(minWidth: 340, minHeight: 500)
      }
      .sheet(isPresented: $profile) { ProfileSettings(office: office) }
      .sheet(isPresented: $display) { DisplaySettings() }
      .sheet(isPresented: $mediaSettings) { MediaSettings(media: media) }
      #if os(macOS)
        .sheet(isPresented: $media.choosingScreen) { ScreenSourcePicker(media: media) }
      #endif
      .sheet(isPresented: $managing) {
        WorkspaceManagementView(api: office.api, workspace: office.workspace)
      }
      .alert("Send an emoji", isPresented: $office.showingEmotePicker) {
        TextField("Emoji", text: $emojiDraft)
        Button("Send") {
          office.send(["type": "emote", "emoji": emojiDraft])
          emojiDraft = ""
        }
        .disabled(emojiDraft.count != 1)
        Button("Cancel", role: .cancel) { emojiDraft = "" }
      } message: {
        Text("Choose one emoji with your keyboard or paste it here.")
      }
  }
  private var configuredScene: some View {
    panels
      .onAppear {
        scene.moveInput = { office.move($0, $1) }
        scene.action = { action in
          if action.hasPrefix("emote:") {
            office.send(["type": "emote", "emoji": String(action.dropFirst(6))])
          } else {
            office.perform(action)
          }
        }
        scene.interact = { target, revision in
          office.send(["type": "interact", "target": target, "revision": revision])
        }
        scene.actionPrompt = { text, enabled in
          interactionPrompt = text
          interactionEnabled = enabled
        }
        scene.selectPerson = { id in
          search = office.snapshot?.people.first { $0.id == id }?.name ?? ""
          panel = "People"
          panelOpen = true
        }
        scene.reducedMotion = reducedMotion || !mapMotion
        scene.nameTagSize = nameTagSize
        scene.nameTagOpacity = nameTagOpacity
        updateInput()
        render()
      }
      .onDisappear {
        scene.stopInput()
        scene.moveInput = nil
        scene.action = nil
        scene.interact = nil
        scene.actionPrompt = nil
        scene.selectPerson = nil
      }
  }
  var body: some View {
    configuredScene
      .onChange(of: inputAllowed) { _, _ in updateInput() }
      .onReceive(office.effects) { scene.receive($0) }
      .onReceive(office.resetInput) { scene.stopInput() }
      .onChange(of: reducedMotion) { _, value in scene.reducedMotion = value || !mapMotion }
      .onChange(of: mapMotion) { _, value in scene.reducedMotion = reducedMotion || !value }
      .onChange(of: nameTagSize) { _, value in scene.nameTagSize = value }
      .onChange(of: nameTagOpacity) { _, value in scene.nameTagOpacity = value }
      .onReceive(media.$speaking) { scene.speaking = $0 }
      .onChange(of: media.sharing) { _, value in
        if !value && !media.broadcastPending && scenePhase == .background {
          Task { await office.stop() }
        }
      }
      .onChange(of: media.broadcastPending) { _, value in
        if !value && !media.sharing && scenePhase == .background { Task { await office.stop() } }
      }
      .onReceive(office.$snapshot) { _ in DispatchQueue.main.async { render() } }
      .onReceive(office.$manifest) { _ in DispatchQueue.main.async { render() } }
      .onReceive(office.$avatars) { _ in DispatchQueue.main.async { render() } }
  }
  private var inputAllowed: Bool {
    !office.showingBoard && !office.showingEmotePicker && !managing && !profile && !display
      && !mediaSettings && !media.choosingScreen && !searchFocused
      && scenePhase == .active
  }
  private func updateInput() {
    scene.inputEnabled = inputAllowed
    if !scene.inputEnabled { office.move(0, 0) }
  }
  private func header(compact: Bool) -> some View {
    HStack(spacing: compact ? 10 : 18) {
      Button(action: leave) {
        Label("littleoffice✦", systemImage: "square.grid.2x2.fill")
          .font(compact ? .subheadline.bold() : .title3.bold())
      }.help("Switch workspace").accessibilityLabel("Switch workspace")
      if !compact {
        Divider().frame(height: 24)
        Text(LocalizedStringKey(title)).font(.subheadline).lineLimit(1)
      }
      Label(zoneName, systemImage: "leaf").font(.caption.weight(.semibold)).lineLimit(1)
      Spacer(minLength: 0)
      if !compact {
        Label(office.connected ? "Connected" : "Disconnected", systemImage: "circle.fill")
          .font(.caption).foregroundStyle(office.connected ? .green : .secondary)
      }
      Button("Movement controls", systemImage: "gamecontroller") { movementVisible.toggle() }
        .labelStyle(.iconOnly).help("Movement controls")
      Button {
        profile = true
      } label: {
        NativeAvatar(person: office.snapshot?.me, avatars: office.avatars).frame(
          width: 28, height: 32)
      }.accessibilityLabel("Profile and status")
    }
    .buttonStyle(.plain).padding(.horizontal, 16).frame(height: 54)
    .glassEffect(.regular, in: .rect(cornerRadius: 18))
  }
  private func rail(compact: Bool) -> some View {
    VStack(spacing: 8) {
      railButton("Office", icon: "house", selected: !panelOpen) { panelOpen = false }
      railButton("Rooms", icon: "door.left.hand.open", selected: panelOpen && panel == "Rooms") {
        panel = "Rooms"
        panelOpen = true
      }
      railButton("People", icon: "person.2", selected: panelOpen && panel == "People") {
        panel = "People"
        panelOpen = true
      }
      Divider().padding(.horizontal, 8)
      railButton("Profile", icon: "person.crop.circle") { profile = true }
      railButton("Media", icon: "headphones") { mediaSettings = true }
      railButton("Display", icon: "slider.horizontal.3") { display = true }
      railButton("Settings", icon: "gearshape") { managing = true }
      railButton("Leave", icon: "rectangle.portrait.and.arrow.right", action: leave)
    }.padding(6).frame(width: compact ? 54 : 64)
      .glassEffect(.regular, in: .rect(cornerRadius: 20))
  }
  private func railButton(
    _ title: String, icon: String, selected: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(spacing: 5) {
        Image(systemName: icon).font(.system(size: 18))
        Text(LocalizedStringKey(title)).font(.system(size: 9, weight: .medium))
      }.frame(maxWidth: .infinity).frame(height: 48)
        .background(
          selected ? Color.accentColor.opacity(0.15) : .clear, in: .rect(cornerRadius: 12)
        )
        .contentShape(Rectangle())
    }.buttonStyle(.plain).accessibilityLabel(title)
  }
  private var peopleAndRooms: some View {
    VStack(spacing: 14) {
      HStack {
        Picker("People and rooms", selection: $panel) {
          Text("People \(office.snapshot?.people.count ?? 0)").tag("People")
          Text("Rooms").tag("Rooms")
        }.pickerStyle(.segmented).labelsHidden()
        Button("Close people and rooms", systemImage: "xmark") { panelOpen = false }
          .labelStyle(.iconOnly).buttonStyle(.plain)
      }
      if office.workspace.role != "member" {
        Button("Invite teammate", systemImage: "plus") { managing = true }
          .buttonStyle(.bordered).frame(maxWidth: .infinity)
      }
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if panel == "People" {
            TextField("Find your people", text: $search).textFieldStyle(.roundedBorder).focused(
              $searchFocused)
            Text("IN THE OFFICE").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            ForEach(
              (office.snapshot?.people ?? []).filter {
                search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)
              }
            ) { person in
              HStack(spacing: 8) {
                NativeAvatar(person: person, avatars: office.avatars).frame(width: 32, height: 38)
                VStack(alignment: .leading, spacing: 3) {
                  Text(person.name + (person.id == office.snapshot?.selfId ? " (you)" : ""))
                    .font(.callout.weight(.medium))
                  Text(
                    "\(person.presence.icon) \(person.presence.text.isEmpty ? person.presence.label : person.presence.text)"
                  )
                  .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if person.id != office.snapshot?.selfId {
                  Menu {
                    Button("Wave") { office.send(["type": "wave", "target": person.id]) }
                    Button("Invite to call") {
                      office.send(["type": "invite", "target": person.id, "kind": "call"])
                    }
                    Button("Invite here") {
                      office.send(["type": "invite", "target": person.id, "kind": "summon"])
                    }
                    Button("Nudge") { office.send(["type": "nudge", "target": person.id]) }
                  } label: {
                    Image(systemName: "ellipsis")
                  }
                  .menuStyle(.borderlessButton).accessibilityLabel("Connect with \(person.name)")
                }
              }
            }
            Divider()
          }
          Text("A SPACE FOR EVERY MOMENT").font(.caption2.weight(.semibold)).foregroundStyle(
            .secondary)
          ForEach((office.manifest?.zones ?? []).filter { panel == "Rooms" || $0.id != "floor" }) {
            zone in
            Button {
              office.send(["type": "zone", "zone": zone.id])
            } label: {
              HStack(spacing: 10) {
                Image(systemName: zone.id == "floor" ? "leaf" : "door.left.hand.open")
                  .font(.title2).frame(width: 36)
                VStack(alignment: .leading, spacing: 4) {
                  Text(zone.name).font(.callout.weight(.medium))
                  Text(
                    "\(office.snapshot?.people.filter { $0.zone == zone.id }.count ?? 0) here"
                      + (office.snapshot?.locks[zone.id] == true ? " · Locked" : "")
                  )
                  .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption)
              }.padding(12).frame(maxWidth: .infinity)
                .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 12))
                .contentShape(Rectangle())
            }.buttonStyle(.plain).disabled(!office.connected)
            if zone.id != "floor", office.snapshot?.me?.zone == zone.id {
              Button(
                office.snapshot?.locks[zone.id] == true ? "Unlock room" : "Lock room",
                systemImage: office.snapshot?.locks[zone.id] == true ? "lock.open" : "lock"
              ) {
                office.send([
                  "type": "lock", "zone": zone.id,
                  "locked": office.snapshot?.locks[zone.id] != true,
                ])
              }.disabled(!office.connected)
            }
          }
        }.padding(2)
      }
    }.padding(16).glassEffect(.regular, in: .rect(cornerRadius: 22))
  }
  @ViewBuilder private var notices: some View {
    VStack(spacing: 8) {
      ForEach(office.invitations) { invite in
        HStack {
          Text(
            "\(invite.fromName) invites you to \(invite.kind == "call" ? "a call" : "join them")")
          Button("Accept") { office.respond(invite, accept: true) }
          Button("Decline") { office.respond(invite, accept: false) }
        }
      }
      if !office.notice.isEmpty { Text(office.notice) }
      if !office.error.isEmpty {
        Text(office.error).foregroundStyle(.red)
        Button(LocalizedStringKey(office.needsTakeover ? "Open here instead" : "Reconnect")) {
          office.connect(takeover: office.needsTakeover)
        }
      }
      if !media.error.isEmpty {
        Text(media.error).foregroundStyle(.red)
        Button("Retry media") { media.retry() }
      }
    }.font(.caption).padding(
      office.invitations.isEmpty && office.notice.isEmpty && office.error.isEmpty
        && media.error.isEmpty ? 0 : 12
    )
    .background(.regularMaterial, in: .rect(cornerRadius: 14)).frame(maxWidth: 560)
  }
  private func render() {
    if let manifest = office.manifest {
      scene.render(manifest: manifest, snapshot: office.snapshot, avatars: office.avatars)
    }
  }
}
private struct OfficeDock: View {
  @ObservedObject var office: WorkspaceSession
  @ObservedObject var media: OfficeMedia
  let compact: Bool
  var body: some View {
    HStack(spacing: compact ? 6 : 18) {
      HStack(spacing: 8) {
        if !compact {
          NativeAvatar(person: office.snapshot?.me, avatars: office.avatars)
            .frame(width: 30, height: 36)
        }
        VStack(alignment: .leading, spacing: 3) {
          Menu {
            ForEach(["available", "busy", "dnd", "away"], id: \.self) { status in
              Button(status.capitalized) {
                office.send(["type": "status", "status": status, "text": "", "icon": ""])
              }
            }
          } label: {
            if compact {
              Image(systemName: "person.crop.circle").font(.title2)
            } else {
              Text(office.snapshot?.me?.name ?? "You").font(.callout.weight(.semibold))
            }
          }.menuStyle(.borderlessButton).accessibilityLabel("Your status")
          if !compact {
            Text(office.snapshot?.me?.status.capitalized ?? "Available")
              .font(.caption2).foregroundStyle(.secondary)
          }
        }
      }
      if !compact { Divider().frame(height: 32) }
      dockButton(
        media.microphone ? "Mute" : "Microphone", icon: media.microphone ? "mic.fill" : "mic.slash",
        active: media.microphone
      ) {
        Task { await media.toggleMicrophone() }
      }.disabled(!media.connected)
      dockButton(
        media.camera ? "Camera off" : "Camera", icon: media.camera ? "video.fill" : "video.slash",
        active: media.camera
      ) {
        Task { await media.toggleCamera() }
      }.disabled(!media.connected)
      dockButton(
        media.broadcastPending
          ? "Cancel screen share" : media.sharing ? "Stop sharing" : "Share screen",
        icon: "rectangle.on.rectangle",
        active: media.sharing
      ) {
        media.requestScreenShare()
      }.disabled(!media.connected)
      dockButton("Whiteboard", icon: "pencil.and.scribble") { office.showingBoard = true }
        .disabled(!office.connected || office.snapshot?.workspace.features?.whiteboard == false)
      #if os(iOS)
        dockButton("Jump", icon: "figure.jumprope") { office.perform("jump") }.disabled(
          !office.connected)
      #endif
      Menu {
        ForEach(["👋", "❤️", "😂", "🎉", "👍", "☕", "🔥", "💯"], id: \.self) { emoji in
          Button(emoji) { office.send(["type": "emote", "emoji": emoji]) }
        }
        Button("More emoji…") { office.showingEmotePicker = true }
        Button("Jump (Space)") { office.perform("jump") }
        Button("Nudge nearby (Z)") { office.perform("nudge") }
        Menu("Pose") {
          ForEach(["stand", "sit", "sleep", "fish"], id: \.self) { pose in
            Button(pose.capitalized) { office.perform(pose) }
          }
        }
        Button("Leave conversation") { office.send(["type": "leave"]) }
      } label: {
        VStack(spacing: 5) {
          Image(systemName: "face.smiling").font(.system(size: 20)).frame(width: 36, height: 30)
          if !compact { Text("Emote").font(.system(size: 9)) }
        }
      }.menuStyle(.borderlessButton).accessibilityLabel("Emote and actions").disabled(
        !office.connected)
    }.buttonStyle(.plain).padding(.horizontal, compact ? 10 : 20).padding(.vertical, 12)
      .glassEffect(.regular, in: .rect(cornerRadius: 22)).fixedSize(
        horizontal: true, vertical: false)
  }
  private func dockButton(
    _ title: String, icon: String, active: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(spacing: 5) {
        Image(systemName: icon).font(.system(size: 20)).frame(width: 36, height: 30)
          .foregroundStyle(active ? Color.accentColor : .primary)
        if !compact { Text(LocalizedStringKey(title)).font(.system(size: 9)) }
      }.frame(minWidth: 40, minHeight: 44).contentShape(Rectangle())
    }.accessibilityLabel(title).help(title)
  }
}
private struct NativeAvatar: View {
  let person: Person?
  let avatars: [String: AvatarManifest]
  var body: some View {
    if let person, let rectangles = avatars[person.avatar]?.frames["down-stand-0"] {
      Canvas { context, size in
        context.scaleBy(x: size.width / 72, y: size.height / 80)
        for rect in rectangles {
          let color = Color(
            red: Double((rect.color >> 16) & 255) / 255,
            green: Double((rect.color >> 8) & 255) / 255,
            blue: Double(rect.color & 255) / 255)
          context.fill(
            Path(CGRect(x: rect.x + 36, y: rect.y + 52, width: rect.w, height: rect.h)),
            with: .color(color))
        }
      }.accessibilityHidden(true)
    } else {
      Image(systemName: "person.crop.circle").resizable().scaledToFit().accessibilityHidden(true)
    }
  }
}
struct DirectionPad: View {
  let move: (Int, Int) -> Void
  var body: some View {
    VStack(spacing: 12) {
      direction("arrow.up", 0, -1)
      HStack(spacing: 12) {
        direction("arrow.left", -1, 0)
        direction("arrow.down", 0, 1)
        direction("arrow.right", 1, 0)
      }
    }
  }
  private func direction(_ icon: String, _ dx: Int, _ dy: Int) -> some View {
    Image(systemName: icon).frame(width: 44, height: 44)
      .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 14))
      .gesture(
        DragGesture(minimumDistance: 0).onChanged { _ in move(dx, dy) }.onEnded { _ in move(0, 0) }
      )
      .accessibilityLabel(icon.replacingOccurrences(of: "arrow.", with: "Move "))
      .accessibilityAddTraits(.isButton)
      .accessibilityAction {
        move(dx, dy)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { move(0, 0) }
      }
  }
}
