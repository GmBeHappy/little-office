# Operating Little Office

For private/internal deployments permitted by the [license](../LICENSE). Start with the [README](../README.md). For upgrades to the workspace-aware backend, follow [workspace rollout](workspace-rollout.md) before these service-management steps. Run one API process.

## Database and migrations

The backend uses **Drizzle ORM** with the existing `pg` PostgreSQL connection pool. Typed table definitions live in `server/schema.ts`; HTTP endpoints, whiteboard saves, account provisioning, and Better Auth use Drizzle. Transactions retain the row locks used for concurrent whiteboard edits and owner changes. SQL remains in reviewed migration files, small SQL expressions, and independent database assertions in tests.

`drizzle/` contains versioned SQL migrations and schema snapshots. `bun db:migrate` applies them and tracks applied versions in `drizzle.__drizzle_migrations`. The first migration can create a fresh database or adopt the existing Little Office schema without replacing tables, resetting settings, or rewriting credentials. Existing sessions, OIDC links/tokens, whiteboards, audit entries and S3 metadata are retained. Back up PostgreSQL, run the migration once before starting the updated API, and keep `BETTER_AUTH_SECRET` unchanged so existing sessions and encrypted OAuth tokens remain usable.

For future schema changes:

```sh
# Edit server/schema.ts, then generate and review the SQL.
bun db:generate --name=describe_change
bun db:check
bun db:migrate
```

Commit the schema and generated `drizzle/` files together. The migration command resolves files relative to the app, so it works in the container and from other working directories. Better Auth now uses its Drizzle adapter; schema changes for authentication must be reflected in `server/schema.ts` and Drizzle migrations instead of running Better Auth's former automatic migration command. Production updates use the same `db:migrate` step shown below; do not use schema push against production.

## Container images and GitHub Actions

[Publish container images](../.github/workflows/publish-images.yml) builds and publishes two images for **Linux AMD64 and ARM64**:

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

Edit `.env` with your domains and secrets. Run `openssl rand -hex 32` separately for `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, and `LIVEKIT_API_SECRET`; use `openssl rand -hex 16` for `LIVEKIT_API_KEY`. Put the same PostgreSQL password into `DATABASE_URL`. Set `APP_URL=https://<office-domain>` and `LIVEKIT_URL=wss://<rtc-domain>`. Leave OIDC fields blank until you configure your provider. Set a stable, unique `OFFICE_MEDIA_NAMESPACE` for this deployment; preserve it across restarts.

`OFFICE_IMAGE` and `CADDY_IMAGE` default to `latest`, and their pull policies default to `always`. Every `docker compose up` checks GHCR and uses a newer successful `main` build without editing `.env`. To pin a build, set both images to the corresponding `sha-<full-commit-SHA>` tag from Actions, or their individual image digests. Keep the repository checkout and image version from the same commit/release when upgrading deployment configuration.

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

Compose waits for PostgreSQL, runs migrations, then starts the API and web app. The one-shot `migrate` container should show `Exited (0)`. The owner command prompts for a password and prints a user ID. Add that ID to `OFFICE_OPERATOR_IDS` in `.env`, then recreate the API container with `docker compose up -d --no-build --force-recreate api`. Workspace ownership alone does not grant platform administration. Open `/login`, then `/workspaces` to manage teams. The compatibility `/office` settings expose platform account/authentication administration to allowlisted operators. Configure workspace SSO through the dashboard; see [workspace rollout](workspace-rollout.md).

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

Validate a call from separate networks and force TURN relay before treating deployment as ready. Production TLS, TURN traversal, and VM capacity must be verified on the actual host. Deployment capacity depends on the host and must be measured with your expected workload.

Caddy and its layer-4 module are version-pinned; the PostgreSQL major tag receives patch updates. Retest media connections when upgrading images.

### Update an existing VM

Schedule a short interruption for active calls. Back up the database first, then update the checkout and pull the moving `latest` tags:

```sh
docker compose exec -T postgres pg_dump -U office office > office-backup.sql
git pull --ff-only
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
# OFFICE_PULL_POLICY=build
# CADDY_PULL_POLICY=build
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

The test suite covers password authentication, access controls, disabled methods, room admission, movement validation, summon consent/expiry, duplicate tabs, and media room generation changes. Authentication tests use a separate ephemeral database on an available localhost port selected by the operating system.

For the two-browser test, start the app, database, and LiveKit first:

```sh
bunx playwright install chromium
bun scripts/e2e.ts
```

The runner creates isolated temporary accounts, uses synthetic audio/video sources, and removes those accounts afterward. It verifies waves, accepted summons, meeting-room video, screen sharing, leaving a conversation, and the narrow-screen layout. Screenshots are written to `test-results/`. Optionally set `CHROME_PATH` to a local Chrome executable.

### Workspace feature controls and external S3 files

Workspace owners can manage maps and features in office settings. Platform storage configuration and connection checks require an allowlisted operator. The Features tab enables or disables Whiteboard for the entire workspace. Disabling it hides the control and closes active whiteboard access while retaining drawings. Feature changes persist and do not move users or interrupt voice rooms.

File storage uses an external S3-compatible bucket, including Garage. Set these server-only variables in `.env` and restart the API:

```dotenv
OFFICE_S3_ENDPOINT=https://s3.example.com
OFFICE_S3_REGION=garage
OFFICE_S3_BUCKET=little-office
OFFICE_S3_ACCESS_KEY_ID=replace-with-your-access-key
OFFICE_S3_SECRET_ACCESS_KEY=replace-with-your-secret-key
```

For AWS S3, use its actual region and leave the endpoint blank; for R2 use its account endpoint and region `auto`. The File storage tab shows connection details without exposing keys. **Test storage connection** verifies writing, reading and deleting a uniquely named temporary object.

With storage configured, the whiteboard has **Save snapshot to storage**. PNG snapshots (up to 5 MB) are held briefly in memory and written to the private S3 bucket; there is no VM file-storage fallback. The whiteboard menu lists the latest 20 **Saved snapshots** for the current area. Downloads check active membership, feature access and current area before issuing a 60-second signed S3 download URL. Editable board elements remain in PostgreSQL, while `office_files` holds only file metadata. Back up both PostgreSQL and the external bucket; disabling a feature does not delete either.

Keep the bucket private. The server key needs read/write/delete object permissions for `whiteboards/` and `checks/`. Browser downloads use a signed URL, not the storage credentials. Configure CORS with one rule per origin for Garage; combining origins in one rule can produce an invalid comma-separated response header:

```json
{
  "CORSRules": [
    {
      "ID": "little-office-production",
      "AllowedOrigins": ["https://office.example.com"],
      "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    },
    {
      "ID": "little-office-local",
      "AllowedOrigins": ["http://localhost:3000"],
      "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

Save this as `cors.json`, replace the production origin, then use AWS CLI with your credentials in environment variables or a local AWS profile:

```sh
aws --endpoint-url https://s3.example.com --region garage s3api put-bucket-cors --bucket little-office --cors-configuration file://cors.json
aws --endpoint-url https://s3.example.com --region garage s3api get-bucket-cors --bucket little-office
```

Check any existing bucket rules before replacing them. Uploaded snapshots and connection checks use only the configured bucket. Runtime feature flags are stored in `workspaces.features`; add an explicit validated flag, UI control and server access check when introducing another feature.
