import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type ConsumeEmailVerificationChallengeInput,
  type ConsumeSetPasswordChallengeInput,
  type CreateIdentityAccountInput,
  type RegisterIdentityAccountInput,
  type RequestSetPasswordChallengeInput,
  type RequestEmailVerificationChallengeInput,
  type UserRecord,
} from '@lodariq/database';

const NOW = '2026-08-07T12:00:00.000Z';
const OWNED_EMAIL = 'creator@example.com';
const OWNED_EMAIL_LOOKUP_HASH = createHash('sha256').update(OWNED_EMAIL, 'utf8').digest('hex');

describe('@lodariq/database owned-auth repository', () => {
  it('registers identity before tenant creation and resumes onboarding idempotently', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const input = registrationInput();
    await expect(repository.registerIdentityAccount(input)).resolves.toBe(true);
    await expect(repository.listIdentityWorkspaces(input.user.id)).resolves.toEqual([]);
    await expect(repository.getCurrentIdentityOnboarding(input.user.id)).resolves.toMatchObject({
      id: input.onboarding.id,
      status: 'pending_identity',
      targetWorkspaceId: input.onboarding.targetWorkspaceId,
    });

    const credential = credentialMaterial('2026-08-07T12:01:00.000Z');
    await expect(
      repository.consumeEmailVerificationChallenge({
        challengeId: input.emailVerificationChallenge.id,
        tokenHash: input.emailVerificationChallenge.tokenHash,
        usedAt: '2026-08-07T12:01:00.000Z',
        credential,
      }),
    ).resolves.toMatchObject({ id: input.user.id });
    await expect(repository.getCurrentIdentityOnboarding(input.user.id)).resolves.toMatchObject({
      status: 'pending_destination',
      version: 2,
    });

    const completionInput = {
      onboardingId: input.onboarding.id,
      userId: input.user.id,
      targetWorkspaceId: input.onboarding.targetWorkspaceId ?? '',
      environments: accountInput().environments,
      completedAt: '2026-08-15T12:02:00.000Z',
    };
    const completed = await repository.completeIdentityOnboarding(completionInput);
    expect(completed).toMatchObject({
      onboarding: { status: 'completed', version: 3 },
      workspace: { id: input.onboarding.targetWorkspaceId, role: 'owner' },
    });
    await expect(repository.completeIdentityOnboarding(completionInput)).resolves.toEqual(
      completed,
    );
    await expect(repository.listIdentityWorkspaces(input.user.id)).resolves.toEqual([
      expect.objectContaining({ id: input.onboarding.targetWorkspaceId, role: 'owner' }),
    ]);
  });

  it('rejects cross-user registration records without partial persistence', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const input = registrationInput();
    input.outboxMessage.userId = 'usr_attacker';

    await expect(repository.registerIdentityAccount(input)).resolves.toBe(false);
    await expect(repository.getIdentityUser(input.user.id)).resolves.toBeNull();
    await expect(repository.getCurrentIdentityOnboarding(input.user.id)).resolves.toBeNull();
    await expect(repository.listIdentityWorkspaces(input.user.id)).resolves.toEqual([]);
  });

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

  it('normalizes usernames, authenticates by either identifier, and rate-limits changes', async () => {
    const input = accountInput();
    input.user.emailVerifiedAt = NOW;
    input.userEmail.verifiedAt = NOW;
    const repository = createInMemoryControlPlaneRepository();
    await repository.createIdentityAccount(input);

    const first = await repository.setAuthUsername({
      userId: input.user.id,
      normalizedUsername: 'creator.handle',
      displayUsername: 'Creator.Handle',
      expectedPasswordHash: input.credential.passwordHash,
      changedAt: NOW,
      minimumPreviousChangeAt: '2026-07-08T12:00:00.000Z',
      usernameId: 'uname_creator_handle_xxxxxxxxxxxxxxxxxxxx',
    });
    expect(first).toMatchObject({ status: 'updated' });
    await expect(
      repository.findPasswordAuthenticationByIdentifier(
        { kind: 'username', value: 'creator.handle' },
        null,
      ),
    ).resolves.toMatchObject({
      credential: { userId: input.user.id },
      identity: { kind: 'password', issuer: 'https://lodariq.io' },
    });
    await expect(
      repository.findPasswordAuthenticationByIdentifier(
        { kind: 'email', value: OWNED_EMAIL },
        OWNED_EMAIL_LOOKUP_HASH,
      ),
    ).resolves.toMatchObject({ credential: { userId: input.user.id } });

    await expect(
      repository.setAuthUsername({
        userId: input.user.id,
        normalizedUsername: 'new.handle',
        displayUsername: 'New.Handle',
        expectedPasswordHash: input.credential.passwordHash,
        changedAt: '2026-08-08T12:00:00.000Z',
        minimumPreviousChangeAt: '2026-07-09T12:00:00.000Z',
        usernameId: 'uname_ignored_change_xxxxxxxxxxxxxxxxxxxx',
      }),
    ).resolves.toEqual({ status: 'rate_limited' });
    await expect(
      repository.setAuthUsername({
        userId: input.user.id,
        normalizedUsername: 'admin',
        displayUsername: 'admin',
        expectedPasswordHash: input.credential.passwordHash,
        changedAt: '2026-09-08T12:00:00.000Z',
        minimumPreviousChangeAt: '2026-08-09T12:00:00.000Z',
        usernameId: 'uname_reserved_name_xxxxxxxxxxxxxxxxxxxx',
      }),
    ).resolves.toEqual({ status: 'invalid_input' });
  });

  it('keeps multiple authenticators on one user and rejects provider-subject collisions', async () => {
    const input = accountInput();
    const repository = createInMemoryControlPlaneRepository();
    await repository.createIdentityAccount(input);
    const passkey = {
      id: 'ident_passkey_owned_xxxxxxxxxxxxx',
      userId: input.user.id,
      kind: 'passkey' as const,
      issuer: 'https://lodariq.io',
      subject: 'credential:passkey-owned-test',
      providerTenantId: null,
      createdAt: NOW,
      lastAuthenticatedAt: null,
    };
    const oidc = {
      id: 'ident_oidc_owned_xxxxxxxxxxxxxxxx',
      userId: input.user.id,
      kind: 'oidc' as const,
      issuer: 'https://identity.example.test',
      subject: 'stable-subject-123',
      providerTenantId: 'tenant-123',
      createdAt: NOW,
      lastAuthenticatedAt: null,
    };
    await expect(repository.createAuthIdentity(passkey)).resolves.toBe(true);
    await expect(repository.createAuthIdentity(oidc)).resolves.toBe(true);
    await expect(
      repository.findAuthIdentityByProviderSubject(oidc.issuer, oidc.subject),
    ).resolves.toEqual(oidc);
    await expect(
      repository.createAuthIdentity({
        ...oidc,
        id: 'ident_oidc_collision_xxxxxxxxxxxxx',
        providerTenantId: 'another-tenant',
      }),
    ).resolves.toBe(false);
    await expect(repository.listAuthIdentities(input.user.id)).resolves.toHaveLength(3);
  });

  it('audits link and unlink decisions and refuses removal of the final usable method', async () => {
    const input = accountInput();
    input.user.emailVerifiedAt = NOW;
    input.userEmail.verifiedAt = NOW;
    const repository = createInMemoryControlPlaneRepository();
    await repository.createIdentityAccount(input);
    const oidc = {
      id: 'ident_linked_oidc_xxxxxxxxxxxxxxx',
      userId: input.user.id,
      kind: 'oidc' as const,
      issuer: 'https://identity.example.test/link',
      subject: 'stable-link-subject',
      providerTenantId: 'tenant-link',
      createdAt: NOW,
      lastAuthenticatedAt: null,
    };
    await expect(
      repository.linkAuthIdentity({
        identity: oidc,
        actorUserId: input.user.id,
        authorization: 'authenticated_session',
        eventId: 'authevt_link_identity_xxxxxxxxxxxx',
        occurredAt: NOW,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.unlinkAuthIdentity({
        userId: input.user.id,
        identityId: oidc.id,
        actorUserId: input.user.id,
        authorization: 'authenticated_session',
        eventId: 'authevt_unlink_identity_xxxxxxxxxx',
        occurredAt: '2026-08-07T12:01:00.000Z',
      }),
    ).resolves.toBe('unlinked');
    await expect(
      repository.unlinkAuthIdentity({
        userId: input.user.id,
        identityId: input.passwordIdentity.id,
        actorUserId: input.user.id,
        authorization: 'strong_recovery',
        eventId: 'authevt_final_method_xxxxxxxxxxxxx',
        occurredAt: '2026-08-07T12:02:00.000Z',
      }),
    ).resolves.toBe('final_method');
    await expect(repository.listAuthIdentities(input.user.id)).resolves.toHaveLength(1);
    await expect(repository.listAuthSecurityEvents(input.user.id)).resolves.toMatchObject([
      { eventType: 'identity_linked' },
      { eventType: 'identity_unlinked' },
      { eventType: 'identity_unlink_rejected_final_method' },
    ]);
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
    await expect(
      duplicateRepository.requestSetPasswordChallenge(duplicateRequest),
    ).resolves.toEqual({ status: 'ambiguous_match' });
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
    ).resolves.toEqual({ status: 'no_match' });
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

    await expect(repository.requestSetPasswordChallenge(first)).resolves.toEqual({
      status: 'queued',
    });
    await expect(repository.requestSetPasswordChallenge(second)).resolves.toEqual({
      status: 'queued',
    });
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

  it('enforces verification resend cooldown and atomically supersedes the active challenge', async () => {
    const account = accountInput();
    const repository = createInMemoryControlPlaneRepository();
    await repository.createIdentityAccount(account);

    await expect(
      repository.requestEmailVerificationChallenge(
        verificationRequestInput('cooldown', '2026-08-07T12:00:10.000Z'),
      ),
    ).resolves.toEqual({ status: 'cooldown' });

    const replacement = verificationRequestInput('replacement', '2026-08-07T12:00:31.000Z');
    await expect(repository.requestEmailVerificationChallenge(replacement)).resolves.toEqual({
      status: 'queued',
    });
    await expect(
      repository.resolveEmailVerificationChallenge(
        account.emailVerificationChallenge.id,
        account.emailVerificationChallenge.tokenHash,
        '2026-08-07T12:00:32.000Z',
      ),
    ).resolves.toBeNull();
    await expect(
      repository.resolveEmailVerificationChallenge(
        replacement.challenge.id,
        replacement.challenge.tokenHash,
        '2026-08-07T12:00:32.000Z',
      ),
    ).resolves.toEqual({
      userId: account.user.id,
      emailNormalized: OWNED_EMAIL,
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
      passwordIdentity: {
        id: 'ident_recovery_complete_xxxxxxxxxxxxxxxxxxxx',
        userId: account.user.id,
        kind: 'password',
        issuer: 'https://lodariq.io',
        subject: `user:${account.user.id}`,
        providerTenantId: null,
        createdAt: '2026-08-07T12:05:00.000Z',
        lastAuthenticatedAt: null,
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
      keyId: 'legacy',
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
        keyId: 'legacy',
      },
      availableAt: createdAt,
      processedAt: null,
      attempts: 0,
      lastError: null,
      createdAt,
    },
  };
}

function verificationRequestInput(
  suffix: string,
  createdAt: string,
): RequestEmailVerificationChallengeInput {
  const paddedSuffix = suffix.padEnd(24, 'x');
  const challengeId = `verify_${paddedSuffix}`;
  return {
    emailNormalized: OWNED_EMAIL,
    emailLookupHash: OWNED_EMAIL_LOOKUP_HASH,
    now: createdAt,
    cooldownMs: 30_000,
    challenge: {
      id: challengeId,
      keyId: 'legacy',
      tokenHash: createHash('sha256').update(`verify:${suffix}`).digest('hex'),
      expiresAt: new Date(Date.parse(createdAt) + 24 * 60 * 60_000).toISOString(),
      usedAt: null,
      createdAt,
    },
    outboxMessage: {
      id: `outbox_verify_${paddedSuffix}`,
      type: 'email_verification',
      payload: {
        challengeId,
        verificationPath: `/verify-email?challenge=${challengeId}`,
        keyId: 'legacy',
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
    userEmail: {
      id: 'email_owned_test_xxxxxxxxxxxxxxxxxxxx',
      userId,
      normalizedEmail: OWNED_EMAIL,
      isPrimary: true,
      verifiedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    passwordIdentity: {
      id: 'ident_owned_test_xxxxxxxxxxxxxxxxxxxx',
      userId,
      kind: 'password',
      issuer: 'https://lodariq.io',
      subject: `user:${userId}`,
      providerTenantId: null,
      createdAt: NOW,
      lastAuthenticatedAt: null,
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
    environments: [
      {
        id: 'env_owned_development',
        workspaceId,
        kind: 'development',
        name: 'Development',
        originAllowlist: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'env_owned_staging',
        workspaceId,
        kind: 'staging',
        name: 'Staging',
        originAllowlist: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'env_owned_production',
        workspaceId,
        kind: 'production',
        name: 'Production',
        originAllowlist: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    emailVerificationChallenge: {
      id: challengeId,
      userId,
      keyId: 'legacy',
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
      payload: {
        challengeId,
        verificationPath: `/verify-email?challenge=${challengeId}`,
        keyId: 'legacy',
      },
      availableAt: NOW,
      processedAt: null,
      attempts: 0,
      lastError: null,
      createdAt: NOW,
    },
  };
}

function registrationInput(): RegisterIdentityAccountInput {
  const account = accountInput();
  return {
    user: account.user,
    userEmail: account.userEmail,
    passwordIdentity: account.passwordIdentity,
    credential: account.credential,
    onboarding: {
      id: 'onboard_owned_test_xxxxxxxxxxxxxxxxxxxx',
      userId: account.user.id,
      intent: 'create_workspace',
      status: 'pending_identity',
      targetWorkspaceId: account.workspace.id,
      targetWorkspaceName: account.workspace.name,
      invitationId: null,
      requestedWorkspaceId: null,
      completedWorkspaceId: null,
      version: 1,
      expiresAt: '2026-08-14T12:00:00.000Z',
      createdAt: NOW,
      updatedAt: NOW,
    },
    emailVerificationChallenge: account.emailVerificationChallenge,
    outboxMessage: account.outboxMessage,
  };
}

function credentialMaterial(timestamp: string) {
  return {
    algorithm: 'argon2id-v1' as const,
    passwordHash: `$argon2id$v=19$m=65536,p=1,t=3$${'G'.repeat(22)}$${'H'.repeat(43)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sessionRecord(
  suffix: string,
  userId: string,
  workspaceId: string,
  overrides: Partial<AuthSessionRecord> = {},
): AuthSessionRecord {
  const createdAt = overrides.createdAt ?? NOW;
  return {
    id: `authsess_${suffix.padEnd(24, 'x')}`,
    userId,
    tokenHash: suffix.charCodeAt(0).toString(16).padStart(2, '0').repeat(32),
    activeWorkspaceId: workspaceId,
    identityId: 'ident_owned_test_xxxxxxxxxxxxxxxxxxxx',
    authenticationMethod: 'password',
    assuranceLevel: 'aal1',
    authenticatedAt: overrides.authenticatedAt ?? createdAt,
    durationPolicy: 'standard',
    createdAt,
    lastSeenAt: overrides.lastSeenAt ?? createdAt,
    idleExpiresAt: '2026-08-08T12:00:00.000Z',
    absoluteExpiresAt: '2026-09-01T12:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}
