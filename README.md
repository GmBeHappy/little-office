# Little Office

**A little closer, wherever you work.**

A cozy pixel workspace for remote teams. Walk over for a conversation, step into a meeting room, share your screen, and sketch an idea together. Give each team its own little world.

[Website](https://www.littleoffice.app) · [Showcase video](docs/media/workspace-showcase.mp4) · [Run locally](#run-locally) · [Architecture](#architecture) · [License](LICENSE)

[![Little Office workspace mockup: Sakura Garden, nearby teammates, and shared office controls](docs/media/workspace-mockup.png)](docs/media/workspace-showcase.mp4)

_Illustrative workspace mockup using the project's pixel artwork and fictional teammates. The [23-second showcase](docs/media/workspace-showcase.mp4) is a rendered feature presentation, not a live-session recording. [Preview source and regeneration](docs/media/README.md)._

## Make remote work feel a little more together

| Feature                        | What you can do                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A workspace for every team** | Create and switch workspaces, invite people by email, and manage owner/admin/member roles. Maps, membership, drawings, and activity belong to their workspace.                                                           |
| **Walk up and talk**           | Move with WASD/arrows or a touch joystick. Nearby voice follows your position; private rooms and accepted direct calls give conversations their own space. Microphone and camera start off.                              |
| **Meet and present**           | Use camera grids, an expanded screen presentation view, device pickers, and quality presets. Speaking indicators show who is talking.                                                                                    |
| **Think on the same canvas**   | Collaborate in Excalidraw with live cursors and persistent boards for the commons and meeting areas. Export drawings; optionally archive PNG snapshots to private S3-compatible storage.                                 |
| **Make it yours**              | Customize avatars, set availability and status messages, wave, send emoji, nudge a teammate, or invite them over with a consent-based summon.                                                                            |
| **Change the scenery**         | Choose from 12 themed maps, including Sakura Garden, Pine Camp, Lunar Outpost, and Summer Cove. Optional daily rotation, roaming wildlife, and shared activities bring the web office to life.                           |
| **Bring your identity**        | Administrator-provisioned passwords, optional Google sign-in, and workspace OIDC with DNS domain verification. Workspace SSO sessions stay scoped to their organization.                                                 |
| **English and Thai**           | Switch the web interface's language without leaving the conversation.                                                                                                                                                    |
| **Catch up on your team**      | A persistent workspace inbox records waves, nudges, summons, and calls. Optional Firebase Cloud Messaging delivers system notifications to opted-in devices; delivery depends on platform credentials and configuration. |
| **See office attendance**      | Review recorded visits, connected/active/idle time, and CSV exports. Members see their own records; owners/admins see the workspace. This measures app activity, not productivity or work in other programs.             |

The web app is the most complete client. **macOS/iOS and Android development clients** share the same accounts, workspaces, office state, and media service; their feature coverage and release requirements are documented below.

## Architecture

One workspace-aware application backend serves all clients. Next.js serves the web UI; Elysia on Bun owns authentication, membership, office rules, whiteboard synchronization, and media permissions. LiveKit carries audio, video, and screen tracks separately from application messages.

```mermaid
flowchart TB
    WEB["Web · Next.js / React / Phaser"]
    APPLE["macOS + iOS · SwiftUI / SpriteKit"]
    ANDROID["Android · Kotlin / Jetpack Compose"]
    EDGE["Caddy · HTTPS / WSS"]
    NEXT["Next.js · pages and assets"]
    API["Elysia on Bun · one API process"]
    RUNTIME["Workspace UUID → Office + Whiteboards"]
    DB[("PostgreSQL · Drizzle ORM")]
    MEDIA["LiveKit · WebRTC / TURN"]
    S3[("Optional private S3 storage")]
    IDP["Optional Google / OIDC"]
    PUSH["Optional FCM · system notifications"]
    WEB --> EDGE
    APPLE --> EDGE
    ANDROID --> EDGE
    EDGE --> NEXT
    EDGE -->|"HTTP + WebSocket API"| API
    EDGE -->|"Media signaling"| MEDIA
    API --> RUNTIME
    API --> DB
    RUNTIME --> DB
    API -->|"Grants and room permissions"| MEDIA
    API --> S3
    API --> IDP
    API --> PUSH
    WEB <-->|"WebRTC media"| MEDIA
    APPLE <-->|"WebRTC media"| MEDIA
    ANDROID <-->|"WebRTC media"| MEDIA
```

| Layer           | Implementation                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Web             | Next.js 16, React 19, Phaser 4; Tailwind CSS 4, shadcn/ui and Radix; React Hook Form + Zod           |
| Application API | Elysia on Bun; Better Auth; HTTP and authenticated WebSockets                                        |
| Data            | PostgreSQL + Drizzle migrations; optional S3-compatible snapshot storage                             |
| Media           | LiveKit SDKs and server, with TURN for networks that need a relay                                    |
| Shared canvas   | Excalidraw; server-validated changes persisted in PostgreSQL                                         |
| Apple           | SwiftUI, SpriteKit, URLSession, Keychain, LiveKit Swift; WKWebView for the whiteboard                |
| Android         | Kotlin, Jetpack Compose, native map rendering, Android Keystore, LiveKit; WebView for the whiteboard |
| Deployment      | Docker Compose, GHCR images, Caddy HTTPS/WSS ingress                                                 |

### How the pieces fit

1. **Sign in once.** Clients use the same identity database. Native apps use system-browser sign-in and a short-lived, single-use PKCE handoff. Workspace membership is checked separately from authentication.
2. **Enter a workspace.** `server/workspace-runtime.ts` creates an `Office` and `Whiteboards` instance per workspace UUID. The backend validates movement and room changes, then broadcasts authoritative snapshots.
3. **Join a conversation.** The API grants access to the server-selected LiveKit room. Room names include a deployment namespace and workspace UUID. Voice/video never travel through the office WebSocket.
4. **Keep the important things.** Accounts, sessions, memberships, invitations, settings, drawings, audit events, attendance intervals, notification inboxes, and push jobs persist in PostgreSQL. Presence and pending interactions live in memory. Optional PNG archives live in S3; the database stores their metadata.

**Deployment boundary:** run **one API process**. Multiple workspaces are supported inside it; multiple API replicas require workspace ownership/routing and state coordination that are not implemented. Nearby voice uses selective subscriptions on a shared floor and is **not a confidentiality boundary** against modified clients. Private meetings and direct calls use isolated media rooms.

With `WORKSPACE_BASE_DOMAIN` configured, each team also gets `https://<slug>.<base-domain>`. The Next.js proxy routes tenant pages, while the API checks the Host and workspace on every scoped request. The portal uses `https://www.littleoffice.app`; workspace cookies remain host-scoped. Optional FCM delivery uses database-backed jobs and per-device opt-in. See [workspace rollout](docs/workspace-rollout.md), [attendance](https://github.com/GmBeHappy/little-office/blob/main/docs/attendance.md), and [connection diagnostics](https://github.com/GmBeHappy/little-office/blob/main/docs/connection-diagnostics.md).

### Repository map

```text
app/              Landing, login, workspaces, office, native handoff routes
components/       Office UI, Phaser scene, media, dashboard, settings, whiteboard
server/           Auth, workspace APIs/runtimes, office rules, media, persistence
shared/           Protocols, map geometry/art, avatars, validation, workspace types
lib/              Web API clients, localization, utilities
drizzle/          Reviewed SQL migrations and schema snapshots
apple/            macOS/iOS app and shared Swift package
android/          Native Android app, tests, and distribution tooling
scripts/          Development, migration, assets, fixtures, showcase generation
deploy/           Production configuration templates and Caddy image
tests/ + e2e/     Backend/protocol tests and browser scenarios
docs/             Rollout, native contract, operations, and showcase assets
```

### Routes

| Route                            | Purpose                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| `/`                              | Public landing page                                          |
| `/login`                         | Password/Google sign-in and workspace SSO entry              |
| `/workspaces`                    | Workspace creation, invitations, memberships, and settings   |
| `/w/:workspaceId/office`         | One workspace's live office                                  |
| `/office`                        | Compatibility entry for the migrated default workspace       |
| `/native/authorize`              | Browser-to-native sign-in handoff                            |
| `/api/workspaces/:workspaceId/*` | Scoped office, media, scene, whiteboard, and management APIs |

## Run locally

Install **Bun 1.4.2+**, **Node.js 24+**, and Docker with Compose.

```sh
bun install --frozen-lockfile
cp .env.example .env
bun -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
```

Put the generated value in `.env` as `BETTER_AUTH_SECRET`, then start the local services:

```sh
docker compose -f compose.dev.yaml up -d
bun run db:migrate
bun run user:create owner "Your name" --owner
```

The account command prompts for a password and prints the user ID. Add that ID to `OFFICE_OPERATOR_IDS` in `.env` if this account should administer platform-wide accounts, authentication, and storage. Workspace ownership alone does not grant these privileges.

```sh
bun dev
```

Open [localhost:3000/login](http://localhost:3000/login), sign in, and visit `/workspaces` to create a team. The provisioned account also has access to the compatibility `/office` workspace. There are no default app credentials or public password-signup endpoints. Email-bound invitations require a verified matching email; local provisioned accounts use `@local.invalid` addresses.

**Without Docker:** run `bun run dev:db` in another terminal and set `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres`. Run `livekit-server --dev --bind 127.0.0.1` separately for calls, then follow the migration/account/app steps above. The map and presence work without LiveKit; calls require it.

Local LiveKit credentials are development-only. Use [the operations guide](docs/operations.md) for private production deployments, HTTPS, TURN, backups, and image updates.

## Configuration and upgrades

Start with [.env.example](.env.example) or [the production template](deploy/production.env.example).

| Setting                                    | Purpose                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `APP_URL`                                  | Exact browser origin. For the public Little Office site, use `https://www.littleoffice.app`. |
| `DATABASE_URL`, `BETTER_AUTH_SECRET`       | Database connection and stable authentication/encryption secret                              |
| `LIVEKIT_*`                                | Public/internal media URLs and server credentials                                            |
| `OFFICE_MEDIA_NAMESPACE`                   | Stable, unique namespace for deployments sharing LiveKit                                     |
| `WORKSPACE_BASE_DOMAIN`                    | Optional workspace subdomain routing and host-scoped sessions                                |
| `FCM_*`                                    | Optional system notification delivery; configure only supported/verified platforms           |
| `OFFICE_OPERATOR_IDS`                      | Explicit allowlist for platform-wide administration                                          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google login; callback is `${APP_URL}/api/auth/callback/google`                     |
| `OIDC_*`                                   | Optional deployment-level legacy SSO; workspace OIDC is configured through the dashboard     |
| `OFFICE_S3_*`                              | Optional private external bucket for whiteboard PNG archives                                 |

In subdomain mode, set `WORKSPACE_BASE_DOMAIN=littleoffice.app`. The updated deployment generator redirects `app.littleoffice.app` to `www.littleoffice.app`, preserving the path and query. Existing native installations saved against the old portal should select the new server and sign in again; custom server choices are preserved.

For the public domain, configure `OFFICE_DOMAIN=www.littleoffice.app` alongside `APP_URL`, and register provider callbacks on that same origin. DNS, certificates, and provider callback changes must be applied to the deployment separately; repository documentation does not change them.

**Upgrading an existing office?** Read [workspace rollout](docs/workspace-rollout.md) first. Migrations `0003`–`0005` add workspaces, native handoffs, and workspace OIDC while retaining existing identities and data. Back up the database and bucket, preserve `BETTER_AUTH_SECRET`, drain old writers/media rooms, migrate, and start one updated API instance. Do not run old and new writers together.

## Client and release status

| Client      | Current scope                                                                                                                          | Setup and release notes                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Web         | Fullest feature set; keyboard/touch office, media, whiteboards, customization, workspace management, English/Thai                      | [Operations](docs/operations.md)                                                      |
| macOS / iOS | Native development client; shared workspaces, map/presence, movement, media, and embedded whiteboard. Minimum macOS 26 / iOS 26.       | [Apple README](apple/README.md) · [Release setup](apple/RELEASE.md)                   |
| Android     | Native development client; workspace management, map/presence, movement, media, and embedded whiteboard. Android 8.0 / API 26 minimum. | [Android README](android/README.md) · [Distribution setup](android/fastlane/SETUP.md) |

This README describes repository features; platform credentials and the deployed version determine what is available at the public website. Native clients require the compatible workspace/native backend. Native feature parity, signed distribution, real-device media/TURN, OAuth, and storage acceptance still have outstanding work; see each platform's notes and the [native API contract](docs/native-contract.md).

Current workspace limits are **5 owned workspaces per account** and **50 members per workspace**. The selectable maps are designed for **4–8 people**; the membership cap is not a tested concurrent-call capacity claim. Recording, persistent text chat, a map editor, and horizontal API scaling are not implemented.

## Development checks

```sh
bun run typecheck
bun test
bun run build
```

For browser scenarios, start the app/database/LiveKit, then run:

```sh
bunx playwright install chromium
bun scripts/e2e.ts
```

The browser runner uses temporary accounts and synthetic media. Native checks live in the platform READMEs. Shared protocol/scene fixtures are generated with `bun scripts/native-fixtures.ts`.

## License

**Source available for private and internal use. Third-party hosting and resale are not permitted without separate written permission.**

The [Little Office Source-Available License 1.0](LICENSE) permits running and modifying the software for yourself or your organization's own internal team. It prohibits providing it as a hosted/managed service to third parties, selling access, reselling or commercially distributing the software, and using a modified or white-label version to do those things. Those restrictions apply to free third-party hosting too. Contact [GmBeHappy](https://github.com/GmBeHappy) for separate permission.

This is a custom source-available license, **not an OSI-approved open-source license**. Existing third-party components retain their own licenses; see [third-party notices](public/licenses/) and the [IBM Plex Sans Thai font license](public/fonts/ibm-plex-sans-thai/OFL.txt). The new terms do not revoke rights already granted for earlier copies under another license. See the [Open Source Definition](https://opensource.org/osd) for why restrictions on resale make this source-available rather than open source.
