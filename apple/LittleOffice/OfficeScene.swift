import LittleOfficeKit
import SpriteKit

@MainActor
final class OfficeScene: SKScene {
  var moveInput: ((Int, Int) -> Void)?
  var action: ((String) -> Void)?
  var selectPerson: ((String) -> Void)?
  var reducedMotion = false
  var inputEnabled = true { didSet { if !inputEnabled { stopInput() } } }
  private var revision = -1
  private var people: [Person] = []
  private var selfId = ""
  private var avatars: [String: AvatarManifest] = [:]
  private var figures: [String: Figure] = [:]
  private var textures: [String: SKTexture] = [:]
  private var keys = Set<UInt16>()
  private var lastTime: Double?
  private var background: SKSpriteNode?
  private let labels = SKNode()
  private let viewport = SKCameraNode()
  private var worldSize = CGSize(width: 1120, height: 720)
  private var focus = CGPoint(x: 560, y: 360)
  #if os(iOS)
    private var walkingTouch: UITouch?
    private var touchOrigin: CGPoint?
    private var dragged = false
    private let stick = SKShapeNode(circleOfRadius: 44)
    private let thumb = SKShapeNode(circleOfRadius: 14)
  #endif

  private final class Figure: SKNode {
    var motion = AvatarAnimation()
    let body = SKSpriteNode()
    let shadow = SKShapeNode()
    let ring = SKShapeNode(ellipseOf: CGSize(width: 37, height: 17))
    let nudge = SKShapeNode()
    let nameLabel = SKLabelNode(fontNamed: "Helvetica-Bold")
    let plate = SKShapeNode()
    let reaction = SKLabelNode(fontNamed: "Helvetica-Bold")
    var fishing: [UInt32: SKShapeNode] = [:]
    override init() {
      super.init()
      body.anchorPoint = CGPoint(x: 0.5, y: 28.0 / 80)
      shadow.fillColor = SKColor(red: 92.0 / 255, green: 101.0 / 255, blue: 81.0 / 255, alpha: 1)
      shadow.strokeColor = .clear
      shadow.zPosition = -3
      ring.strokeColor = SKColor(red: 1, green: 0.97, blue: 0.85, alpha: 0.9)
      ring.lineWidth = 2
      ring.position.y = -3
      ring.zPosition = -2
      nudge.strokeColor = SKColor(red: 239.0 / 255, green: 184.0 / 255, blue: 101.0 / 255, alpha: 1)
      nudge.position.y = -3
      nudge.lineWidth = 2
      nudge.zPosition = -1
      nameLabel.fontSize = 12
      nameLabel.fontColor = SKColor(red: 0.23, green: 0.28, blue: 0.22, alpha: 1)
      nameLabel.verticalAlignmentMode = .center
      nameLabel.zPosition = 5
      plate.fillColor = SKColor(red: 0.98, green: 0.97, blue: 0.91, alpha: 1)
      plate.strokeColor = .clear
      plate.zPosition = 4
      reaction.fontSize = 24
      reaction.verticalAlignmentMode = .bottom
      reaction.zPosition = 6
      for node in [shadow, ring, nudge, body, plate, nameLabel, reaction] { addChild(node) }
    }
    required init?(coder: NSCoder) { fatalError("Use init()") }
  }
  override init(size: CGSize) {
    super.init(size: size)
    scaleMode = .resizeFill
    backgroundColor = .black
    isUserInteractionEnabled = true
    addChild(labels)
    addChild(viewport)
    camera = viewport
    #if os(iOS)
      stick.strokeColor = .white.withAlphaComponent(0.6)
      stick.fillColor = .black.withAlphaComponent(0.15)
      thumb.fillColor = .white.withAlphaComponent(0.6)
      thumb.strokeColor = .clear
      stick.addChild(thumb)
      stick.zPosition = 10000
      stick.isHidden = true
      addChild(stick)
    #endif
  }
  required init?(coder: NSCoder) { fatalError("Use init(size:)") }
  func render(manifest: SceneManifest, snapshot: Snapshot?, avatars: [String: AvatarManifest]) {
    self.avatars = avatars
    if revision != manifest.revision {
      revision = manifest.revision
      worldSize = CGSize(width: manifest.width, height: manifest.height)
      background?.removeFromParent()
      let node = SKSpriteNode(
        texture: texture(
          manifest.rectangles, width: Int(manifest.width), height: Int(manifest.height)))
      node.anchorPoint = .zero
      node.zPosition = -1000
      addChild(node)
      background = node
      labels.removeAllChildren()
      for label in manifest.labels {
        let node = SKLabelNode(fontNamed: "Menlo-Bold")
        node.text = label.text
        node.fontSize = label.size
        node.fontColor = color(
          UInt32(label.color.replacingOccurrences(of: "#", with: ""), radix: 16) ?? 0xffffff)
        node.position = CGPoint(x: label.x, y: worldSize.height - label.y)
        labels.addChild(node)
      }
    }
    people = snapshot?.people ?? []
    selfId = snapshot?.selfId ?? ""
    let ids = Set(people.map(\.id))
    for id in Array(figures.keys) where !ids.contains(id) {
      figures.removeValue(forKey: id)?.removeFromParent()
    }
    for person in people where figures[person.id] == nil {
      let figure = Figure()
      figure.position = CGPoint(x: person.x, y: worldSize.height - person.y)
      figures[person.id] = figure
      addChild(figure)
    }
  }
  func receive(_ event: OfficeEffect) {
    let now = ProcessInfo.processInfo.systemUptime * 1000
    switch event.type {
    case "jump": figures[event.from]?.motion.jumpStart = now
    case "emote":
      figures[event.from]?.motion.emote = event.emoji ?? ""
      figures[event.from]?.motion.emoteUntil = now + 3000
    case "wave": figures[event.from]?.motion.waveUntil = now + 2600
    case "nudge-animation":
      figures[event.from]?.motion.nudgeStart = now
      figures[event.from]?.motion.nudgeSender = true
      if let to = event.to {
        figures[to]?.motion.nudgeStart = now
        figures[to]?.motion.nudgeSender = false
      }
    default: break
    }
  }
  override func update(_ currentTime: TimeInterval) {
    let time = ProcessInfo.processInfo.systemUptime * 1000
    let delta = lastTime.map { max(0, time - $0) } ?? 0
    lastTime = time
    let wallTime = Date().timeIntervalSince1970 * 1000
    for person in people {
      guard let figure = figures[person.id] else { continue }
      let blend = min(1, delta / 65)
      figure.position.x += (person.x - figure.position.x) * blend
      figure.position.y += (worldSize.height - person.y - figure.position.y) * blend
      figure.zPosition = 1000 + person.y
      let frame = figure.motion.update(
        time: time, delta: delta, moving: person.moving,
        pose: person.pose, direction: person.direction, reducedMotion: reducedMotion)
      let frameName = "\(person.direction)-\(person.pose)-\(frame.index)"
      let key = "\(person.avatar):\(frameName)"
      if textures[key] == nil, let rects = avatars[person.avatar]?.frames[frameName] {
        textures[key] = texture(rects, width: 72, height: 80, offsetX: 36, offsetY: 52)
      }
      if let texture = textures[key], figure.body.texture !== texture {
        figure.body.texture = texture
        figure.body.size = texture.size()
      }
      figure.body.xScale = 1 + frame.squash / 2
      figure.body.yScale = 1 - frame.squash
      figure.body.position = CGPoint(
        x: frame.offsetX,
        y: frame.height - frame.offsetY - 8 * frame.squash - frame.bob * (1 - frame.squash))
      figure.shadow.path = CGPath(
        ellipseIn: CGRect(
          x: -(31 - frame.height * 0.3) / 2, y: -4 - (12 - frame.height * 0.1) / 2,
          width: 31 - frame.height * 0.3, height: 12 - frame.height * 0.1), transform: nil)
      figure.shadow.alpha = 0.18 - frame.height / 400
      figure.ring.isHidden = person.id != selfId
      figure.nudge.path = CGPath(
        ellipseIn: CGRect(
          x: -(40 + frame.nudgeMotion * 15) / 2,
          y: -(19 + frame.nudgeMotion * 5) / 2, width: 40 + frame.nudgeMotion * 15,
          height: 19 + frame.nudgeMotion * 5), transform: nil)
      figure.nudge.alpha = frame.nudgeOpacity
      let name =
        person.name + (person.id == selfId ? " · you" : "") + (person.microphone ? " 🎙" : "")
      if figure.nameLabel.text != name {
        figure.nameLabel.text = name
        figure.plate.path = CGPath(
          roundedRect: CGRect(
            x: -figure.nameLabel.frame.width / 2 - 6,
            y: -10, width: figure.nameLabel.frame.width + 12, height: 20), cornerWidth: 2,
          cornerHeight: 2, transform: nil)
      }
      let fishingActive = person.fishing.map { $0.phase(at: wallTime) != "idle" } ?? false
      let fishingSpace = person.direction == "up" && fishingActive ? 28.0 : 0
      figure.nameLabel.position.y = 57 + frame.height + fishingSpace
      figure.plate.position.y = figure.nameLabel.position.y
      figure.reaction.text = frame.reaction
      figure.reaction.position.y = 66 + frame.height + fishingSpace
      drawFishing(person, figure: figure, time: wallTime)
      if person.id == selfId { focus = figure.position }
    }
    updateViewport()
  }
  private func drawFishing(_ person: Person, figure: Figure, time: Double) {
    let rects =
      person.fishing?.rectangles(
        at: time, skin: avatars[person.avatar]?.skin ?? 0xe5b28b,
        reducedMotion: reducedMotion) ?? []
    var paths: [UInt32: CGMutablePath] = [:]
    for rect in rects {
      let path = paths[rect.color] ?? CGMutablePath()
      path.addRect(CGRect(x: rect.x, y: -rect.y - rect.h, width: rect.w, height: rect.h))
      paths[rect.color] = path
    }
    for (color, node) in figure.fishing { node.isHidden = paths[color] == nil }
    for (rgb, path) in paths {
      let node = figure.fishing[rgb] ?? SKShapeNode()
      if node.parent == nil {
        node.fillColor = color(rgb)
        node.strokeColor = .clear
        node.isAntialiased = false
        figure.addChild(node)
        figure.fishing[rgb] = node
      }
      node.path = path
      node.isHidden = false
      node.zPosition = person.direction == "up" ? -0.5 : 1
    }
  }
  override func didChangeSize(_ oldSize: CGSize) { updateViewport() }
  private func updateViewport() {
    guard size.width > 0, size.height > 0 else { return }
    let scale = min(worldSize.width / size.width, worldSize.height / size.height)
    viewport.setScale(scale)
    let halfWidth = size.width * scale / 2
    let halfHeight = size.height * scale / 2
    viewport.position = CGPoint(
      x: min(max(focus.x, halfWidth), worldSize.width - halfWidth),
      y: min(max(focus.y, halfHeight), worldSize.height - halfHeight))
  }
  func stopInput() {
    keys.removeAll()
    moveInput?(0, 0)
    #if os(iOS)
      walkingTouch = nil
      touchOrigin = nil
      stick.isHidden = true
    #endif
  }
  private func select(at point: CGPoint) {
    if let person = people.sorted(by: { $0.y > $1.y }).first(where: {
      guard let figure = figures[$0.id] else { return false }
      return CGRect(x: figure.position.x - 22, y: figure.position.y - 10, width: 44, height: 75)
        .contains(point)
    }) {
      selectPerson?(person.id)
    }
  }
  private func color(_ rgb: UInt32) -> SKColor {
    SKColor(
      red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255,
      blue: CGFloat(rgb & 255) / 255, alpha: 1)
  }
  private func texture(
    _ rectangles: [DrawingRect], width: Int, height: Int, offsetX: Double = 0, offsetY: Double = 0
  ) -> SKTexture {
    let context = CGContext(
      data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.translateBy(x: offsetX, y: Double(height) - offsetY)
    context.scaleBy(x: 1, y: -1)
    for rect in rectangles {
      context.setFillColor(color(rect.color).cgColor)
      context.fill(CGRect(x: rect.x, y: rect.y, width: rect.w, height: rect.h))
    }
    let texture = SKTexture(cgImage: context.makeImage()!)
    texture.filteringMode = .nearest
    return texture
  }
  #if os(macOS)
    override func didMove(to view: SKView) {
      view.window?.makeFirstResponder(view)
      NotificationCenter.default.addObserver(
        self, selector: #selector(lostFocus),
        name: NSWindow.didResignKeyNotification, object: nil)
    }
    override func willMove(from view: SKView) {
      stopInput()
      NotificationCenter.default.removeObserver(self)
    }
    @objc private func lostFocus() { stopInput() }
    override func mouseDown(with event: NSEvent) {
      guard inputEnabled else { return }
      view?.window?.makeFirstResponder(view)
      select(at: event.location(in: self))
    }
    override func keyDown(with event: NSEvent) {
      guard inputEnabled, event.modifierFlags.intersection([.command, .control, .option]).isEmpty
      else { return }
      let actions: [UInt16: String] = [
        49: "jump", 6: "nudge", 18: "sit", 19: "sleep", 20: "fish", 83: "sit", 84: "sleep",
        85: "fish",
      ]
      if let command = actions[event.keyCode] {
        if !event.isARepeat { action?(command) }
        return
      }
      keys.insert(event.keyCode)
      updateKeys()
    }
    override func keyUp(with event: NSEvent) {
      keys.remove(event.keyCode)
      updateKeys()
    }
    private func updateKeys() {
      guard inputEnabled else { return }
      let left = !keys.isDisjoint(with: [0, 123])
      let right = !keys.isDisjoint(with: [2, 124])
      let up = !keys.isDisjoint(with: [13, 126])
      let down = !keys.isDisjoint(with: [1, 125])
      moveInput?((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0))
    }
  #else
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
      guard inputEnabled, walkingTouch == nil, let touch = touches.first, let view else { return }
      walkingTouch = touch
      touchOrigin = touch.location(in: view)
      dragged = false
      stick.position = touch.location(in: self)
      thumb.position = .zero
      stick.setScale(viewport.xScale)
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
      guard inputEnabled, let touch = walkingTouch, touches.contains(touch),
        let origin = touchOrigin, let view
      else { return }
      let point = touch.location(in: view)
      let dx = point.x - origin.x
      let dy = point.y - origin.y
      let direction = AvatarAnimation.touchDirection(x: dx, y: dy)
      dragged = dragged || hypot(dx, dy) >= 10
      stick.isHidden = !dragged
      let scale = min(1, 44 / max(1, hypot(dx, dy)))
      thumb.position = CGPoint(x: dx * scale, y: -dy * scale)
      moveInput?(direction.0, direction.1)
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
      guard let touch = walkingTouch, touches.contains(touch) else { return }
      if !dragged { select(at: touch.location(in: self)) }
      stopInput()
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { stopInput() }
  #endif
}
