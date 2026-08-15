import { describe, expect, it } from 'vitest';
import { readAuthRecoveryRlsMigration, readInitialBaseline } from './migration-test-utils.js';

describe('owned-auth password recovery baseline', () => {
  it('adds purpose-separated challenge/outbox storage and exact email lookup', () => {
    const source = readInitialBaseline();
    expect(source).toContain('create table if not exists set_password_challenges');
    expect(source).toContain('create table if not exists set_password_outbox');
    expect(source).toContain('users_email_normalized_lookup_idx');
    expect(source).toContain('lower(btrim(email))');
    expect(source).toContain('set_password_challenges_active_user_idx');
    expect(source).toContain('auth_outbox_due_idx');
    expect(source).toContain('set_password_outbox_due_idx');
    expect(source).toContain('lease_version integer not null default 0');
    expect(source).toContain('terminal_at timestamptz');
    expect(source).toContain("check (id ~ '^reset_");
  });

  it('forces RLS and scopes lookup, consume, invalidation, and outbox writes', () => {
    const source = readInitialBaseline();
    for (const table of ['set_password_challenges', 'set_password_outbox']) {
      expect(source).toContain(`alter table ${table} enable row level security`);
      expect(source).toContain(`alter table ${table} force row level security`);
    }
    for (const policy of [
      'users_set_password_email_lookup',
      'users_set_password_update',
      'set_password_challenges_owned_insert',
      'set_password_challenges_token_lookup',
      'set_password_challenges_token_consume',
      'set_password_challenges_user_invalidate',
      'email_verification_challenges_set_password_invalidate',
      'set_password_outbox_owned_insert',
      'set_password_outbox_user_cancel',
      'auth_outbox_set_password_cancel',
    ]) {
      expect(source).toContain(`create policy ${policy}`);
    }
  });

  it('adds user-scoped read visibility required for recovery invalidation updates', () => {
    const source = readAuthRecoveryRlsMigration();
    const baseline = readInitialBaseline();

    for (const policy of [
      'set_password_challenges_user_lookup',
      'email_verification_challenges_auth_user_lookup',
      'auth_outbox_auth_user_lookup',
      'set_password_outbox_auth_user_lookup',
    ]) {
      expect(source).toContain(`create policy ${policy}`);
      expect(baseline).toContain(`create policy ${policy}`);
    }
    expect(source).not.toMatch(/\bdrop\s+policy\b/iu);
    expect(source.match(/exception when duplicate_object then null/gu)).toHaveLength(4);
    expect(
      source.match(/user_id = current_setting\('lodariq\.auth_user_id', true\)/gu),
    ).toHaveLength(4);
    expect(source.match(/used_at is null/gu)).toHaveLength(2);
    expect(source.match(/and processed_at is null/gu)).toHaveLength(2);
    expect(source.match(/terminal_at is null/gu)).toHaveLength(2);
    expect(source.match(/lodariq\.auth_recovery_mutation_at/gu)).toHaveLength(4);
    expect(source).not.toContain("current_setting('lodariq.auth_outbox_worker'");
  });
});
