import AVFoundation
import Combine
import LittleOfficeKit
import LiveKit
import SwiftUI

@MainActor
final class OfficeMedia: NSObject, ObservableObject, RoomDelegate {
  @Published private(set) var room: Room?
  @Published private(set) var microphone = false
  @Published private(set) var camera = false
  @Published private(set) var sharing = false
  @Published private(set) var connected = false
  @Published var error = ""
  @Published private(set) var speaking = Set<String>()
  @Published var selectedVideo: String?
  @Published var cameraDevices: [AVCaptureDevice] = []
  @Published var cameraDeviceId = ""
  @Published var shareAppAudio = false
  @Published private(set) var changingCamera = false
  @Published var quality = UserDefaults.standard.string(forKey: "mediaQuality") ?? "maximum"
  private var retryAction: (() -> Void)?
  private var deviceObserver: AnyCancellable?
  private var watching: String?
  @Published var choosingScreen = false
  @Published private(set) var broadcastPending = false
  private var broadcastTimeout: Task<Void, Never>?
  #if os(iOS)
    private var broadcastObserver: AnyCancellable?
  #endif
  override init() {
    super.init()
    deviceObserver = NotificationCenter.default.publisher(
      for: AVCaptureDevice.wasDisconnectedNotification
    ).sink { [weak self] _ in
      Task { @MainActor in await self?.refreshDevices() }
    }
    #if os(iOS)
      BroadcastManager.shared.shouldPublishTrack = false
      broadcastObserver = BroadcastManager.shared.isBroadcastingPublisher.receive(
        on: DispatchQueue.main
      ).sink { [weak self] active in
        Task { @MainActor in
          guard let self else { return }
          if active {
            guard self.connected, self.broadcastPending || self.sharing else {
              BroadcastManager.shared.requestStop()
              return
            }
            self.broadcastTimeout?.cancel()
            self.broadcastPending = false
            self.sharing = true
            self.send?(["type": "screen-share", "room": self.roomId, "enabled": true])
          } else if self.sharing {
            self.sharing = false
            self.send?(["type": "screen-share", "room": self.roomId, "enabled": false])
            self.send?(["type": "present", "enabled": false])
            await self.share(authorized: false)
          }
        }
      }
    #endif
  }
  private func endBroadcast() {
    broadcastTimeout?.cancel()
    broadcastTimeout = nil
    broadcastPending = false
    #if os(iOS)
      BroadcastManager.shared.requestStop()
    #endif
  }
  #if os(macOS)
    @Published var screenSources: [MacOSScreenCaptureSource] = []
    private var screenSource: MacOSScreenCaptureSource?
  #endif
  private var roomId = ""
  private var generation = UUID()
  private var presentationAuthorization = CaptureAuthorization()
  private var connection: Task<Void, Never>?
  private var subscriptions: Task<Void, Never>?
  private var latest: Snapshot?
  private var send: (([String: Any]) -> Void)?
  func update(
    _ snapshot: Snapshot, api: OfficeAPI, workspaceId: String,
    send: @escaping ([String: Any]) -> Void
  ) {
    latest = snapshot
    self.send = send
    retryAction = { [weak self] in
      guard let self else { return }
      self.watch(nil)
      self.roomId = ""
      self.update(snapshot, api: api, workspaceId: workspaceId, send: send)
    }
    reconcileViewer()
    if sharing,
      let track = room?.localParticipant.trackPublications.values.first(where: {
        $0.source == .screenShareVideo
      })?.track as? LocalVideoTrack, track.capturer.captureState == .stopped
    {
      sharing = false
      send(["type": "screen-share", "room": roomId, "enabled": false])
      send(["type": "present", "enabled": false])
      Task { await share(authorized: false) }
    }
    let next = snapshot.me?.room ?? ""
    guard next != roomId else {
      updateSubscriptions()
      return
    }
    watch(nil)
    endBroadcast()
    choosingScreen = false
    #if os(macOS)
      screenSources = []
      screenSource = nil
    #endif
    selectedVideo = nil
    let epoch = UUID()
    generation = epoch
    roomId = next
    connection?.cancel()
    subscriptions?.cancel()
    let old = room
    room = nil
    microphone = false
    camera = false
    changingCamera = false
    sharing = false
    connected = false
    connection = Task { [weak self] in
      await old?.disconnect()
      guard let self, generation == epoch, !next.isEmpty, !Task.isCancelled else { return }
      do {
        let access: MediaAccess = try await api.call(
          api.workspacePath(workspaceId, "/media/token"), method: "POST", body: [:])
        guard generation == epoch, access.room == next, !Task.isCancelled else { return }
        let candidate = Room()
        candidate.add(delegate: self)
        room = candidate
        try await candidate.connect(
          url: access.url, token: access.token, connectOptions: ConnectOptions(autoSubscribe: false)
        )
        guard generation == epoch, !Task.isCancelled else {
          await candidate.disconnect()
          return
        }
        connected = true
        error = ""
        updateSubscriptions()
      } catch {
        if generation == epoch {
          self.error = error.localizedDescription
          connected = false
        }
      }
    }
  }
  func stop() async {
    endBroadcast()
    watch(nil)
    selectedVideo = nil
    speaking = []
    choosingScreen = false
    retryAction = nil
    generation = UUID()
    roomId = ""
    latest = nil
    connection?.cancel()
    connection = nil
    subscriptions?.cancel()
    subscriptions = nil
    let previous = room
    room = nil
    connected = false
    microphone = false
    camera = false
    changingCamera = false
    sharing = false
    await previous?.disconnect()
  }
  private func updateSubscriptions() {
    guard let room, let latest, let me = latest.me, connected else { return }
    subscriptions?.cancel()
    subscriptions = Task { [weak self] in
      do {
        for participant in room.remoteParticipants.values {
          let person = latest.people.first { $0.id == participant.identity?.stringValue }
          let audible = person.map { me.canHear($0) } ?? false
          for publication in participant.trackPublications.values {
            guard !Task.isCancelled else { return }
            if let remote = publication as? RemoteTrackPublication {
              try await remote.set(subscribed: audible)
              if let track = remote.track as? RemoteAudioTrack {
                let volume = person.map { me.volume(for: $0) } ?? 0
                DispatchQueue.global(qos: .userInitiated).async { track.volume = volume }
              }
            }
          }
        }
        self?.objectWillChange.send()
      } catch { if !Task.isCancelled { self?.error = error.localizedDescription } }
    }
  }
  func toggleMicrophone() async {
    guard let room, connected else { return }
    let next = !microphone
    let epoch = generation
    do {
      try await room.localParticipant.setMicrophone(enabled: next)
      guard generation == epoch, self.room === room else { return }
      microphone = next
      send?(["type": "microphone", "room": roomId, "enabled": next])
    } catch {
      if generation == epoch, self.room === room { self.error = error.localizedDescription }
    }
  }
  func toggleCamera() async {
    guard let room, connected, !changingCamera else { return }
    changingCamera = true
    let epoch = generation
    let next = !camera
    defer { if generation == epoch { changingCamera = false } }
    do {
      try await room.localParticipant.setCamera(
        enabled: next, captureOptions: captureOptions, publishOptions: publishOptions)
      guard generation == epoch, self.room === room else { return }
      camera = next
    } catch {
      if generation == epoch, self.room === room { self.error = error.localizedDescription }
    }
  }
  func requestScreenShare() {
    if sharing || broadcastPending {
      send?(["type": "present", "enabled": false])
      Task { await share(authorized: false) }
      return
    }
    #if os(macOS)
      choosingScreen = true
      let epoch = generation
      Task {
        do {
          let sources = try await MacOSScreenCapturer.sources(for: .any)
          guard generation == epoch, choosingScreen, connected else { return }
          screenSources = sources
        } catch {
          if generation == epoch, choosingScreen { self.error = error.localizedDescription }
        }
      }
    #else
      send?(["type": "present", "enabled": true])
    #endif
  }
  #if os(macOS)
    func chooseScreen(_ source: MacOSScreenCaptureSource) {
      guard choosingScreen, connected, screenSources.contains(where: { $0 === source }) else {
        return
      }
      screenSource = source
      choosingScreen = false
      send?(["type": "present", "enabled": true])
    }
  #endif
  func share(authorized: Bool) async {
    let request = presentationAuthorization.begin(enabled: authorized)
    guard let room, connected else {
      if !authorized { endBroadcast() }
      return
    }
    let epoch = generation
    if !authorized { endBroadcast() }
    do {
      #if os(macOS)
        if authorized, let screenSource {
          if let existing = room.localParticipant.trackPublications.values.first(where: {
            $0.source == .screenShareVideo
          }) as? LocalTrackPublication {
            try await room.localParticipant.unpublish(publication: existing)
          }
          let track = await LocalVideoTrack.createMacOSScreenShareTrack(
            source: screenSource, options: screenOptions)
          guard generation == epoch, self.room === room, connected,
            presentationAuthorization.isCurrent(request, enabled: authorized)
          else { return }
          let publication = try await room.localParticipant.publish(
            videoTrack: track, options: publishOptions)
          guard generation == epoch, self.room === room,
            presentationAuthorization.isCurrent(request, enabled: authorized)
          else {
            // Revoke only this superseded track, never a newer room/share or its broadcast process.
            try? await room.localParticipant.unpublish(publication: publication)
            return
          }
        } else {
          try await room.localParticipant.setScreenShare(enabled: false)
        }
      #else
        if authorized {
          broadcastPending = true
          // Create the extension receiver explicitly. LocalParticipant.set uses room defaults
          // and can otherwise create the in-app capturer even with per-call extension options.
          let track = await LocalVideoTrack.createBroadcastScreenCapturerTrack(
            options: screenOptions)
          guard generation == epoch, self.room === room, connected,
            presentationAuthorization.isCurrent(request, enabled: authorized)
          else { return }
          let publication = try await room.localParticipant.publish(
            videoTrack: track, options: publishOptions)
          guard generation == epoch, self.room === room,
            presentationAuthorization.isCurrent(request, enabled: authorized)
          else {
            // Revoke only this superseded track, never a newer room/share or its broadcast process.
            try? await room.localParticipant.unpublish(publication: publication)
            return
          }
          guard generation == epoch, self.room === room, connected else {
            return
          }
          BroadcastManager.shared.requestActivation()
          broadcastTimeout?.cancel()
          broadcastTimeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(45))
            guard let self, !Task.isCancelled, self.generation == epoch, self.broadcastPending
            else { return }
            self.send?(["type": "present", "enabled": false])
            await self.share(authorized: false)
          }
          return
        } else {
          try await room.localParticipant.setScreenShare(enabled: false)
        }
      #endif
      guard generation == epoch, self.room === room,
        presentationAuthorization.isCurrent(request, enabled: authorized)
      else { return }
      sharing = authorized
      send?(["type": "screen-share", "room": roomId, "enabled": authorized])
    } catch {
      guard generation == epoch, self.room === room,
        presentationAuthorization.isCurrent(request, enabled: authorized)
      else { return }
      self.error = error.localizedDescription
      endBroadcast()
      sharing = false
      send?(["type": "present", "enabled": false])
    }
  }
  func retry() { retryAction?() }
  func watch(_ publisher: String?) {
    guard watching != publisher else { return }
    watching = publisher
    send?(["type": "screen-view", "room": roomId, "publisher": publisher as Any? ?? NSNull()])
  }
  func selectVideo(_ video: Video?) {
    selectedVideo = video?.id
    watch(video?.screen == true && video?.local == false ? video?.publisher : nil)
  }
  private func reconcileViewer() {
    guard let selectedVideo else { return }
    guard let video = videos.first(where: { $0.id == selectedVideo }),
      latest?.people.contains(where: { $0.id == video.publisher && $0.room == roomId }) == true
    else {
      self.selectedVideo = nil
      watch(nil)
      return
    }
  }
  func viewers(for publisher: String) -> [Person] {
    latest?.people.filter { $0.room == roomId && $0.watching == publisher } ?? []
  }
  private var publishOptions: VideoPublishOptions {
    let fps = quality == "balanced" ? 30 : 60
    return VideoPublishOptions(
      encoding: VideoEncoding(
        maxBitrate: quality == "maximum" ? 20_000_000 : quality == "high" ? 6_000_000 : 2_500_000,
        maxFps: fps),
      screenShareEncoding: VideoEncoding(
        maxBitrate: quality == "maximum" ? 30_000_000 : quality == "high" ? 10_000_000 : 5_000_000,
        maxFps: fps))
  }
  private var screenOptions: ScreenShareCaptureOptions {
    ScreenShareCaptureOptions(
      dimensions: captureOptions.dimensions, fps: captureOptions.fps,
      appAudio: shareAppAudio && microphone,
      useBroadcastExtension: true)
  }
  private var captureOptions: CameraCaptureOptions {
    let dimensions: Dimensions =
      quality == "maximum"
      ? Dimensions(width: 3840, height: 2160)
      : quality == "high"
        ? Dimensions(width: 1920, height: 1080) : Dimensions(width: 1280, height: 720)
    return CameraCaptureOptions(
      device: cameraDevices.first { $0.uniqueID == cameraDeviceId }, position: .front,
      dimensions: dimensions, fps: quality == "balanced" ? 30 : 60)
  }
  func refreshDevices() async {
    do {
      cameraDevices = try await CameraCapturer.captureDevices()
      if !cameraDeviceId.isEmpty
        && !cameraDevices.contains(where: { $0.uniqueID == cameraDeviceId })
      {
        cameraDeviceId = ""
        await applyCameraSettings()
      }
    } catch { self.error = error.localizedDescription }
  }
  func applyCameraSettings() async {
    UserDefaults.standard.set(quality, forKey: "mediaQuality")
    guard camera, let room, !changingCamera,
      let publication = room.localParticipant.trackPublications.values.first(where: {
        $0.source == .camera
      }) as? LocalTrackPublication
    else { return }
    let epoch = generation
    changingCamera = true
    defer { if generation == epoch { changingCamera = false } }
    do {
      // Republish so capture dimensions AND encoder bitrate/fps use the selected quality.
      try await room.localParticipant.unpublish(publication: publication)
      guard generation == epoch, self.room === room, connected else { return }
      camera = false
      try await room.localParticipant.setCamera(
        enabled: true, captureOptions: captureOptions, publishOptions: publishOptions)
      guard generation == epoch, self.room === room, connected else { return }
      camera = true
    } catch {
      guard generation == epoch, self.room === room else { return }
      self.error = error.localizedDescription
    }
  }
  func flipCamera() async {
    let epoch = generation
    guard
      let track = room?.localParticipant.trackPublications.values.first(where: {
        $0.source == .camera
      })?.track as? LocalVideoTrack,
      let capturer = track.capturer as? CameraCapturer
    else { return }
    do { try await capturer.switchCameraPosition() } catch {
      guard generation == epoch else { return }
      self.error = error.localizedDescription
    }
  }
  struct Video: Identifiable {
    let id: String
    let name: String
    let publisher: String
    let screen: Bool
    let local: Bool
    let track: VideoTrack
  }
  var videos: [Video] {
    guard let room else { return [] }
    let participants: [Participant] =
      [room.localParticipant] + Array(room.remoteParticipants.values)
    return participants.flatMap { participant in
      participant.videoTracks.compactMap { publication in
        guard let track = publication.track as? VideoTrack, !publication.isMuted else { return nil }
        return Video(
          id: publication.sid.stringValue, name: participant.name ?? "Teammate",
          publisher: participant.identity?.stringValue ?? "",
          screen: publication.source == .screenShareVideo, local: participant is LocalParticipant,
          track: track)
      }
    }
  }
  nonisolated func room(
    _ room: Room, participant: RemoteParticipant,
    didPublishTrack publication: RemoteTrackPublication
  ) { Task { @MainActor in if self.room === room { self.updateSubscriptions() } } }
  nonisolated func room(
    _ room: Room, participant: RemoteParticipant,
    didSubscribeTrack publication: RemoteTrackPublication
  ) {
    Task { @MainActor in
      if self.room === room {
        self.reconcileViewer()
        self.objectWillChange.send()
      }
    }
  }
  nonisolated func room(
    _ room: Room, participant: RemoteParticipant,
    didUnsubscribeTrack publication: RemoteTrackPublication
  ) {
    Task { @MainActor in
      if self.room === room {
        self.reconcileViewer()
        self.objectWillChange.send()
      }
    }
  }
  nonisolated func room(_ room: Room, didUpdateSpeakingParticipants participants: [Participant]) {
    Task { @MainActor in
      guard self.room === room else { return }
      self.speaking = Set(participants.compactMap { $0.identity?.stringValue })
      self.send?([
        "type": "microphone", "room": self.roomId, "enabled": self.microphone,
        "speaking": participants.contains { $0.identity == room.localParticipant.identity },
      ])
      self.objectWillChange.send()
    }
  }
  nonisolated func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
    Task { @MainActor in
      if self.room === room {
        self.endBroadcast()
        self.watch(nil)
        self.selectedVideo = nil
        self.speaking = []
        self.connected = false
        self.microphone = false
        self.camera = false
        self.sharing = false
        self.error =
          error?.localizedDescription ?? "Media disconnected. Retry the connection."
      }
    }
  }
}
