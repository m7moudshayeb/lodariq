import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type ConsumeEmailVerificationChallengeInput,
  type ConsumeSetPasswordChallengeInput,
  type CreateIdentityAccountInput,
  type RequestSetPasswordChallengeInput,
  type UserRecord,
} from '@lodariq/database';

const NOW = '2026-08-07T12:00:00.000Z';
const OWNED_EMAIL = 'creator@example.com';
const OWNED_EMAIL_LOOKUP_HASH = createHash('sha256').update(OWNED_EMAIL, 'utf8').digest('hex');

describe('@lodariq/database owned-auth repository', () => {
  it('creates an unverified account atomically and consumes its challenge once', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const input = accountInput();
    await expect(repository.createIdentityAccount(input)).resolves.toBe(true);
    await expect(repository.createIdentityAccount(input)).resolves.toBe(false);

    const credential = await repository.findPasswordCredentialByEmail(
      input.credential.emailNormalized,
      input.credential.emailLookupHash,
    );
    expect(credential).not.toBeNull();
    if (!credential) throw new Error('credential fixture was not persisted');
    expect(credential).toMatchObject({
      algorithm: 'argon2id-v1',
      passwordHash: input.credential.passwordHash,
    });
    expect(credential.passwordHash).toMatch(
      /^\$argon2id\$v=19\$m=65536,p=1,t=3\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/u,
    );
    for (const retiredField of [
      'salt',
      'passwordSalt',
      'scryptN',
      'scryptR',
      'scryptP',
      'costN',
      'blockSize',
      'parallelization',
      'keyLength',
    ]) {
      expect(Object.keys(credential)).not.toContain(retiredField);
    }

    await expect(
      repository.resolveEmailVerificationChallenge(
        input.emailVerificationChallenge.id,
        input.emailVerificationChallenge.tokenHash,
        '2026-08-07T12:01:00.000Z',
      ),
    ).resolves.toEqual({
      userId: input.user.id,
      emailNormalized: input.credential.emailNormalized,
    });
    const ownerCredential: ConsumeEmailVerificationChallengeInput['credential'] = {
      algorithm: 'argon2id-v1',
      passwordHash: `$argon2id$v=19$m=65536,p=1,t=3$${'E'.repeat(22)}$${'F'.repeat(43)}`,
      createdAt: '2026-08-07T12:01:00.000Z',
      updatedAt: '2026-08-07T12:01:00.000Z',
    };
    await expect(
      repository.consumeEmailVerificationChallenge({
        challengeId: input.emailVerificationChallenge.id,
        tokenHash: input.emailVerificationChallenge.tokenHash,
        usedAt: '2026-08-07T12:01:00.000Z',
        credential: ownerCredential,
      }),
    ).resolves.toMatchObject({
      id: input.user.id,
      emailVerifiedAt: '2026-08-07T12:01:00.000Z',
    });
    await expect(
      repository.findPasswordCredentialByEmail(
        input.credential.emailNormalized,
        input.credential.emailLookupHash,
      ),
    ).resolves.toMatchObject({
      createdAt: input.credential.createdAt,
      passwordHash: ownerCredential.passwordHash,
    });
    await expect(
      repository.consumeEmailVerificationChallenge({
        challengeId: input.emailVerificationChallenge.id,
        tokenHash: input.emailVerificationChallenge.tokenHash,
        usedAt: '2026-08-07T12:02:00.000Z',
        credential: ownerCredential,
      }),
    ).resolves.toBeNull();
  });

  it('rejects expired and concurrently rotated source sessions', async () => {
    const input = accountInput();
    input.user.emailVerifiedAt = NOW;
    const repository = createInMemoryControlPlaneRepository();
    await repository.createIdentityAccount(input);

    const expired = sessionRecord('expired', input.user.id, input.workspace.id, {
      createdAt: '2026-08-07T10:00:00.000Z',
      idleExpiresAt: '2026-08-07T11:00:00.000Z',
      absoluteExpiresAt: '2026-08-08T10:00:00.000Z',
    });
    await repository.createAuthSession(expired);
    await expect(
      repository.rotateAuthSession({
        currentTokenHash: expired.tokenHash,
        nextSession: sessionRecord('expired-next', input.user.id, input.workspace.id),
      }),
    ).resolves.toBeNull();

    const current = sessionRecord('current', input.user.id, input.workspace.id);
    await repository.createAuthSession(current);
    const firstRotation = repository.rotateAuthSession({
      currentTokenHash: current.tokenHash,
      nextSession: sessionRecord('next-a', input.user.id, input.workspace.id),
    });
    const secondRotation = repository.rotateAuthSession({
      currentTokenHash: current.tokenHash,
      nextSession: sessionRecord('next-b', input.user.id, input.workspace.id),
    });
    const results = await Promise.all([firstRotation, secondRotation]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('bounds rate-limit attempts and prunes stale buckets in capped batches', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const input = {
      bucketHash: 'a'.repeat(64),
      scope: 'sign-in' as const,
      now: '2026-08-01T00:00:00.000Z',
      windowMs: 60_000,
      maxAttempts: 2,
      blockMs: 60_000,
    };
    await expect(repository.consumeAuthRateLimit(input)).resolves.toMatchObject({ allowed: true });
    await expect(repository.consumeAuthRateLimit(input)).resolves.toMatchObject({ allowed: true });
    await expect(repository.consumeAuthRateLimit(input)).resolves.toMatchObject({ allowed: false });
    await expect(repository.pruneAuthRateLimits('2026-08-02T00:00:00.000Z', 1)).resolves.toBe(1);
  });

  it('fails closed for zero or duplicate exact normalized-email recovery matches', async () => {
    const duplicateUsers: UserRecord[] = [
      legacyUser('usr_duplicate_a', 'Creator@Example.com'),
      legacyUser('usr_duplicate_b', ' creator@example.com '),
    ];
    const duplicateRepository = createInMemoryControlPlaneRepository({
      users: duplicateUsers,
    });
    const duplicateRequest = setPasswordRequestInput('duplicate');
    await expect(duplicateRepository.requestSetPasswordChallenge(duplicateRequest)).resolves.toBe(
      false,
    );
    await expect(
      duplicateRepository.resolveSetPasswordChallenge(
        duplicateRequest.challenge.id,
        duplicateRequest.challenge.tokenHash,
        '2026-08-07T12:01:00.000Z',
      ),
    ).resolves.toBeNull();

    const missingRepository = createInMemoryControlPlaneRepository();
    await expect(
      missingRepository.requestSetPasswordChallenge(setPasswordRequestInput('missing')),
    ).resolves.toBe(false);
  });

  it('does not create a second owned identity for an existing normalized legacy email', async () => {
    const repository = createInMemoryControlPlaneRepository({
      users: [legacyUser('usr_existing_legacy', ' Creator@Example.com ')],
    });

    await expect(repository.createIdentityAccount(accountInput())).resolves.toBe(false);
  });

  it('replaces prior reset challenges and resolves only a live reset-purpose token', async () => {
    const account = accountInput();
    const repository = createInMemoryControlPlaneRepository();
    await repository.createIdentityAccount(account);
    const first = setPasswordRequestInput('first');
    const second = setPasswordRequestInput('second', '2026-08-07T12:02:00.000Z');

    await expect(repository.requestSetPasswordChallenge(first)).resolves.toBe(true);
    await expect(repository.requestSetPasswordChallenge(second)).resolves.toBe(true);
    await expect(
      repository.resolveSetPasswordChallenge(
        first.challenge.id,
        first.challenge.tokenHash,
        '2026-08-07T12:03:00.000Z',
      ),
    ).resolves.toBeNull();
    await expect(
      repository.resolveSetPasswordChallenge(
        second.challenge.id,
        'f'.repeat(64),
        '2026-08-07T12:03:00.000Z',
      ),
    ).resolves.toBeNull();
    await expect(
      repository.resolveSetPasswordChallenge(
        second.challenge.id,
        second.challenge.tokenHash,
        '2026-08-07T12:03:00.000Z',
      ),
    ).resolves.toEqual({
      userId: account.user.id,
      emailNormalized: 'creator@example.com',
    });
  });

  it('atomically sets the credential, verifies the user, revokes sessions, and invalidates challenges', async () => {
    const account = accountInput();
    const repository = createInMemoryControlPlaneRepository();
    await repository.createIdentityAccount(account);
    const firstSession = sessionRecord('alpha', account.user.id, account.workspace.id);
    const secondSession = sessionRecord('beta', account.user.id, account.workspace.id);
    await repository.createAuthSession(firstSession);
    await repository.createAuthSession(secondSession);

    const request = setPasswordRequestInput('complete');
    await repository.requestSetPasswordChallenge(request);
    const consumeInput: ConsumeSetPasswordChallengeInput = {
      challengeId: request.challenge.id,
      tokenHash: request.challenge.tokenHash,
      usedAt: '2026-08-07T12:05:00.000Z',
      credential: {
        algorithm: 'argon2id-v1',
        passwordHash: `$argon2id$v=19$m=65536,p=1,t=3$${'C'.repeat(22)}$${'D'.repeat(43)}`,
        createdAt: '2026-08-07T12:05:00.000Z',
        updatedAt: '2026-08-07T12:05:00.000Z',
      },
    };

    await expect(repository.consumeSetPasswordChallenge(consumeInput)).resolves.toMatchObject({
      id: account.user.id,
      emailVerifiedAt: consumeInput.usedAt,
    });
    await expect(
      repository.findPasswordCredentialByEmail(request.emailNormalized, request.emailLookupHash),
    ).resolves.toMatchObject({
      userId: account.user.id,
      passwordHash: consumeInput.credential.passwordHash,
    });
    await expect(
      repository.resolveAuthSession(firstSession.tokenHash, consumeInput.usedAt),
    ).resolves.toBeNull();
    await expect(
      repository.resolveAuthSession(secondSession.tokenHash, consumeInput.usedAt),
    ).resolves.toBeNull();
    await expect(
      repository.resolveEmailVerificationChallenge(
        account.emailVerificationChallenge.id,
        account.emailVerificationChallenge.tokenHash,
        '2026-08-07T12:06:00.000Z',
      ),
    ).resolves.toBeNull();
    await expect(
      repository.createCredentialBoundAuthSession({
        session: sessionRecord('stale-password', account.user.id, account.workspace.id),
        expectedPasswordHash: account.credential.passwordHash,
      }),
    ).resolves.toBeNull();
    await expect(
      repository.createCredentialBoundAuthSession({
        session: sessionRecord('current-password', account.user.id, account.workspace.id),
        expectedPasswordHash: consumeInput.credential.passwordHash,
      }),
    ).resolves.toMatchObject({ userId: account.user.id });
    await expect(repository.consumeSetPasswordChallenge(consumeInput)).resolves.toBeNull();
  });
});

function legacyUser(id: string, email: string): UserRecord {
  return {
    id,
    legacyIdentityId: `legacy_${id}`,
    email,
    name: null,
    emailVerifiedAt: NOW,
    createdAt: NOW,
  };
}

function setPasswordRequestInput(
  suffix: string,
  createdAt = NOW,
): RequestSetPasswordChallengeInput {
  const paddedSuffix = suffix.padEnd(24, 'x');
  const challengeId = `reset_${paddedSuffix}`;
  const tokenByte = suffix.charCodeAt(0).toString(16).padStart(2, '0');
  return {
    emailNormalized: OWNED_EMAIL,
    emailLookupHash: OWNED_EMAIL_LOOKUP_HASH,
    challenge: {
      id: challengeId,
      tokenHash: tokenByte.repeat(32),
      emailNormalized: OWNED_EMAIL,
      emailLookupHash: OWNED_EMAIL_LOOKUP_HASH,
      expiresAt: '2026-08-07T13:00:00.000Z',
      usedAt: null,
      createdAt,
    },
    outboxMessage: {
      id: `outbox_${paddedSuffix}`,
      type: 'set_password',
      payload: {
        purpose: 'set_password',
        challengeId,
        resetPath: `/set-password?challenge=${challengeId}`,
      },
      availableAt: createdAt,
      processedAt: null,
      attempts: 0,
      lastError: null,
      createdAt,
    },
  };
}

function accountInput(): CreateIdentityAccountInput {
  const userId = 'usr_owned_test';
  const workspaceId = 'wk_owned_test';
  const challengeId = 'verify_abcdefghijklmnopqrstuvwxyz';
  return {
    user: {
      id: userId,
      legacyIdentityId: null,
      email: OWNED_EMAIL,
      name: 'Creator',
      emailVerifiedAt: null,
      createdAt: NOW,
    },
    credential: {
      userId,
      emailNormalized: OWNED_EMAIL,
      emailLookupHash: OWNED_EMAIL_LOOKUP_HASH,
      algorithm: 'argon2id-v1',
      passwordHash: `$argon2id$v=19$m=65536,p=1,t=3$${'A'.repeat(22)}$${'B'.repeat(43)}`,
      createdAt: NOW,
      updatedAt: NOW,
    },
    workspace: { id: workspaceId, name: 'Owned', createdAt: NOW, updatedAt: NOW },
    membership: { workspaceId, userId, role: 'owner', createdAt: NOW },
    environments: [],
    emailVerificationChallenge: {
      id: challengeId,
      userId,
      tokenHash: '2'.repeat(64),
      createdAt: NOW,
      expiresAt: '2026-08-08T12:00:00.000Z',
      usedAt: null,
    },
    outboxMessage: {
      id: 'outbox_abcdefghijklmnopqrstuvwxyz',
      type: 'email_verification',
      userId,
      recipientEmail: OWNED_EMAIL,
      payload: { challengeId, verificationPath: `/verify-email?challenge=${challengeId}` },
      availableAt: NOW,
      processedAt: null,
      attempts: 0,
      lastError: null,
      createdAt: NOW,
    },
  };
}

function sessionRecord(
  suffix: string,
  userId: string,
  workspaceId: string,
  overrides: Partial<AuthSessionRecord> = {},
): AuthSessionRecord {
  return {
    id: `authsess_${suffix.padEnd(24, 'x')}`,
    userId,
    tokenHash: suffix.charCodeAt(0).toString(16).padStart(2, '0').repeat(32),
    activeWorkspaceId: workspaceId,
    createdAt: NOW,
    lastSeenAt: NOW,
    idleExpiresAt: '2026-08-08T12:00:00.000Z',
    absoluteExpiresAt: '2026-09-01T12:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}
