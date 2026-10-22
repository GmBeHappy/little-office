# Native contract v1

Web and Apple clients share one account/session system and one workspace API. UUIDs identify workspaces; slugs are display addresses. New office URLs are `/w/:workspaceId/office`. The old `/office` page and unscoped office API are compatibility aliases for `00000000-0000-4000-8000-000000000001` only.

## Authentication

1. App creates a random PKCE verifier and state, derives S256 challenge, and opens `/native/authorize?challenge=...&state=...` with ASWebAuthenticationSession.
2. Browser signs in through the existing Better Auth flow. The signed-in user explicitly continues to the app; `POST /api/native/authorize` creates a 60-second handoff bound to that session and challenge.
3. The only callback is `littleoffice://auth?code=...&state=...`. No bearer/session credential appears in a URL. Codes are stored as hashes; one pending grant exists per browser session.
4. App verifies callback state and exchanges the code/verifier at `POST /api/native/exchange`. Atomic deletion enforces single use. Expired, revoked, disabled, wrong-verifier and replay attempts fail.
5. Response supplies a signed Better Auth bearer token, expiry and actual cookie name. App stores it in Keychain. Requests use `Authorization: Bearer ...` and the exact configured `Origin`. Credentials are restricted to the configured HTTPS origin (loopback HTTP is allowed for development).

The bearer plugin requires a valid signature. The token refers to the same 8-hour non-refreshing session as the authorizing browser; logging out either client invalidates that session. Reauthentication is required after expiry. Membership is checked independently on every workspace request. Public workspace creation does not require approval in the migrated default workspace; access to that workspace still requires its own approved membership.

## Endpoints

| Endpoint                                                 | Purpose                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/account`                                       | Account-level profile                                                       |
| `GET/POST /api/workspaces`                               | List memberships / create workspace                                         |
| `GET/PATCH /api/workspaces/:id`                          | Members/invitations and workspace metadata / manager update                 |
| `POST/DELETE .../:id/invitations[/:invitationId]`        | Create/revoke email-bound invitation                                        |
| `POST /api/invitations/accept`                           | Verified matching email; one use; current inviter authority checked         |
| `PATCH/DELETE .../:id/members/:userId`                   | Owner role changes/removal; serialized last-owner protection                |
| `GET .../:id/config`, `GET .../:id/me`                   | Protocol version, capabilities, effective membership                        |
| `GET .../:id/scene`, `GET .../:id/avatar?appearance=...` | Native drawing manifests from shared code; scene includes revision/geometry |
| `WS .../:id/office?protocol=1[&takeover=1]`              | Office commands and snapshots                                               |
| `POST .../:id/media/token`                               | Short-lived grant for the server-derived current room                       |
| `GET .../:id/whiteboard/context`                         | Current board context; requires an existing office connection               |
| `WS .../:id/whiteboard`                                  | Existing validated Excalidraw change/pointer/ping protocol                  |
| `GET/POST .../:id/whiteboard/files`                      | Workspace and current-board file access                                     |

Commands remain defined by `shared/protocol.ts`. Snapshot envelopes include `workspaceId` and `protocolVersion: 1`. Native ignores foreign workspace envelopes, rejects unsupported versions, and tears down sockets/media/document state when switching workspaces. Server authority determines movement, conversations, presenter permission, and room grants.

## Avatar drawing contract

Avatar manifests use `version: 2` and include `appearance`, `skin`, and 80 frame entries named `{direction}-{pose}-{index}`. Directions are up/down/left/right; poses are stand/sit/sleep/fish. Indices 0–3 represent strides `[0, 4, 0, -4]`, advancing every 110 ms while moving; index 4 is the airborne stride of 3 pixels. Left frames are already mirrored, so native clients must not mirror them again. Map manifests remain version 1 and the office WebSocket protocol remains version 1. Deploy the updated atlas endpoint with the updated app.

The native scene consumes scoped `jump`, `wave`, `emote`, and `nudge-animation` events, with monotonic local timestamps for transient animation. Fishing metadata in each person uses server wall-clock timestamps and the same geometry as `shared/fishing.ts`. `scripts/native-fixtures.ts` generates drawing fixtures for Swift parity checks.

## Revocation and storage

Membership removal or role change closes that workspace's office/whiteboard sockets and retires the relevant LiveKit room generation. Other workspaces remain connected. Expiry, disabled accounts and policy changes are rechecked on live sockets every five seconds; database recheck failures disconnect them. A failed LiveKit retirement is an error and blocks subsequent grant issuance until retry succeeds. Existing bearer tokens expire after at most two minutes; a separate LiveKit acceptance test is required to verify real disconnect behavior under network failures.

New files use deployment/workspace-prefixed S3 keys; existing keys are preserved by the migration. Every scene/file/audit query scopes by workspace. The whiteboard WKWebView uses ephemeral storage and a host-bound HTTP-only cookie; it never opens a second office connection or exposes credentials to JavaScript.

Deployment remains **one API process**. Presence is in memory; multiple API replicas require explicit workspace routing/ownership before scaling.
