# Android beta distribution

The Android workflow builds with fastlane, then uploads a **signed release APK** to Firebase App Distribution on Android-related pushes to `main`. Manual runs have a `distribute` switch (default on); uploads still require `main`. Pull requests only test/build, with no signing or Google credentials. Nothing publishes to Google Play.

## Registered Firebase app

Firebase project: `little-office-15f4b` (project number `109956361163`). Registered Android App ID: `1:109956361163:android:a0788f390ba5358a79a44e`. App Distribution is activated. The package is `com.littleoffice.android`.

GitHub repository: `GmBeHappy/little-office`, numeric repository ID `1360286130`, owner ID `35629716`. These identifiers are public configuration, not credentials. The corresponding federation condition is:

```text
assertion.repository_id == '1360286130' &&
assertion.repository_owner_id == '35629716' &&
assertion.ref == 'refs/heads/main' &&
assertion.environment == 'firebase' &&
assertion.workflow_ref == 'GmBeHappy/little-office/.github/workflows/android.yml@refs/heads/main'
```

Map the referenced claims when creating the provider. The environment must be named `firebase` for the condition to match.

## Firebase and Google Cloud

1. Register an Android app with the exact package **`com.littleoffice.android`** in the intended Firebase project. Copy its **App ID** (`1:<project-number>:android:<id>`), not the package/project ID. In App Distribution, select the app and click **Get started**. App Distribution alone needs no Firebase SDK or `google-services.json` in the mobile client. See the [Firebase fastlane guide](https://firebase.google.com/docs/app-distribution/android/distribute-fastlane) and [CI prerequisites](https://firebase.google.com/docs/app-distribution/best-practices-distributing-android-apps-to-qa-testers-with-ci-cd).
2. Create a dedicated CI service account in that project and grant **Firebase App Distribution Admin** (`roles/firebaseappdistro.admin`). Enable the Firebase App Distribution API and IAM Service Account Credentials API if not already enabled.
3. Configure a Google Workload Identity Pool/provider for GitHub's issuer `https://token.actions.githubusercontent.com`, following [Google's service account federation instructions](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account). Do not create/download a service-account private key. Map `google.subject=assertion.sub` and repository/repository-owner IDs, repository name, ref, environment and workflow reference claims. Restrict the provider condition to this repository's **numeric repository and owner IDs**, `assertion.ref == 'refs/heads/main'`, `assertion.environment == 'firebase'`, and `assertion.workflow_ref == 'GmBeHappy/little-office/.github/workflows/android.yml@refs/heads/main'`. Get IDs from the actual GitHub repository; names alone can be reused after deletion/transfer. Scope the service account's `roles/iam.workloadIdentityUser` binding to this repository's mapped ID in that pool, not the entire pool.
4. Create the GitHub repository environment **`firebase`**, restrict deployment branches to **main**, and set the variables/secrets below. Add required reviewers if your release process calls for them. Keep workflow changes under trusted review.

Google's action writes a temporary external-account ADC file and exports `GOOGLE_APPLICATION_CREDENTIALS`. The pinned [Firebase fastlane plugin](https://github.com/firebase/fastlane-plugin-firebase_app_distribution/blob/main/lib/fastlane/plugin/firebase_app_distribution/helper/firebase_app_distribution_auth_client.rb) supports ADC and external-account credentials. The lane explicitly passes that ADC file to the plugin, so cached Firebase CLI logins cannot take precedence. The workflow authenticates **after the build**, immediately before upload, because GitHub's OIDC assertion is short-lived. It does not use Firebase CLI login tokens or service-account JSON secrets. Google credentials are removed by the action's cleanup hook; only specific APK/report paths are uploaded as artifacts.

## Provisioning status

The `firebase` GitHub environment is created and restricted to the `main` branch. Its Firebase project/App ID variables and all four encrypted Android signing secrets are configured. A new stable RSA 3072 signing identity was generated with explicit user approval. The private local backup is in ignored `android/.signing/` (directory mode 700, keystore and credentials mode 600); keep an encrypted off-machine backup. Never attach that directory to a PR or artifact. Workload Identity Federation is configured with service account `little-office-android-ci@little-office-15f4b.iam.gserviceaccount.com` and provider `projects/109956361163/locations/global/workloadIdentityPools/little-office-github/providers/github`; both GitHub environment variables are set. The provider restricts the numeric repository/owner IDs, main branch, firebase environment and exact workflow reference shown above. The service-account impersonation binding targets only this repository ID. The first cloud upload must still be verified after the workflow reaches main.

## GitHub environment settings

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `FIREBASE_ANDROID_APP_ID` | Registered Android Firebase App ID |
| Variable | `FIREBASE_PROJECT_ID` | Firebase/Google Cloud project ID |
| Variable | `GOOGLE_WORKLOAD_IDENTITY_PROVIDER` | Full `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>` name |
| Variable | `GOOGLE_SERVICE_ACCOUNT` | Dedicated distribution service account email |
| Variable, optional | `FIREBASE_GROUPS` | Comma-separated existing tester group aliases; empty uploads without assigning/notifying testers |
| Secret | `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the stable private signing keystore |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| Secret | `ANDROID_KEY_ALIAS` | Signing entry alias |
| Secret | `ANDROID_KEY_PASSWORD` | Signing entry password |

Use the same signing key for every update. Keep an encrypted backup outside Git; losing/changing it prevents installed testers from upgrading without uninstalling. Supply an existing app signing key if this package has already been distributed. For a new app, create a dedicated key in Android Studio's **Generate Signed App Bundle or APK** flow and store the above values in GitHub's encrypted environment secrets. Do not commit the keystore, passwords or Base64 contents. The runner writes the keystore with owner-only permissions in its temporary directory and removes it even after failure. Signing passwords stay in process environment, never Gradle command-line arguments.

`ANDROID_VERSION_CODE` is `github.run_number * 100 + github.run_attempt`, so retries receive a new version. Keep fewer than 100 attempts per run, and retain this workflow's run-number sequence; migrating/renaming/resetting it requires a higher version-code base than the latest distributed build. Default version name is `0.1.0`; override `ANDROID_VERSION_NAME` for a release. Signed APK + R8 mapping artifacts expire after seven days.

## Local commands

Install Ruby 3.3+ and Bundler, then from `android/`:

```sh
bundle install
bundle exec fastlane android verify
```

For a signed build, set `ANDROID_KEYSTORE_FILE` to an **absolute** private keystore path and the three password/alias environment variables above, plus a new `ANDROID_VERSION_CODE`. Then:

```sh
bundle exec fastlane android release
```

To upload that APK, set `FIREBASE_ANDROID_APP_ID` and `GOOGLE_APPLICATION_CREDENTIALS` to a valid ADC file, and optionally `FIREBASE_GROUPS`/`RELEASE_NOTES`:

```sh
bundle exec fastlane android distribute
```

The release lane fails before building if signing/version inputs are missing. The upload lane fails before contacting Firebase if App ID/ADC/signed APK are missing. APK distribution does not require linking Google Play. Native Firebase SDKs, Play deployment, tester invitations and automated test-device services are outside this pipeline.

## Verification status

Validated locally on 2026-10-22: actual fastlane/plugin loading, the full `verify` lane, early rejection of missing signing/Firebase configuration, signed release APK generation with an ephemeral test key, Android `apksigner` verification, and version-code override. The test key and its APK were deleted afterward. All locked gems accept CI Ruby 3.3; local execution used installed Ruby 4.0.7. Workflow YAML and Ruby syntax were checked. [GitHub Linux CI](https://github.com/GmBeHappy/little-office/actions/runs/39759027788) also passed tests, lint, both builds and artifact upload in 4m55s; Firebase was correctly skipped on the PR. The runner reports Node 20 action deprecation notices and currently executes those verified actions under Node 24. No Firebase upload has yet been run. Additional app validation is recorded in `../README.md`. Cloud upload success requires the real Firebase app, WIF trust and GitHub signing environment to be configured and a successful Actions run; a local build does not prove that external configuration is complete.
