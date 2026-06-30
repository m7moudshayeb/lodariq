# Phase 1 Deployment Runbook

This runbook covers Lodariq Phase 1 deployment on Fly.io with Neon, Clerk, and
Cloudflare. It also records how to prepare Sentry, Resend, and Stripe without
wiring them into Phase 1 code before they are needed.

The current repository has deployable Fly apps for:

- API production: `apps/api/fly.toml`
- API staging: `apps/api/fly.staging.toml`
- Dashboard production: `apps/dashboard/fly.toml`
- Dashboard staging: `apps/dashboard/fly.staging.toml`
- Hosted editor production: `apps/editor/fly.toml`
- Hosted editor staging: `apps/editor/fly.staging.toml`

## Environment Model

Keep these two concepts separate:

- Deployment environments are where the Lodariq control plane runs:
  `local`, `staging`, `production`, and optional short-lived `preview`.
- Product environments are rows and tokens inside Lodariq workspaces:
  `development`, `staging`, and `production`.

A staging deployment can create product `production` SDK tokens for staging test
data. That does not mean it is production infrastructure. Never share database
URLs, Clerk instances, Cloudflare buckets, or SDK tokens between deployment
environments.

## Naming Matrix

| Surface                | Staging                              | Production                   |
| ---------------------- | ------------------------------------ | ---------------------------- |
| API Fly app            | `lodariq-api-staging`                | `lodariq-api`                |
| Dashboard Fly app      | `lodariq-dashboard-staging`          | `lodariq-dashboard`          |
| Editor Fly app         | `lodariq-editor-staging`             | `lodariq-editor`             |
| API origin             | `https://staging-api.lodariq.com`    | `https://api.lodariq.com`    |
| Dashboard origin       | `https://staging-app.lodariq.com`    | `https://app.lodariq.com`    |
| CDN origin             | `https://staging-cdn.lodariq.com`    | `https://cdn.lodariq.com`    |
| Editor origin          | `https://staging-editor.lodariq.com` | `https://editor.lodariq.com` |
| Neon branch or project | `staging`                            | `production`                 |
| Runtime DB role        | `lodariq_app_staging`                | `lodariq_app`                |
| R2 bucket              | `lodariq-assets-staging`             | `lodariq-assets-production`  |
| Clerk application      | Lodariq Staging                      | Lodariq Production           |

For preview deployments, use generated names such as
`lodariq-api-pr-123`, `lodariq-dashboard-pr-123`, and a Neon preview branch.
Do not attach public `lodariq.com` domains to previews unless there is a clear
need.

## Secrets Policy

Use a single secrets manager as the source of truth, then sync to Fly app
secrets. Doppler or Infisical are both acceptable under ADR 0010. If no manager
is available yet, use `fly secrets set` directly and migrate later.

Recommended config layout:

| Config          | Purpose                                       | Sync target                 |
| --------------- | --------------------------------------------- | --------------------------- |
| `stg_api`       | Staging API runtime secrets                   | `lodariq-api-staging`       |
| `stg_dashboard` | Staging dashboard runtime secrets             | `lodariq-dashboard-staging` |
| `prd_api`       | Production API runtime secrets                | `lodariq-api`               |
| `prd_dashboard` | Production dashboard runtime secrets          | `lodariq-dashboard`         |
| `admin_neon`    | Owner/admin database URLs for migrations only | Do not sync to Fly          |

Rules:

- The editor Fly apps are static services and currently need no runtime
  secrets. Keep them in deployment automation anyway so staging and production
  always serve `/authoring.html` before authoring launch is enabled.
- Fly API `DATABASE_URL` must use a non-owner runtime role with `BYPASSRLS`
  disabled.
- Never put `neondb_owner`, `postgres`, or any Neon Console-created admin role
  in a Fly app runtime secret.
- Keep `NEON_DB_URL` or owner URLs only in the admin config or local operator
  shell for migrations and role provisioning.
- Keep staging and production passwords different, even if they point to
  branches inside the same Neon project.
- Do not print secret values in terminal output, issue trackers, PRs, or docs.

## Required Runtime Variables

API:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://<runtime-role>:<password>@<host>/<database>?sslmode=require
LODARIQ_AUTH_MODE=clerk
CLERK_SECRET_KEY=<sk_test_or_sk_live>
# or CLERK_JWT_KEY=<PEM public key>
CLERK_AUTHORIZED_PARTIES=https://<dashboard-origin>
LODARIQ_PUBLIC_API_BASE_URL=https://<api-origin>
LODARIQ_LOADER_SRC=https://<cdn-origin>/sdk/lodariq-loader.js
LODARIQ_CREATOR_LOADER_SRC=https://<cdn-origin>/sdk/lodariq-creator.js
LODARIQ_AUTHORING_IFRAME_SRC=https://<editor-origin>/authoring.html
```

Dashboard:

```bash
NODE_ENV=production
LODARIQ_API_BASE_URL=https://<api-origin>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<pk_test_or_pk_live>
CLERK_SECRET_KEY=<sk_test_or_sk_live>
```

Editor:

```bash
NODE_ENV=production
PORT=3003
```

The editor app is a static Fly service. It does not receive Clerk, database, or
SDK token secrets. The parent product page passes its origin as the
`parentOrigin` iframe query parameter, and the editor accepts only validated
bridge messages from that exact origin.

`NODE_ENV`, `PORT`, `LODARIQ_AUTH_MODE=clerk`, public API URLs, loader URLs, and
dashboard API URLs are committed in the Fly config files because they are
environment-specific configuration, not secrets. Database URLs, Clerk secret
keys, R2 credentials, Stripe keys, Resend keys, and Sentry auth tokens must stay
in the secret store. Clerk publishable keys are public but environment-specific;
keep them in the same secrets/config workflow so staging and production cannot
be mixed by accident.

## Local Prerequisites

Run deployment commands from the repository root with project Node 24:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
node -v
pnpm -v
```

Expected Node version is `v24.18.0` or a compatible Node 24 version.

Install and authenticate CLIs as needed:

```bash
brew install flyctl
fly auth login

# Optional for Cloudflare R2 uploads and DNS automation.
pnpm dlx wrangler login
```

## Fly.io Setup

Official references:

- Fly apps: https://fly.io/docs/flyctl/apps-create/
- Fly secrets: https://fly.io/docs/flyctl/secrets-set/
- Fly certs: https://fly.io/docs/flyctl/certs-add/

Create the six apps once:

```bash
fly apps create lodariq-api-staging --org <fly-org>
fly apps create lodariq-dashboard-staging --org <fly-org>
fly apps create lodariq-editor-staging --org <fly-org>
fly apps create lodariq-api --org <fly-org>
fly apps create lodariq-dashboard --org <fly-org>
fly apps create lodariq-editor --org <fly-org>
```

Set API secrets:

```bash
fly secrets set -c apps/api/fly.staging.toml \
  DATABASE_URL='<staging-runtime-database-url>' \
  CLERK_SECRET_KEY='<staging-clerk-secret-key>' \
  CLERK_AUTHORIZED_PARTIES='https://staging-app.lodariq.com'

fly secrets set -c apps/api/fly.toml \
  DATABASE_URL='<production-runtime-database-url>' \
  CLERK_SECRET_KEY='<production-clerk-secret-key>' \
  CLERK_AUTHORIZED_PARTIES='https://app.lodariq.com'
```

```bash
fly secrets set -c apps/dashboard/fly.staging.toml \
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='<staging-publishable-key>' \
  CLERK_SECRET_KEY='<staging-clerk-secret-key>'

fly secrets set -c apps/dashboard/fly.toml \
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='<production-publishable-key>' \
  CLERK_SECRET_KEY='<production-clerk-secret-key>'
```

Attach public domains:

```bash
fly certs add staging-api.lodariq.com -c apps/api/fly.staging.toml
fly certs add staging-app.lodariq.com -c apps/dashboard/fly.staging.toml
fly certs add staging-editor.lodariq.com -c apps/editor/fly.staging.toml
fly certs add api.lodariq.com -c apps/api/fly.toml
fly certs add app.lodariq.com -c apps/dashboard/fly.toml
fly certs add editor.lodariq.com -c apps/editor/fly.toml
```

In Cloudflare DNS, create the records requested by `fly certs check`. Keep them
DNS-only until Fly certificate issuance is healthy. After certificate checks
pass, only enable Cloudflare proxying if it has been tested with cookies,
streaming, and API responses.

Deploy staging first:

```bash
pnpm deploy:editor:staging
pnpm deploy:api:staging
pnpm deploy:dashboard:staging
```

Deploy production only after staging, database checks, and Clerk smoke checks
pass:

```bash
pnpm deploy:editor:production
pnpm deploy:api:production
pnpm deploy:dashboard:production
```

Operational commands:

```bash
fly status -c apps/api/fly.staging.toml
fly logs -c apps/api/fly.staging.toml
fly secrets list -c apps/api/fly.staging.toml

fly status -c apps/dashboard/fly.toml
fly logs -c apps/dashboard/fly.toml
fly secrets list -c apps/dashboard/fly.toml

fly status -c apps/editor/fly.staging.toml
fly logs -c apps/editor/fly.staging.toml
```

`fly secrets list` shows secret names and digests, not values. Use it to verify
presence, not to recover secrets.

## Neon Setup

Official references:

- Neon branching: https://neon.com/docs/guides/branching-intro
- Neon roles: https://neon.com/docs/manage/roles

Recommended shape:

- One Neon project is acceptable for Phase 1 if production and staging use
  separate branches and separate runtime roles.
- Separate Neon projects are stronger if compliance, backup boundaries, or
  billing boundaries require it.
- Preview deployments should use short-lived Neon branches and never reuse the
  staging runtime role.

Create or choose branches:

1. In Neon Console, create or confirm the production branch.
2. Create a `staging` child branch from production after the schema is current.
3. For previews, create a branch per PR and delete it when the preview is gone.

Apply migrations only with an owner/admin URL:

```bash
pnpm migrations:check

psql "$STAGING_NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0000_phase_1_foundation.sql
psql "$STAGING_NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0001_correlation_ids.sql

psql "$PRODUCTION_NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0000_phase_1_foundation.sql
psql "$PRODUCTION_NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0001_correlation_ids.sql
```

If `psql` is not available, paste the migration into the Neon SQL Editor for
the target branch after `pnpm migrations:check` passes. Destructive migrations
against shared staging or production need explicit human sign-off in the
migration file before they are applied.

`0001_correlation_ids.sql` is additive. It adds nullable trace columns and
indexes for publication and authoring-session correlation IDs. New Phase 1 API
writes always populate them; existing rows without values are read with a
deterministic fallback until an explicit, human-approved shared-environment
backfill is scheduled.

Provision runtime roles with SQL-created roles, not Neon Console-created admin
roles. Console/API-created Neon roles can inherit elevated privileges; the
repository script creates a limited login role and verifies `BYPASSRLS` is off.

Staging:

```bash
DATABASE_URL="$STAGING_NEON_OWNER_DATABASE_URL" \
LODARIQ_RUNTIME_ROLE_PROVISIONING=I_UNDERSTAND_THIS_CHANGES_DATABASE_PRIVILEGES \
LODARIQ_RUNTIME_DB_ROLE=lodariq_app_staging \
LODARIQ_RUNTIME_DB_PASSWORD='<new-32-plus-character-password>' \
pnpm db:provision:runtime-role
```

Production:

```bash
DATABASE_URL="$PRODUCTION_NEON_OWNER_DATABASE_URL" \
LODARIQ_RUNTIME_ROLE_PROVISIONING=I_UNDERSTAND_THIS_CHANGES_DATABASE_PRIVILEGES \
LODARIQ_RUNTIME_DB_ROLE=lodariq_app \
LODARIQ_RUNTIME_DB_PASSWORD='<new-32-plus-character-password>' \
pnpm db:provision:runtime-role
```

Build app connection strings with the runtime role and password:

```text
postgresql://lodariq_app_staging:<password>@<staging-host>/neondb?sslmode=require
postgresql://lodariq_app:<password>@<production-host>/neondb?sslmode=require
```

Verify live RLS with the runtime URL, never the owner URL:

```bash
DATABASE_URL="$STAGING_RUNTIME_DATABASE_URL" \
LODARIQ_LIVE_RLS_WRITE_CHECK=I_UNDERSTAND_THIS_WRITES_SCRATCH_ROWS \
pnpm rls:verify:live

DATABASE_URL="$PRODUCTION_RUNTIME_DATABASE_URL" \
LODARIQ_LIVE_RLS_WRITE_CHECK=I_UNDERSTAND_THIS_WRITES_SCRATCH_ROWS \
pnpm rls:verify:live
```

The verification writes and cleans up scratch rows. Run it only on an approved
staging branch or production after explicit approval.

The RLS verifier is not just a catalog check. It also proves the runtime role has
`BYPASSRLS` disabled, unscoped tenant reads return no rows, workspace-scoped reads
see only the selected scratch workspace, document versions and publications stay
inside that workspace, and the SDK token lookup scope can see only the matching
environment token plus environment row. It must not expose workspace, document,
artifact, publication, authoring-session, or event rows before the token has
resolved to a workspace.

The API depends on that two-step flow:

1. `/v1/sdk/*` receives an environment bearer token and resolves only the token
   hash through `lodariq.environment_token_hash`.
2. The repository returns the token's `workspaceId`, `environmentId`, environment
   kind, and origin allowlist.
3. The route enforces the exact browser origin allowlist.
4. Document, artifact, publication, event, and authoring-session reads/writes use
   the resolved workspace and regular `lodariq.workspace_id` RLS scope.

Do not add a wider token-lookup policy to documents or artifacts. If SDK lookup
needs more data later, resolve the token first and then run a normal
workspace-scoped repository call.

## Clerk Setup

Official references:

- Clerk token verification: https://clerk.com/docs/reference/backend/verify-token
- Clerk organizations: https://clerk.com/docs/guides/organizations/overview

Create separate Clerk applications:

- `Lodariq Staging`: use test/development keys unless you intentionally need a
  production Clerk instance for staging.
- `Lodariq Production`: use live/production keys.

Required Clerk configuration:

1. Enable Organizations.
2. Create a staging organization and a production organization for operator
   smoke tests.
3. Invite operator users into the organization.
4. Use roles that map cleanly to Lodariq roles:
   `owner`, `admin`, `member`, and viewer-like fallback.
5. Make sure the browser has an active organization before testing the
   dashboard. The API requires the Clerk token to contain `org_id`.
6. Configure redirect URLs for each dashboard origin.
7. Configure allowed origins/authorized parties exactly:
   - Staging API secret: `CLERK_AUTHORIZED_PARTIES=https://staging-app.lodariq.com`
   - Production API secret: `CLERK_AUTHORIZED_PARTIES=https://app.lodariq.com`

Phase 1 API auth accepts a bearer token or the `__session` cookie. The dashboard
uses Clerk's Next.js provider, route protection, sign-in/sign-up pages,
organization switching, and user menu. The API still makes the final workspace
authorization decision from the verified token's active `org_id` claim.

If testing through Fly's default hostnames before DNS is ready, temporarily add
the exact Fly dashboard origin to `CLERK_AUTHORIZED_PARTIES`, then remove it
after custom domains work.

## Cloudflare DNS and R2 Setup

Official references:

- R2 public buckets/custom domains:
  https://developers.cloudflare.com/r2/buckets/public-buckets/
- R2 S3-compatible API:
  https://developers.cloudflare.com/r2/api/s3/api/
- R2 tokens:
  https://developers.cloudflare.com/r2/api/tokens/

DNS:

1. Add `lodariq.com` to Cloudflare.
2. Point registrar nameservers at Cloudflare.
3. Create or allow Fly to validate records for:
   - `staging-api.lodariq.com`
   - `staging-app.lodariq.com`
   - `staging-editor.lodariq.com`
   - `api.lodariq.com`
   - `app.lodariq.com`
   - `editor.lodariq.com`
4. Create R2 custom domains:
   - `staging-cdn.lodariq.com`
   - `cdn.lodariq.com`

R2 buckets:

1. Create `lodariq-assets-staging`.
2. Create `lodariq-assets-production`.
3. Connect `staging-cdn.lodariq.com` to the staging bucket.
4. Connect `cdn.lodariq.com` to the production bucket.
5. Build and stage SDK CDN assets:

```bash
pnpm --filter @lodariq/sdk-runtime build
pnpm --filter @lodariq/sdk-authoring build
pnpm sdk:prepare-assets
```

The packager writes upload-ready files to `dist/sdk-assets/sdk/` and a review
manifest to `dist/sdk-assets/manifest.json`. It follows the loader/runtime,
tour-renderer, and creator installer relative imports, strips public source-map
comments, records SHA-256 hashes, and marks cache policy hints per file.

6. Upload `dist/sdk-assets/sdk/` to the bucket prefix `/sdk/`:
   - `lodariq-loader.js` is the ordinary viewer/runtime snippet entrypoint.
   - `lodariq-creator.js` is the short-lived authenticated creator launch
     snippet entrypoint.
   - `runtime/index.js`, `renderers/tour.js`, and referenced chunks must remain
     at the relative paths recorded in the manifest.
7. Use short cache TTLs for stable entrypoint paths such as
   `lodariq-loader.js`, `lodariq-creator.js`, `runtime/index.js`, and
   `renderers/tour.js`; use long immutable cache headers only for files marked
   `immutable` in `dist/sdk-assets/manifest.json`.
8. Disable `r2.dev` public access for production. Use custom domains for
   production.
9. If `r2.dev` is enabled for staging, treat it as temporary and never put that
   URL into production snippets.

R2 API tokens:

1. Create one bucket-scoped token per environment.
2. Scope staging to `lodariq-assets-staging`.
3. Scope production to `lodariq-assets-production`.
4. Use Object Read & Write for publisher/build jobs.
5. Use Object Read only for any future runtime that only reads.
6. Store:

```bash
R2_ACCOUNT_ID=<account-id>
R2_BUCKET=<bucket-name>
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_PUBLIC_BASE_URL=https://<cdn-origin>
```

Phase 1 code does not yet upload compiled artifacts to R2. These values are for
the publication pipeline once server-side artifact upload is connected.

Cache policy:

- Content-addressed assets such as `/sdk/<hash>.js` and compiled artifact hashes
  can use long immutable cache headers.
- Pointer files, manifests, or "current" URLs should use short TTLs or
  revalidation.
- Do not invalidate the whole CDN path for normal publication. Publish a new
  content hash and update the pointer.

## Sentry Setup

Official reference:

- Next.js setup: https://docs.sentry.io/platforms/javascript/guides/nextjs/

Prepare but do not rely on Sentry until code integration is added:

1. Create projects:
   - `lodariq-api-staging`
   - `lodariq-api-production`
   - `lodariq-dashboard-staging`
   - `lodariq-dashboard-production`
2. Store DSNs per service/environment as `SENTRY_DSN`.
3. Store source-map upload tokens as build secrets only, not public runtime
   config.
4. Use environment tags: `staging` and `production`.
5. Before enabling replay, scrub PII and workspace/customer content.

## Resend Setup

Official reference:

- API keys: https://resend.com/docs/dashboard/api-keys/introduction

Resend is not required for Phase 1 runtime paths yet. Prepare it this way:

1. Create a Lodariq Resend team.
2. Add and verify `lodariq.com` or a subdomain such as `mail.lodariq.com`.
3. Add DNS records from Resend in Cloudflare.
4. Create separate API keys:
   - `lodariq-staging`
   - `lodariq-production`
5. Store:

```bash
RESEND_API_KEY=<resend-key>
EMAIL_FROM=Lodariq <hello@lodariq.com>
```

Do not send transactional customer mail from staging to real users unless the
recipient is explicitly allowlisted.

## Stripe Setup

Official reference:

- API keys: https://docs.stripe.com/keys

Stripe is deferred until billing is implemented. Prepare boundaries now:

1. Use Stripe sandbox/test mode for staging.
2. Use live mode only for production.
3. Prefer restricted API keys over unrestricted secret keys when integration
   permissions are known.
4. Store webhook signing secrets separately from API keys.
5. Planned secrets:

```bash
STRIPE_SECRET_KEY=<restricted-or-secret-key>
STRIPE_WEBHOOK_SECRET=<whsec_...>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_...>
```

Do not emit one Stripe event per SDK interaction. Billing should be tied to
product-level usage aggregation, not runtime analytics noise.

## Deployment Order

For a fresh staging environment:

1. Create Fly apps.
2. Create or choose Neon staging branch.
3. Run `pnpm migrations:check`.
4. Apply migrations with the Neon owner URL.
5. Provision `lodariq_app_staging`.
6. Build and store staging runtime `DATABASE_URL`.
7. Run `pnpm rls:verify:live` against the staging runtime URL.
8. Create Clerk staging application and organization.
9. Set Fly API secrets.
10. Attach Fly certificates and Cloudflare DNS records.
11. Deploy editor.
12. Deploy API.
13. Deploy dashboard.
14. Check `/healthz`, `/openapi.json`, and editor `/authoring.html`.
15. Sign in with a Clerk user that has an active organization.
16. Mint a staging SDK token from the dashboard.
17. Install the ordinary SDK snippet in a staging test app and confirm no
    creator toolbar renders.
18. Create a short-lived authoring launch snippet, install it in the same
    staging test app, and confirm the creator toolbar opens the
    `staging-editor.lodariq.com` iframe.
19. Save a small document edit from creator mode and confirm the API accepts it
    only with both the environment bearer token and
    `x-lodariq-authoring-session` header.
20. Confirm SDK bootstrap rejects disallowed origins and accepts allowlisted
    origins.

For production:

1. Repeat the same flow with production-specific providers, roles, secrets, and
   domains.
2. Do not copy staging secrets into production.
3. Apply any production migration only after staging has passed and destructive
   migration sign-off requirements are satisfied.
4. Deploy editor first when the hosted iframe asset changed, then API before
   dashboard if API routes or OpenAPI output changed.
5. Keep the previous Fly release available for rollback.

## Verification Commands

Local checks before deployment:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm verify
```

Runtime environment shape check with fixture values:

```bash
NODE_ENV=production \
DATABASE_URL='postgresql://lodariq_app:password@example.com/neondb?sslmode=require' \
LODARIQ_AUTH_MODE='clerk' \
CLERK_SECRET_KEY='sk_test_fixture' \
CLERK_AUTHORIZED_PARTIES='https://app.lodariq.com' \
LODARIQ_PUBLIC_API_BASE_URL='https://api.lodariq.com' \
LODARIQ_LOADER_SRC='https://cdn.lodariq.com/sdk/lodariq-loader.js' \
LODARIQ_CREATOR_LOADER_SRC='https://cdn.lodariq.com/sdk/lodariq-creator.js' \
LODARIQ_AUTHORING_IFRAME_SRC='https://editor.lodariq.com/authoring.html' \
LODARIQ_API_BASE_URL='https://api.lodariq.com' \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='pk_test_fixture' \
pnpm live:check-env
```

Staging health checks:

```bash
curl -fsS https://staging-api.lodariq.com/healthz
curl -fsS https://staging-api.lodariq.com/openapi.json
curl -fsSI https://staging-app.lodariq.com
curl -fsSI https://staging-editor.lodariq.com/authoring.html
```

Production health checks:

```bash
curl -fsS https://api.lodariq.com/healthz
curl -fsS https://api.lodariq.com/openapi.json
curl -fsSI https://app.lodariq.com
curl -fsSI https://editor.lodariq.com/authoring.html
```

## Promotion and Rollback

Promotion:

1. Merge code after `pnpm verify`.
2. Apply schema changes to staging.
3. Verify staging RLS.
4. Deploy staging editor, API, and dashboard.
5. Run Clerk-authenticated staging smoke checks.
6. Apply schema changes to production after approval.
7. Verify production RLS.
8. Deploy production editor, API, and dashboard.
9. Run production smoke checks with an internal organization.

Rollback:

- Application rollback: use Fly releases to roll back the app image.
- Publication rollback: use immutable publication rows and update the active
  publication pointer; do not recompile just to roll back.
- Database rollback: do not assume down migrations are safe. For destructive or
  data-changing migrations, restore from Neon point-in-time or branch recovery
  only after explicit review.
- Secret rollback: use the secrets manager version history or re-set the last
  known good secret in Fly.

## Secret Rotation

Database runtime role:

1. Safer path: create a new runtime role such as `lodariq_app_202607`, provision
   it with the repository script, update Fly `DATABASE_URL`, deploy, verify, and
   later revoke the old role.
2. Faster path: update the existing role password with the repository script,
   then immediately update Fly `DATABASE_URL`; this can break existing
   connections until machines restart.

Clerk:

1. Create or rotate the key in Clerk.
2. Set the new API Fly secret.
3. Deploy/restart API machines.
4. Confirm authenticated dashboard requests still work.
5. Remove the old key.

R2:

1. Create a new bucket-scoped token.
2. Update secrets in the publisher/build runtime.
3. Verify upload and readback.
4. Revoke the old token.

Stripe and Resend:

1. Create a new key in the provider.
2. Update only the matching environment.
3. Verify test calls or webhooks.
4. Revoke the old key.

## Current Phase 1 Gaps

- No separate Fly worker is deployed yet.
- Compiled publication artifact upload to R2 is documented but not wired into
  Phase 1 publication code.
- Sentry, Resend, and Stripe are provider-prep only; they are not required by
  current `pnpm verify`.
- Live authoring launch still needs deployed staging smoke evidence across the
  editor iframe, API save endpoint, SDK token origin allowlist, and Clerk-backed
  dashboard flow.
