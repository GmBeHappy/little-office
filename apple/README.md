# Little Office for Apple platforms

SwiftUI with native Liquid Glass for the app screens, SpriteKit for the office, LiveKit Swift **2.17.0** for media, and a nonpersistent WKWebView **only for the shared Excalidraw whiteboard**. Both platforms use the existing Elysia API and workspace memberships.

Open `LittleOffice.xcodeproj`, choose the **LittleOffice** scheme, then **My Mac** or an iPhone simulator. Minimum deployment targets are **macOS 26 / iOS 26**. The project was compiled with Xcode 27; LiveKit requires Swift 6.1 or newer. The project uses team `2L9PQLRQ83` and bundle ID `dev.littleoffice.app`; a signed-in authorized Apple account and provisioning are required for device/distribution builds. See [beta delivery](RELEASE.md) for Xcode Cloud setup.

Start the web/API/database using the repository's existing development commands. The default app server address is `http://localhost:3000`. Only loopback HTTP is accepted; use an HTTPS server for physical devices. Sign in in the system browser, then choose **Continue to app**. Password/OIDC accounts and configured Google sign-in all use the same identity database. Invitations require a verified matching email address.

Liquid Glass uses SwiftUI’s system toolbar surfaces, `.glass` / `.glassProminent` button styles, and `GlassEffectContainer` for custom movement controls. Lists and forms keep their standard content surfaces. Build with Xcode 26 or newer; no older-OS fallback UI is included. The minimum is not a maximum: the app can run on OS 27 and later. System controls follow the running OS and the SDK used to build; new OS-specific APIs still require availability checks and acceptance testing. See [Apple’s deployment-target definition](https://help.apple.com/xcode/mac/current/en.lproj/deve69552ee5.html) and [Liquid Glass adoption guidance](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass).

## Office layout

The office keeps the web layout: a full-window map, workspace/location header, left navigation rail, right People/Rooms panel, nearby-voice badge, video tiles, and a centered bottom device bar. These are SwiftUI controls on native Liquid Glass surfaces. The SpriteKit camera uses the same fill/follow/clamp behavior as the web camera. On narrow windows/iPhone the People/Rooms panel becomes a dismissible overlay and the bottom controls use icons; touch movement is available by dragging the map or using the direction pad. The workspace chooser and management forms remain native screens.

## Avatar controls and animation

The SpriteKit scene updates every display frame with the web's 65 ms position interpolation, four 110 ms walking frames (`0, 4, 0, -4` pixel strides), mirrored left-facing artwork, walking bob, 520 ms jump arc plus 130 ms landing squash, pose settling/sleep breathing, and 500 ms nudge reaction. Server events drive local and remote jumps, waves, emoji, and nudges. Fishing uses the same cast/wait/catch geometry and server timestamps as the web, including custom-avatar skin colors. Reduce Motion disables secondary pose/nudge/fishing motion as on the web.

- **WASD/arrows:** walk; **Space:** jump; **Z:** nudge the teammate in front.
- **1 / 2 / 3** (including numpad): toggle sit / sleep / fish; moving or jumping stands up.
- **iPhone:** drag anywhere on the map with a 10-point dead zone and the same diagonal threshold as the web; release/cancel stops. The direction pad and Jump button are also available.
- **Emote menu:** emoji, jump, nudge, poses, and leave conversation. More emoji accepts the system emoji keyboard/paste; the server validates it. The People menu adds targeted Wave.

Inputs stop when the app loses focus, a sheet/dialog opens, search takes focus, or the workspace closes. Movement messages run every 80 ms and sequence numbers catch up to the authoritative snapshot after reconnect. The shared web nudge sound is bundled directly from `public/sounds/nudge.wav`.

Local Mac smoke checks also passed sit/sleep shortcuts, jumping from sleep, map refocus after search, direction-pad walking, Z nudge with a visible recipient `!`, a custom emoji rendered above the avatar, and a targeted wave observed by the second account. The second local account observed jump/nudge events and changing positions; typing WASD/Space into search did not move or jump. iPhone drag gestures have build/unit coverage but still need device acceptance testing. Wildlife/farm **E** interactions are part of the remaining mini-game work below, not this avatar-controls implementation.

## What is included

- Keychain credentials, PKCE browser handoff, workspace picker, create/join/invite/member-role management.
- Per-workspace WebSocket sessions, explicit takeover, reconnect, cleanup on switch/logout/background.
- Native rendering of every map and preset/custom avatar from the existing TypeScript drawing functions. Scene geometry and artwork come from authenticated API manifests.
- Keyboard and touch movement, room entry, status/poses, calls/summons/nudges, camera/microphone controls, nearby subscriptions, screen receive/publish through LiveKit.
- Whiteboard-only web surface with an HTTP-only session cookie, same-origin navigation, nonpersistent storage, and disposal on workspace/room changes.

## Validation and release limits

Unsigned **macOS arm64** and **iOS Simulator arm64** builds pass. Release archive checks on 22 October 2026 also pass for **iOS arm64** and **macOS universal (arm64 + x86_64)**, including the app icon catalog and distribution metadata. Ten Swift tests cover actual server fixtures, PKCE/request-origin restrictions, avatar timing, touch input, and 88 fishing frames generated by the web renderer. A native-atlas regression test compares all directions/poses/strides for preset and custom avatars against the shared TypeScript drawing function. A local macOS 27.0.1 smoke test on 10 October 2026 passed browser sign-in and Keychain restore, workspace creation/switching, native map/presence rendering, movement, status changes, and meeting-room entry. A second test account observed the movement and confirmed that switching removes presence from the previous workspace. Local LiveKit received microphone and camera publications and media packets; both devices were turned off after testing.

The smoke test found and fixed two UI issues: workspace rows lacked an explicit accessibility activation action, and the whiteboard WebView needed an explicit minimum/flexible frame inside its SwiftUI sheet. The embedded Excalidraw page now loads with its toolbar and Saved status, and tool selection works. Drawing gestures and save/reopen persistence inside WKWebView remain unverified because the UI automation could not reliably target canvas coordinates.

This is a development client, **not a signed beta or full web-feature-parity release**. Device-based web↔Mac↔iPhone audio/video/TURN, Bluetooth/interruption handling, screen-capture permissions, OAuth-provider redirects, and embedded editor interaction still need acceptance testing. On iOS versions that lack the SDK's system screen picker, the default capture shares the app screen; no Broadcast Upload Extension is included. Backgrounding ends office/media participation; there is no incoming-call push or CallKit integration.

Wildlife/mini-game animation, full profile/appearance editing, activity-log/settings parity, full Thai localization, and whiteboard file download handling are not yet native-complete. The whiteboard web surface blocks navigation to external file URLs. Signing metadata, app icons, and an Xcode Cloud test hook are prepared. The signed cloud build, Apple processing, and TestFlight availability must be verified separately; see [beta delivery](RELEASE.md). No production migration is performed by the Apple workflow.

## Checks

```sh
bun run native:fixtures
swift test --package-path apple/LittleOfficeKit
xcodebuild -project apple/LittleOffice.xcodeproj -scheme LittleOffice \
  -destination 'platform=macOS,arch=arm64' ONLY_ACTIVE_ARCH=YES ARCHS=arm64 CODE_SIGNING_ALLOWED=NO build
xcodebuild -project apple/LittleOffice.xcodeproj -scheme LittleOffice \
  -destination 'generic/platform=iOS Simulator' ONLY_ACTIVE_ARCH=YES ARCHS=arm64 CODE_SIGNING_ALLOWED=NO build
```

`Package.resolved` pins the SDK and its binary dependencies. Fixtures are regenerated with `scripts/native-fixtures.ts`; no hand-maintained duplicate map rules are used.

API details: [native contract](../docs/native-contract.md). Upgrade instructions: [workspace rollout](../docs/workspace-rollout.md).
