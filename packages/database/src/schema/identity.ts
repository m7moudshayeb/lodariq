import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { timestamps } from './shared';

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ...timestamps,
});

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    // Nullable during the owned-auth expand/contract rollout. Existing external
    // identities remain rollback-only until an approved contract migration.
    legacyIdentityId: text('clerk_user_id').unique(),
    email: text('email').notNull(),
    name: text('name'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Deliberately non-unique: a legacy duplicate must be detected and rejected
    // by the recovery repository, never hidden by an arbitrary LIMIT 1.
    index('users_email_normalized_lookup_idx').on(sql`lower(btrim(${table.email}))`),
  ],
);

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_memberships_workspace_idx').on(table.workspaceId),
    check(
      'workspace_memberships_role_check',
      sql`${table.role} in ('owner', 'admin', 'member', 'viewer')`,
    ),
  ],
);

export const passwordCredentials = pgTable(
  'password_credentials',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    emailNormalized: text('email_normalized').notNull(),
    emailLookupHash: text('email_lookup_hash').notNull(),
    algorithm: text('algorithm').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('password_credentials_email_normalized_idx').on(table.emailNormalized),
    uniqueIndex('password_credentials_email_lookup_hash_idx').on(table.emailLookupHash),
    check('password_credentials_algorithm_check', sql`${table.algorithm} = 'argon2id-v1'`),
    check(
      'password_credentials_email_normalized_check',
      sql`char_length(${table.emailNormalized}) between 3 and 320 and ${table.emailNormalized} = lower(btrim(${table.emailNormalized}))`,
    ),
    check(
      'password_credentials_lookup_hash_check',
      sql`${table.emailLookupHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'password_credentials_encoding_check',
      sql`${table.passwordHash} ~ '^\\$argon2id\\$v=19\\$m=65536,p=1,t=3\\$[A-Za-z0-9+/]{22}\\$[A-Za-z0-9+/]{43}$'`,
    ),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    activeWorkspaceId: text('active_workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('auth_sessions_token_hash_idx').on(table.tokenHash),
    index('auth_sessions_user_idx').on(table.userId),
    index('auth_sessions_expiry_idx').on(table.absoluteExpiresAt),
    check('auth_sessions_token_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('auth_sessions_id_check', sql`${table.id} ~ '^authsess_[A-Za-z0-9_-]{20,}$'`),
    check(
      'auth_sessions_expiry_order_check',
      sql`${table.createdAt} <= ${table.lastSeenAt}
        and ${table.lastSeenAt} < ${table.idleExpiresAt}
        and ${table.idleExpiresAt} <= ${table.absoluteExpiresAt}`,
    ),
  ],
);

export const emailVerificationChallenges = pgTable(
  'email_verification_challenges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('email_verification_challenges_token_hash_idx').on(table.tokenHash),
    index('email_verification_challenges_user_idx').on(table.userId),
    index('email_verification_challenges_expires_idx').on(table.expiresAt),
    check(
      'email_verification_challenges_id_check',
      sql`${table.id} ~ '^verify_[A-Za-z0-9_-]{20,}$'`,
    ),
    check('email_verification_challenges_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'email_verification_challenges_expiry_check',
      sql`${table.createdAt} < ${table.expiresAt}`,
    ),
  ],
);

export const setPasswordChallenges = pgTable(
  'set_password_challenges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    emailLookupHash: text('email_lookup_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('set_password_challenges_token_hash_idx').on(table.tokenHash),
    uniqueIndex('set_password_challenges_active_user_idx')
      .on(table.userId)
      .where(sql`${table.usedAt} is null`),
    index('set_password_challenges_user_idx').on(table.userId),
    index('set_password_challenges_expires_idx').on(table.expiresAt),
    check('set_password_challenges_id_check', sql`${table.id} ~ '^reset_[A-Za-z0-9_-]{20,}$'`),
    check('set_password_challenges_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'set_password_challenges_email_normalized_check',
      sql`char_length(${table.emailNormalized}) between 3 and 320 and ${table.emailNormalized} = lower(btrim(${table.emailNormalized}))`,
    ),
    check(
      'set_password_challenges_lookup_hash_check',
      sql`${table.emailLookupHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check('set_password_challenges_expiry_check', sql`${table.createdAt} < ${table.expiresAt}`),
  ],
);

export const authOutbox = pgTable(
  'auth_outbox',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    payload: jsonb('payload').$type<{ challengeId: string; verificationPath: string }>().notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    leaseVersion: integer('lease_version').notNull().default(0),
    lastError: text('last_error'),
    terminalAt: timestamp('terminal_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('auth_outbox_available_idx').on(table.availableAt),
    index('auth_outbox_due_idx')
      .on(table.availableAt, table.createdAt)
      .where(
        sql`${table.processedAt} is null and ${table.terminalAt} is null and ${table.attempts} < 20`,
      ),
    index('auth_outbox_user_idx').on(table.userId),
    check('auth_outbox_id_check', sql`${table.id} ~ '^outbox_[A-Za-z0-9_-]{20,}$'`),
    check('auth_outbox_type_check', sql`${table.type} = 'email_verification'`),
    check(
      'auth_outbox_recipient_check',
      sql`char_length(${table.recipientEmail}) between 3 and 320 and ${table.recipientEmail} = lower(btrim(${table.recipientEmail}))`,
    ),
    check('auth_outbox_attempts_check', sql`${table.attempts} between 0 and 20`),
    check('auth_outbox_lease_version_check', sql`${table.leaseVersion} between 0 and 2147483647`),
    check(
      'auth_outbox_last_error_check',
      sql`${table.lastError} is null or ${table.lastError} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check('auth_outbox_payload_check', sql`jsonb_typeof(${table.payload}) = 'object'`),
    check(
      'auth_outbox_delivery_payload_check',
      sql`${table.payload} ?& array['challengeId', 'verificationPath']
        and jsonb_typeof(${table.payload}->'challengeId') = 'string'
        and jsonb_typeof(${table.payload}->'verificationPath') = 'string'
        and ${table.payload}->>'challengeId' ~ '^verify_[A-Za-z0-9_-]{20,}$'
        and char_length(${table.payload}->>'verificationPath') between 1 and 2048`,
    ),
  ],
);

export const setPasswordOutbox = pgTable(
  'set_password_outbox',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    payload: jsonb('payload')
      .$type<{ purpose: 'set_password'; challengeId: string; resetPath: string }>()
      .notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    leaseVersion: integer('lease_version').notNull().default(0),
    lastError: text('last_error'),
    terminalAt: timestamp('terminal_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('set_password_outbox_available_idx').on(table.availableAt),
    index('set_password_outbox_due_idx')
      .on(table.availableAt, table.createdAt)
      .where(
        sql`${table.processedAt} is null and ${table.terminalAt} is null and ${table.attempts} < 20`,
      ),
    index('set_password_outbox_user_idx').on(table.userId),
    check('set_password_outbox_id_check', sql`${table.id} ~ '^outbox_[A-Za-z0-9_-]{20,}$'`),
    check('set_password_outbox_type_check', sql`${table.type} = 'set_password'`),
    check(
      'set_password_outbox_recipient_check',
      sql`char_length(${table.recipientEmail}) between 3 and 320 and ${table.recipientEmail} = lower(btrim(${table.recipientEmail}))`,
    ),
    check('set_password_outbox_attempts_check', sql`${table.attempts} between 0 and 20`),
    check(
      'set_password_outbox_lease_version_check',
      sql`${table.leaseVersion} between 0 and 2147483647`,
    ),
    check(
      'set_password_outbox_last_error_check',
      sql`${table.lastError} is null or ${table.lastError} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      'set_password_outbox_payload_check',
      sql`jsonb_typeof(${table.payload}) = 'object'
        and ${table.payload} ?& array['purpose', 'challengeId', 'resetPath']
        and jsonb_typeof(${table.payload}->'purpose') = 'string'
        and jsonb_typeof(${table.payload}->'challengeId') = 'string'
        and jsonb_typeof(${table.payload}->'resetPath') = 'string'
        and ${table.payload}->>'purpose' = 'set_password'
        and ${table.payload}->>'challengeId' ~ '^reset_[A-Za-z0-9_-]{20,}$'
        and char_length(${table.payload}->>'resetPath') between 1 and 2048`,
    ),
  ],
);

export const authRateLimits = pgTable(
  'auth_rate_limits',
  {
    bucketHash: text('bucket_hash').primaryKey(),
    scope: text('scope').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('auth_rate_limits_updated_idx').on(table.updatedAt),
    check('auth_rate_limits_hash_check', sql`${table.bucketHash} ~ '^[0-9a-f]{64}$'`),
    check('auth_rate_limits_scope_check', sql`${table.scope} in ('sign-in', 'sign-up')`),
    check('auth_rate_limits_attempts_check', sql`${table.attempts} between 1 and 1000000`),
  ],
);
