#!/usr/bin/env node
import process, { stderr, stdout } from 'node:process';
import { neon } from '@neondatabase/serverless';

const provisioningConsent = 'I_UNDERSTAND_THIS_CHANGES_DATABASE_PRIVILEGES';
const roleNamePattern = /^[a-z_][a-z0-9_]{0,62}$/;
const appendOnlyRuntimeTables = [
  'compiled_artifacts',
  'publications',
  'style_sources',
  'product_style_applications',
  'brand_drift_runs',
  'publication_verifications',
  'release_approvals',
  'analytics_events',
];
const releaseOperationLifecycleColumns = [
  'status',
  'requested_artifact_id',
  'source_publication_id',
  'actual_active_publication_id',
  'result_publication_id',
  'result_generation',
  'error_code',
  'completed_at',
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    fail('DATABASE_URL is required for runtime role provisioning.');
  }

  if (process.env.LODARIQ_RUNTIME_ROLE_PROVISIONING !== provisioningConsent) {
    fail(
      [
        'LODARIQ_RUNTIME_ROLE_PROVISIONING must be set before changing database privileges.',
        `Set it to ${provisioningConsent} when using the owner/admin connection.`,
      ].join('\n'),
    );
  }

  const roleName = process.env.LODARIQ_RUNTIME_DB_ROLE?.trim() ?? '';
  if (!roleNamePattern.test(roleName)) {
    fail('LODARIQ_RUNTIME_DB_ROLE must be a lowercase PostgreSQL identifier.');
  }

  const rolePassword = process.env.LODARIQ_RUNTIME_DB_PASSWORD ?? '';
  if (rolePassword.length < 32) {
    fail('LODARIQ_RUNTIME_DB_PASSWORD must be at least 32 characters.');
  }

  const sql = neon(databaseUrl);
  await ensureNotProvisioningCurrentRole(sql, roleName);
  await upsertRuntimeRole(sql, roleName, rolePassword);
  await grantRuntimePrivileges(sql, roleName);
  await verifyRuntimeRole(sql, roleName);

  log(
    [
      `Runtime role ${roleName} is provisioned with BYPASSRLS disabled.`,
      'Store an application DATABASE_URL that uses this role, then run pnpm rls:verify:live.',
    ].join('\n'),
  );
}

async function ensureNotProvisioningCurrentRole(sql, roleName) {
  const [row] = await sql`select current_user as current_user`;
  if (row?.current_user === roleName) {
    fail('Refusing to provision the currently connected database role.');
  }
}

async function upsertRuntimeRole(sql, roleName, rolePassword) {
  const existing = await sql`select rolname from pg_roles where rolname = ${roleName}`;
  const quotedRole = quoteIdent(roleName);
  const quotedPassword = quoteLiteral(rolePassword);

  if (existing.length) {
    await sql.query(`alter role ${quotedRole} login password ${quotedPassword} nobypassrls`);
    return;
  }

  await sql.query(`create role ${quotedRole} login password ${quotedPassword} nobypassrls`);
}

async function grantRuntimePrivileges(sql, roleName) {
  const quotedRole = quoteIdent(roleName);
  const [database] = await sql`select current_database() as database_name`;
  const databaseName = database?.database_name;
  if (!databaseName) fail('Unable to determine current database name.');

  await sql.query(`grant connect on database ${quoteIdent(databaseName)} to ${quotedRole}`);
  await sql.query(`grant usage on schema public to ${quotedRole}`);
  await sql.query(`grant usage on type lodariq_environment to ${quotedRole}`);
  await sql.query(`grant usage on type lodariq_document_deployment_state to ${quotedRole}`);
  await sql.query(`grant usage on type lodariq_release_action to ${quotedRole}`);
  await sql.query(`grant usage on type lodariq_release_operation_status to ${quotedRole}`);
  await sql.query(
    `grant select, insert, update, delete on all tables in schema public to ${quotedRole}`,
  );
  await sql.query(
    `alter default privileges in schema public grant select, insert, update, delete on tables to ${quotedRole}`,
  );
  const existingAppendOnlyTables = await listExistingAppendOnlyTables(sql);
  if (existingAppendOnlyTables.length) {
    const appendOnlyTableList = existingAppendOnlyTables.map(quoteIdent).join(', ');
    await sql.query(`revoke update, delete on table ${appendOnlyTableList} from ${quotedRole}`);
  }
  if (await tableExists(sql, 'release_operations')) {
    await sql.query(`revoke update, delete on table "release_operations" from ${quotedRole}`);
    await sql.query(
      `grant update (${releaseOperationLifecycleColumns.map(quoteIdent).join(', ')}) on table "release_operations" to ${quotedRole}`,
    );
  }
}

async function verifyRuntimeRole(sql, roleName) {
  const [role] = await sql`
    select rolname, rolbypassrls, rolcreatedb, rolcreaterole, rolsuper
    from pg_roles
    where rolname = ${roleName}
  `;

  if (!role) fail(`Runtime role ${roleName} was not created.`);
  if (role.rolbypassrls) fail(`Runtime role ${roleName} still has BYPASSRLS.`);
  if (role.rolcreatedb || role.rolcreaterole || role.rolsuper) {
    fail(`Runtime role ${roleName} has elevated PostgreSQL privileges.`);
  }
  for (const table of await listExistingAppendOnlyTables(sql)) {
    const [privileges] = await sql`
      select
        has_table_privilege(${roleName}, ${table}, 'UPDATE') as can_update,
        has_table_privilege(${roleName}, ${table}, 'DELETE') as can_delete
    `;
    if (privileges?.can_update || privileges?.can_delete) {
      fail(`Runtime role ${roleName} can mutate append-only table ${table}.`);
    }
  }
  if (await tableExists(sql, 'release_operations')) {
    const [privileges] = await sql`
      select
        has_table_privilege(${roleName}, 'release_operations', 'DELETE') as can_delete,
        has_column_privilege(${roleName}, 'release_operations', 'reason', 'UPDATE') as can_update_reason
    `;
    if (privileges?.can_delete || privileges?.can_update_reason) {
      fail(`Runtime role ${roleName} can mutate immutable release-operation fields.`);
    }
    for (const column of releaseOperationLifecycleColumns) {
      const [columnPrivilege] = await sql`
        select has_column_privilege(${roleName}, 'release_operations', ${column}, 'UPDATE') as allowed
      `;
      if (!columnPrivilege?.allowed) {
        fail(`Runtime role ${roleName} cannot update release_operations.${column}.`);
      }
    }
  }
}

async function listExistingAppendOnlyTables(sql) {
  const rows = await sql`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = current_schema()
      and c.relkind = 'r'
      and c.relname = any(${appendOnlyRuntimeTables})
  `;
  return rows.map((row) => row.relname).sort();
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function tableExists(sql, table) {
  const [row] = await sql`
    select to_regclass(${`public.${table}`}) is not null as exists
  `;
  return Boolean(row?.exists);
}

function log(message) {
  stdout.write(`${message}\n`);
}

function fail(message) {
  stderr.write(`${message}\n`);
  process.exit(1);
}

await main();
