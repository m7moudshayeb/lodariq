# Lodariq Database Baseline and Migrations

The development-only migration history starts from one initial
baseline before the first shared environment was initialized:

```text
0000_initial_baseline.sql
0001_publication_verification_renderer_v3.sql
0002_publication_verification_renderer_v4.sql
0003_publication_verification_renderer_contract.sql
0004_authoring_resources.sql
0005_auth_recovery_rls.sql
0006_auth_lifecycle_reliability.sql
0007_provider_neutral_identity.sql
0008_resumable_identity_onboarding.sql
0009_tenant_administration.sql
0010_account_session_management.sql
0011_assurance_passkeys_recovery.sql
0012_oidc_authorization.sql
0013_enterprise_identity.sql
0014_experience_measurement.sql
```

The baseline creates the complete current Neon-compatible PostgreSQL schema,
constraints, indexes, functions, and row-level-security policies. It is wrapped
in one transaction so a failed bootstrap does not leave a partially initialized
database. Apply the baseline exactly once to a new, empty database with an
owner/admin connection, then apply every later numbered migration in order:

```bash
pnpm migrations:check

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0000_initial_baseline.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0001_publication_verification_renderer_v3.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0002_publication_verification_renderer_v4.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0003_publication_verification_renderer_contract.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0004_authoring_resources.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0005_auth_recovery_rls.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0006_auth_lifecycle_reliability.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0007_provider_neutral_identity.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0008_resumable_identity_onboarding.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0009_tenant_administration.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0010_account_session_management.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0011_assurance_passkeys_recovery.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0012_oidc_authorization.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0013_enterprise_identity.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0014_experience_measurement.sql
```

Migration `0007` adds verified-email, username, provider-identity, session
assurance, workspace-auth-policy, and SSO-connection foundations. Its idempotent
insert-only backfill aborts on ambiguous normalized legacy email data and keeps
all rollback columns in place.

Migration `0008` adds resumable server-owned onboarding state, append-only
identity link/unlink security events, and soft-disable support for authenticators.
It does not rewrite or remove existing identity data.

Migration `0009` adds soft-deletion retention metadata, the append-only tenant
audit ledger, and a leased workspace-invitation email outbox. It replaces broad
membership and invitation policies with capability-bound issuance,
verified-email token acceptance, worker/maintenance scopes, and administrator
mutation policies while keeping all existing tenant data intact.

Migration `0010` adds account/session management, dual-proof email change, and
append-only account security events. Migration `0011` adds passkey challenges,
public-key credentials, and hash-only recovery codes with forced RLS and
single-use compare-and-set consumption.
Migration `0012` adds encrypted PKCE transaction state for Google and Microsoft
OIDC. Its forced-RLS policies bind every create, lookup, and consume operation
to the SHA-256 digest of an unpredictable state value; no provider token is stored.
Migration `0013` adds validated enterprise OIDC connections, globally unique
verified domains, group-to-role mappings, hash-only SCIM credentials, managed
principals, append-only enterprise audit events, and dual-owner break-glass
requests. Connection activation is reserved for the dedicated
`lodariq_enterprise_validator` role after external Okta or Entra validation.
Migration `0014` adds per-document success events and adaptive policy, a single
live experiment per document, form responses in their own table rather than in
analytics payloads, step-anchored review comments, expiring step leases, and the
workspace application registry that cross-application handoffs resolve against.
Every table is workspace-isolated with forced RLS.

Do not apply the baseline to a database that already contains Lodariq objects.
Once the first shared environment has been initialized, treat this baseline as
immutable and add reviewed forward migrations for later schema changes.

Provision a non-owner runtime database role before using the API against Neon.
The owner role may install schema changes, but it must not be used for app
traffic because it can bypass RLS:

```bash
DATABASE_URL="postgres://owner:..." \
LODARIQ_RUNTIME_ROLE_PROVISIONING=I_UNDERSTAND_THIS_CHANGES_DATABASE_PRIVILEGES \
LODARIQ_RUNTIME_DB_ROLE=lodariq_app \
LODARIQ_RUNTIME_DB_PASSWORD="<at-least-32-characters>" \
pnpm db:provision:runtime-role
```

Store the resulting app connection string as the runtime `DATABASE_URL`, using
the new role and password, not `neondb_owner`.

Provision the separate validator role only for deployment operators. Never put
its URL in an API or dashboard environment:

```bash
DATABASE_URL="postgres://owner:..." \
LODARIQ_ENTERPRISE_VALIDATOR_ROLE_PROVISIONING=I_UNDERSTAND_THIS_CREATES_A_RESTRICTED_VALIDATION_ROLE \
LODARIQ_ENTERPRISE_VALIDATOR_DB_PASSWORD="<at-least-32-characters>" \
pnpm --filter @lodariq/database provision:enterprise-validator-role
```

The resulting connection string is supplied as
`LODARIQ_ENTERPRISE_VALIDATION_DATABASE_URL` only to the reviewed operator
command described in the enterprise identity rollout runbook.

Destructive migrations against any shared environment require explicit human
sign-off before execution. A destructive migration must include this comment
with a real approval reference before the guard can pass:

```sql
-- lodariq-shared-env-destructive-migration-signoff: <approver/date/approval-link>
```

Additive metadata migrations that would benefit from a historical backfill
should still avoid data-changing statements by default. Add nullable columns
and indexes first, have new writes populate the value, and schedule any
shared-environment backfill as a separately approved operation.

After applying the baseline or a later migration to an isolated Neon branch,
verify the live RLS posture and scratch-row behavior:

```bash
DATABASE_URL="postgres://..." \
LODARIQ_LIVE_RLS_WRITE_CHECK=I_UNDERSTAND_THIS_WRITES_SCRATCH_ROWS \
pnpm rls:verify:live
```

The live check verifies that tenant tables have RLS enabled and forced, the
runtime database role does not have `BYPASSRLS`, workspace-scoped reads cannot
cross tenants, unscoped reads fail closed, and narrow public/session lookup
policies expose only their bound context.
