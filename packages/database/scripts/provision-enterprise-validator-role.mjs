#!/usr/bin/env node
import process, { stderr, stdout } from 'node:process';
import { neon } from '@neondatabase/serverless';

const CONSENT = 'I_UNDERSTAND_THIS_CREATES_A_RESTRICTED_VALIDATION_ROLE';
const ROLE = 'lodariq_enterprise_validator';

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) fail('Owner/admin DATABASE_URL is required.');
  if (process.env.LODARIQ_ENTERPRISE_VALIDATOR_ROLE_PROVISIONING !== CONSENT) {
    fail(`LODARIQ_ENTERPRISE_VALIDATOR_ROLE_PROVISIONING must equal ${CONSENT}.`);
  }
  const password = process.env.LODARIQ_ENTERPRISE_VALIDATOR_DB_PASSWORD ?? '';
  if (password.length < 32 || password.length > 256) {
    fail('LODARIQ_ENTERPRISE_VALIDATOR_DB_PASSWORD must contain 32–256 characters.');
  }
  const sql = neon(databaseUrl);
  const [current] = await sql`select current_user as current_user`;
  if (current?.current_user === ROLE) fail('Refusing to provision the currently connected role.');

  const existing = await sql`select rolname from pg_roles where rolname = ${ROLE}`;
  const role = quoteIdent(ROLE);
  const secret = quoteLiteral(password);
  if (existing.length) {
    await sql.query(
      `alter role ${role} login password ${secret} noinherit nocreatedb nocreaterole nosuperuser nobypassrls`,
    );
  } else {
    await sql.query(
      `create role ${role} login password ${secret} noinherit nocreatedb nocreaterole nosuperuser nobypassrls`,
    );
  }
  const [database] = await sql`select current_database() as database_name`;
  if (!database?.database_name) fail('Unable to determine the current database.');
  await sql.query(`grant connect on database ${quoteIdent(database.database_name)} to ${role}`);
  await sql.query(`revoke all on schema public from ${role}`);
  await sql.query(`grant usage on schema public to ${role}`);
  await sql.query(`revoke all privileges on all tables in schema public from ${role}`);
  await sql.query(`grant select, update on table sso_connections to ${role}`);
  await sql.query(`grant insert on table enterprise_validation_evidence to ${role}`);
  await sql.query(`grant insert on table enterprise_audit_events to ${role}`);

  const [verified] = await sql`
    select
      r.rolbypassrls,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolsuper,
      has_table_privilege(${ROLE}, 'sso_connections', 'SELECT') as can_read_connections,
      has_table_privilege(${ROLE}, 'sso_connections', 'UPDATE') as can_update_connections,
      has_table_privilege(${ROLE}, 'enterprise_validation_evidence', 'INSERT') as can_insert_evidence,
      has_table_privilege(${ROLE}, 'enterprise_audit_events', 'INSERT') as can_insert_audit,
      has_table_privilege(${ROLE}, 'users', 'SELECT') as can_read_users
    from pg_roles r where r.rolname = ${ROLE}
  `;
  if (
    !verified ||
    verified.rolbypassrls ||
    verified.rolcreatedb ||
    verified.rolcreaterole ||
    verified.rolsuper ||
    !verified.can_read_connections ||
    !verified.can_update_connections ||
    !verified.can_insert_evidence ||
    !verified.can_insert_audit ||
    verified.can_read_users
  ) {
    fail('Enterprise validator role privilege verification failed.');
  }
  stdout.write(
    `Enterprise validator role ${ROLE} is ready with narrow, forced-RLS privileges.\n`,
  );
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function fail(message) {
  stderr.write(`${message}\n`);
  process.exit(1);
}

await main();
