# Apple beta delivery

App Store Connect record: **Little Office by GMTECH**, Apple ID **6825711209**, with iOS and macOS platforms. [Open App Store Connect](https://appstoreconnect.apple.com/apps/6825711209).

The native project is `apple/LittleOffice.xcodeproj`, with the shared `LittleOffice` scheme. iOS/iPadOS and macOS share the explicit bundle ID `dev.littleoffice.app` and team `2L9PQLRQ83` (GMTECH SOLUTION LIMITED PARTNERSHIP). Deployment targets are iOS 26 and macOS 26. Release archives use automatic signing. Marketing version is `0.1.0`; local build number starts at `1`.

## Xcode Cloud workflow

Configure this in Xcode / App Store Connect after the project is available in the connected GitHub repository. Xcode Cloud workflows are service configuration; committing a GitHub Actions YAML file does not create an Xcode Cloud workflow.

| Setting | Value |
| --- | --- |
| Repository | `GmBeHappy/little-office` |
| Project | `apple/LittleOffice.xcodeproj` |
| Scheme | `LittleOffice` |
| Name | `TestFlight — main` |
| Start conditions | Branch changes on `main`, plus manual builds on `main` |
| File conditions | `apple/**`, `public/sounds/nudge.wav` |
| Environment | Latest stable Xcode 26 or newer; macOS 26 or newer |
| Action 1 | Archive iOS, Release, TestFlight distribution |
| Action 2 | Archive macOS, Release, TestFlight distribution |
| Post-action | TestFlight internal distribution to the selected internal tester group |

Use the first workflow setup in **Xcode → Product → Xcode Cloud → Create Workflow**, then adjust the archive actions and start conditions. Select the existing App Store Connect record and enable access only to this repository if GitHub authorization is needed. The account holder must resolve outstanding Apple agreements. Do not start a paid plan or accept agreements implicitly.

Xcode Cloud recognizes `apple/ci_scripts/ci_post_clone.sh` beside the project and runs the ten native contract/animation tests before each action. Test fixtures and the shared scheme are checked in. The app has no web build step and needs no database, Bun, Google client secret, or OIDC credentials in CI. Swift Package Manager restores the versions pinned in `project.xcworkspace/xcshareddata/swiftpm/Package.resolved`.

Xcode Cloud assigns increasing build numbers automatically; no custom counter script is necessary. Keep that numbering continuous for macOS. Increase `MARKETING_VERSION` in both build configurations when preparing a new app version.

## Source publication

The isolated Apple release branch is `codex/apple-testflight`, based on `origin/main`. Use a manual build of this branch for the first TestFlight build. The automatic `main` trigger can build the app after the reviewed Apple source is merged there. Review and publish the entire `apple/` directory except ignored `.build`/per-user files; `public/sounds/nudge.wav` is already tracked on `main`. Do not accidentally include pending backend/auth/Android changes in an Apple-only publication. A review branch can validate the archive manually before merging into the configured `main` trigger.

This build expects the workspace/native APIs described in `../docs/native-contract.md` on its chosen server. A successful native build does not deploy those server routes. The app defaults to loopback for development; testers on physical devices must enter an available HTTPS server with the corresponding backend version.

## Validation and beta availability

On 22 October 2026, `apple/ci_scripts/ci_post_clone.sh` passed all ten tests and unsigned Release archives passed for iOS arm64 and macOS universal (arm64 + x86_64). Run the same checks after native changes. A signed Xcode Cloud archive must still complete Apple processing before it appears as an installable TestFlight build. Resolve any export-compliance question in App Store Connect based on the shipped app and LiveKit/WebRTC implementation; this repository does not assert an unreviewed export-compliance answer. External testers additionally require Apple's beta review.

The app icon reproduces the existing web brand. Regenerate its checked-in iOS/macOS sizes with `swift apple/scripts/generate-app-icon.swift` from the repository root.

Sources: [first Xcode Cloud workflow](https://developer.apple.com/documentation/xcode/configuring-your-first-xcode-cloud-workflow), [custom script location](https://developer.apple.com/documentation/xcode/writing-custom-build-scripts), [TestFlight distribution](https://developer.apple.com/documentation/xcode/distributing-your-xcode-cloud-builds-through-testflight), [automatic build numbering](https://developer.apple.com/documentation/xcode/setting-the-next-build-number-for-xcode-cloud-builds/).
