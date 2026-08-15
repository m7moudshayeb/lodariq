import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type PasskeyCredentialRecord,
} from '@lodariq/database';

const NOW = '2026-08-15T12:00:00.000Z';
const USER_ID = 'usr_assurance_repository';
const PASSWORD_IDENTITY_ID = `ident_password_${'p'.repeat(20)}`;
const PASSKEY_IDENTITY_ID = `ident_passkey_${'k'.repeat(20)}`;
const CREDENTIAL_ID = 'credential_assurance_repository_123456';
const CHALLENGE_ID = `authchal_${'c'.repeat(24)}`;
const CHALLENGE_HASH = 'a'.repeat(64);

describe('@lodariq/database assurance repository', () => {
  it('atomically advances a passkey counter and rejects challenge and counter replay', async () => {
    const repository = createRepository();
    const first = await repository.completePasskeyAuthentication({
      challengeId: CHALLENGE_ID,
      challengeHash: CHALLENGE_HASH,
      credentialId: CREDENTIAL_ID,
      expectedCounter: 7,
      nextCounter: 8,
      authenticatedAt: NOW,
      nextSession: session('first'),
      currentSessionTokenHash: null,
      event: event('first'),
    });
    expect(first).toMatchObject({ authenticationMethod: 'passkey', assuranceLevel: 'aal2' });
    await expect(repository.findPasskeyCredential(CREDENTIAL_ID)).resolves.toMatchObject({
      counter: 8,
      lastUsedAt: NOW,
    });

    await expect(
      repository.completePasskeyAuthentication({
        challengeId: CHALLENGE_ID,
        challengeHash: CHALLENGE_HASH,
        credentialId: CREDENTIAL_ID,
        expectedCounter: 7,
        nextCounter: 8,
        authenticatedAt: NOW,
        nextSession: session('challenge-replay'),
        currentSessionTokenHash: null,
        event: event('challenge-replay'),
      }),
    ).resolves.toBeNull();
    await expect(repository.findPasskeyCredential(CREDENTIAL_ID)).resolves.toMatchObject({
      counter: 8,
    });
    await expect(repository.listAccountSecurityEvents(USER_ID)).resolves.toHaveLength(1);
  });

  it('removes passkey material when the backing identity is unlinked', async () => {
    const repository = createRepository();
    await expect(
      repository.unlinkAuthIdentity({
        userId: USER_ID,
        identityId: PASSKEY_IDENTITY_ID,
        actorUserId: USER_ID,
        authorization: 'authenticated_session',
        eventId: `authevt_${'u'.repeat(24)}`,
        occurredAt: NOW,
      }),
    ).resolves.toBe('unlinked');
    await expect(repository.findPasskeyCredential(CREDENTIAL_ID)).resolves.toBeNull();
    await expect(repository.listPasskeyCredentials(USER_ID)).resolves.toEqual([]);
  });
});

function createRepository() {
  const passkey: PasskeyCredentialRecord = {
    id: `passkey_${'q'.repeat(24)}`,
    userId: USER_ID,
    identityId: PASSKEY_IDENTITY_ID,
    credentialId: CREDENTIAL_ID,
    publicKey: Uint8Array.from({ length: 32 }, (_, index) => index),
    counter: 7,
    transports: ['internal'],
    deviceType: 'multiDevice',
    backedUp: true,
    aaguid: '00000000-0000-0000-0000-000000000000',
    name: 'Synced passkey',
    createdAt: NOW,
    lastUsedAt: null,
  };
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: USER_ID,
        legacyIdentityId: null,
        email: 'repository-assurance@example.com',
        name: null,
        emailVerifiedAt: NOW,
        createdAt: NOW,
      },
    ],
    authIdentities: [
      {
        id: PASSWORD_IDENTITY_ID,
        userId: USER_ID,
        kind: 'password',
        issuer: 'https://lodariq.io',
        subject: `user:${USER_ID}`,
        providerTenantId: null,
        createdAt: NOW,
        lastAuthenticatedAt: NOW,
      },
      {
        id: PASSKEY_IDENTITY_ID,
        userId: USER_ID,
        kind: 'passkey',
        issuer: 'https://lodariq.io',
        subject: `passkey:${CREDENTIAL_ID}`,
        providerTenantId: null,
        createdAt: NOW,
        lastAuthenticatedAt: NOW,
      },
    ],
    webAuthnChallenges: [
      {
        id: CHALLENGE_ID,
        purpose: 'passkey_authentication',
        userId: USER_ID,
        challengeHash: CHALLENGE_HASH,
        rpId: 'lodariq.io',
        origin: 'https://app.lodariq.io',
        expiresAt: '2026-08-15T12:05:00.000Z',
        consumedAt: null,
        createdAt: '2026-08-15T11:59:00.000Z',
      },
    ],
    passkeyCredentials: [passkey],
  });
}

function session(suffix: string): AuthSessionRecord {
  return {
    id: `authsess_${suffix.replace(/[^a-z]/gu, '')}_${'s'.repeat(20)}`,
    userId: USER_ID,
    tokenHash: createHash('sha256').update(`token:${suffix}`).digest('hex'),
    activeWorkspaceId: null,
    identityId: PASSKEY_IDENTITY_ID,
    authenticationMethod: 'passkey',
    assuranceLevel: 'aal2',
    authenticatedAt: NOW,
    durationPolicy: 'standard',
    deviceLabel: 'Test authenticator',
    createdAt: NOW,
    lastSeenAt: NOW,
    idleExpiresAt: '2026-08-15T18:00:00.000Z',
    absoluteExpiresAt: '2026-08-16T12:00:00.000Z',
    revokedAt: null,
  };
}

function event(suffix: string) {
  return {
    id: `acctevt_${suffix.replace(/[^a-z]/gu, '')}_${'e'.repeat(20)}`,
    userId: USER_ID,
    actorUserId: USER_ID,
    eventType: 'passkey_authenticated' as const,
    targetId: CREDENTIAL_ID,
    occurredAt: NOW,
  };
}
