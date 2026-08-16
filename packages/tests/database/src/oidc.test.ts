import { describe, expect, it } from 'vitest';
import {
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type OidcAuthorizationAttemptRecord,
} from '@lodariq/database';

const NOW = '2026-08-15T12:00:00.000Z';
const USER_ID = 'usr_oidc_repository';
const IDENTITY_ID = `ident_oidc_repository_${'i'.repeat(20)}`;

describe('@lodariq/database OIDC repository', () => {
  it('consumes a state-bound authorization attempt exactly once', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const attempt = authorizationAttempt();
    await expect(repository.createOidcAuthorizationAttempt(attempt)).resolves.toBe(true);
    await expect(repository.getOidcAuthorizationAttempt(attempt.stateHash, NOW)).resolves.toEqual(
      attempt,
    );
    await expect(
      repository.consumeOidcAuthorizationAttempt(attempt.id, attempt.stateHash, NOW),
    ).resolves.toBe(true);
    await expect(
      repository.consumeOidcAuthorizationAttempt(attempt.id, attempt.stateHash, NOW),
    ).resolves.toBe(false);
    await expect(repository.getOidcAuthorizationAttempt(attempt.stateHash, NOW)).resolves.toBeNull();
  });

  it('creates a session only for the exact active issuer and subject', async () => {
    const repository = createInMemoryControlPlaneRepository({
      users: [
        {
          id: USER_ID,
          legacyIdentityId: null,
          email: 'oidc-repository@example.com',
          name: null,
          emailVerifiedAt: NOW,
          createdAt: NOW,
        },
      ],
      authIdentities: [
        {
          id: IDENTITY_ID,
          userId: USER_ID,
          kind: 'oidc',
          issuer: 'https://accounts.google.com',
          subject: 'stable-subject',
          providerTenantId: 'google',
          createdAt: NOW,
          lastAuthenticatedAt: null,
        },
      ],
    });
    await expect(
      repository.createExternalIdentitySession({
        identityId: IDENTITY_ID,
        issuer: 'https://attacker.example',
        subject: 'stable-subject',
        authenticatedAt: NOW,
        session: session('wrong-issuer'),
      }),
    ).resolves.toBeNull();
    await expect(
      repository.createExternalIdentitySession({
        identityId: IDENTITY_ID,
        issuer: 'https://accounts.google.com',
        subject: 'stable-subject',
        authenticatedAt: NOW,
        session: session('exact-proof'),
      }),
    ).resolves.toMatchObject({
      userId: USER_ID,
      identityId: IDENTITY_ID,
      authenticationMethod: 'oidc',
    });
  });
});

function authorizationAttempt(): OidcAuthorizationAttemptRecord {
  return {
    id: `oidcattempt_${'a'.repeat(24)}`,
    providerId: 'google',
    action: 'sign_in',
    userId: null,
    stateHash: 'b'.repeat(64),
    encryptedVerifier: 'c'.repeat(64),
    nonceHash: 'd'.repeat(64),
    returnTo: '/',
    workspaceName: null,
    durationPolicy: 'standard',
    expiresAt: '2026-08-15T12:10:00.000Z',
    consumedAt: null,
    createdAt: NOW,
  };
}

function session(suffix: string): AuthSessionRecord {
  return {
    id: `authsess_${suffix.padEnd(20, 's')}`,
    userId: USER_ID,
    tokenHash: suffix.charCodeAt(0).toString(16).padEnd(64, '0'),
    activeWorkspaceId: null,
    identityId: IDENTITY_ID,
    authenticationMethod: 'oidc',
    assuranceLevel: 'aal1',
    authenticatedAt: NOW,
    durationPolicy: 'standard',
    deviceLabel: 'Test browser',
    createdAt: NOW,
    lastSeenAt: NOW,
    idleExpiresAt: '2026-08-15T13:00:00.000Z',
    absoluteExpiresAt: '2026-08-15T20:00:00.000Z',
    revokedAt: null,
  };
}
