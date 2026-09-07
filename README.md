# Little Office

A pixel-art office built with **Next.js, Elysia on Bun, PostgreSQL, Phaser, Better Auth, and LiveKit**.

Walk with WASD/arrows and press Space to jump (or click the Space control on the map). Enable nearby audio to talk to people close by. Join the Studio or Library for a meeting, share your screen, wave, summon a teammate with their consent, or start an accepted direct call. Microphone and camera start off.

The map fills the browser window. Navigation, people/rooms, and media controls float above it. Close the people panel for more map space, reopen it from People or Rooms, or use the expand button for browser fullscreen with all controls included.

## Run locally

Install Bun 1.4.2+ and Node.js 24+. From the repository:

```sh
bun install --frozen-lockfile
cp .env.example .env
```

Set a randomly generated `BETTER_AUTH_SECRET` in `.env`:

```sh
bun -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
```

With Docker, start the development database and media server:

```sh
docker compose -f compose.dev.yaml up -d
bun db:migrate
bun user:create owner "Your name" --owner
bun dev
```

The user command asks for a password without echoing it. Open **http://localhost:3000**, sign in, and create members in **Settings → Members**. Temporary passwords created through the UI must be changed on first login. There are no default app accounts or public signup endpoints.

The development LiveKit key `devkey` / secret `secret` is only for localhost. Use random credentials for production.

### Without Docker

Run the included development-only PostgreSQL-compatible runtime in a separate terminal:

```sh
bun dev:db
```

Set `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres`, then run the migration, account creation, and app commands above. Data lives in `.data/postgres`. Use real PostgreSQL on the VM.

Run the official LiveKit server separately:

```sh
livekit-server --dev --bind 127.0.0.1
```

The map, presence, waves, summons, and authentication work without LiveKit. Calls need a reachable LiveKit server; failures appear in the UI. Opening this localhost setup from another computer requires correct public media addresses and HTTPS; use the production setup below for that.

## Workspace maps

Workspace owners can change the name and shared map under **Settings → Workspace**. The selection persists in PostgreSQL and updates all connected users.

| Theme           | 4–8 people · 8 work seats | 10–12 people · 12 work seats |
| --------------- | ------------------------- | ---------------------------- |
| Nature outdoors | Fern Grove                | Willow Gardens               |
| Camping         | Pine Camp                 | Summit Basecamp              |
| Space           | Lunar Outpost             | Orbital Station              |

Every map has two private meeting areas. Sizes describe the seating layout, rather than admission limits. Applying a different map ends calls and screen sharing, clears invitations and room locks, and moves everyone to a safe entrance with nearby audio off. Changing only the workspace name keeps conversations active.

After updating an existing installation, run `bun db:migrate` before restarting the API (production Compose runs migrations automatically).

## Authentication

- **Username/password:** administrator-provisioned usernames; Argon2id hashes; login throttling; revocable HttpOnly sessions.
- **OIDC SSO:** discovery, Authorization Code + PKCE, ID-token verification, and explicit linking to an existing user through **Settings → Devices → Link your SSO account**.
- **Settings → Authentication:** owner-only switches for password login and SSO. The backend enforces the switches and ends sessions authenticated through a disabled method. Disabling both methods is rejected. An owner must successfully sign in through the current SSO provider before passwords can be disabled.
- New SSO users await owner approval under **Settings → Members**. Matching email addresses never automatically link accounts.
- Each account can have one active office tab. Close or leave the existing tab before joining from another one.

Set these when your SSO provider is ready:

```dotenv
OIDC_ISSUER=https://your-provider.example/your-realm
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-server-side-secret
```

Restart the API and obtain the configured provider ID from `/api/config`. Register the callback:

```text
https://office.example.com/api/auth/callback/<provider-id>
```

The provider ID includes a hash of the issuer, so changing issuer cannot accidentally reuse another provider's identities. Enable SSO in settings, link your owner account while recently authenticated, then sign out and sign in with SSO to verify it. Password login remains under your control.

SSO sign-in needs the provider's `openid`, `profile`, and `email` claims. Provider groups, SCIM provisioning, and back-channel logout are not implemented in this release. Provider disablement is not immediate application-session revocation; owner account disablement in this app revokes access. Sessions expire after eight hours. A separately authorized local password can still log in while that method is enabled.

## Deploy to the Linux VM

The production Compose file uses Linux host networking. Install Docker with Compose, and arrange three DNS A records pointing at the VM's public IP:

- `office.example.com` — app
- `rtc.example.com` — LiveKit signaling
- `turn.example.com` — TURN/TLS

Use DNS-only records for RTC/TURN when your DNS provider also offers an HTTP proxy. The VM must allow WebRTC traffic directly.

```sh
cp deploy/production.env.example .env
# Set actual domains and independently generated secrets in .env.
bun deploy:configure
docker compose build
docker compose run --rm caddy caddy validate --config /etc/caddy/caddy.json
docker compose up -d
docker compose exec api bun scripts/create-user.ts owner "Your name" --owner
```

`deploy:configure` generates secret-containing files under ignored `deploy/generated/` with restrictive permissions. It validates the domain and secret configuration. Caddy includes its layer-4 module to share TCP 443 between HTTPS and TURN/TLS, obtaining trusted certificates automatically. PROXY protocol preserves client IPs between the layer-4 router and HTTPS listener.

Use the following firewall policy on both the VM and its cloud security group:

| Public port     | Purpose                                 |
| --------------- | --------------------------------------- |
| TCP 80          | Certificate issuance and HTTPS redirect |
| TCP 443         | App, signaling, and TURN/TLS            |
| TCP 7881        | Direct WebRTC TCP fallback              |
| UDP 3478        | TURN/UDP                                |
| UDP 50000–60000 | Direct WebRTC media                     |

Restrict SSH to your administrator address. Block public access to 3000, 3001, 5432, 5349, 7880, 8443, and Caddy's admin port 2019. Application and database listeners use loopback; LiveKit's internal listeners additionally rely on this firewall. **Do not use the development Compose file on a public VM.**

Validate a call from separate networks and force TURN relay before treating deployment as ready. Production TLS, TURN traversal, Docker image builds, and VM capacity must be verified on the actual host. The VM's specs, DNS, and access have not been supplied yet.

Pin the built application and Caddy images by digest for repeatable rollouts. Caddy and its layer-4 module are version-pinned; the PostgreSQL major tag receives patch updates. Rebuild and retest when upgrading images.

### Operations

```sh
docker compose ps
docker compose logs --tail=100 api livekit caddy
docker compose exec -T postgres pg_dump -U office office > office-backup.sql
```

Back up database dumps and production secrets securely off the VM. Test restoration into a separate database. Never commit `.env`, generated config, dumps, or development credentials. A host restart interrupts calls; application presence and pending invitations are intentionally transient.

## Verification

```sh
bun typecheck
bun test
bun build
```

The test suite covers password authentication, access controls, disabled methods, room admission, movement validation, summon consent/expiry, duplicate tabs, and media room generation changes. Authentication tests use a separate ephemeral database on localhost:15433.

For the two-browser test, start the app, database, and LiveKit first:

```sh
bunx playwright install chromium
bun scripts/e2e.ts
```

The runner creates isolated temporary accounts, uses synthetic audio/video sources, and removes those accounts afterward. It verifies waves, accepted summons, meeting-room video, screen sharing, leaving a conversation, and the narrow-screen layout. Screenshots are written to `test-results/`. Optionally set `CHROME_PATH` to a local Chrome executable.

## Implementation notes

- `app/`, `components/`: Next.js interface, Phaser office, and LiveKit media controls.
- `server/`: Elysia HTTP/WebSocket endpoints, Better Auth, office rules, PostgreSQL access, and LiveKit grants.
- `shared/`: authored map geometry, collision checks, message schemas, and shared types.
- `scripts/`, `deploy/`: migrations, account provisioning, tests, and VM configuration.

This release targets one private office and a small team. It has one authoritative Elysia process and one map. Moving to multiple API processes requires shared office ownership/state coordination.

Nearby voice uses selective subscriptions within a public floor room. Distance is a user-experience rule, not a confidentiality boundary against modified clients. Private meetings/direct calls use isolated LiveKit rooms. Leaving a media group rotates its room generation and disconnects the retired room, so old tokens cannot reach the continuing conversation. Remaining members reconnect briefly; busy offices may need a more advanced admission system to reduce that churn.

The map uses original geometric pixel art and requires no downloaded sprite assets. Desktop browsers are the primary target; the compact layout and room navigation work on smaller screens, but touch movement is not included. Screen/system audio support varies by browser and capture source. Recording, a map editor, persistent chat, and multiple organizations are outside this release.
