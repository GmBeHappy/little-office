# Connection diagnostics

The web client writes `[little-office]` JSON lifecycle records to the browser console. Help → **Download connection diagnostics** exports the last 300 records from this page, in memory only. Export before reloading; reload clears the buffer. There is no automatic upload or microphone/camera recording.

The API writes one JSON record per stdout line. Use `docker compose logs --since 15m api` on the host. Compose caps API and web logs at three 10 MB files per service. Match the exported `clientRef`, `roomRef` or `requestRef` and UTC `at` timestamps to server records. References are non-secret correlation hashes of random identifiers, not user identities. The server `boot` UUID distinguishes process restarts. Schema version is `1`.

Typical sequence:

- `socket.connect` → `socket.open` (browser transport), `socket.accepted` (server admission).
- `socket.resumed`: authenticated same-tab retry; `previousConnectionRef` identifies the old transport. The old `socket.close` has `current:false`, and must not produce `office.removed` or `media.rotate`.
- `socket.close` includes its numeric close code; browser also records `clean`, `online` and `hidden`. `1006` is abnormal closure, `1008` is a policy/rate limit, `4001` means another client owns the office. `socket.retry.durationMs` is backoff time.
- `office.removed.reason`: `socket_closed`, `heartbeat_timeout` (more than 35 seconds without a command or transport pong), `session_expired`, `session_revoked`, `access_revoked`, `revalidation_failed` or explicit `takeover`. `ageMs` is time since the last command or transport pong. Revalidation remains fail-closed.
- `media.rotate` records the old/new room references and affected peer count. `media.retire.reason` explains requested deletion; `media.deleted` confirms it; `media.delete_failed` leaves retirement pending and admission blocked. Map changes and process startup cleanup are labeled separately.
- `media.disconnected.code` is LiveKit's numeric disconnect reason (SDK 2.22: `2` duplicate identity, `4` participant removed, `5` room deleted, `6` state mismatch, `7` join failure). Compare it to server deletion records before blaming connectivity. `media.dispose` is intentional React cleanup; `media.failed` is a connection/device failure. SDK automatic reconnect emits `media.reconnecting` → `media.reconnected`.
- `api.failed` correlates web/server failures through an opaque `x-office-request-id`; it records status and a sanitized error class, never the request body or raw error text. Connection failures before reaching the API have only a browser record.

For the 2026-10-27 regression, a retry entered `Office.add`, which removed the existing member and rotated their media room before adding them again. The server now rebinds a matching client **and authenticated session** before closing the old socket. Position, conversation and peer media survive; actual departures and cross-session takeovers still revoke private-room access.

Logs deliberately exclude tokens, cookies, request/response bodies, raw URLs, SDK payloads, names, email addresses, status/chat text and device identifiers. Raw LiveKit console logging is disabled in favor of these allowlisted events. Add new events/fields to `shared/diagnostics.ts` and its privacy tests; do not spread arbitrary objects into log output. Native clients are not instrumented by this web/API change.

Regression checks: `bun test tests/office-reconnect.test.ts tests/office.test.ts tests/diagnostics.test.ts`. The WebSocket fixture uses a real isolated Elysia server and database and proves same-client resumption preserves another participant's media room. `OFFICE_RECONNECT_SOAK=1 bun tests/fixtures/office-reconnect-runner.ts` additionally checks 150 seconds of idle heartbeats.

## Reconnect and input latency (2026-10-29)

An unexpected transport close (1001/1006) with a client ID emits `socket.detached` and stops movement immediately. The same authenticated session/client has 15 seconds to resume without removing membership or rotating peers' media. `reconnect_timeout` removes a member that does not return. Explicit departures, session expiry/revocation and cross-session takeover retain immediate enforcement.

The server sends WebSocket protocol pings every 10 seconds. Browser protocol pongs remain available when background page JavaScript is throttled; they refresh connection liveness without changing human activity or extending authentication. `socket.latency.durationMs` measures the observed ping/pong interval (network and scheduling), logged once a minute or for samples at least 250 ms. Compare these with client `page.state` and reconnect events; HTTP page-load timing is not WebSocket RTT.

The local avatar predicts movement and stops on key release without waiting for server snapshots. Collision, locked-room and capacity rules are shared with the server. Prediction changes rendering only: authoritative snapshots still determine conversation/media access. It reconciles after a stop acknowledgment and stops extrapolating after one second without new snapshots. Remote avatars retain interpolation. Idle frames no longer send redundant movement commands, and blur sends an immediate stop.

Run `bun test tests/movement.test.ts tests/office.test.ts tests/office-reconnect.test.ts` for the deterministic regression checks. Run `bun tests/fixtures/movement-browser-runner.ts` with Playwright Chromium installed for the actual React/Phaser keyboard test over a simulated 300 ms round trip. It verifies early movement, immediate release and final authoritative reconciliation. The fixture uses only loopback and synthetic users.

A transient `/me` network error or 5xx response no longer signs the user out during reconnect or focus refresh. Explicit 401/403 still clears the session. `e2e/connection-recovery.spec.ts` exercises these cases in the real OfficeApp using synthetic API/WebSocket responses. Run it against a local web build with `APP_URL=http://127.0.0.1:3917 bunx playwright test e2e/connection-recovery.spec.ts`.
