# Little Office

A pixel-art office built with **Next.js, Elysia on Bun, PostgreSQL, Phaser, Better Auth, and LiveKit**.

Walk with WASD/arrows and press Space to jump (or click the Space control on the map). Enable nearby audio to talk to people close by. Join the Studio or Library for a meeting, share your screen, wave, summon a teammate with their consent, or start an accepted direct call. Microphone and camera start off.

The map fills the browser window. Navigation, people/rooms, and media controls float above it. Close the people panel for more map space, reopen it from People or Rooms, or use the expand button for browser fullscreen with all controls included.

Speaking activity appears as green highlights and animated sound bars on characters, the people list, and video tiles. Your microphone control also shows “Speaking” when it detects sound. Indicators follow your current conversation and nearby-audio range, and clear during silence, mute, or disconnection. Reduced-motion preferences keep the bars still.

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

## Container images and GitHub Actions

[Publish container images](.github/workflows/publish-images.yml) builds and publishes two images for **Linux AMD64 and ARM64**:

| Image                                   | Used by                                                       |
| --------------------------------------- | ------------------------------------------------------------- |
| `ghcr.io/gmbehappy/little-office`       | Next.js web, Elysia API, migrations, and account provisioning |
| `ghcr.io/gmbehappy/little-office-caddy` | Caddy with the layer-4 module for HTTPS and TURN/TLS          |

The workflow runs on pushes to `main`, tags matching `v*`, and **Actions → Publish container images → Run workflow**. Backend tests run on a native runner before either image is published; each app image also runs a production Next.js build. Buildx caches layers between runs. A newer run on the same branch cancels an older unfinished run.

| Tag                     | Published when             |
| ----------------------- | -------------------------- |
| `latest`                | A build of `main` succeeds |
| `sha-<full-commit-SHA>` | Every successful build     |
| `v1.0.0` (example)      | That Git tag is pushed     |

Both images use the same tagging scheme. Wait for **both jobs** to finish successfully before deploying. Use a matching commit tag for reproducible deployments; `latest` moves as new commits build.

The workflow uses GitHub's automatic `GITHUB_TOKEN` with `contents: read` and `packages: write`; no Docker Hub account or repository secret is needed. If organization policy restricts Actions or package creation, an administrator must allow the workflow and these permissions. See [GitHub's container publishing guide](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

New GHCR packages are private by default. Either keep them private and log in on the VM with a personal access token (classic) granting `read:packages`, or change **each package's** visibility to public for anonymous pulls. Package visibility is separate from repository visibility. See [GitHub's Container Registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## Deploy to the Linux VM

### 1. Prepare the VM and DNS

Install Git, OpenSSL, Docker Engine, and the Docker Compose plugin on a Linux AMD64 or ARM64 VM. Bun and Node.js are included in the image. The production Compose file uses Linux host networking.

Point three DNS A records at the VM's public IP:

- `office.example.com` — app
- `rtc.example.com` — LiveKit signaling
- `turn.example.com` — TURN/TLS

Use DNS-only records for RTC/TURN when your DNS provider also offers an HTTP proxy. Configure the firewall listed below before starting the containers. The VM must allow WebRTC traffic directly.

### 2. Download the configuration and images

Wait for the repository's **Publish container images** workflow to succeed, then run on the VM:

```sh
git clone https://github.com/GmBeHappy/little-office.git
cd little-office
cp deploy/production.env.example .env
chmod 600 .env
```

For private packages, log in before pulling. Enter your personal access token at the password prompt:

```sh
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

Edit `.env` with your domains and secrets. Run `openssl rand -hex 32` separately for `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, and `LIVEKIT_API_SECRET`; use `openssl rand -hex 16` for `LIVEKIT_API_KEY`. Put the same PostgreSQL password into `DATABASE_URL`. Set `APP_URL=https://<office-domain>` and `LIVEKIT_URL=wss://<rtc-domain>`. Leave OIDC fields blank until you configure your provider.

`OFFICE_IMAGE` and `CADDY_IMAGE` default to `latest`. To pin a build, set both to the corresponding `sha-<full-commit-SHA>` tag from Actions, or their individual image digests. Keep the repository checkout and image version from the same commit/release when upgrading deployment configuration.

```sh
docker compose pull
```

If pulling reports `denied`, check package access and your GHCR login. If it reports `manifest unknown`, check that both publish jobs succeeded and that the configured tag exists.

### 3. Generate proxy and media configuration

Run the configuration generator inside the published app image:

```sh
mkdir -p deploy/generated
chmod 700 deploy/generated
docker compose run --rm --no-deps --user "$(id -u):$(id -g)" \
  --volume "$PWD/deploy/generated:/app/deploy/generated" \
  api bun scripts/configure-deploy.ts
docker compose run --rm --no-deps caddy \
  caddy validate --config /etc/caddy/caddy.json
```

This generates secret-containing files under ignored `deploy/generated/` with restrictive permissions and validates domains and secrets. Caddy includes its layer-4 module to share TCP 443 between HTTPS and TURN/TLS, obtaining trusted certificates automatically. PROXY protocol preserves client IPs between the layer-4 router and HTTPS listener.

### 4. Start the app and create the owner

```sh
docker compose up -d --no-build
docker compose ps -a
docker compose exec api bun scripts/create-user.ts owner "Your name" --owner
```

Compose waits for PostgreSQL, runs migrations, then starts the API and web app. The one-shot `migrate` container should show `Exited (0)`. The owner command prompts for a password. Open your configured `https://office...` URL, sign in, and add teammates under **Settings → Members**. Configure OIDC under **Authentication** when your provider is ready.

If startup fails, inspect `docker compose logs --tail=100 migrate api web caddy livekit`. If the API is still starting, wait until it is healthy before creating the owner.

### Firewall and media checks

Use the following firewall policy on both the VM and its cloud security group:

| Public port     | Purpose                                 |
| --------------- | --------------------------------------- |
| TCP 80          | Certificate issuance and HTTPS redirect |
| TCP 443         | App, signaling, and TURN/TLS            |
| TCP 7881        | Direct WebRTC TCP fallback              |
| UDP 3478        | TURN/UDP                                |
| UDP 50000–60000 | Direct WebRTC media                     |

Restrict SSH to your administrator address. Block public access to 3000, 3001, 5432, 5349, 7880, 8443, and Caddy's admin port 2019. Application and database listeners use loopback; LiveKit's internal listeners additionally rely on this firewall. **Do not use the development Compose file on a public VM.**

Validate a call from separate networks and force TURN relay before treating deployment as ready. Production TLS, TURN traversal, and VM capacity must be verified on the actual host. The VM's specs, DNS, and access have not been supplied yet.

Caddy and its layer-4 module are version-pinned; the PostgreSQL major tag receives patch updates. Retest media connections when upgrading images.

### Update an existing VM

Schedule a short interruption for active calls. Back up the database first, then update the checkout and the two image references in `.env` together:

```sh
docker compose exec -T postgres pg_dump -U office office > office-backup.sql
git pull --ff-only
# If using pinned tags, update OFFICE_IMAGE and CADDY_IMAGE in .env now.
docker compose pull
docker compose stop web api
docker compose up --no-deps --force-recreate --exit-code-from migrate migrate
# Continue only if migrations exited successfully (exit code 0).
docker compose up -d --no-build
docker compose ps -a
```

Repeat the configuration-generation and validation commands before startup if domains, LiveKit keys, or proxy/media configuration changed. The `postgres`, `caddy_data`, and `caddy_config` volumes retain data across container updates. Do not use `docker compose down -v` unless you intend to delete that data. Rolling back images does not roll back database migrations; restore a compatible backup if a migration requires it.

### Build on the VM instead (optional)

The same Compose file retains local build definitions. Use local tags to avoid confusion with downloaded images:

```sh
# Set these in .env:
# OFFICE_IMAGE=little-office:local
# CADDY_IMAGE=little-office-caddy:local
docker compose build
```

Then follow configuration generation, validation, and startup above; skip `docker compose pull` for these local tags. The published-image path is the default.

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
