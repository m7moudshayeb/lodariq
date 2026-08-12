# Archived: Early Deployment Checklist

Status: superseded by `../deployment/phase-1-fly.md`. Retained only as operator
history; commands and provider steps may be incomplete or stale. Its
`lodariq.com` service origins predate ADR 0006's `.io` migration and must not be
used for current deployments.

1. Cloudflare: add domain
   - Go to dash.cloudflare.com.
   - Click Add a domain.
   - Enter lodariq.com.
   - Pick a plan.
   - Cloudflare gives you nameservers.
   - Go to your domain registrar.
   - Replace current nameservers with Cloudflare’s nameservers.
   - Wait until Cloudflare shows the domain as active.

2. Neon: create database
   - Go to console.neon.tech.
   - Click New Project.
   - Name it lodariq.
   - Pick a region close to Fly fra, ideally Frankfurt / EU.
   - Create the project.
   - Open Branches.
   - Keep the default branch as production, or rename/label it production.
   - Click Create branch.
   - Name it staging.
   - Choose parent branch production.
   - Create branch.
   - Open the staging branch.
   - Click Connection Details.
   - Copy the owner/admin connection string. Save it locally as STAGING_NEON_OWNER_DATABASE_URL.

3. Neon: run migrations

   pnpm migrations:check

   psql "$STAGING_NEON_OWNER_DATABASE_URL" -f packages/database/drizzle/0000_phase_1_foundation.sql
     psql "$STAGING_NEON_OWNER_DATABASE_URL" -f packages/database/drizzle/0001_correlation_ids.sql

4. Neon: create runtime role
   Do not create this role from the Neon UI. Neon says Console-created roles inherit neon_superuser, which can include BYPASSRLS; Lodariq needs
   a limited SQL-created runtime role.

   DATABASE_URL="$STAGING_NEON_OWNER_DATABASE_URL" \
   LODARIQ_RUNTIME_ROLE_PROVISIONING=I_UNDERSTAND_THIS_CHANGES_DATABASE_PRIVILEGES \
   LODARIQ_RUNTIME_DB_ROLE=lodariq_app_staging \
   LODARIQ_RUNTIME_DB_PASSWORD='<new-long-password>' \
   pnpm db:provision:runtime-role

   Build this and save it as STAGING_RUNTIME_DATABASE_URL:

   postgresql://lodariq_app_staging:<password>@<staging-host>/neondb?sslmode=require

5. Clerk: create staging app
   - Go to dashboard.clerk.com.
   - Click Create application.
   - Name it Lodariq Staging.
   - Choose your login methods, probably email first.
   - Open the app.
   - Go to Configure / Organizations.
   - Enable Organizations.
   - Go to Organizations.
   - Click Create organization.
   - Name it Lodariq Internal Staging.
   - Invite yourself/operator users.
   - Go to API keys.
   - Copy NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.
   - Copy CLERK_SECRET_KEY.

   Clerk organizations are the right model here because Lodariq workspaces map to an active org context.

6. Cloudflare R2: create staging bucket
   - In Cloudflare, left nav R2 Object Storage.
   - Click Create bucket.
   - Name it lodariq-assets-staging.
   - Create bucket.
   - Open the bucket.
   - Click Settings.
   - Find Custom Domains.
   - Click Connect Domain.
   - Pick lodariq.com.
   - Enter staging-cdn.lodariq.com.
   - Connect it.
   - Keep r2.dev disabled unless temporarily testing. R2 buckets are private by default, and custom domains are the production path.

7. Cloudflare R2: create upload token
   - Go to R2 Object Storage.
   - Under Account Details, click Manage next to API Tokens.
   - Click Create Account API token.
   - Permission: Object Read & Write.
   - Scope it only to lodariq-assets-staging.
   - Create token.
   - Copy Access Key ID and Secret Access Key immediately; Cloudflare will not show the secret again.

8. Upload staging SDK assets

   pnpm --filter @lodariq/sdk-runtime build
   pnpm --filter @lodariq/sdk-authoring build
   pnpm sdk:prepare-assets

   Configure AWS CLI for R2:

   aws configure --profile lodariq-r2-staging

   # Access key: staging R2 access key

   # Secret key: staging R2 secret key

   # Region: auto

   # Output: json

   Upload:

   aws s3 sync dist/sdk-assets/sdk/ s3://lodariq-assets-staging/sdk/ \
   --endpoint-url https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com \
   --profile lodariq-r2-staging

9. Fly: create staging apps

   fly auth login

   fly apps create lodariq-api-staging --org <fly-org>
   fly apps create lodariq-dashboard-staging --org <fly-org>
   fly apps create lodariq-editor-staging --org <fly-org>

   Fly’s CLI supports fly apps create <app name> with --org.

10. Fly: set staging secrets

fly secrets set -c apps/api/fly.staging.toml \
DATABASE_URL="$STAGING_RUNTIME_DATABASE_URL" \
CLERK_SECRET_KEY="<staging-clerk-secret-key>" \
CLERK_AUTHORIZED_PARTIES="https://staging-app.lodariq.com"

fly secrets set -c apps/dashboard/fly.staging.toml \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="<staging-clerk-publishable-key>" \
CLERK_SECRET_KEY="<staging-clerk-secret-key>"

Fly secrets are set with fly secrets set NAME=VALUE.

11. Fly + Cloudflare DNS: attach domains

fly certs add staging-api.lodariq.com -c apps/api/fly.staging.toml
fly certs add staging-app.lodariq.com -c apps/dashboard/fly.staging.toml
fly certs add staging-editor.lodariq.com -c apps/editor/fly.staging.toml

Then for each one:

fly certs check staging-api.lodariq.com -c apps/api/fly.staging.toml

- Copy the DNS records Fly asks for.
- Go to Cloudflare DNS.
- Click Add record.
- Add the CNAME/TXT/A/AAAA records Fly requested.
- Set proxy to DNS only at first.
- Wait until fly certs check passes.

Fly also exposes this in the app dashboard under Certificates.

12. Deploy staging

pnpm deploy:editor:staging
pnpm deploy:api:staging
pnpm deploy:dashboard:staging

13. Check staging

curl -fsS https://staging-api.lodariq.com/healthz
curl -fsS https://staging-api.lodariq.com/openapi.json
curl -fsSI https://staging-app.lodariq.com
curl -fsSI https://staging-editor.lodariq.com/authoring.html

Production

Repeat the same exact steps, with these substitutions:

Neon branch/project: production
Runtime role: lodariq_app
Clerk app: Lodariq Production
R2 bucket: lodariq-assets-production
CDN: cdn.lodariq.com
API Fly app: lodariq-api
Dashboard Fly app: lodariq-dashboard
Editor Fly app: lodariq-editor
API domain: api.lodariq.com
Dashboard domain: app.lodariq.com
Editor domain: editor.lodariq.com
CLERK_AUTHORIZED_PARTIES=https://app.lodariq.com

For Clerk production:

- In Clerk Dashboard, open the production app.
- Use Create production instance if Clerk shows you a development/production instance switcher.
- Copy pk_live_... and sk_live_....
- Clerk warns that production keys must replace dev keys in hosting env vars.

Production commands:

fly apps create lodariq-api --org <fly-org>
fly apps create lodariq-dashboard --org <fly-org>
fly apps create lodariq-editor --org <fly-org>

fly secrets set -c apps/api/fly.toml \
DATABASE_URL="$PRODUCTION_RUNTIME_DATABASE_URL" \
CLERK_SECRET_KEY="<production-clerk-secret-key>" \
CLERK_AUTHORIZED_PARTIES="https://app.lodariq.com"

fly secrets set -c apps/dashboard/fly.toml \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="<production-clerk-publishable-key>" \
CLERK_SECRET_KEY="<production-clerk-secret-key>"

fly certs add api.lodariq.com -c apps/api/fly.toml
fly certs add app.lodariq.com -c apps/dashboard/fly.toml
fly certs add editor.lodariq.com -c apps/editor/fly.toml

pnpm deploy:editor:production
pnpm deploy:api:production
pnpm deploy:dashboard:production

Local

Local is mostly for coding, not proof of deployment.

- Use .env or .env.local; do not overwrite existing secrets.
- Put local/dev values there:

  DATABASE_URL=<local-or-neon-dev-url>
  LODARIQ_AUTH_MODE=headers
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<optional-clerk-dev-key>
  CLERK_SECRET_KEY=<optional-clerk-dev-secret>
  LODARIQ_LOADER_SRC=http://127.0.0.1:<local-static-port>/sdk/lodariq-loader.js
  LODARIQ_CREATOR_LOADER_SRC=http://127.0.0.1:<local-static-port>/sdk/lodariq-creator.js
  LODARIQ_AUTHORING_IFRAME_SRC=http://127.0.0.1:3003/authoring.html

Run:

source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm install
pnpm --filter @lodariq/api dev
pnpm --filter @lodariq/dashboard dev
pnpm --filter @lodariq/editor dev

The immediate next real milestone is staging: sign in with Clerk, create/select an org, mint an SDK token, install the snippet on a real app,
open creator mode, save a tour, publish it, and confirm the visitor runtime loads from staging-cdn.lodariq.com.
