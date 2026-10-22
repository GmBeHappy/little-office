# Little Office for Android

Native Kotlin + Jetpack Compose client, in the same repository as the web and Apple apps. Android 8.0 (API 26) minimum; compile/target SDK 36. The dashboard, workspace settings, map, avatars and controls are native. Only the shared Excalidraw whiteboard uses a WebView.

**Developer-only beta:** this client requires the SaaS/native backend, including `/native/authorize`, `/api/native/exchange`, `/api/account`, `/api/workspaces`, `/api/saas/config` and the workspace office socket. That backend is not yet on `main` and is outside [Android PR #8](https://github.com/GmBeHappy/little-office/pull/8). Use a compatible development/test server; installing or distributing this APK does not make the current main-branch web server compatible. General testing against the main deployment must wait until the shared backend is integrated and deployed.

## Build and run

Use Android Studio with SDK 36 and JDK 21 (JDK 17 also meets AGP's minimum). Open this `android/` directory. The checked-in Gradle wrapper pins Gradle 9.1.0; AGP 9.0.1 supplies Kotlin 2.2.10, with the matching Compose compiler plugin. Library versions are pinned in `app/build.gradle.kts`; LiveKit's audio dependency is restricted to its single group on JitPack.

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk" # adjust for your machine
export JAVA_HOME="$(/usr/libexec/java_home -v 21)" # macOS
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
./gradlew :app:installDebug
```

Start the web/API stack as described in the root README. For an Android emulator or USB-connected development device:

```sh
adb reverse tcp:3000 tcp:3000
```

Keep the app's address as `http://localhost:3000` so browser login, API Origin checks and the Next proxy all agree with `APP_URL`. `10.0.2.2` is deliberately not an allowed cleartext credential origin. A deployed server must use HTTPS. A physical device can also use an HTTPS deployment without port forwarding.

Tap **Sign in with your browser**. Android Custom Tabs opens the existing web login, including Google and workspace OIDC when configured. After the browser's explicit “Continue to app” step, `littleoffice://auth` returns a one-time code to Android. No OAuth client secret is embedded in the app.

Debug APK: `app/build/outputs/apk/debug/app-debug.apk`.
Release bundle: `./gradlew :app:bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`. Local release artifacts are unsigned unless `ANDROID_KEYSTORE_FILE` and the associated signing environment variables are supplied. Firebase CI builds a signed release APK using a stable key; see [distribution setup](fastlane/SETUP.md).

## Implemented flows

- Account restore/sign-out and server selection; create/list/switch workspaces, rename/change map, invite/revoke, accept an email-bound invitation, owner membership role changes/removal. Workspace-only SSO accounts see the server-scoped list and cannot create unrelated workspaces.
- Native map rasterization from the version 1 scene manifest and version 2 avatar atlas. Drag anywhere on the map to walk; arrows/WASD also work. Jump/space, sit, sleep, fish, reactions, waves, nudges, people, private call/summon invitations, statuses and room switching use the shared server commands.
- Four 110 ms walking frames, airborne frame 4, 520 ms jump arc, 130 ms landing squash, pose settling, nudge reactions and fishing pixels follow the web/Swift timing. Server snapshots remain authoritative for position and collision.
- LiveKit microphone/camera permission prompts and native remote/local video, distance/conversation subscriptions, server-approved screen sharing with Android MediaProjection. Capture is off until explicitly enabled. Leaving/switching workspaces stops media. Backgrounding disconnects the office unless an explicit screen share is active; reconnect on returning. The SDK supplies the screen-share foreground service and system notification.
- The whiteboard is an authenticated, host-restricted WebView. It has no JavaScript credential bridge, file/content URL access, mixed content or third-party cookies. Only the configured origin can load resources. Session cookies and WebStorage are cleared on close and before a new board session; unlike WKWebView, Android WebView has no per-view nonpersistent-store API.

## Structure and security

`OfficeModel` holds account/workspace selection; `OfficeSession` owns one workspace socket, manifests and effects; `OfficeMedia` owns one LiveKit room; `OfficeMap` draws cached map pixels and interpolated people. `OfficeAPI` sends the exact configured Origin plus signed bearer token and rejects redirects. Workspace switches invalidate the prior generation and cancel its tasks before accepting new snapshots. Foreign workspace envelopes and unknown protocol versions are rejected.

`CredentialStore` encrypts both sessions and pending PKCE verifiers using Android Keystore AES-GCM, authenticating each storage slot with additional data. Backup and device-transfer rules exclude app data. The login callback validates its scheme/host/path, unique parameters and constant-time state before exchanging the single-use code. No password is stored by the app.

The backend remains the authority for workspace membership, OIDC domain verification/auto-join, invitations, room grants and movement. Android does not introduce a separate auth service or database. The native contract document belongs to the pending shared-backend integration; it is intentionally absent from this Android-only PR, so there is no standalone contract-file link here.

## Checks

Unit tests consume the same scene/avatar/snapshot and **88 fishing drawing fixtures** as Swift, directly from `apple/LittleOfficeKit/Tests/LittleOfficeKitTests/Fixtures`. They also cover PKCE RFC 7636, callback rejection, origin validation, redirect credential containment, foreign-workspace/protocol rejection, jump timing and joystick directions.

An optional on-device smoke test exercises a disposable real backend: native handoff exchange, encrypted session storage, workspace entry, socket snapshots, movement, jump, sit, leaving and logout. It drives the actual activity/model against the backend; it does not automate touch gestures, Google/OIDC consent or the browser UI. Build both APKs first:

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
python3 scripts/device-smoke.py /tmp/disposable-account.json emulator-5554
```

The input JSON contains `username`, `password` and `origin` (`http://localhost:3000` only). Use a disposable local database/account. The runner signs in over localhost, sends only a 60-second single-use PKCE handoff to private device runtime storage, immediately consumes/deletes it, and signs out afterward. Nothing is placed in app/test assets or printed to logs. Without that runtime grant the instrumentation test skips.

`.github/workflows/android.yml` runs JVM tests, lint, APK and release AAB builds through fastlane on Android changes for PRs, main pushes and manual dispatch. After successful checks on `main`, a separate protected `firebase` job signs a release APK and uploads it to Firebase App Distribution using GitHub OIDC/Google Workload Identity Federation. Artifacts expire after seven days. See [the required Firebase, signing and GitHub environment setup](fastlane/SETUP.md); no Google Play upload is configured.

## Validation and remaining acceptance work

Validated on 2026-10-22 with JDK 21, SDK 36 and Pixel 8 Pro API 34 emulator: debug APK, release AAB, nine JVM tests (including all 88 differential fishing samples), Android lint, and a real-server instrumentation smoke test through the activity/model (native handoff, workspace socket, avatar atlas, movement, jump, sit, Keystore and logout). The app is installed in the local emulator. [GitHub Actions verification](https://github.com/GmBeHappy/little-office/actions/runs/39759027788) and the real local fastlane verification lane also pass; an ephemeral-key release build passed `apksigner` validation and version-code override checks. Its test key/APK were removed. Cloud distribution remains unverified until the production signing and WIF settings are provisioned.

Production Google/OIDC browser consent, physical-device microphone/camera/screen-sharing, whiteboard file collaboration and reconnection under poor networks need acceptance tests with the deployment's real services. The local smoke backend deliberately has no LiveKit/storage/Google credentials. Android does not yet implement the web's complete wildlife/activity overlays or the operator administration console. Firebase signing/upload code is included; its real cloud run still depends on the configured GitHub environment and Firebase project. Google Play distribution is not configured.
