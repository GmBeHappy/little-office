# Workspace consolidation: upgrade and rollout

The implementation is in the main repository; the private SaaS fork remains unchanged. It is a code integration, not an import of the fork's experimental accounts/database/CI secrets.

## Local development

Use the existing `bun install`, database startup and `bun run db:migrate` workflow. `/` is the landing page, `/login` supports existing password/OIDC accounts, `/workspaces` manages teams, and `/w/:workspaceId/office` opens one team. `/office` retains the old default-office entry point.

`bun run user:create <username> <name> --owner` prints the new user's ID. Platform account/password/login-policy/storage administration additionally requires that ID in `OFFICE_OPERATOR_IDS` (comma separated), followed by an API restart. Workspace ownership does not grant platform privileges. The compatibility `/office` settings expose platform administration only to allowlisted operators; scoped office pages direct member management to their workspace dashboard.

Optional `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` enable Google in the same Better Auth database. Configure the provider callback as `${APP_URL}/api/auth/callback/google`. Existing OIDC configuration stays supported. Google OAuth credentials must be configured separately; do not put provider secrets in native clients.

Use a stable, unique `OFFICE_MEDIA_NAMESPACE` for each deployment sharing LiveKit. All new room names include it and the workspace UUID; startup cleanup only targets that deployment namespace. During the first upgrade, drain the old process and its old `office-*` rooms explicitly before starting the new version. Never bulk-delete another deployment's rooms.

## Migration

`0003_workspaces.sql` creates the canonical workspace/membership/invitation tables, copies the old settings to UUID `00000000-0000-4000-8000-000000000001` (`default`), and maps every old user into that workspace with the same role/approval/status. It adds workspace references to drawings, files and audit entries while retaining IDs, password hashes, sessions, OIDC data and S3 keys. The old singleton settings table remains as an upgrade reference; new writes use `workspaces`.

`0004_native_handoff.sql` stores short-lived, hashed, session-bound PKCE handoffs. Drizzle migration tracking makes repeated `db:migrate` runs safe.

For an existing deployment:

1. Back up PostgreSQL and the S3 object inventory/data; rehearse restoring them.
2. Stop office writes/joins and drain the old API process. Do not run old and new writers concurrently.
3. Preserve the existing `BETTER_AUTH_SECRET`; encrypted provider tokens and existing sessions depend on it.
4. Apply migrations using the new image, then compare counts and sample IDs/hashes/settings/drawings/file references against the backup.
5. Set the operator allowlist and deployment media namespace; start **one** API instance.
6. Verify legacy login, pending-member rejection, default office, and two-workspace isolation before opening new joins.
7. After new tenant writes, use a forward fix or coordinated restore. Starting the old binary against the new database is not a safe rollback strategy.

Useful checks (no credentials are printed):

```sql
SELECT count(*) FROM "user";
SELECT count(*) FROM workspace_memberships
 WHERE workspace_id='00000000-0000-4000-8000-000000000001';
SELECT id,slug,name,map_id,revision FROM workspaces;
SELECT workspace_id,count(*) FROM office_whiteboards GROUP BY workspace_id;
SELECT workspace_id,count(*) FROM office_files GROUP BY workspace_id;
SELECT workspace_id,count(*) FROM office_audit GROUP BY workspace_id;
SELECT w.id,w.name FROM workspaces w WHERE NOT EXISTS (
 SELECT 1 FROM workspace_memberships m
 WHERE m.workspace_id=w.id AND m.role='owner' AND m.approved=true
);
```

## Production rollout and remaining acceptance

The SaaS/workspace backend was deployed on **2026-10-23** from main commit `cea4bd99acc833d2167156bae49c2ac5b4c39fb5`. The account portal is [app.littleoffice.app](https://app.littleoffice.app); existing office data now belongs to workspace **GMTECH**, slug `gmtech`, at [gmtech.littleoffice.app](https://gmtech.littleoffice.app). Its original UUID `00000000-0000-4000-8000-000000000001` is unchanged. The previous office hostname redirects to this workspace.

The cutover preserved 8 users and their 8 memberships (including 1 pending membership), 3 whiteboards, 2 file references and 1,928 audit events. Final backups were retained both on the server and locally. Live browser acceptance verified legacy Authentik SSO, the GMTECH office's Connected state and a joined LiveKit room. The portal and workspace served valid HTTPS; unknown tenant certificate requests were denied, mismatched SNI/Host returned 421, public internal endpoints and cross-workspace routes returned 404, and unauthenticated protected routes returned 401.

Native parity implementation and validation remain in progress. The newer additive scene animation manifest is a separate change and must be deployed before native clients can use it. Google OAuth, individual workspace OIDC providers, private S3 integration, web↔Mac↔iPhone↔Android calls, screen capture and device interruptions still need acceptance with real clients. Signing and beta distribution status is tracked in each client's release documentation; the successful browser/LiveKit check does not establish complete native feature parity.

Local tests use isolated PGlite databases and fake accounts; they do not migrate development or production data. LiveKit failure tests use a local protocol stub.

## Google and workspace OIDC

Apply migration `0005_workspace_oidc.sql` with the normal migration command before starting the updated API. It adds an encrypted, owner-managed OIDC connection per workspace. No existing accounts or memberships are replaced.

For Google, configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and register `${APP_URL}/api/auth/callback/google` as an authorized redirect URI in a **Web application** OAuth client. The web, Apple, and Android apps all use this server callback through system-browser sign-in; never put the Google secret in an app. Restart the API after changing credentials. Google is shown on `/login` and `/workspaces` when configured. A verified Gmail or Google Workspace identity can recover an existing same-email account; third-party Google email accounts require explicit linking from a fresh personal-account session because Google is not authoritative for those mailboxes.

A workspace owner signs in with a personal account (Google or existing password), opens its settings at `/workspaces`, and saves its issuer URL, client ID, client secret and exact organization email domain. The owner must have signed in within the last ten minutes. The form returns the exact callback URI to register at the IdP and a workspace-specific `_little-office.<domain>` DNS TXT challenge. **Verify and enable SSO** checks DNS ownership and the provider's discovery metadata before enabling it. Public HTTPS endpoints on port 443 are required; internal/private-network identity servers are not supported by the hosted SaaS path. Authorization code flow, PKCE S256, signed ID tokens, nonce, verified email, and `openid profile email` scopes are required. Client-secret basic and post authentication are supported.

Share `/login?workspace=<workspace-slug>`. A new identity with a verified email in that exact domain is created as a **member** in that workspace (50-member limit); domains and subdomains are not interchangeable. Existing accounts first sign in with their original login, then use **Connect your organization** to prove and link their SSO identity explicitly. An email match alone never implicitly links a workspace IdP to a global account. The native browser handoff preserves the resulting session's workspace restriction.

SSO sessions can use only the issuing workspace. They cannot create workspaces, accept global invitations, configure authentication, edit global names/avatars, or operate the platform. Owner/admin roles come from membership records, never IdP claims. Google/personal sessions retain the usual multi-workspace access. Removing a member from an OIDC-configured workspace suspends its membership so domain autojoin cannot restore access; owners can explicitly restore it in People.

Saving/changing or disabling SSO revokes its active sessions, including native sessions and connected office clients. Changing issuer, client ID or domain also changes the provider identifier/callback URI; existing users must reconnect. Rotation is rejected while an active member relies on that provider without another enabled Google or password login. Link a usable recovery login before rotating; secret-only changes preserve the provider identifier. DNS proof is rechecked each time SSO is enabled; ownership is not continuously monitored while enabled. Remove a former employee's IdP access or suspend membership to deny future sign-ins.

Client secrets are encrypted using `BETTER_AUTH_SECRET` and never returned from the API. Preserve this secret securely with backups; replacing it without migrating ciphertext makes saved connections unreadable. Existing environment-configured OIDC remains available for the legacy deployment and is independent of workspace OIDC.

References: [Google's authoritative-email guidance](https://developers.google.com/identity/sign-in/web/backend-auth), [Better Auth account linking](https://better-auth.com/docs/concepts/users-accounts), and [OAuth providers](https://better-auth.com/docs/concepts/oauth).

## Workspace subdomains

Set `APP_URL=https://app.littleoffice.app` and `WORKSPACE_BASE_DOMAIN=littleoffice.app` in both web and API environments. Keep the API on loopback; the ingress must preserve the original `Host`, proxy `/api` and `/api/*` including WebSocket upgrades, and never expose `/internal*`. Forwarded host/protocol headers are not used for identity or tenant selection. Existing canonical `/w/<UUID>/office` and native API URLs continue to work.

The account dashboard, password/Google/OIDC login, provider callbacks and native browser consent stay on `app.littleoffice.app`. Workspace addresses such as `gmtech.littleoffice.app` resolve an existing database slug to its unchanged workspace UUID. Unknown, reserved and multi-label hosts fail closed. The dashboard opens each workspace's own hostname; workspace API paths and sockets cannot select a sibling workspace. Tenant origin checks require exact same-host origins, with no wildcard CORS or shared-domain cookies.

Sign-in from a workspace starts a browser-bound handoff to the account portal. A 60-second, single-use grant stored in the existing `verification` table returns to the initiating hostname and nonce. The result is an `HttpOnly; Secure; SameSite=Lax; Path=/` `__Host-` cookie scoped to that workspace and the original session expiry. It contains no reusable portal session credential. Parent-session logout/revocation, membership removal and OIDC configuration changes invalidate access immediately. Portal cookies also use the `__Host-` prefix when subdomains are enabled to prevent sibling cookie injection. Account security and SSO administration remain on the portal; the office profile dialog keeps workspace status editing local and links to the existing name/avatar editor on the portal. The portal editor does not join another office socket.

Native apps can use the canonical portal to select all their workspaces. If configured with a workspace hostname instead, browser consent redirects to the canonical portal, and the existing PKCE exchange returns a workspace-scoped bearer token plus its matching cookie name. The same credential works for the native API and embedded whiteboard; it cannot authenticate at the portal or a sibling hostname.

For Caddy on-demand certificates, `GET http://127.0.0.1:3001/internal/tls-allow?domain=<hostname>` permits only an existing, non-reserved workspace hostname. Unknown names return 403; a database failure returns 503. This endpoint is loopback-only at the ingress/network boundary, with an additional exact loopback Host check. The canonical portal and RTC/TURN names use explicitly configured certificates. The API's exact loopback `GET /api/health` remains available for container healthchecks and checks the database.

The completed GMTECH cutover changed the existing default workspace's slug to `gmtech` and display name to `GMTECH`, after backup and verification. Its UUID, map/features, memberships, account hashes, whiteboards, S3 keys and audit records were preserved. The old API was stopped before switching traffic, and its previous public hostname redirects to the GMTECH workspace. Subdomain routing itself required no new schema migration.

Validation: `bun test tests` covers authentication, tenant API/socket isolation, grants, cookie scope, native handoff and deployment configuration. After `next build`, run `bun tests/fixtures/workspace-routing-smoke.ts` to exercise the compiled Next server's tenant root rewrite and portal redirects against a temporary hostname lookup service. `skipProxyUrlNormalize` preserves the ingress server URL so a loopback rewrite does not become an external request to a normalized hostname.
