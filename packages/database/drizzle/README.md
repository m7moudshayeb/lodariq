# Lodariq Database Migrations

Phase 1 migrations target Neon-compatible PostgreSQL through Drizzle.

Destructive migrations against any shared environment require explicit human
sign-off before execution. Additive migrations may be reviewed through the
normal code path, but tenant isolation policies must remain enabled for every
workspace-scoped table.

Run the local guard before applying migrations:

```bash
pnpm --filter @lodariq/database check:migrations
```

Provision a non-owner runtime database role before using the API against Neon.
The owner role may install migrations, but it must not be used as app traffic
because it can bypass RLS:

```bash
DATABASE_URL="postgres://owner:..." \
LODARIQ_RUNTIME_ROLE_PROVISIONING=I_UNDERSTAND_THIS_CHANGES_DATABASE_PRIVILEGES \
LODARIQ_RUNTIME_DB_ROLE=lodariq_app \
LODARIQ_RUNTIME_DB_PASSWORD="<at-least-32-characters>" \
pnpm db:provision:runtime-role
```

Store the resulting app connection string as the runtime `DATABASE_URL`, using
the new role and password, not `neondb_owner`.

If a migration intentionally contains destructive SQL, the migration file must
include this comment with a real approval reference before it can pass:

```sql
-- lodariq-shared-env-destructive-migration-signoff: <approver/date/approval-link>
```

Additive metadata migrations that would benefit from a historical backfill
should still avoid data-changing statements by default. Add nullable columns and
indexes first, have new writes populate the value, and schedule any shared-env
backfill as a separately approved operation.

After applying migrations to an isolated Neon branch or approved staging
database, verify the live RLS posture and scratch-row behavior:

```bash
DATABASE_URL="postgres://..." \
LODARIQ_LIVE_RLS_WRITE_CHECK=I_UNDERSTAND_THIS_WRITES_SCRATCH_ROWS \
pnpm rls:verify:live
```

The live check verifies that tenant tables have RLS enabled and forced, the
runtime database role does not have `BYPASSRLS`, workspace-scoped reads cannot
cross tenants, unscoped reads fail closed, and the SDK token lookup policy only
reveals the environment-token bootstrap context. It also writes scratch document
versions, compiled artifacts, and immutable publication rows to prove the live
Neon schema supports the Phase 1 publication path.
