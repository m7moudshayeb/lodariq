# Lodariq Database Baseline and Migrations

The migration history starts from one initial baseline. That baseline was
applied when the shared development and staging databases were initialized, so
it is immutable: deployed environments never re-read it, and a change made by
editing it reaches no database. Every schema change is a numbered forward
migration.

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
0015_sdk_installation_kill_switch.sql
0016_experience_comment_threads.sql
0017_commercial_entitlements.sql
0018_delivery_orchestration.sql
0019_experiment_delivery.sql
0020_adaptive_delivery.sql
0021_narration_media.sql
0022_analytics_exports.sql
0023_analytics_audience_segments.sql
0024_authoring_collaboration_presence.sql
0025_governance_capability_profiles.sql
0026_outbound_webhooks.sql
0027_data_residency_controls.sql
0028_authoring_roadmap_records.sql
0029_change_aware_copy_records.sql
0030_commercial_billing_lifecycle.sql
0031_data_residency_execution.sql
0032_analytics_warehouse_sync.sql
0033_accessibility_governance.sql
0034_authoring_session_capabilities.sql
0035_rls_scope_containment.sql
0036_cross_scope_foreign_keys.sql
0037_billing_batch_recovery.sql
0038_hot_query_indexes.sql
0039_analytics_events_indexes.sql
0040_dead_letter_and_rotation.sql
0041_analytics_events_partitioning.sql   (approved for controlled rollout, applied nowhere)
```

## Where each environment sits

A migration list says what exists, not what has been applied. Without this the
next deploy re-audits the live schema from scratch, which is the work `0034`
existed to close out. **Update this table in the same change that applies a
migration.**

| Environment | PostgreSQL        | Applied through                           | As of      |
| ----------- | ----------------- | ----------------------------------------- | ---------- |
| Development | `16.15 (651533a)` | `0040_dead_letter_and_rotation.sql`       | 2026-08-24 |
| Staging     | `16.15 (651533a)` | `0040_dead_letter_and_rotation.sql`       | 2026-08-24 |
| Production  | —                 | not provisioned                           | —          |

Both shared environments were initialized from `0000_initial_baseline.sql` and
carry the full `0001`-`0040` sequence. Two baseline edits were made in place
before that rule was settled; both now have forward migrations, so a database built from today's
baseline and one upgraded through the sequence converge —
`analytics_events.adaptive_visitor_key_hash` in `0020`, and the
`authoring_sessions` capabilities check in `0034`.

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

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0015_sdk_installation_kill_switch.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0016_experience_comment_threads.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0017_commercial_entitlements.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0018_delivery_orchestration.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0019_experiment_delivery.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0020_adaptive_delivery.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0021_narration_media.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0022_analytics_exports.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0023_analytics_audience_segments.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0024_authoring_collaboration_presence.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0025_governance_capability_profiles.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0026_outbound_webhooks.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0027_data_residency_controls.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0028_authoring_roadmap_records.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0029_change_aware_copy_records.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0030_commercial_billing_lifecycle.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0031_data_residency_execution.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0032_analytics_warehouse_sync.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0033_accessibility_governance.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0034_authoring_session_capabilities.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0035_rls_scope_containment.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0036_cross_scope_foreign_keys.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0037_billing_batch_recovery.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0038_hot_query_indexes.sql

# 0039 deliberately uses psql autocommit for CREATE INDEX CONCURRENTLY.
psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0039_analytics_events_indexes.sql

psql -X -v ON_ERROR_STOP=1 "$NEON_OWNER_DATABASE_URL" \
  -f packages/database/drizzle/0040_dead_letter_and_rotation.sql
```

## Shared-environment batch: 0035-0040

Development was migrated on 2026-08-24. Staging remains at `0034`; repeat the
same snapshot, approval, execution, and verification procedure there only after
development's hosted deployment matches the current source and passes the full
service probe.

**The development gate cleared on 2026-08-24.** `lodariq-api-dev` release `v15`
carries the current source, `/readyz` returns `200`, and `/v1/openapi.json`
returns `200` — the `404` recorded below was the previous release, not a missing
route. Staging is also unblocked for the current `0040`-compatible deployment.

Staging is deployed and migrated in that order, and the order matters. The
deploy workflow applies no migrations, so shipping this branch's code to an
environment still at `0034` breaks anything reading `webhook_endpoints` or
`analytics_warehouse_destinations`: Drizzle's bare `.select()` names
`previous_secret_version`, `secret_overlap_until`, `dead_lettered_at` and
`dead_letter_reason`, and `0040` is what creates them. Migrate first, then
deploy — the reverse of what the code-first instinct suggests.

1. Run **Deploy existing Fly apps** with `target: staging` only after step 6.
2. Snapshot staging and record the exact name.
3. Run the three `0036` preflight counts below; all must be zero.
4. Apply `0035` → `0036` → `0037` → `0038` with an owner URL.
5. Apply `0039` alone (no transaction), then confirm
   `select indexrelid::regclass from pg_index where not indisvalid;` is empty.
   Do not rerun `0039` blind — `if not exists` will not repair an invalid index
   that already owns the name.
6. Apply `0040`.
7. Deploy, then probe `/readyz` and `/v1/openapi.json` on the staging API.

Development execution record:

- Snapshot: `lodariq-dev-before-0035-0040-2026-08-24`.
- Explicit approval covered `0035`-`0040`, including the constraint replacements
  in `0040`.
- All catalog signatures, validated constraints, column-specific delete actions,
  indexes, orphan counts, and row counts passed postflight; no invalid index or
  scratch RLS workspace remained.
- The restricted runtime role was reconciled through the standard provisioner,
  and the live scratch-isolation verifier passed.
- Hosted API `/readyz` passed. The complete service probe remains pending because
  the currently deployed development API returns `404` for `/v1/openapi.json`,
  although that route exists in the current source.

Staging execution record:

- Snapshot: `staging-before-35-40-2026-08-24`.
- `0035` through `0038` applied transactionally, `0039` applied separately with
  concurrent indexes, and `0040` applied last.
- Postflight passed: required columns and constraints exist, all expected
  indexes are valid and ready, no invalid indexes remain, forced RLS is enabled
  on the checked worker tables, and all three `0036` orphan counts are zero.

Applied file SHA-256 values:

```text
0035 c2d0e9f47288771a281e7a8ca19216de12eb26a6248db9d1fb260984379bd06f
0036 df96b27d482c99bbba1a9a8192c7cc3f5b926cb551659cc5a4e7a9eee192042f
0037 84146d8eef559e515878d67cb37df6f58e35cb9ef3084b57979e49809941d625
0038 04998f7ddadf00652aea78df2d1cdce0688f2fdfa3cc00b71337d4495eb399a4
0039 6a9edc25575c339b3b3a3805c4e0a8bd3c70e0654b263017eee04f3104fa6024
0040 6de72f74b476dade744b0ed4f5de3466a677c50a9c4ad3813f9fdf6fb493d190
```

Before each environment:

1. Run `pnpm migrations:check` and the focused database migration tests.
2. Create a fresh Neon snapshot after `0034` and record its exact name.
3. Confirm the three `0036` scope-reference preflight counts are zero.
4. Confirm PostgreSQL 15 or newer for `0036`'s column-specific `SET NULL` action.
5. Record explicit operator approval for the `0040` constraint replacements.
6. Apply `0035` through `0040` in order with an owner URL. Never use the runtime
   `DATABASE_URL` and never replay `0000` through `0034`.

Run the scope-reference preflight with RLS explicitly disabled inside a
read-only transaction. This prevents an unscoped RLS query from reporting a
misleading zero. All three rows must report `0`; if the owner role cannot bypass
RLS, the command must fail rather than being treated as a pass.

First confirm that the preflight connection can bypass forced RLS:

```sql
select current_user, rolsuper, rolbypassrls
from pg_roles
where rolname = current_user;
```

Continue when either `rolsuper` or `rolbypassrls` is `true`. As verified on
2026-08-24, the configured development and staging owner connections both use
`neondb_owner` with `rolsuper = false` and `rolbypassrls = true`; the five tables
read by this preflight have RLS enabled and forced.

If both capabilities are `false`, stop. Provision or request a dedicated
preflight role that has `BYPASSRLS` but only `CONNECT`, schema `USAGE`, and
`SELECT` access to the five tables below, then use it only for this read-only
check. Do not disable `FORCE ROW LEVEL SECURITY` on live tables, even
temporarily, and do not grant the preflight role data-mutation privileges.

```sql
begin;
set local transaction read only;
set local row_security = off;

select 'workspace_applications.theme_id' as reference, count(*) as orphan_count
from workspace_applications wa
where wa.theme_id is not null
  and not exists (
    select 1
    from themes t
    where t.workspace_id = wa.workspace_id and t.id = wa.theme_id
  )
union all
select 'governance_audit_events.environment_id', count(*)
from governance_audit_events ga
where ga.environment_id is not null
  and not exists (
    select 1
    from environments e
    where e.workspace_id = ga.workspace_id and e.id = ga.environment_id
  )
union all
select 'tenant_audit_events.environment_id', count(*)
from tenant_audit_events ta
where ta.environment_id is not null
  and not exists (
    select 1
    from environments e
    where e.workspace_id = ta.workspace_id and e.id = ta.environment_id
  );

rollback;
```

Migration `0036` adds its three foreign keys as `not valid`, then validates them
inside the same transaction. Its delete actions null only `theme_id` or
`environment_id`; `workspace_id` remains intact. A historical scope violation
therefore aborts the migration without leaving any partial constraint behind.
The transaction retains the validation locks until commit, so writes to the
affected tables can block while the historical scans run. Its column-specific
`on delete set null (column)` syntax requires PostgreSQL 15 or newer.

Migration `0039` has no transaction block because PostgreSQL forbids
`create index concurrently` inside one. After it runs, verify that it left no
invalid indexes before continuing to `0040`:

```sql
select indexrelid::regclass
from pg_index
where not indisvalid;
```

An empty result is required. If the command fails, stop; do not continue the
batch or rerun `0039` blindly, because `if not exists` will not repair an invalid
index that already owns the intended name.

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

For an existing shared environment, audit the live schema and apply only the
missing numbered files in order; never replay `0000`. Use an owner/admin
connection for schema installation, not the runtime `DATABASE_URL`. Migrations
`0017` and `0019` include insert-only backfills for existing workspaces and
experiments, so record their expected row counts during the preflight.

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

## Approved for controlled rollout: 0041 analytics_events partitioning

`0041_analytics_events_partitioning.sql` is authored, tested against a scratch
database, and applied nowhere. It carries explicit approval metadata, so
`pnpm migrations:check` passes. The approval is for a controlled maintenance
window and does not substitute for a fresh snapshot, row-count comparison, or
postflight verification.

It is not part of the `0035`-`0040` batch and must be applied separately, only
after `0035`-`0040` have been verified. Stop ingestion, snapshot the target,
run the file on its own, compare the printed pre/post row counts, and keep
`analytics_events_pre_partition` until the partitioned table has been observed
in production-like traffic.

What it does, and why it is in its own category:

- Rebuilds `analytics_events` as a table partitioned monthly on `occurred_at`,
  because retention on the largest table in the system has to be
  `drop partition` rather than a `DELETE` sweep.
- **Changes the primary key** from `(id)` to `(id, occurred_at)`. PostgreSQL
  requires the partition key in every unique constraint. Nothing looks a row up
  by bare `id` today, but nothing may assume `id` alone is unique afterwards.
- **Requires a maintenance window.** Partitioning in place is impossible; the
  table is copied and swapped under `ACCESS EXCLUSIVE`, and ingestion must be
  stopped for the duration.
- Leaves `analytics_events_pre_partition` in place as the rollback. Rename it
  back to recover the previous shape with every row. Drop it only after the
  application has been observed reading and writing the partitioned table.

Verified on a scratch database at `0040`: 120 rows across four months copied
into 18 partitions with the counts matching, partition pruning confirmed in the
query plan, insert routing confirmed, and the check constraints and index
column lists diffed against the original table until identical. RLS is
re-enabled and re-forced and both workspace policies are recreated on the parent
**and on every partition** — a rebuild drops all of it, and a partition reached
by its own name enforces its own policies, not the parent's. The
`*-postgres16` tenant isolation suites cover this.

Retention itself already ships: `maintainAnalyticsEventPartitions` runs on the
analytics export worker's tick, creates partitions three months ahead, and drops
those older than thirteen months. It returns immediately while the table is not
partitioned, so it is inert until this migration is applied.

Still open after it lands: workspaces whose `analyticsRetentionDays` is shorter
than the partition span. Partitions are time-based and global, so a shorter
per-workspace retention needs a bounded per-workspace delete alongside the
partition drop.
