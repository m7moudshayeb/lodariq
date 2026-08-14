# Lodariq Database Baseline and Migrations

The development-only `0000`–`0008` SQL sequence was squashed into one initial
baseline before the first shared environment was initialized:

```text
0000_initial_baseline.sql
0001_publication_verification_renderer_v3.sql
0002_publication_verification_renderer_v4.sql
0003_publication_verification_renderer_contract.sql
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
```

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
