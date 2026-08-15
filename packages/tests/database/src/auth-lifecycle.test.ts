import { describe, expect, it } from 'vitest';
import {
  createInMemoryControlPlaneRepository,
  type AuthOutboxRecord,
  type SetPasswordOutboxRecord,
} from '@lodariq/database';

const NOW = '2026-08-15T12:00:00.000Z';
const OLD = '2026-06-01T12:00:00.000Z';
const FUTURE = '2026-09-01T12:00:00.000Z';

describe('@lodariq/database auth lifecycle maintenance', () => {
  it('removes bounded terminal data and only abandons unverified empty single-member tenants', async () => {
    const repository = createInMemoryControlPlaneRepository({
      users: [
        user('usr_abandoned', 'abandoned@example.com', OLD),
        user('usr_protected', 'protected@example.com', OLD),
        user('usr_collaborator', 'collaborator@example.com', OLD, NOW),
        user('usr_invited_owner', 'invited-owner@example.com', OLD),
        {
          ...user('usr_deleted', 'deleted@example.com', OLD, NOW),
          deletedAt: OLD,
          retentionExpiresAt: OLD,
        },
      ],
      workspaces: [
        workspace('wk_abandoned', OLD),
        workspace('wk_protected', OLD),
        workspace('wk_invited', OLD),
      ],
      workspaceMemberships: [
        membership('wk_abandoned', 'usr_abandoned', 'owner', OLD),
        membership('wk_protected', 'usr_protected', 'owner', OLD),
        membership('wk_protected', 'usr_collaborator', 'member', OLD),
        membership('wk_invited', 'usr_invited_owner', 'owner', OLD),
      ],
      passwordCredentials: [
        credential('usr_abandoned', 'abandoned@example.com', OLD),
        credential('usr_protected', 'protected@example.com', OLD),
        credential('usr_invited_owner', 'invited-owner@example.com', OLD),
      ],
      workspaceInvitations: [
        {
          id: 'invite_pending_xxxxxxxxxxxxxxx',
          workspaceId: 'wk_invited',
          emailNormalized: 'future-member@example.com',
          emailLookupHash: sha256Fixture('future-member@example.com'),
          tokenHash: 'f'.repeat(64),
          role: 'member',
          invitedByUserId: 'usr_invited_owner',
          expiresAt: FUTURE,
          acceptedAt: null,
          revokedAt: null,
          createdAt: OLD,
        },
      ],
      emailVerificationChallenges: [
        {
          id: 'verify_old_xxxxxxxxxxxxxxxxxxxx',
          userId: 'usr_abandoned',
          keyId: 'legacy',
          tokenHash: 'a'.repeat(64),
          expiresAt: OLD,
          usedAt: null,
          createdAt: OLD,
        },
      ],
      setPasswordChallenges: [
        {
          id: 'reset_old_xxxxxxxxxxxxxxxxxxxxx',
          userId: 'usr_protected',
          keyId: 'legacy',
          tokenHash: 'b'.repeat(64),
          emailNormalized: 'protected@example.com',
          emailLookupHash: sha256Fixture('protected@example.com'),
          expiresAt: FUTURE,
          usedAt: OLD,
          createdAt: OLD,
        },
      ],
      authSessions: [
        {
          id: 'authsess_old_xxxxxxxxxxxxxxxxx',
          userId: 'usr_protected',
          tokenHash: 'c'.repeat(64),
          activeWorkspaceId: 'wk_protected',
          identityId: null,
          authenticationMethod: 'password',
          assuranceLevel: 'aal1',
          authenticatedAt: OLD,
          durationPolicy: 'standard',
          createdAt: OLD,
          lastSeenAt: OLD,
          idleExpiresAt: '2026-06-02T12:00:00.000Z',
          absoluteExpiresAt: '2026-06-03T12:00:00.000Z',
          revokedAt: null,
        },
      ],
      authOutbox: [verificationOutbox('processed', { processedAt: OLD })],
      setPasswordOutbox: [passwordOutbox('terminal', { terminalAt: OLD })],
    });
    await repository.consumeAuthRateLimit({
      bucketHash: 'd'.repeat(64),
      scope: 'sign-in',
      now: OLD,
      windowMs: 60_000,
      maxAttempts: 3,
      blockMs: 60_000,
    });

    const result = await repository.cleanupAuthLifecycle({
      now: NOW,
      abandonedUnverifiedBefore: '2026-08-01T00:00:00.000Z',
      challengeBefore: '2026-08-01T00:00:00.000Z',
      sessionBefore: '2026-08-01T00:00:00.000Z',
      rateLimitBefore: '2026-08-01T00:00:00.000Z',
      outboxBefore: '2026-08-01T00:00:00.000Z',
      limit: 100,
    });

    expect(result).toEqual({
      deletedAccounts: 1,
      abandonedUsers: 1,
      emptyWorkspaces: 1,
      verificationChallenges: 1,
      setPasswordChallenges: 1,
      sessions: 1,
      rateLimitBuckets: 1,
      verificationOutboxRows: 1,
      setPasswordOutboxRows: 1,
      workspaceInvitationOutboxRows: 0,
      accountEmailChangeChallenges: 0,
      accountEmailChangeOutboxRows: 0,
    });
    expect(await repository.getIdentityUser('usr_abandoned')).toBeNull();
    expect(await repository.getIdentityUser('usr_protected')).not.toBeNull();
    expect(await repository.getIdentityUser('usr_invited_owner')).not.toBeNull();
    expect(await repository.getIdentityUser('usr_deleted')).toBeNull();
    expect(await repository.listIdentityWorkspaces('usr_protected')).toHaveLength(1);
  });

  it('reports queue state without exposing recipient or token material', async () => {
    const queued = verificationOutbox('queued');
    const retried = verificationOutbox('retried', {
      attempts: 2,
      lastError: 'resend_timeout',
      availableAt: FUTURE,
    });
    const repository = createInMemoryControlPlaneRepository({ authOutbox: [queued, retried] });

    expect(await repository.getAuthDeliveryStatus('email_verification', queued.id)).toMatchObject({
      state: 'queued',
      attempts: 0,
      lastFailureCode: null,
    });
    const retryStatus = await repository.getAuthDeliveryStatus('email_verification', retried.id);
    expect(retryStatus).toMatchObject({
      state: 'retry_scheduled',
      attempts: 2,
      lastFailureCode: 'resend_timeout',
      nextAttemptAt: FUTURE,
    });
    expect(JSON.stringify(retryStatus)).not.toContain('creator@example.com');
    expect(JSON.stringify(retryStatus)).not.toContain('token');
  });
});

function user(id: string, email: string, createdAt: string, emailVerifiedAt: string | null = null) {
  return { id, legacyIdentityId: null, email, name: null, emailVerifiedAt, createdAt };
}

function workspace(id: string, createdAt: string) {
  return { id, name: id, createdAt, updatedAt: createdAt };
}

function membership(workspaceId: string, userId: string, role: string, createdAt: string) {
  return { workspaceId, userId, role, createdAt };
}

function credential(userId: string, emailNormalized: string, createdAt: string) {
  return {
    userId,
    emailNormalized,
    emailLookupHash: sha256Fixture(emailNormalized),
    algorithm: 'argon2id-v1' as const,
    passwordHash: `$argon2id$v=19$m=65536,p=1,t=3$${'A'.repeat(22)}$${'B'.repeat(43)}`,
    createdAt,
    updatedAt: createdAt,
  };
}

function verificationOutbox(
  suffix: string,
  overrides: Partial<AuthOutboxRecord> = {},
): AuthOutboxRecord {
  const padded = suffix.padEnd(24, 'x');
  const challengeId = `verify_${padded}`;
  return {
    id: `outbox_${padded}`,
    type: 'email_verification',
    userId: 'usr_protected',
    recipientEmail: 'creator@example.com',
    payload: {
      challengeId,
      verificationPath: `/verify-email?challenge=${challengeId}`,
      keyId: 'legacy',
    },
    availableAt: OLD,
    processedAt: null,
    attempts: 0,
    lastError: null,
    terminalAt: null,
    createdAt: OLD,
    ...overrides,
  };
}

function passwordOutbox(
  suffix: string,
  overrides: Partial<SetPasswordOutboxRecord> = {},
): SetPasswordOutboxRecord {
  const padded = suffix.padEnd(24, 'x');
  const challengeId = `reset_${padded}`;
  return {
    id: `outbox_reset_${padded}`,
    type: 'set_password',
    userId: 'usr_protected',
    recipientEmail: 'creator@example.com',
    payload: {
      purpose: 'set_password',
      challengeId,
      resetPath: `/reset-password?challenge=${challengeId}`,
      keyId: 'legacy',
    },
    availableAt: OLD,
    processedAt: null,
    attempts: 0,
    lastError: null,
    terminalAt: null,
    createdAt: OLD,
    ...overrides,
  };
}

function sha256Fixture(value: string): string {
  return value
    .padEnd(64, '0')
    .slice(0, 64)
    .replace(/[^a-f0-9]/gu, 'a');
}
