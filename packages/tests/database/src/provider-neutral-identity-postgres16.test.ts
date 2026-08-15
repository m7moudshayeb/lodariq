import { afterEach, describe, expect, it } from 'vitest';
import {
  PROVIDER_NEUTRAL_IDENTITY_FILE_NAME,
  listCheckedInSqlPaths,
} from './migration-test-utils.js';
import {
  createDisposablePostgresFixture,
  DISPOSABLE_POSTGRES_ENABLED,
  type DisposablePostgresFixture,
} from './postgres16-test-harness.js';

let activeFixture: DisposablePostgresFixture | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'provider-neutral identity expansion on PostgreSQL 16',
  () => {
    afterEach(() => {
      activeFixture?.cleanup();
      activeFixture = undefined;
    });

    it('backfills exact emails/password identities and preserves rollback columns', () => {
      const fixture = createLegacyFixture();
      fixture.runOwnerSql(`
        insert into users (id, clerk_user_id, email, name, email_verified_at, created_at) values
          ('usr_migrate_a', 'legacy_a', 'CreatorA@example.com', 'A', now(), '2026-08-01T00:00:00Z'),
          ('usr_migrate_b', null, 'creatorb@example.com', 'B', null, '2026-08-02T00:00:00Z');
        insert into workspaces (id, name, created_at, updated_at)
          values ('wk_migrate_a', 'A', now(), now());
        insert into password_credentials
          (user_id, email_normalized, email_lookup_hash, algorithm, password_hash, created_at, updated_at)
        values
          ('usr_migrate_a', 'creatora@example.com', '${'a'.repeat(64)}', 'argon2id-v1',
           '$argon2id$v=19$m=65536,p=1,t=3$${'A'.repeat(22)}$${'B'.repeat(43)}', now(), now());
        insert into auth_sessions
          (id, user_id, token_hash, active_workspace_id, created_at, last_seen_at,
           idle_expires_at, absolute_expires_at, revoked_at)
        values
          ('authsess_migration_xxxxxxxxxxxx', 'usr_migrate_a', '${'b'.repeat(64)}', null,
           now(), now(), now() + interval '1 day', now() + interval '2 days', null);
      `);

      fixture.applyMigration(providerNeutralMigrationPath());

      expect(fixture.runOwnerSql('select count(*) from user_emails;')).toBe('2');
      expect(fixture.runOwnerSql('select count(*) from auth_identities;')).toBe('1');
      expect(fixture.runOwnerSql('select count(*) from workspace_auth_policies;')).toBe('1');
      expect(
        fixture.runOwnerSql(
          "select normalized_email from user_emails where user_id = 'usr_migrate_a';",
        ),
      ).toBe('creatora@example.com');
      expect(
        fixture.runOwnerSql(
          "select issuer || '|' || subject from auth_identities where user_id = 'usr_migrate_a';",
        ),
      ).toBe('https://lodariq.io|user:usr_migrate_a');
      expect(
        fixture.runOwnerSql(
          "select email || '|' || coalesce(clerk_user_id, '') from users where id = 'usr_migrate_a';",
        ),
      ).toBe('CreatorA@example.com|legacy_a');
      expect(
        fixture.runOwnerSql(
          "select (identity_id is null)::text || '|' || authentication_method || '|' || assurance_level || '|' || duration_policy from auth_sessions where id = 'authsess_migration_xxxxxxxxxxxx';",
        ),
      ).toBe('true|password|aal1|standard');
      expect(
        fixture.runOwnerSql(
          "select relrowsecurity::text || '|' || relforcerowsecurity::text from pg_class where relname = 'auth_identities';",
        ),
      ).toBe('true|true');
      expect(() =>
        fixture.runOwnerSql(`
          insert into auth_identities
            (id, user_id, kind, issuer, subject, provider_tenant_id, created_at)
          values
            ('ident_duplicate_subject_xxxxxxxxx', 'usr_migrate_b', 'password',
             'https://lodariq.io', 'user:usr_migrate_a', null, now());
        `),
      ).toThrow(/auth_identities_issuer_subject_idx/u);
      expect(() =>
        fixture.runOwnerSql(`
          insert into auth_identities
            (id, user_id, kind, issuer, subject, provider_tenant_id, created_at)
          values
            ('ident_external_tenant_xxxxxxxxxx', 'usr_migrate_b', 'oidc',
             'https://identity.example.test', 'external-subject', null, now());
        `),
      ).toThrow(/auth_identities_provider_tenant_check/u);
    });

    it('aborts the entire backfill when normalized legacy emails are ambiguous', () => {
      const fixture = createLegacyFixture();
      fixture.runOwnerSql(`
        insert into users (id, clerk_user_id, email, name, email_verified_at, created_at) values
          ('usr_ambiguous_a', null, 'Duplicate@example.com', 'A', null, now()),
          ('usr_ambiguous_b', null, ' duplicate@example.com ', 'B', null, now());
      `);
      expect(() => fixture.applyMigration(providerNeutralMigrationPath())).toThrow(
        /ambiguous normalized email data/u,
      );
      expect(fixture.runOwnerSql("select to_regclass('public.user_emails') is null;")).toBe('t');
    });
  },
);

function createLegacyFixture(): DisposablePostgresFixture {
  const fixture = createDisposablePostgresFixture('identity_migration');
  activeFixture = fixture;
  fixture.runOwnerSql(`
    create table users (
      id text primary key,
      clerk_user_id text unique,
      email text not null,
      name text,
      email_verified_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table workspaces (
      id text primary key,
      name text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table password_credentials (
      user_id text primary key references users(id) on delete cascade,
      email_normalized text not null,
      email_lookup_hash text not null,
      algorithm text not null,
      password_hash text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table auth_sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      token_hash text not null,
      active_workspace_id text references workspaces(id) on delete set null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      idle_expires_at timestamptz not null,
      absolute_expires_at timestamptz not null,
      revoked_at timestamptz
    );
  `);
  return fixture;
}

function providerNeutralMigrationPath(): string {
  const path = listCheckedInSqlPaths().find((candidate) =>
    candidate.endsWith(PROVIDER_NEUTRAL_IDENTITY_FILE_NAME),
  );
  if (!path) throw new Error('Provider-neutral identity migration is missing');
  return path;
}
