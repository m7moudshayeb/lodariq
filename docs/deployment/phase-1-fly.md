# Phase 1 Deployment Runbook

This runbook covers Lodariq deployment on Fly.io with Neon, Lodariq-owned
authentication, and Cloudflare. It preserves explicitly labeled references to
the former Phase 1 Clerk deployment as historical evidence, but active runtime code and
dependencies are Clerk-free. It also records how to prepare Sentry, Resend, and
Stripe without claiming production capabilities before they are wired.

## Canonical Hosted-Authoring Supersession

This runbook preserves the deploy and smoke procedure for the historical Phase 1
implementation. In particular, steps that install `lodariq-creator.js` as a
second, dashboard-generated creator snippet are evidence for that implementation
only; they are not the current canonical authoring entry.

The implemented Phase 2 Slice 1 convergence keeps one permanent public-installation
SDK entry in the customer app and resolves exact origins to environments
server-side. Configured development and staging products expose a direct,
draggable launcher. The launcher opens a first-party top-level authentication
popup, completes an exact-origin single-use code exchange for a short-lived
activation grant, then lazily opens the creator module and exact-origin editor
iframe. The iframe receives that grant once, creates and owns the document-
scoped session, and opens the same modeless authoring popup and runtime overlay.
Its stable actions are `New`, `Experiences on this page`, and `Preview`; Phase 2
Brand/release actions appear contextually, and Phase 3 expands `New` into the
broad outcome/type chooser. The dashboard remains setup/admin/support only, and
a browser extension is not required for the core path.

That convergence is implemented and locally verified. Deployed staging/live
origin evidence remains open, so the historical steps below are useful only for
reproducing the former Phase 1 path and must not be used as proof of the current
canonical workflow.

Phase 2 Slice 2's tokenized Tour delivery/preview, persisted Brand Theme,
document-specific delivery, preflight, and guarded staging publication passed its
local milestone and current-view visual QA. Slice 3 Product Match, exact browser
verification, and same-artifact promotion/approval are implemented locally. The
2026-08-09 stabilization checkpoint passes the full Node 24 `pnpm verify`,
including 86 Vitest files / 810 tests, 77 Playwright tests with four intentional
skips, and a zero-vulnerability dependency audit. None of this is deployed
evidence. Slice 3 preview/persistence/findings hardening, rollback/unpublish, and
analytics isolation remain incomplete.

The owned-auth code milestone is complete and active runtime/dependencies are
Clerk-free. Recovery/reset, the unified verification/reset outbox worker and
Resend adapter, authoritative API/BFF capability gates, activation recovery UX,
and the consolidated local gate pass. This is not a production account cutover:
first-database baseline application, provider/domain/secrets, coordinated capability enablement,
deployment, and live probes remain. Production configs therefore still keep
public signup, password recovery, and email delivery disabled.

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

This runbook deploys Lodariq's own control plane. It does not define how a
customer experience moves between product environments. Customer content uses
the immutable publish -> verify -> promote -> rollback model in
`../plans/phase-2-brand-and-release-foundation.md` and ADR 0014. Promotion of a
customer experience must reuse the exact verified compiled artifact; it is not
a Fly, Neon, or dashboard deployment.

A staging deployment can create product `production` SDK tokens for staging test
data. That does not mean it is production infrastructure. Never share database
URLs, auth/BFF secrets, Cloudflare buckets, or SDK tokens between deployment
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
| Auth/session store     | Staging Neon branch                  | Production Neon branch       |

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
LODARIQ_AUTH_MODE=lodariq
LODARIQ_AUTH_BFF_SOURCE_SECRET=<same-random-32-plus-byte-value-as-dashboard>
LODARIQ_EMAIL_DELIVERY_MODE=disabled
LODARIQ_PUBLIC_SIGNUP_MODE=disabled
LODARIQ_PASSWORD_RECOVERY_MODE=disabled
LODARIQ_PUBLIC_API_BASE_URL=https://<api-origin>
LODARIQ_LOADER_SRC=https://<cdn-origin>/sdk/lodariq-loader.js
LODARIQ_PUBLIC_LOADER_SRC=https://<cdn-origin>/sdk/lodariq-public-bootstrap.js
LODARIQ_CREATOR_LOADER_SRC=https://<cdn-origin>/sdk/lodariq-creator.js
LODARIQ_CREATOR_MODULE_URL=https://<cdn-origin>/sdk/sha256-<digest>/creator.js
LODARIQ_CREATOR_MODULE_VERSION=<version>
LODARIQ_CREATOR_MODULE_INTEGRITY=sha256-<base64-digest-matching-url>
LODARIQ_AUTHORING_IFRAME_SRC=https://<editor-origin>/authoring.html
```

Dashboard:

```bash
NODE_ENV=production
LODARIQ_AUTH_MODE=lodariq
LODARIQ_API_BASE_URL=https://<api-origin>
LODARIQ_AUTH_BFF_SOURCE_SECRET=<same-random-32-plus-byte-value-as-api>
LODARIQ_PUBLIC_SIGNUP_MODE=disabled
LODARIQ_PASSWORD_RECOVERY_MODE=disabled
```

Editor:

```bash
NODE_ENV=production
PORT=3003
```

The editor app is a static Fly service. It does not receive auth, database, or
SDK token secrets. The parent product page passes its origin as the
`parentOrigin` iframe query parameter, and the editor accepts only validated
bridge messages from that exact origin.

`NODE_ENV`, `PORT`, `LODARIQ_AUTH_MODE=lodariq`, fail-closed signup/recovery/
email modes, public API URLs, loader URLs, and dashboard API URLs are committed
in the Fly config files because they are environment-specific configuration,
not secrets. Database URLs, the shared BFF
source secret, R2 credentials, Stripe keys, Resend keys, and Sentry auth tokens
must stay in the secret store. The BFF secret must be identical within one
deployment environment and different between staging and production.

When production cutover is approved, replace only the three disabled auth modes
with the enabled values below and add the required API secrets/config:

```bash
# API
LODARIQ_EMAIL_DELIVERY_MODE=resend
LODARIQ_PUBLIC_SIGNUP_MODE=email-verification
LODARIQ_PASSWORD_RECOVERY_MODE=email
LODARIQ_APP_BASE_URL=https://<dashboard-origin>
LODARIQ_AUTH_EMAIL_FROM='Lodariq <access@lodariq.com>'
LODARIQ_AUTH_EMAIL_TOKEN_SECRET=<random-32-plus-byte-secret>
RESEND_API_KEY=<environment-specific-resend-key>

# Dashboard
LODARIQ_PUBLIC_SIGNUP_MODE=email-verification
LODARIQ_PASSWORD_RECOVERY_MODE=email
```

The API modes are authoritative. Never expose signup/recovery in the dashboard
while API delivery is disabled, and never place the email token secret or Resend
key in a `NEXT_PUBLIC_*` variable.

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
  LODARIQ_AUTH_BFF_SOURCE_SECRET='<staging-random-32-plus-byte-secret>'

fly secrets set -c apps/api/fly.toml \
  DATABASE_URL='<production-runtime-database-url>' \
  LODARIQ_AUTH_BFF_SOURCE_SECRET='<production-random-32-plus-byte-secret>'
```

```bash
fly secrets set -c apps/dashboard/fly.staging.toml \
  LODARIQ_AUTH_BFF_SOURCE_SECRET='<same-staging-secret-as-api>'

fly secrets set -c apps/dashboard/fly.toml \
  LODARIQ_AUTH_BFF_SOURCE_SECRET='<same-production-secret-as-api>'
```

Generate each BFF secret from a cryptographically secure source, store it in the
secrets manager, and paste the same value only into the matching API/dashboard
pair. Never derive production from staging or expose it through a
`NEXT_PUBLIC_*` variable.

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

Deploy production only after staging, database/RLS checks, and owned-auth smoke checks
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

Lodariq has not been deployed, so bootstrap each new database with the single
initial baseline and an owner/admin URL. The baseline is for an empty database
and must be applied exactly once:

```bash
pnpm migrations:check

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0000_initial_baseline.sql
```

If `psql` is not available, paste the baseline into the Neon SQL Editor for the
empty target branch after `pnpm migrations:check` passes. Do not run it against
a database containing Lodariq objects. After the first shared environment is
initialized, freeze the baseline and use reviewed forward migrations for later
schema changes; destructive changes still require explicit human sign-off.

Validate the baseline on an isolated empty Neon branch before initializing the
staging or production branches:

```bash
psql -X -v ON_ERROR_STOP=1 "$ISOLATED_NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0000_initial_baseline.sql
```

Then provision a non-owner runtime role on that branch and exercise the Drizzle
release-operation and document-pointer paths, including idempotency replay,
stale-generation CAS, two concurrent writers, and cross-tenant RLS isolation.
Also exercise password-credential lookup, session lookup/touch/revoke/rotation,
verification consumption, outbox worker scope, rate-limit buckets, unscoped
denial, password-recovery request/consume behavior, cross-purpose email-outbox
leasing, and cross-workspace membership isolation.
Exercise theme draft revision CAS, immutable approval/default behavior,
document theme acknowledgement, visual-check identity binding, append-only
theme/version/check policies, document-specific delivery, and staging release
idempotency/generation conflict behavior as well.
Initialize shared environments only after those checks pass. The baseline
contains schema DDL only: it creates no users, themes, publications, deployment
pointers, or other historical rows, and performs no data backfill.

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

Those are the historical Phase 1 checks. Current baseline acceptance also
requires the expanded live scratch workflow to create and resolve release
operations/document pointers and exercise every narrow owned-auth RLS scope,
prove expected-generation/session-rotation CAS under competing writers, and
verify theme draft/version/default and visual-check scopes, append-only approved
records, and that no new table crosses tenant scope. The verifier code covers
these new tables locally; isolated branch application and live behavior remain
pending.

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

## Lodariq-Owned Auth Setup and Cutover Gate

The active implementation uses PostgreSQL-backed users, password credentials,
memberships, opaque auth sessions, purpose-separated verification/reset
challenges, unified leased outbox delivery, a Resend sender, and auth rate-limit
buckets. Fastify owns worker start/drain lifecycle. API and BFF independently
gate signup/recovery, with API delivery capability authoritative. No Clerk
application, publishable key, secret key, authorized-party configuration,
provider organization, or provider SDK is required.

Before a staging owned-auth smoke:

1. Apply `0000_initial_baseline.sql` exactly once to an approved isolated empty
   Neon database and provision the non-owner runtime role. Do not run the retired
   development migration chain or a historical backfill.
2. Run `pnpm rls:verify:live` with the explicit scratch-write acknowledgment.
3. Set the same strong `LODARIQ_AUTH_BFF_SOURCE_SECRET` in the matching API and
   dashboard Fly apps.
4. Keep `LODARIQ_AUTH_MODE=lodariq` in both services. Never use header auth in a
   deployed environment.
5. Keep all three capability modes disabled for a migration-only smoke. For the
   delivery smoke, first verify the Resend domain and configure its secrets,
   then enable API delivery/signup/recovery and matching dashboard signup/
   recovery modes together.
6. Use the code-complete recovery/set-password flow to enroll a reviewed test
   user; do not mark provider-era users verified or add credentials with an ad
   hoc shared-environment update.
7. Verify signup/verification, recovery/reset, ambiguous-email acceptance,
   expiry/replay, outbox lease/retry/terminal behavior, sign-in/sign-out, cookie
   expiry/revocation, and workspace create/select with session rotation,
   cross-workspace denial, and authoring activation that
   resumes the exact request without changing the dashboard's active workspace.

Production cutover remains blocked until operators have:

- initialized the approved empty Neon target from `0000_initial_baseline.sql`
  exactly once and passed the expanded live RLS verifier with the non-owner role;
- verified the Resend domain and configured environment-specific app-origin,
  from-address, API-key, and token-secret values;
- enabled API delivery/signup/recovery plus matching dashboard signup/recovery
  modes and deployed both services together;
- proved the Fly client-source boundary in deployment, including that only the
  dashboard can create a valid signed pseudonymous source envelope;
- completed live verification/reset delivery, expiry/replay, ambiguous-email,
  outbox retry/terminal, session/workspace, and launcher reset-then-retry smoke
  coverage; and
- retained `legacyIdentityId` through an approved rollback window until cutover
  is stable.

The former Clerk setup is intentionally not retained as an active
procedure. Git history and the Phase 1 historical notes record it; restoring it
would contradict ADR 0017 and the current dependency boundary.

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

`lodariq-creator.js` above records the historical Phase 1 packaging boundary.
After hosted convergence, authoring code may still be a separate lazy bundle,
but customers must not install it as a second snippet; the permanent loader owns
launcher activation after the exact-origin code exchange and document-session
creation.

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

The Resend adapter and unified auth-email worker are wired and locally verified;
the provider/domain/secrets and production flags are not configured. Production
signup/recovery therefore remain disabled. Prepare the provider this way:

1. Create a Lodariq Resend team.
2. Add and verify `lodariq.com` or a subdomain such as `mail.lodariq.com`.
3. Add DNS records from Resend in Cloudflare.
4. Create separate API keys:
   - `lodariq-staging`
   - `lodariq-production`
5. Store:

```bash
RESEND_API_KEY=<resend-key>
LODARIQ_APP_BASE_URL=https://<dashboard-origin>
LODARIQ_AUTH_EMAIL_FROM='Lodariq <access@lodariq.com>'
LODARIQ_AUTH_EMAIL_TOKEN_SECRET=<random-32-plus-byte-secret>
```

Do not send transactional customer mail from staging to real users unless the
recipient is explicitly allowlisted.

Do not enable delivery/signup/recovery merely because an API key exists. First
initialize the empty target from `0000_initial_baseline.sql`, pass live RLS,
verify the domain and sender, set every
environment-specific secret, and deploy API/dashboard capability flags together.
Then verify claim/retry/idempotency, redacted errors, expiry/replay, single-use
links, and operator recovery. Verification/reset secrets belong in URL fragments
and must not appear in proxy logs or referrers.

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

The staging steps below describe the current one-install, owned-auth path. The
historical dashboard-created second creator snippet and Clerk organization flow
are not deployment prerequisites.

For a fresh staging environment:

1. Create Fly apps.
2. Create or choose Neon staging branch.
3. Run `pnpm migrations:check`.
4. Apply `0000_initial_baseline.sql` exactly once with the Neon owner URL.
5. Provision `lodariq_app_staging`.
6. Build and store staging runtime `DATABASE_URL`.
7. Run `pnpm rls:verify:live` against the staging runtime URL.
8. Set the matching API/dashboard BFF source secret and keep signup/recovery/
   email delivery disabled.
9. Confirm the recorded owned-auth consolidated milestone gate is green for the
   revision being deployed.
10. Confirm the Slice 2 consolidated milestone gate and same-viewport visual QA
    are recorded as passing before enabling Brand/staging release capabilities.
11. Attach Fly certificates and Cloudflare DNS records.
12. Deploy editor.
13. Deploy API.
14. Deploy dashboard.
15. Check `/healthz`, `/openapi.json`, and editor `/authoring.html`.
16. Sign in with a reviewed isolated-environment owned-auth test account; verify
    the HttpOnly cookie, sign-out revocation, and workspace rotation.
17. Configure the product origin and one permanent SDK installation from the
    dashboard setup/admin surface.
18. Open the staging product directly and confirm the draggable launcher appears
    without installing a creator snippet or browser extension.
19. Start the first-party auth popup and verify exact-origin success, cancel,
    expiry, and replay behavior through the activation grant and subsequent
    document-scoped short-lived authoring session.
20. Confirm `New`, `Experiences on this page`, and `Preview` are stable; the
    modeless popup can move away from product controls; and authoring reuses the
    runtime-rendered overlay.
21. Confirm the dashboard is not visited during ordinary authoring and that
    authoring-session creation still has no publication side effect.
22. Create/edit/approve a test Brand Theme, confirm the first approved version
    becomes the default, bind/acknowledge it on a Tour, and verify direct and
    hosted authoring return that exact approved snapshot.
23. Review the immutable staging artifact, run the guarded publish action, and
    verify server-derived idempotency replay, stale-generation `409`, append-only
    release history, and isolation from a second document pointer. Do not treat
    deterministic basic preflight as real-browser staging verification.
24. Confirm production bootstrap contains no launcher, activation, creator, or
    editor metadata and makes zero creator-network requests.

These are required deployed checks, not current evidence. A baseline-only smoke
keeps public capabilities disabled. An email cutover smoke enables them only
after the approved baseline initialization, Resend domain/secrets, and coordinated API/
dashboard configuration are ready; use the recovery/set-password path instead of
an ad hoc credential update.

For production:

1. Repeat the same flow with production-specific providers, roles, secrets, and
   domains.
2. Do not copy staging secrets into production.
3. Apply `0000_initial_baseline.sql` exactly once to the approved empty production
   database only after staging has passed. After first shared use, apply only
   reviewed forward migrations and satisfy destructive-migration sign-off.
4. Deploy editor first when the hosted iframe asset changed, then API before
   dashboard if API routes or OpenAPI output changed.
5. Keep the previous Fly release available for rollback.

The legacy `/v1/documents/:documentId/publish` mutation is closed. Use the
guarded document-scoped staging release route for the smoke above. Production
remains closed until exact staging browser verification and same-artifact
production promotion pass capability, idempotency, CAS, and live RLS checks.

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
LODARIQ_AUTH_MODE='lodariq' \
LODARIQ_AUTH_BFF_SOURCE_SECRET='fixture-secret-at-least-32-bytes-long' \
LODARIQ_EMAIL_DELIVERY_MODE='disabled' \
LODARIQ_PUBLIC_API_BASE_URL='https://api.lodariq.com' \
LODARIQ_LOADER_SRC='https://cdn.lodariq.com/sdk/lodariq-loader.js' \
LODARIQ_PUBLIC_LOADER_SRC='https://cdn.lodariq.com/sdk/lodariq-public-bootstrap.js' \
LODARIQ_CREATOR_LOADER_SRC='https://cdn.lodariq.com/sdk/lodariq-creator.js' \
LODARIQ_CREATOR_MODULE_URL='https://cdn.lodariq.com/sdk/sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/creator.js' \
LODARIQ_CREATOR_MODULE_VERSION='fixture-v1' \
LODARIQ_CREATOR_MODULE_INTEGRITY='sha256-qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=' \
LODARIQ_AUTHORING_IFRAME_SRC='https://editor.lodariq.com/authoring.html' \
LODARIQ_API_BASE_URL='https://api.lodariq.com' \
LODARIQ_PUBLIC_SIGNUP_MODE='disabled' \
LODARIQ_PASSWORD_RECOVERY_MODE='disabled' \
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
5. Run owned-auth staging smokes, including cookie/session rotation, workspace
   isolation, popup resume, and the signed BFF source boundary.
6. Apply schema changes to production after approval.
7. Verify production RLS.
8. Deploy production editor, API, and dashboard.
9. Run production smoke checks with an internal organization.

Rollback:

- Application rollback: use Fly releases to roll back the app image.
- Publication rollback: the Phase 2 guarded rollback route remains pending. Do
  not mutate a pointer manually; the eventual route must append immutable history
  and atomically move the pointer without recompiling.
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

Owned-auth BFF source secret:

1. Generate a new random 32+-byte value in the secrets manager.
2. Update the matching API and dashboard Fly apps as one coordinated change.
3. Restart/deploy both services; mixed old/new values fail credential requests
   closed during the rollout.
4. Confirm sign-in source-rate limiting, authenticated dashboard requests, and
   authoring-popup resume still work.
5. Retire the old value after both services are healthy. This rotation does not
   require changing password hashes or session tokens.

Owned-auth sessions:

1. For a suspected session compromise, revoke affected database-backed sessions
   by user/session scope through an approved operator path.
2. Do not rotate a nonexistent global session-signing key: session bearers are
   opaque and only their hashes are stored.

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

- No separate general-purpose Fly worker is deployed yet. The bounded auth-email
  outbox worker intentionally starts/drains inside the API lifecycle.
- Compiled publication artifact upload to R2 is documented but not wired into
  Phase 1 publication code.
- Sentry and Stripe are provider-prep only. Resend delivery code is wired and
  locally verified, but the provider domain/secrets and deployed capability
  flags remain production auth-cutover blockers.
- Live authoring launch still needs deployed staging smoke evidence across the
  editor iframe, API save endpoint, SDK origin allowlist, owned-auth dashboard/
  popup flow, and production creator-network exclusion.
- Phase 2 Slice 1 hosted convergence is implemented locally but still needs the
  deployed evidence above.
- Phase 2 Slice 2 Brand/staging behavior and its local milestone/visual QA are
  implemented. The baseline schema, exact-theme direct/hosted authoring,
  document-specific delivery, deterministic preflight, and guarded staging
  release still need the isolated/live RLS and browser smokes above. Slice 3
  product sampling, exact browser verification, and production
  promotion/approval are also implemented locally; rollback/unpublish and
  analytics isolation remain later work.
- The Clerk-free owned-auth code milestone passes its consolidated local gate.
  First-database baseline application, approved Neon/RLS evidence, Resend domain/secrets,
  coordinated API/dashboard enablement, deployment/live probes, and production
  cutover remain open. Invitations/member administration remain later product
  work rather than a hidden credential-cutover claim.
