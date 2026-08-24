import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { COMMERCIAL_PLAN_VERSION } from '@lodariq/schema';

const ADMIN_DATABASE_URL = process.env.LODARIQ_TEST_POSTGRES_ADMIN_URL?.trim() ?? '';

export const DISPOSABLE_POSTGRES_ENABLED =
  process.env.LODARIQ_DISPOSABLE_POSTGRES === '1' && ADMIN_DATABASE_URL.length > 0;

export interface DisposablePostgresFixture {
  readonly ownerDatabaseUrl: string;
  readonly runtimeDatabaseUrl: string;
  runOwnerSql(statement: string): string;
  applyMigration(path: string): void;
  cleanup(): void;
}

export function createDisposablePostgresFixture(prefix: string): DisposablePostgresFixture {
  assertDisposableAdminDatabase(ADMIN_DATABASE_URL);
  const suffix = randomBytes(6).toString('hex');
  const databaseName = safeIdentifier(`lodariq_${prefix}_${suffix}`);
  const runtimeRole = safeIdentifier(`lodariq_${prefix}_app_${suffix}`);
  const runtimePassword = `lodariq_${prefix}_${suffix}_runtime_password`;
  let databaseCreated = false;
  let roleCreated = false;

  runPsql(ADMIN_DATABASE_URL, `create database ${quoteIdentifier(databaseName)};`);
  databaseCreated = true;
  const ownerDatabaseUrl = databaseUrlFor(ADMIN_DATABASE_URL, databaseName);

  try {
    runPsql(
      ADMIN_DATABASE_URL,
      [
        `create role ${quoteIdentifier(runtimeRole)}`,
        `  login password ${sqlLiteral(runtimePassword)}`,
        '  nosuperuser nocreatedb nocreaterole noinherit nobypassrls;',
        `grant connect on database ${quoteIdentifier(databaseName)} to ${quoteIdentifier(runtimeRole)};`,
      ].join('\n'),
    );
    roleCreated = true;
  } catch (error) {
    runPsql(
      ADMIN_DATABASE_URL,
      `drop database if exists ${quoteIdentifier(databaseName)} with (force);`,
    );
    throw error;
  }

  return {
    ownerDatabaseUrl,
    runtimeDatabaseUrl: databaseUrlWithCredentials(ownerDatabaseUrl, runtimeRole, runtimePassword),
    runOwnerSql(statement) {
      return runPsql(ownerDatabaseUrl, statement);
    },
    applyMigration(path) {
      runPsqlFile(ownerDatabaseUrl, path);
    },
    cleanup() {
      if (databaseCreated) {
        try {
          runPsql(
            ADMIN_DATABASE_URL,
            `drop database if exists ${quoteIdentifier(databaseName)} with (force);`,
          );
        } catch {
          // The CI PostgreSQL service is disposable; preserve the original failure.
        }
      }
      if (roleCreated) {
        try {
          runPsql(ADMIN_DATABASE_URL, `drop role if exists ${quoteIdentifier(runtimeRole)};`);
        } catch {
          // The CI PostgreSQL service is disposable; preserve the original failure.
        }
      }
    },
  };
}

export function runtimeRoleGrantsSql(runtimeDatabaseUrl: string): string {
  const role = quoteIdentifier(decodeURIComponent(new URL(runtimeDatabaseUrl).username));
  return `
    grant usage on schema public to ${role};
    grant usage on type lodariq_environment to ${role};
    grant usage on type lodariq_document_deployment_state to ${role};
    grant usage on type lodariq_release_action to ${role};
    grant usage on type lodariq_release_operation_status to ${role};
    grant select, insert, update, delete on all tables in schema public to ${role};
    grant execute on function public.lodariq_current_workspace_role(text) to ${role};
    grant execute on function public.lodariq_workspace_is_empty(text) to ${role};
    grant execute on function public.lodariq_user_is_workspace_member(text, text) to ${role};
    grant execute on function public.lodariq_count_creator_seats(text) to ${role};
    grant execute on function public.lodariq_accept_workspace_invitation(text, text, text, timestamptz) to ${role};
    grant execute on function public.lodariq_schedule_account_deletion(text, timestamptz, timestamptz) to ${role};
    revoke update, delete on compiled_artifacts, publications,
      product_style_applications, style_sources, auth_security_events,
      tenant_audit_events, account_security_events,
      effective_entitlement_snapshots, workspace_usage_ledger,
      ai_credit_ledger, delivery_transition_history,
      analytics_export_audit_events from ${role};
    revoke update, delete on webhook_events,
      data_residency_migration_history, data_residency_migration_evidence,
      analytics_warehouse_sync_runs, accessibility_sweeps,
      accessibility_finding_events from ${role};
    revoke update, delete on release_operations from ${role};
    grant update (
      status,
      requested_artifact_id,
      source_publication_id,
      actual_active_publication_id,
      result_publication_id,
      result_generation,
      error_code,
      completed_at
    ) on release_operations to ${role};
  `;
}

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

export function businessWorkspaceSubscriptionSql(workspaceId: string, at: string): string {
  const instant = new Date(at);
  if (!Number.isFinite(instant.getTime())) throw new Error('subscription fixture time is invalid');
  const periodStart = new Date(
    Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1),
  ).toISOString();
  const periodEnd = new Date(
    Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth() + 1, 1),
  ).toISOString();
  return `
    insert into workspace_subscriptions
      (workspace_id, plan_id, plan_version, status, entitlement_overrides_json,
       current_period_start, current_period_end, revision, created_at, updated_at)
    values
      (${sqlLiteral(workspaceId)}, 'business', ${sqlLiteral(COMMERCIAL_PLAN_VERSION)},
       'active', '{}'::jsonb, ${sqlLiteral(periodStart)}::timestamptz,
       ${sqlLiteral(periodEnd)}::timestamptz, 1,
       ${sqlLiteral(at)}::timestamptz, ${sqlLiteral(at)}::timestamptz);
  `;
}

function runPsql(databaseUrl: string, statement: string): string {
  try {
    return execFileSync('psql', psqlArguments(databaseUrl), {
      encoding: 'utf8',
      env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
      input: statement,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw psqlError(error);
  }
}

function runPsqlFile(databaseUrl: string, path: string): void {
  try {
    execFileSync('psql', [...psqlArguments(databaseUrl), '--file', path], {
      encoding: 'utf8',
      env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw psqlError(error);
  }
}

function psqlArguments(databaseUrl: string): string[] {
  return [
    '-X',
    '--no-psqlrc',
    '--set',
    'ON_ERROR_STOP=1',
    '--quiet',
    '--tuples-only',
    '--no-align',
    '--dbname',
    databaseUrl,
  ];
}

function psqlError(error: unknown): Error {
  if (!error || typeof error !== 'object') return new Error(String(error));
  const stderr = 'stderr' in error ? String(error.stderr) : '';
  const stdout = 'stdout' in error ? String(error.stdout) : '';
  const message = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
  return new Error(message || (error instanceof Error ? error.message : 'psql failed'));
}

function assertDisposableAdminDatabase(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  if (
    !new Set(['postgres:', 'postgresql:']).has(parsed.protocol) ||
    !new Set(['127.0.0.1', 'localhost']).has(parsed.hostname) ||
    parsed.pathname !== '/postgres' ||
    parsed.username !== 'lodariq_ci_owner'
  ) {
    throw new Error('refusing disposable PostgreSQL test outside its dedicated local CI fixture');
  }
}

function databaseUrlFor(databaseUrl: string, databaseName: string): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function databaseUrlWithCredentials(
  databaseUrl: string,
  username: string,
  password: string,
): string {
  const parsed = new URL(databaseUrl);
  parsed.username = username;
  parsed.password = password;
  return parsed.toString();
}

function safeIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value)) {
    throw new Error(`unsafe PostgreSQL fixture identifier: ${value}`);
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${safeIdentifier(value)}"`;
}
