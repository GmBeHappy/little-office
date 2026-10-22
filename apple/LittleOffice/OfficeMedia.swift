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
  private var roomId = ""
  private var generation = UUID()
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
    let next = snapshot.me?.room ?? ""
    guard next != roomId else {
      updateSubscriptions()
      return
    }
    let epoch = UUID()
    generation = epoch
    roomId = next
    connection?.cancel()
    subscriptions?.cancel()
    let old = room
    room = nil
    microphone = false
    camera = false
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
    do {
      try await room.localParticipant.setMicrophone(enabled: next)
      microphone = next
      send?(["type": "microphone", "room": roomId, "enabled": next])
    } catch { self.error = error.localizedDescription }
  }
  func toggleCamera() async {
    guard let room, connected else { return }
    do {
      try await room.localParticipant.setCamera(enabled: !camera)
      camera.toggle()
    } catch { self.error = error.localizedDescription }
  }
  func requestScreenShare() { send?(["type": "present", "enabled": !sharing]) }
  func share(authorized: Bool) async {
    guard let room, connected else { return }
    do {
      try await room.localParticipant.setScreenShare(enabled: authorized)
      sharing = authorized
      send?(["type": "screen-share", "room": roomId, "enabled": authorized])
    } catch {
      self.error = error.localizedDescription
      sharing = false
      send?(["type": "present", "enabled": false])
    }
  }
  struct Video: Identifiable {
    let id: String
    let name: String
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
          id: publication.sid.stringValue, name: participant.name ?? "Teammate", track: track)
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
  ) { Task { @MainActor in if self.room === room { self.objectWillChange.send() } } }
  nonisolated func room(
    _ room: Room, participant: RemoteParticipant,
    didUnsubscribeTrack publication: RemoteTrackPublication
  ) { Task { @MainActor in if self.room === room { self.objectWillChange.send() } } }
  nonisolated func room(_ room: Room, didUpdateSpeakingParticipants participants: [Participant]) {
    Task { @MainActor in
      guard self.room === room else { return }
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
        self.connected = false
        self.microphone = false
        self.camera = false
        self.sharing = false
        self.error =
          error?.localizedDescription ?? "Media disconnected. Reconnect the office to retry."
      }
    }
  }
}
