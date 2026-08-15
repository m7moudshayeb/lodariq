import { sql } from 'drizzle-orm';
import {
  boolean,
  bigint,
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
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  retentionExpiresAt: timestamp('retention_expires_at', { withTimezone: true }),
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
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    retentionExpiresAt: timestamp('retention_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Deliberately non-unique: a legacy duplicate must be detected and rejected
    // by the recovery repository, never hidden by an arbitrary LIMIT 1.
    index('users_email_normalized_lookup_idx').on(sql`lower(btrim(${table.email}))`),
  ],
);

export const userEmails = pgTable(
  'user_emails',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    normalizedEmail: text('normalized_email').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('user_emails_normalized_idx').on(table.normalizedEmail),
    uniqueIndex('user_emails_primary_user_idx')
      .on(table.userId)
      .where(sql`${table.isPrimary}`),
    index('user_emails_user_idx').on(table.userId),
    check('user_emails_id_check', sql`${table.id} ~ '^email_[A-Za-z0-9_-]{20,}$'`),
    check(
      'user_emails_normalized_check',
      sql`char_length(${table.normalizedEmail}) between 3 and 320 and ${table.normalizedEmail} = lower(btrim(${table.normalizedEmail}))`,
    ),
  ],
);

export const usernames = pgTable(
  'usernames',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    normalizedUsername: text('normalized_username').notNull(),
    displayUsername: text('display_username').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('usernames_normalized_idx').on(table.normalizedUsername),
    check('usernames_id_check', sql`${table.id} ~ '^uname_[A-Za-z0-9_-]{20,}$'`),
    check(
      'usernames_normalized_check',
      sql`char_length(${table.normalizedUsername}) between 3 and 32
        and ${table.normalizedUsername} = lower(btrim(${table.normalizedUsername}))
        and ${table.normalizedUsername} ~ '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$'
        and ${table.normalizedUsername} !~ '[._-]{2}'`,
    ),
    check(
      'usernames_display_check',
      sql`char_length(${table.displayUsername}) between 3 and 32
        and ${table.displayUsername} = btrim(${table.displayUsername})
        and ${table.displayUsername} ~ '^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$'
        and ${table.displayUsername} !~ '[._-]{2}'
        and lower(${table.displayUsername}) = ${table.normalizedUsername}`,
    ),
    check(
      'usernames_reserved_check',
      sql`${table.normalizedUsername} not in (
        'account', 'admin', 'administrator', 'api', 'app', 'auth', 'billing',
        'dashboard', 'editor', 'help', 'lodariq', 'login', 'logout', 'me',
        'oauth', 'owner', 'root', 'security', 'settings', 'signin', 'signup',
        'sso', 'support', 'system', 'verify', 'www'
      )`,
    ),
  ],
);

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    providerTenantId: text('provider_tenant_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastAuthenticatedAt: timestamp('last_authenticated_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('auth_identities_issuer_subject_idx').on(table.issuer, table.subject),
    index('auth_identities_user_idx').on(table.userId),
    index('auth_identities_provider_tenant_idx').on(table.providerTenantId),
    check('auth_identities_id_check', sql`${table.id} ~ '^ident_[A-Za-z0-9_-]{20,}$'`),
    check(
      'auth_identities_kind_check',
      sql`${table.kind} in ('password', 'passkey', 'oidc', 'saml')`,
    ),
    check(
      'auth_identities_provider_tenant_check',
      sql`(
        ${table.kind} in ('password', 'passkey')
        and ${table.issuer} = 'https://lodariq.io'
        and ${table.providerTenantId} is null
      ) or (
        ${table.kind} in ('oidc', 'saml')
        and ${table.providerTenantId} is not null
      )`,
    ),
    check(
      'auth_identities_subject_check',
      sql`char_length(${table.subject}) between 1 and 1024 and char_length(${table.issuer}) between 1 and 2048`,
    ),
  ],
);

export const oidcAuthorizationAttempts = pgTable(
  'oidc_authorization_attempts',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id').notNull(),
    action: text('action').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    stateHash: text('state_hash').notNull(),
    encryptedVerifier: text('encrypted_verifier').notNull(),
    nonceHash: text('nonce_hash').notNull(),
    returnTo: text('return_to').notNull(),
    workspaceName: text('workspace_name'),
    durationPolicy: text('duration_policy').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('oidc_authorization_attempts_state_idx').on(table.stateHash),
    index('oidc_authorization_attempts_user_idx').on(table.userId),
    index('oidc_authorization_attempts_expiry_idx').on(table.expiresAt),
    check('oidc_authorization_attempts_id_check', sql`${table.id} ~ '^oidcattempt_[A-Za-z0-9_-]{20,}$'`),
    check('oidc_authorization_attempts_provider_check', sql`${table.providerId} ~ '^[a-z][a-z0-9_-]{1,63}$'`),
    check('oidc_authorization_attempts_action_check', sql`${table.action} in ('sign_in', 'sign_up', 'link')`),
    check('oidc_authorization_attempts_duration_check', sql`${table.durationPolicy} in ('standard', 'remembered')`),
    check(
      'oidc_authorization_attempts_action_data_check',
      sql`(
        ${table.action} = 'link' and ${table.userId} is not null and ${table.workspaceName} is null
      ) or (
        ${table.action} = 'sign_up' and ${table.userId} is null
        and char_length(btrim(${table.workspaceName})) between 1 and 120
      ) or (
        ${table.action} = 'sign_in' and ${table.userId} is null and ${table.workspaceName} is null
      )`,
    ),
    check('oidc_authorization_attempts_state_check', sql`${table.stateHash} ~ '^[0-9a-f]{64}$'`),
    check('oidc_authorization_attempts_nonce_check', sql`${table.nonceHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'oidc_authorization_attempts_verifier_check',
      sql`char_length(${table.encryptedVerifier}) between 64 and 4096 and ${table.encryptedVerifier} ~ '^[A-Za-z0-9_-]+$'`,
    ),
    check(
      'oidc_authorization_attempts_return_check',
      sql`char_length(${table.returnTo}) between 1 and 2048 and ${table.returnTo} like '/%' and ${table.returnTo} not like '//%'`,
    ),
    check('oidc_authorization_attempts_expiry_check', sql`${table.createdAt} < ${table.expiresAt}`),
  ],
);

export const authSecurityEvents = pgTable(
  'auth_security_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    identityId: text('identity_id').notNull(),
    authorization: text('authorization_source').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('auth_security_events_user_time_idx').on(table.userId, table.occurredAt),
    check('auth_security_events_id_check', sql`${table.id} ~ '^authevt_[A-Za-z0-9_-]{20,}$'`),
    check(
      'auth_security_events_type_check',
      sql`${table.eventType} in (
        'identity_linked', 'identity_unlinked', 'identity_unlink_rejected_final_method'
      )`,
    ),
    check(
      'auth_security_events_authorization_check',
      sql`${table.authorization} in ('authenticated_session', 'strong_recovery')`,
    ),
  ],
);

export const identityOnboardingStates = pgTable(
  'identity_onboarding_states',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    intent: text('intent').notNull(),
    status: text('status').notNull(),
    targetWorkspaceId: text('target_workspace_id'),
    targetWorkspaceName: text('target_workspace_name'),
    invitationId: text('invitation_id'),
    requestedWorkspaceId: text('requested_workspace_id'),
    completedWorkspaceId: text('completed_workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(1),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('identity_onboarding_active_user_idx')
      .on(table.userId)
      .where(sql`${table.status} in ('pending_identity', 'pending_destination')`),
    index('identity_onboarding_expiry_idx').on(table.expiresAt),
    check('identity_onboarding_id_check', sql`${table.id} ~ '^onboard_[A-Za-z0-9_-]{20,}$'`),
    check(
      'identity_onboarding_intent_check',
      sql`${table.intent} in ('create_workspace', 'accept_invitation', 'request_access')`,
    ),
    check(
      'identity_onboarding_status_check',
      sql`${table.status} in ('pending_identity', 'pending_destination', 'completed', 'cancelled')`,
    ),
    check('identity_onboarding_version_check', sql`${table.version} between 1 and 2147483647`),
    check(
      'identity_onboarding_create_workspace_check',
      sql`${table.intent} <> 'create_workspace' or (
        ${table.targetWorkspaceId} is not null
        and char_length(${table.targetWorkspaceName}) between 1 and 120
      )`,
    ),
    check(
      'identity_onboarding_completion_check',
      sql`${table.status} <> 'completed' or ${table.completedWorkspaceId} is not null`,
    ),
    check('identity_onboarding_expiry_check', sql`${table.createdAt} < ${table.expiresAt}`),
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
    identityId: text('identity_id').references(() => authIdentities.id, { onDelete: 'restrict' }),
    authenticationMethod: text('authentication_method').notNull().default('password'),
    assuranceLevel: text('assurance_level').notNull().default('aal1'),
    authenticatedAt: timestamp('authenticated_at', { withTimezone: true }).notNull().defaultNow(),
    durationPolicy: text('duration_policy').notNull().default('standard'),
    deviceLabel: text('device_label').notNull().default('Unknown device'),
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
      'auth_sessions_method_check',
      sql`${table.authenticationMethod} in ('password', 'passkey', 'oidc', 'saml', 'recovery')`,
    ),
    check(
      'auth_sessions_assurance_check',
      sql`${table.assuranceLevel} in ('aal1', 'aal2', 'aal3')`,
    ),
    check(
      'auth_sessions_duration_policy_check',
      sql`${table.durationPolicy} in ('standard', 'remembered', 'managed')`,
    ),
    check(
      'auth_sessions_device_label_check',
      sql`char_length(${table.deviceLabel}) between 1 and 120 and ${table.deviceLabel} = btrim(${table.deviceLabel})`,
    ),
    check(
      'auth_sessions_expiry_order_check',
      sql`${table.createdAt} <= ${table.lastSeenAt}
        and ${table.lastSeenAt} < ${table.idleExpiresAt}
        and ${table.idleExpiresAt} <= ${table.absoluteExpiresAt}`,
    ),
  ],
);

export const accountSecurityEvents = pgTable(
  'account_security_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    targetId: text('target_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('account_security_events_user_time_idx').on(table.userId, table.occurredAt),
    check('account_security_events_id_check', sql`${table.id} ~ '^acctevt_[A-Za-z0-9_-]{20,}$'`),
    check(
      'account_security_events_type_check',
      sql`${table.eventType} in (
        'password_changed', 'email_change_started', 'email_change_current_verified',
        'email_change_new_verified', 'email_changed', 'session_revoked',
        'sessions_revoked_all', 'account_deletion_scheduled'
      )`,
    ),
    check('account_security_events_actor_check', sql`${table.actorUserId} = ${table.userId}`),
  ],
);

export const accountEmailChangeChallenges = pgTable(
  'account_email_change_challenges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    currentEmailNormalized: text('current_email_normalized').notNull(),
    newEmailNormalized: text('new_email_normalized').notNull(),
    newEmailLookupHash: text('new_email_lookup_hash').notNull(),
    currentTokenHash: text('current_token_hash').notNull(),
    newTokenHash: text('new_token_hash').notNull(),
    keyId: text('key_id').notNull(),
    currentVerifiedAt: timestamp('current_verified_at', { withTimezone: true }),
    newVerifiedAt: timestamp('new_verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('account_email_change_active_user_idx')
      .on(table.userId)
      .where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
    uniqueIndex('account_email_change_current_token_idx').on(table.currentTokenHash),
    uniqueIndex('account_email_change_new_token_idx').on(table.newTokenHash),
    index('account_email_change_expiry_idx').on(table.expiresAt),
    check('account_email_change_id_check', sql`${table.id} ~ '^emailchange_[A-Za-z0-9_-]{20,}$'`),
    check(
      'account_email_change_email_check',
      sql`char_length(${table.currentEmailNormalized}) between 3 and 320
        and char_length(${table.newEmailNormalized}) between 3 and 320
        and ${table.currentEmailNormalized} = lower(btrim(${table.currentEmailNormalized}))
        and ${table.newEmailNormalized} = lower(btrim(${table.newEmailNormalized}))
        and ${table.currentEmailNormalized} <> ${table.newEmailNormalized}`,
    ),
    check(
      'account_email_change_hash_check',
      sql`${table.newEmailLookupHash} ~ '^[0-9a-f]{64}$'
        and ${table.currentTokenHash} ~ '^[0-9a-f]{64}$'
        and ${table.newTokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check('account_email_change_key_check', sql`${table.keyId} ~ '^[a-z0-9][a-z0-9_-]{0,31}$'`),
    check('account_email_change_expiry_check', sql`${table.createdAt} < ${table.expiresAt}`),
  ],
);

export const accountEmailChangeOutbox = pgTable(
  'account_email_change_outbox',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => accountEmailChangeChallenges.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    payload: jsonb('payload')
      .$type<{
        purpose: 'account_email_change';
        challengeId: string;
        proof: 'current_email' | 'new_email';
        changePath: string;
        keyId: string;
      }>()
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
    uniqueIndex('account_email_change_outbox_proof_idx').on(
      table.challengeId,
      sql`(${table.payload}->>'proof')`,
    ),
    index('account_email_change_outbox_due_idx')
      .on(table.availableAt, table.createdAt)
      .where(
        sql`${table.processedAt} is null and ${table.terminalAt} is null and ${table.attempts} < 20`,
      ),
    check('account_email_change_outbox_id_check', sql`${table.id} ~ '^outbox_[A-Za-z0-9_-]{20,}$'`),
    check('account_email_change_outbox_type_check', sql`${table.type} = 'account_email_change'`),
    check(
      'account_email_change_outbox_recipient_check',
      sql`char_length(${table.recipientEmail}) between 3 and 320 and ${table.recipientEmail} = lower(btrim(${table.recipientEmail}))`,
    ),
    check('account_email_change_outbox_attempts_check', sql`${table.attempts} between 0 and 20`),
    check(
      'account_email_change_outbox_lease_check',
      sql`${table.leaseVersion} between 0 and 2147483647`,
    ),
    check(
      'account_email_change_outbox_error_check',
      sql`${table.lastError} is null or ${table.lastError} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      'account_email_change_outbox_payload_check',
      sql`jsonb_typeof(${table.payload}) = 'object'
        and ${table.payload} ?& array['purpose', 'challengeId', 'proof', 'changePath', 'keyId']
        and ${table.payload}->>'purpose' = 'account_email_change'
        and ${table.payload}->>'challengeId' ~ '^emailchange_[A-Za-z0-9_-]{20,}$'
        and ${table.payload}->>'proof' in ('current_email', 'new_email')
        and char_length(${table.payload}->>'changePath') between 1 and 2048
        and ${table.payload}->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'`,
    ),
  ],
);

export const workspaceAuthPolicies = pgTable(
  'workspace_auth_policies',
  {
    workspaceId: text('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ssoRequired: boolean('sso_required').notNull().default(false),
    minimumAssurance: text('minimum_assurance').notNull().default('aal1'),
    passwordAllowed: boolean('password_allowed').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check(
      'workspace_auth_policies_assurance_check',
      sql`${table.minimumAssurance} in ('aal1', 'aal2', 'aal3')`,
    ),
    check(
      'workspace_auth_policies_viable_method_check',
      sql`${table.passwordAllowed} or ${table.ssoRequired}`,
    ),
  ],
);

export const ssoConnections = pgTable(
  'sso_connections',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    protocol: text('protocol').notNull(),
    issuer: text('issuer').notNull(),
    provider: text('provider').notNull().default('other'),
    clientId: text('client_id').notNull().default('migration-placeholder'),
    provisioningMode: text('provisioning_mode').notNull().default('invitation_only'),
    status: text('status').notNull().default('draft'),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sso_connections_workspace_issuer_idx').on(
      table.workspaceId,
      table.protocol,
      table.issuer,
    ),
    index('sso_connections_workspace_idx').on(table.workspaceId),
    check('sso_connections_id_check', sql`${table.id} ~ '^sso_[A-Za-z0-9_-]{20,}$'`),
    check('sso_connections_protocol_check', sql`${table.protocol} in ('oidc', 'saml')`),
    check(
      'sso_connections_status_check',
      sql`${table.status} in ('draft', 'verified', 'disabled')`,
    ),
    check('sso_connections_provider_check', sql`${table.provider} in ('okta', 'entra', 'other')`),
    check(
      'sso_connections_provisioning_mode_check',
      sql`${table.provisioningMode} in ('invitation_only', 'jit')`,
    ),
    check(
      'sso_connections_activation_check',
      sql`${table.status} <> 'verified' or ${table.validatedAt} is not null`,
    ),
    check('sso_connections_issuer_check', sql`char_length(${table.issuer}) between 1 and 2048`),
    check('sso_connections_client_id_check', sql`char_length(${table.clientId}) between 1 and 512`),
  ],
);

export const webauthnChallenges = pgTable(
  'webauthn_challenges',
  {
    id: text('id').primaryKey(),
    purpose: text('purpose').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    challengeHash: text('challenge_hash').notNull(),
    rpId: text('rp_id').notNull(),
    origin: text('origin').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('webauthn_challenges_hash_idx').on(table.challengeHash),
    index('webauthn_challenges_user_idx').on(table.userId),
    index('webauthn_challenges_expiry_idx').on(table.expiresAt),
    check('webauthn_challenges_id_check', sql`${table.id} ~ '^authchal_[A-Za-z0-9_-]{20,}$'`),
    check(
      'webauthn_challenges_purpose_check',
      sql`${table.purpose} in ('passkey_registration', 'passkey_authentication', 'passkey_step_up')`,
    ),
    check('webauthn_challenges_hash_check', sql`${table.challengeHash} ~ '^[0-9a-f]{64}$'`),
    check('webauthn_challenges_rp_check', sql`char_length(${table.rpId}) between 1 and 253`),
    check('webauthn_challenges_origin_check', sql`char_length(${table.origin}) between 8 and 2048`),
    check('webauthn_challenges_expiry_check', sql`${table.createdAt} < ${table.expiresAt}`),
  ],
);

export const passkeyCredentials = pgTable(
  'passkey_credentials',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    identityId: text('identity_id')
      .notNull()
      .references(() => authIdentities.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    transports: jsonb('transports').$type<string[]>().notNull().default([]),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    aaguid: text('aaguid').notNull(),
    name: text('name').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('passkey_credentials_credential_idx').on(table.credentialId),
    uniqueIndex('passkey_credentials_identity_idx').on(table.identityId),
    index('passkey_credentials_user_idx').on(table.userId),
    check('passkey_credentials_id_check', sql`${table.id} ~ '^passkey_[A-Za-z0-9_-]{20,}$'`),
    check(
      'passkey_credentials_credential_check',
      sql`${table.credentialId} ~ '^[A-Za-z0-9_-]{16,}$' and char_length(${table.credentialId}) <= 2048`,
    ),
    check(
      'passkey_credentials_public_key_check',
      sql`${table.publicKey} ~ '^[A-Za-z0-9_-]{16,}$' and char_length(${table.publicKey}) <= 8192`,
    ),
    check('passkey_credentials_counter_check', sql`${table.counter} >= 0`),
    check(
      'passkey_credentials_device_check',
      sql`${table.deviceType} in ('singleDevice', 'multiDevice')`,
    ),
    check('passkey_credentials_name_check', sql`char_length(${table.name}) between 1 and 120`),
  ],
);

export const recoveryCodeSets = pgTable(
  'recovery_code_sets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('recovery_code_sets_active_user_idx')
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
    check('recovery_code_sets_id_check', sql`${table.id} ~ '^recoveryset_[A-Za-z0-9_-]{20,}$'`),
  ],
);

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: text('id').primaryKey(),
    setId: text('set_id')
      .notNull()
      .references(() => recoveryCodeSets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('recovery_codes_hash_idx').on(table.codeHash),
    index('recovery_codes_user_idx').on(table.userId),
    index('recovery_codes_set_idx').on(table.setId),
    check('recovery_codes_id_check', sql`${table.id} ~ '^recoverycode_[A-Za-z0-9_-]{20,}$'`),
    check('recovery_codes_hash_check', sql`${table.codeHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const emailVerificationChallenges = pgTable(
  'email_verification_challenges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    keyId: text('key_id').notNull().default('legacy'),
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
      'email_verification_challenges_key_id_check',
      sql`${table.keyId} ~ '^[a-z0-9][a-z0-9_-]{0,31}$'`,
    ),
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
    keyId: text('key_id').notNull().default('legacy'),
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
      'set_password_challenges_key_id_check',
      sql`${table.keyId} ~ '^[a-z0-9][a-z0-9_-]{0,31}$'`,
    ),
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
    payload: jsonb('payload')
      .$type<{ challengeId: string; verificationPath: string; keyId: string }>()
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
      sql`${table.payload} ?& array['challengeId', 'verificationPath', 'keyId']
        and jsonb_typeof(${table.payload}->'challengeId') = 'string'
        and jsonb_typeof(${table.payload}->'verificationPath') = 'string'
        and jsonb_typeof(${table.payload}->'keyId') = 'string'
        and ${table.payload}->>'challengeId' ~ '^verify_[A-Za-z0-9_-]{20,}$'
        and char_length(${table.payload}->>'verificationPath') between 1 and 2048
        and ${table.payload}->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'`,
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
      .$type<{
        purpose: 'set_password';
        challengeId: string;
        resetPath: string;
        keyId: string;
      }>()
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
        and ${table.payload} ?& array['purpose', 'challengeId', 'resetPath', 'keyId']
        and jsonb_typeof(${table.payload}->'purpose') = 'string'
        and jsonb_typeof(${table.payload}->'challengeId') = 'string'
        and jsonb_typeof(${table.payload}->'resetPath') = 'string'
        and jsonb_typeof(${table.payload}->'keyId') = 'string'
        and ${table.payload}->>'purpose' = 'set_password'
        and ${table.payload}->>'challengeId' ~ '^reset_[A-Za-z0-9_-]{20,}$'
        and char_length(${table.payload}->>'resetPath') between 1 and 2048
        and ${table.payload}->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'`,
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

export const workspaceInvitations = pgTable(
  'workspace_invitations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    emailNormalized: text('email_normalized').notNull(),
    emailLookupHash: text('email_lookup_hash').notNull(),
    tokenHash: text('token_hash').notNull(),
    role: text('role').notNull(),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('workspace_invitations_workspace_idx').on(table.workspaceId),
    uniqueIndex('workspace_invitations_token_hash_idx').on(table.tokenHash),
    uniqueIndex('workspace_invitations_active_email_idx')
      .on(table.workspaceId, table.emailLookupHash)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    check('workspace_invitations_id_check', sql`${table.id} ~ '^invite_[A-Za-z0-9_-]{20,}$'`),
    check('workspace_invitations_token_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'workspace_invitations_lookup_hash_check',
      sql`${table.emailLookupHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'workspace_invitations_email_check',
      sql`char_length(${table.emailNormalized}) between 3 and 320 and ${table.emailNormalized} = lower(btrim(${table.emailNormalized}))`,
    ),
    check('workspace_invitations_role_check', sql`${table.role} in ('admin', 'member', 'viewer')`),
    check('workspace_invitations_expiry_check', sql`${table.createdAt} < ${table.expiresAt}`),
    check(
      'workspace_invitations_terminal_state_check',
      sql`${table.acceptedAt} is null or ${table.revokedAt} is null`,
    ),
  ],
);

export const workspaceInvitationOutbox = pgTable(
  'workspace_invitation_outbox',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    invitationId: text('invitation_id')
      .notNull()
      .unique()
      .references(() => workspaceInvitations.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    payload: jsonb('payload')
      .$type<{
        purpose: 'workspace_invitation';
        invitationId: string;
        acceptancePath: string;
        keyId: string;
      }>()
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
    index('workspace_invitation_outbox_due_idx')
      .on(table.availableAt, table.createdAt)
      .where(
        sql`${table.processedAt} is null and ${table.terminalAt} is null and ${table.attempts} < 20`,
      ),
    index('workspace_invitation_outbox_workspace_idx').on(table.workspaceId),
    check('workspace_invitation_outbox_id_check', sql`${table.id} ~ '^outbox_[A-Za-z0-9_-]{20,}$'`),
    check('workspace_invitation_outbox_type_check', sql`${table.type} = 'workspace_invitation'`),
    check(
      'workspace_invitation_outbox_recipient_check',
      sql`char_length(${table.recipientEmail}) between 3 and 320 and ${table.recipientEmail} = lower(btrim(${table.recipientEmail}))`,
    ),
    check('workspace_invitation_outbox_attempts_check', sql`${table.attempts} between 0 and 20`),
    check(
      'workspace_invitation_outbox_lease_version_check',
      sql`${table.leaseVersion} between 0 and 2147483647`,
    ),
    check(
      'workspace_invitation_outbox_last_error_check',
      sql`${table.lastError} is null or ${table.lastError} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      'workspace_invitation_outbox_payload_check',
      sql`jsonb_typeof(${table.payload}) = 'object'
        and ${table.payload} ?& array['purpose', 'invitationId', 'acceptancePath', 'keyId']
        and jsonb_typeof(${table.payload}->'purpose') = 'string'
        and jsonb_typeof(${table.payload}->'invitationId') = 'string'
        and jsonb_typeof(${table.payload}->'acceptancePath') = 'string'
        and jsonb_typeof(${table.payload}->'keyId') = 'string'
        and ${table.payload}->>'purpose' = 'workspace_invitation'
        and ${table.payload}->>'invitationId' ~ '^invite_[A-Za-z0-9_-]{20,}$'
        and char_length(${table.payload}->>'acceptancePath') between 1 and 2048
        and ${table.payload}->>'keyId' ~ '^[a-z0-9][a-z0-9_-]{0,31}$'`,
    ),
  ],
);

export const tenantAuditEvents = pgTable(
  'tenant_audit_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    invitationId: text('invitation_id'),
    previousRole: text('previous_role'),
    nextRole: text('next_role'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('tenant_audit_events_workspace_time_idx').on(table.workspaceId, table.occurredAt),
    check('tenant_audit_events_id_check', sql`${table.id} ~ '^tenevt_[A-Za-z0-9_-]{20,}$'`),
    check(
      'tenant_audit_events_type_check',
      sql`${table.eventType} in (
        'invitation_created', 'invitation_revoked', 'invitation_accepted',
        'membership_role_changed', 'membership_removed', 'ownership_transferred',
        'workspace_deletion_scheduled', 'workspace_deletion_cancelled'
      )`,
    ),
    check(
      'tenant_audit_events_previous_role_check',
      sql`${table.previousRole} is null or ${table.previousRole} in ('owner', 'admin', 'member', 'viewer')`,
    ),
    check(
      'tenant_audit_events_next_role_check',
      sql`${table.nextRole} is null or ${table.nextRole} in ('owner', 'admin', 'member', 'viewer')`,
    ),
  ],
);
