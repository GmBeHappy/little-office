# Little Office for Apple platforms

SwiftUI with native Liquid Glass for the app screens, SpriteKit for the office, LiveKit Swift **2.17.0** for media, and a nonpersistent WKWebView **only for the shared Excalidraw whiteboard**. Both platforms use the existing Elysia API and workspace memberships.

Open `LittleOffice.xcodeproj`, choose the **LittleOffice** scheme, then **My Mac** or an iPhone simulator. Minimum deployment targets are **macOS 26 / iOS 26**. The project was compiled with Xcode 27; LiveKit requires Swift 6.1 or newer. The project uses team `2L9PQLRQ83` and bundle ID `dev.littleoffice.app`; a signed-in authorized Apple account and provisioning are required for device/distribution builds. See [beta delivery](RELEASE.md) for Xcode Cloud setup.

Start the web/API/database using the repository's existing development commands. The default app server address is `https://app.littleoffice.app`; an explicitly saved development server remains selected. Use `http://localhost:3000` for local development. Only loopback HTTP is accepted; use an HTTPS server for physical devices. Sign in in the system browser, then choose **Continue to app**. Password/OIDC accounts and configured Google sign-in all use the same identity database. Invitations require a verified matching email address.

Liquid Glass uses SwiftUI’s system toolbar surfaces, `.glass` / `.glassProminent` button styles, and `GlassEffectContainer` for custom movement controls. Lists and forms keep their standard content surfaces. Build with Xcode 26 or newer; no older-OS fallback UI is included. The minimum is not a maximum: the app can run on OS 27 and later. System controls follow the running OS and the SDK used to build; new OS-specific APIs still require availability checks and acceptance testing. See [Apple’s deployment-target definition](https://help.apple.com/xcode/mac/current/en.lproj/deve69552ee5.html) and [Liquid Glass adoption guidance](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass).

## Office layout

The office keeps the web layout: a full-window map, workspace/location header, left navigation rail, right People/Rooms panel, nearby-voice badge, video tiles, and a centered bottom device bar. These are SwiftUI controls on native Liquid Glass surfaces. The SpriteKit camera uses the same fill/follow/clamp behavior as the web camera. On narrow windows/iPhone the People/Rooms panel becomes a dismissible overlay and the bottom controls use icons; touch movement is available by dragging the map or using the direction pad. The welcome and workspace chooser use the Little Office cream/forest/sage palette, the shared zen pixel artwork, and native Liquid Glass cards. Workspace discovery keeps credentials and API calls on the canonical portal, passing only a validated workspace hint into browser authorization; custom development servers remain an explicit choice. Management forms remain native.

## Avatar controls and animation

The SpriteKit scene updates every display frame with the web's 65 ms position interpolation, four 110 ms walking frames (`0, 4, 0, -4` pixel strides), mirrored left-facing artwork, walking bob, 520 ms jump arc plus 130 ms landing squash, pose settling/sleep breathing, and 500 ms nudge reaction. Server events drive local and remote jumps, waves, emoji, and nudges. Fishing uses the same cast/wait/catch geometry and server timestamps as the web, including custom-avatar skin colors. Reduce Motion disables secondary pose/nudge/fishing motion as on the web.

- **WASD/arrows:** walk; **Space:** jump; **Z:** nudge the teammate in front.
- **1 / 2 / 3** (including numpad): toggle sit / sleep / fish; moving or jumping stands up.
- **iPhone:** drag anywhere on the map with a 10-point dead zone and the same diagonal threshold as the web; release/cancel stops. The direction pad and Jump button are also available.
- **Emote menu:** emoji, jump, nudge, poses, and leave conversation. More emoji accepts the system emoji keyboard/paste; the server validates it. The People menu adds targeted Wave.

Inputs stop when the app loses focus, a sheet/dialog opens, search takes focus, or the workspace closes. Movement messages run every 80 ms and sequence numbers catch up to the authoritative snapshot after reconnect. The shared web nudge sound is bundled directly from `public/sounds/nudge.wav`.

Local Mac smoke checks also passed sit/sleep shortcuts, jumping from sleep, map refocus after search, direction-pad walking, Z nudge with a visible recipient `!`, a custom emoji rendered above the avatar, and a targeted wave observed by the second account. The second local account observed jump/nudge events and changing positions; typing WASD/Space into search did not move or jump. iPhone drag gestures have build/unit coverage but still need device acceptance testing. **E** or the mobile action button performs the nearest eligible habitat/farm interaction. Server habitat revision checks remain authoritative.

## Feature coverage

- Keychain/PKCE browser sign-in, fresh personal reauthentication, workspace switching, create/join/invite/member roles and removed-member restore.
- Profile name, six avatar presets and skin/hair/hat/outfit editing with rotate/randomize; four availabilities, eight status presets and the same icon palette/activity precedence as the web. Workspace SSO sessions cannot edit the global name/avatar.
- Native office/people/rooms layout, locks, occupancy, status bubbles, speaking indicators, configurable 8–16 point name tags and 0–100% background opacity, English/Thai strings, Reduce Motion and help.
- All 15 maps consume the backend animation manifest: ambient effects, wildlife routes/poses, shared station stages and affection, nearest-target interactions. Local farm eggs/crops/roaming hens/cow/sheep and pickup art use the exported web artwork/rules. The web farm remains local per client; it is not invented as new shared server state.
- Camera/screen distinction, filmstrip/grid/pinned/expanded views, screen viewer reporting and same-room viewer lists; device selection, camera flip, capture quality, nearby subscriptions with the web volume attenuation, retry and capture-stop recovery.
- Optional app audio uses LiveKit’s supported microphone mixer: choose it before sharing; microphone mute also mutes app audio. Camera quality republishes the encoder; screen quality changes require stop/restart.
- macOS display/window capture chooser. iOS ReplayKit broadcast extension supports cross-app sharing after signing/App Group provisioning. Only a server-authorized presenter can publish; cancellation/timeout, room changes, disconnect and logout stop capture. Background office connection remains alive only during pending/active sharing.
- Workspace map/daily rotation/features with revision checks, owner activity filter/pagination, organization OIDC form/DNS verification/enable-disable and browser account recovery linking. Secrets remain blank on reads, and the backend retains personal-account, fresh-authentication and role checks. Global operator controls include local-account creation, approval/disable, role changes, delete, password reset, login-method policy and storage checks. Self/owner/SSO protections are reflected in UI and remain enforced by the backend.
- Whiteboard remains the only WebView. Its host-only HTTP-only cookie is kept in a nonpersistent store. Workspace file downloads and same-origin blob exports use WKDownload; bearer credentials are not forwarded to S3. Loading/errors/export sharing and disposal on room/workspace/logout/feature change are covered in the native lifecycle. Native Done checks the editor’s unsaved/in-flight guard, swipe dismissal is disabled, and the shared `littleoffice-whiteboard-closed` event closes the native sheet after the web guard.

## Validation and release limits

The previous signed TestFlight build predates these parity changes. Do not infer delivery of this branch from that build. New code must be reviewed, merged, signed and processed by Xcode Cloud.

Latest local verification: 21 Swift tests passed and unsigned macOS/iOS simulator builds passed, including the iOS broadcast extension. The final branded iOS build installed/launched on iPhone 17 Pro (iOS 26.1). CUA verified its compact welcome screen, visible primary action, no horizontal overflow, and workspace-address sheet; the Device Hub screenshot export was inspected. After the matching backend rollout, the copied `https://gmtech.littleoffice.app/` address resolved successfully in the actual app and displayed GMTECH while retaining the canonical API origin. Authenticated workspace-chooser/office UI and macOS visual acceptance remain outstanding; no authenticated smoke-test success is implied.

The Swift package includes canonical backend-generated route/pose, habitat pixel, ambient effect, farm drawing/interaction and feature-boundary vectors across all 15 maps, plus the existing PKCE/origin, movement/jump and fishing tests. Run the commands below for the current test/build result; unsigned builds do not establish ReplayKit or hardware acceptance.

Still required on signed physical devices: cross-app ReplayKit stop/resume/background behavior, web↔Mac↔iPhone audio/video/TURN, hardware camera/microphone/speaker changes, Bluetooth/interruption handling, fresh provider sign-in and workspace-SSO restrictions, and Excalidraw drawing/export/save-reopen persistence. No production camera or microphone test is implied by simulator/build checks. Incoming-call push and CallKit are outside the existing web feature set.

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
