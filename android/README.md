# Little Office for Android

Native Kotlin + Jetpack Compose client, in the same repository as the web and Apple apps. Android 8.0 (API 26) minimum; compile/target SDK 36. The dashboard, workspace settings, map, avatars and controls are native. Only the shared Excalidraw whiteboard uses a WebView.

**Beta:** the SaaS backend is deployed at `https://app.littleoffice.app`, the default connection. Legacy data is in the `gmtech` workspace; each workspace has its own web subdomain. Native accounts keep their configured API origin while switching workspaces—the workspace slug is display metadata, not a replacement API host. Development overrides remain under **Connection options**. Installing an APK does not migrate or upgrade a server.

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

Tap **Continue to Little Office**. Android Custom Tabs opens the existing web login, including Google and workspace OIDC when configured. After the browser's explicit “Continue to app” step, `littleoffice://auth` returns a one-time code to Android. No OAuth client secret is embedded in the app.

Debug APK: `app/build/outputs/apk/debug/app-debug.apk`.
Release bundle: `./gradlew :app:bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`. Local release artifacts are unsigned unless `ANDROID_KEYSTORE_FILE` and the associated signing environment variables are supplied. Firebase CI builds a signed release APK using a stable key; see [distribution setup](fastlane/SETUP.md).

## Implemented flows

- Branded cream/sage connection and workspace cards with bundled pixel scenes and IBM Plex Sans Thai typography. Phone sign-in puts the action before the decorative scene. English/Thai language selection and display preferences persist locally.
- Account restore/sign-out; native profile/avatar/status editing; workspace create/list/switch, map selection, membership approval/roles/removal, invitations, feature flags, daily maps, activity history, owner OIDC configuration and verification. Workspace-scoped identities cannot create unrelated workspaces or change global name/avatar; browser reauthentication remains required where the shared API requires it.
- Native map/avatars, animated effects, habitat stations and animals, farm activities and celebration pixels consume the shared manifest. Drag to move; arrows/WASD, Space jump, E interact, Z nudge and 1/2/3 sit/sleep/fish match web controls. Server snapshots remain authoritative for movement and collision. Jump, landing, walking, fishing and nudge timing follow shared fixtures.
- Reactions, people/status lists, rooms, summons/private calls, nudges and leave-call controls. No separate text-chat feature is invented.
- LiveKit microphone/camera, audio-route/camera selection, video quality, camera grid and screen viewers. Server-authorized MediaProjection sharing offers an explicit **Include app audio** choice on API 29+; Android and the source app decide which audio may be captured. Microphone mute remains independent. Screen capture is off until permission and server authorization are granted; stale capture operations are invalidated on revocation or session changes.
- Explicitly allowlisted personal operators get native global account management, password reset, login-method policy and storage configuration/check controls. The backend checks permission for every operation; tenant membership never grants operator access.
- Whiteboard-only WebView: loading/error handling, collaborative editor, guarded close, document chooser, PNG/JSON export and saved snapshot download. A bounded export bridge exposes bytes and close notification, never credentials. Authenticated snapshot URLs resolve at the office API, then signed storage downloads use a header-free request with a 5 MB limit. Document picker flows preserve the office while the external activity is open.

## Structure and security

`OfficeModel` holds account/workspace selection; `OfficeSession` owns one workspace socket, manifests and effects; `OfficeMedia` owns one LiveKit room; `OfficeMap` draws cached map pixels and interpolated people. `OfficeAPI` sends the exact configured Origin plus signed bearer token and rejects redirects. Workspace switches invalidate the prior generation and cancel its tasks before accepting new snapshots. Foreign workspace envelopes and unknown protocol versions are rejected.

`CredentialStore` encrypts both sessions and pending PKCE verifiers using Android Keystore AES-GCM, authenticating each storage slot with additional data. Backup and device-transfer rules exclude app data. The login callback validates its scheme/host/path, unique parameters and constant-time state before exchanging the single-use code. No password is stored by the app.

The backend remains the authority for workspace membership, OIDC domain verification/auto-join, invitations, room grants and movement. Android does not introduce a separate auth service or database. See the [shared native contract](../docs/native-contract.md) for authentication, workspace endpoints and drawing manifests.

## Checks

Unit tests cover PKCE, callback/origin validation, protocol scope, jump/joystick behavior, 88 fishing fixtures, habitat routes/drawings, map effects, farm drawings/interactions, status/volume rules, capture authorization races and snapshot export credential/size boundaries. Animation fixtures come from `scripts/native-fixtures.ts`; the Android resource stores only the consumed sections.

An optional on-device smoke test exercises a disposable real backend: native handoff exchange, encrypted session storage, workspace entry, socket snapshots, movement, jump, sit, leaving and logout. It also checks background/resume and document-operation lifecycle, and verifies actual Canvas pixels from an injected habitat station. It drives the actual activity/model against the backend; it does not automate touch gestures, Google/OIDC consent or the browser UI. Build both APKs first:

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
python3 scripts/device-smoke.py /tmp/disposable-account.json emulator-5554
```

The input JSON contains `username`, `password` and `origin` (`http://localhost:3000` only). Use a disposable local database/account. The runner signs in over localhost, sends only a 60-second single-use PKCE handoff to private device runtime storage, immediately consumes/deletes it, and signs out afterward. Nothing is placed in app/test assets or printed to logs. Without that runtime grant the instrumentation test skips.

`.github/workflows/android.yml` runs JVM tests, lint, APK and release AAB builds through fastlane on Android changes for PRs, main pushes and manual dispatch. After successful checks on `main`, a separate protected `firebase` job signs a release APK and uploads it to Firebase App Distribution using GitHub OIDC/Google Workload Identity Federation. Artifacts expire after seven days. See [the required Firebase, signing and GitHub environment setup](fastlane/SETUP.md); no Google Play upload is configured.

## Validation and remaining acceptance work

On 2026-10-25, JDK 21 / SDK 36 checks passed: 18 JVM tests, debug APK, instrumentation APK, Android lint and release AAB. On 2026-10-25 the Pixel 8 Pro API 34 emulator passed the disposable-backend instrumentation smoke, including socket/movement/poses, Keystore/logout, session resume, external-document preservation and actual Canvas rendering. This instrumentation operates the activity/model; it is not a touch or browser-consent test. The final branded UI has build/lint coverage but has not received a completed interactive visual acceptance pass: earlier computer-control lookups hung or coordinate actions returned `noWindowsAvailable`; a final retry could read Android Studio but did not expose the separately running emulator. The latest APK is installed on `Pixel_8_Pro_API_34` (`emulator-5554`).

[Firebase distribution run 39827498828](https://github.com/GmBeHappy/little-office/actions/runs/39827498828) succeeded for the earlier release. The new changes require PR review and a new main-branch distribution run. CI uses the existing signing/WIF configuration; Google Play distribution is not configured.

Remaining acceptance work: physical-device microphone/camera/audio routing, screen and optional app-audio sharing (including revocation/restart), production Google/OIDC browser consent when configured, real S3 whiteboard file exchange and dirty-close/export interactions, poor-network reconnection, and final phone/tablet visual/touch QA. The disposable smoke backend has no production LiveKit/storage/provider credentials. Code coverage and emulator model tests do not establish real media or provider acceptance.
