import AVFoundation
import LittleOfficeKit
import LiveKit
import SwiftUI

struct MediaPanel: View {
  @ObservedObject var media: OfficeMedia
  let compact: Bool
  @State private var expanded = false
  @State private var grid = false
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Button(
          grid ? "Filmstrip" : "Grid", systemImage: grid ? "rectangle.split.3x1" : "square.grid.2x2"
        ) { grid.toggle() }
        if media.selectedVideo != nil {
          Button("Unpin", systemImage: "pin.slash") { media.selectVideo(nil) }
        }
      }.font(.caption).buttonStyle(.borderless)
      if let selected = media.videos.first(where: { $0.id == media.selectedVideo }) {
        tile(selected).onTapGesture { expanded = true }
          .frame(height: compact ? 160 : 250)
      }
      ScrollView(grid ? .vertical : .horizontal) {
        LazyVGrid(
          columns: grid
            ? [GridItem(.adaptive(minimum: compact ? 140 : 190))] : [GridItem(.flexible())]
        ) {
          if grid {
            ForEach(media.videos) { video in
              tile(video).frame(height: 150).onTapGesture { media.selectVideo(video) }
            }
          } else {
            HStack {
              ForEach(media.videos) { video in
                tile(video).frame(width: compact ? 150 : 220, height: compact ? 125 : 170)
                  .onTapGesture { media.selectVideo(video) }
              }
            }
          }
        }
      }.frame(maxHeight: grid ? 330 : compact ? 125 : 170)
    }.frame(maxWidth: compact ? 190 : 480)
      .sheet(isPresented: $expanded) {
        NavigationStack {
          if let video = media.videos.first(where: { $0.id == media.selectedVideo }) {
            tile(video).padding()
          } else {
            Text("This video has ended.")
          }
        }.toolbar { Button("Done") { expanded = false } }.frame(minWidth: 340, minHeight: 400)
      }
      .onDisappear { media.selectVideo(nil) }
  }
  private func tile(_ video: OfficeMedia.Video) -> some View {
    VStack(spacing: 4) {
      SwiftUIVideoView(video.track, layoutMode: .fit).clipShape(.rect(cornerRadius: 12))
      HStack {
        Label(video.name, systemImage: video.screen ? "rectangle.on.rectangle" : "video")
        Spacer(minLength: 0)
        if video.screen {
          Menu {
            let viewers = media.viewers(for: video.publisher)
            if viewers.isEmpty { Text("No viewers yet") }
            ForEach(viewers) { Text($0.name) }
          } label: {
            Label("\(media.viewers(for: video.publisher).count)", systemImage: "eye")
          }
        }
        Button("Expand", systemImage: "arrow.up.left.and.arrow.down.right") {
          media.selectVideo(video)
          expanded = true
        }.labelStyle(.iconOnly)
      }.font(.caption)
    }.padding(6).background(.regularMaterial, in: .rect(cornerRadius: 16))
      .accessibilityLabel("\(video.name), \(video.screen ? "screen share" : "camera")")
  }
}
struct MediaSettings: View {
  @ObservedObject var media: OfficeMedia
  @Environment(\.dismiss) private var dismiss
  @State private var input = ""
  @State private var output = ""
  var body: some View {
    NavigationStack {
      Form {
        #if os(iOS)
          Section("Screen sharing") {
            Text(
              "Use the system broadcast picker to share your screen across apps. Stop sharing here or in Control Center."
            )
          }
        #endif
        Section("Video") {
          Picker("Quality", selection: $media.quality) {
            Text("Maximum · up to 4K / 60 fps").tag("maximum")
            Text("High · up to 1080p / 60 fps").tag("high")
            Text("Balanced · up to 720p / 30 fps").tag("balanced")
          }
          .disabled(media.sharing || media.broadcastPending || media.changingCamera)
          if media.sharing || media.broadcastPending {
            Text("Stop sharing to change screen quality.").font(.caption)
          }
          Toggle("Include app audio in screen sharing", isOn: $media.shareAppAudio)
            .disabled(!media.microphone || media.sharing || media.broadcastPending)
          Text(
            "App audio is mixed with your enabled microphone. Choose before starting a share; muting the microphone also mutes app audio."
          ).font(.caption)
          Picker("Camera", selection: $media.cameraDeviceId) {
            Text("Default").tag("")
            ForEach(media.cameraDevices, id: \.uniqueID) { Text($0.localizedName).tag($0.uniqueID) }
          }
          .disabled(media.changingCamera)
          Button("Flip camera") { Task { await media.flipCamera() } }.disabled(
            !media.camera || media.changingCamera)
          Button("Refresh devices") { Task { await media.refreshDevices() } }
        }
        #if os(macOS)
          Section("Audio") {
            Picker("Microphone", selection: $input) {
              ForEach(AudioManager.shared.inputDevices) { Text($0.name).tag($0.deviceId) }
            }
            Picker("Speaker", selection: $output) {
              ForEach(AudioManager.shared.outputDevices) { Text($0.name).tag($0.deviceId) }
            }
          }
        #else
          Section("Audio") {
            Text(
              "Choose the audio route using Control Center. Microphone and camera permissions are managed in Settings."
            )
          }
        #endif
        if !media.error.isEmpty { Text(media.error).foregroundStyle(.red) }
        Button("Retry media connection") { media.retry() }
      }.formStyle(.grouped).navigationTitle("Audio & video").toolbar {
        Button("Done") { dismiss() }
      }
      .task {
        await media.refreshDevices()
        input = AudioManager.shared.inputDevice.deviceId
        output = AudioManager.shared.outputDevice.deviceId
      }
      .onChange(of: media.quality) { _, _ in Task { await media.applyCameraSettings() } }
      .onChange(of: media.cameraDeviceId) { _, _ in Task { await media.applyCameraSettings() } }
      .onChange(of: input) { _, value in
        if let device = AudioManager.shared.inputDevices.first(where: { $0.deviceId == value }) {
          AudioManager.shared.inputDevice = device
        }
      }
      .onChange(of: output) { _, value in
        if let device = AudioManager.shared.outputDevices.first(where: { $0.deviceId == value }) {
          AudioManager.shared.outputDevice = device
        }
      }
      .onReceive(
        NotificationCenter.default.publisher(for: AVCaptureDevice.wasDisconnectedNotification)
      ) { _ in Task { await media.refreshDevices() } }
    }.frame(minWidth: 340, minHeight: 420)
  }
}

#if os(macOS)
  struct ScreenSourcePicker: View {
    @ObservedObject var media: OfficeMedia
    var body: some View {
      NavigationStack {
        List(Array(media.screenSources.enumerated()), id: \.offset) { index, source in
          Button {
            media.chooseScreen(source)
          } label: {
            if let window = source as? MacOSWindow {
              Label(window.title ?? "Window \(index + 1)", systemImage: "macwindow")
            } else if let display = source as? MacOSDisplay {
              Label(
                "Display \(display.displayID) · \(display.width) × \(display.height)",
                systemImage: "display")
            }
          }
        }.navigationTitle("Choose what to share").toolbar {
          Button("Cancel") { media.choosingScreen = false }
        }
        if !media.error.isEmpty { Text(media.error).foregroundStyle(.red).padding() }
        if media.screenSources.isEmpty {
          Text("Allow screen recording in System Settings, then reopen this picker.").padding()
        }
      }.frame(minWidth: 400, minHeight: 400)
    }
  }
#endif
