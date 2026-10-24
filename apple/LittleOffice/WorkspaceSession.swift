import AVFoundation
import Combine
import Foundation
import LittleOfficeKit
import SwiftUI

@MainActor
final class WorkspaceSession: ObservableObject, Identifiable {
  let id = UUID()
  let workspace: Workspace
  let api: OfficeAPI
  @Published var snapshot: Snapshot?
  @Published var manifest: SceneManifest?
  @Published var avatars: [String: AvatarManifest] = [:]
  @Published var invitations: [Invitation] = []
  @Published var connected = false
  @Published var needsTakeover = false
  @Published var error = ""
  @Published var notice = ""
  @Published var profile: ProfileResponse?
  @Published var showingBoard = false
  @Published var showingEmotePicker = false
  let media = OfficeMedia()
  let effects = PassthroughSubject<OfficeEffect, Never>()
  let resetInput = PassthroughSubject<Void, Never>()
  private var chime: AVAudioPlayer?
  private var socket: URLSessionWebSocketTask?
  private var receiver: Task<Void, Never>?
  private var pulse: Task<Void, Never>?
  private var reconnect: Task<Void, Never>?
  private var retryDelay = 2.0
  private var generation = UUID()
  private var sequence = 0
  private var direction = (0, 0)
  private var loadingAvatars = Set<String>()
  init(workspace: Workspace, api: OfficeAPI) {
    self.workspace = workspace
    self.api = api
  }
  func connect(takeover: Bool = false) {
    guard receiver == nil else { return }
    reconnect?.cancel()
    reconnect = nil
    let epoch = UUID()
    generation = epoch
    error = ""
    needsTakeover = false
    receiver = Task { [weak self] in
      guard let self else { return }
      do {
        let config: OfficeConfig = try await api.call(api.workspacePath(workspace.id, "/config"))
        guard config.protocolVersion == 1 else {
          throw APIError(status: 426, message: "Update Little Office to connect to this server.")
        }
        let manifest: SceneManifest = try await api.call(api.workspacePath(workspace.id, "/scene"))
        guard !Task.isCancelled, generation == epoch else { return }
        self.manifest = manifest
        let socket = try api.socket(workspaceId: workspace.id, takeover: takeover)
        self.socket = socket
        socket.resume()
        pulse = Task { [weak self] in
          while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(80))
            guard let self, !Task.isCancelled else { return }
            if self.connected { self.sendMove() }
          }
        }
        while !Task.isCancelled {
          let message = try await socket.receive()
          let data: Data
          switch message {
          case .data(let value): data = value
          case .string(let value): data = Data(value.utf8)
          @unknown default: continue
          }
          guard generation == epoch, !Task.isCancelled else { return }
          try handle(data, mediaEnabled: config.mediaConfigured)
        }
      } catch {
        guard generation == epoch, !Task.isCancelled else { return }
        needsTakeover = socket?.closeCode.rawValue == 4001
        self.error =
          needsTakeover ? "This workspace is open on another device." : error.localizedDescription
        resetInput.send()
        direction = (0, 0)
        connected = false
        showingBoard = false
        snapshot = nil
        pulse?.cancel()
        pulse = nil
        socket?.cancel(with: .goingAway, reason: nil)
        self.socket = nil
        await media.stop()
        receiver = nil
        let apiFailure = error as? APIError
        if !needsTakeover && ![401, 403, 426].contains(apiFailure?.status ?? 0) {
          let delay = retryDelay
          retryDelay = min(30, retryDelay * 2)
          reconnect = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !Task.isCancelled, generation == epoch else { return }
            connect()
          }
        }
      }
    }
  }
  private func handle(_ data: Data, mediaEnabled: Bool) throws {
    guard let event = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      event["workspaceId"] as? String == workspace.id
    else { return }
    switch event["type"] as? String {
    case "snapshot":
      let next = try JSONDecoder().decode(Snapshot.self, from: data)
      guard next.protocolVersion == 1 else {
        throw APIError(status: 426, message: "Update Little Office.")
      }
      if let old = snapshot, old.workspace.revision != next.workspace.revision {
        showingBoard = false
        Task { [weak self] in
          guard let self else { return }
          do {
            let nextManifest: SceneManifest = try await api.call(
              api.workspacePath(workspace.id, "/scene"))
            if nextManifest.revision == self.snapshot?.workspace.revision {
              self.manifest = nextManifest
            }
          } catch { self.error = error.localizedDescription }
        }
      }
      if snapshot?.me?.zone != next.me?.zone { showingBoard = false }
      sequence = max(sequence, next.me?.seq ?? 0)
      snapshot = next
      connected = true
      retryDelay = 2
      invitations.removeAll { $0.expires <= Date().timeIntervalSince1970 * 1000 }
      if mediaEnabled {
        media.update(
          next, api: api, workspaceId: workspace.id, send: { [weak self] in self?.send($0) })
      }
      for appearance in Set(next.people.map(\.avatar))
      where avatars[appearance] == nil && !loadingAvatars.contains(appearance) {
        loadingAvatars.insert(appearance)
        Task { [weak self] in
          guard let self else { return }
          defer { loadingAvatars.remove(appearance) }
          do {
            let value: AvatarManifest = try await api.call(
              api.workspacePath(workspace.id, "/avatar?appearance=\(appearance)"))
            avatars[appearance] = value
          } catch { self.error = error.localizedDescription }
        }
      }
    case "jump", "emote", "wave", "nudge-animation":
      effects.send(try JSONDecoder().decode(OfficeEffect.self, from: data))
      if event["type"] as? String == "wave", event["to"] as? String == snapshot?.selfId,
        event["silent"] as? Bool != true
      {
        notice = "\(event["name"] as? String ?? "Someone") waved at you."
      }
    case "nudge", "nudge-sent":
      if event["type"] as? String == "nudge" {
        notice = "\(event["name"] as? String ?? "Someone") nudged you."
      }
      if let url = Bundle.main.url(forResource: "nudge", withExtension: "wav") {
        chime?.stop()
        chime = try? AVAudioPlayer(contentsOf: url)
        chime?.volume = 0.5
        chime?.play()
      }
    case "invitation":
      if let raw = event["invitation"] {
        invitations.append(
          try JSONDecoder().decode(
            Invitation.self, from: JSONSerialization.data(withJSONObject: raw)))
      }
    case "invitation-ended": invitations.removeAll { $0.id == event["id"] as? String }
    case "notice", "error": notice = event["message"] as? String ?? ""
    case "presenter": Task { await media.share(authorized: event["enabled"] as? Bool ?? false) }
    case "user-updated":
      Task {
        do { profile = try await api.call(api.workspacePath(workspace.id, "/me")) } catch {
          self.error = error.localizedDescription
        }
      }
    default: break
    }
  }
  func send(_ command: [String: Any]) {
    guard let socket, let data = try? JSONSerialization.data(withJSONObject: command),
      let text = String(data: data, encoding: .utf8)
    else { return }
    socket.send(.string(text)) { _ in }
  }
  func move(_ dx: Int, _ dy: Int) {
    guard direction != (dx, dy) else { return }
    direction = (dx, dy)
    sendMove()
  }
  func perform(_ action: String) {
    guard connected else { return }
    switch action {
    case "jump", "nudge": send(["type": action])
    case "stand", "sit", "sleep", "fish":
      resetInput.send()
      move(0, 0)
      send(["type": "pose", "pose": snapshot?.me?.pose == action ? "stand" : action])
    default: break
    }
  }
  private func sendMove() {
    guard connected else { return }
    sequence = max(sequence, snapshot?.me?.seq ?? 0) + 1
    send(["type": "move", "dx": direction.0, "dy": direction.1, "seq": sequence])
  }
  func respond(_ invitation: Invitation, accept: Bool) {
    send(["type": "respond", "id": invitation.id, "accept": accept])
    invitations.removeAll { $0.id == invitation.id }
  }
  func stop() async {
    generation = UUID()
    reconnect?.cancel()
    reconnect = nil
    resetInput.send()
    chime?.stop()
    direction = (0, 0)
    showingBoard = false
    showingEmotePicker = false
    receiver?.cancel()
    receiver = nil
    pulse?.cancel()
    pulse = nil
    socket?.cancel(with: .normalClosure, reason: nil)
    socket = nil
    connected = false
    snapshot = nil
    invitations = []
    await media.stop()
  }
}
