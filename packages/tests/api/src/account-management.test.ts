import { beforeAll, describe, expect, it } from 'vitest';
import {
  createAccountEmailChangeToken,
  createApiApp,
  createLodariqAuthProvider,
  hashAccountEmailChangeToken,
  hashAuthSessionToken,
  hashOwnedPassword,
} from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type InMemoryControlPlaneSeed,
  type PasswordCredentialRecord,
} from '@lodariq/database';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const USER_ID = 'usr_account_management';
const WORKSPACE_ID = 'wk_account_management';
const PASSWORD = 'correct-current-password';
const NEW_PASSWORD = 'a-new-strong-password';
const EMAIL_SECRET = 'account-email-test-secret-that-is-long-enough';
let credential: PasswordCredentialRecord;

beforeAll(async () => {
  credential = await hashOwnedPassword(USER_ID, 'member@example.com', PASSWORD, NOW);
});

describe('@lodariq/api account management', () => {
  it('changes a password atomically, revokes every old session, and requires recent auth', async () => {
    const currentToken = 'lq_sess_account_current';
    const otherToken = 'lq_sess_account_other';
    const repository = accountRepository({
      authSessions: [session(currentToken), session(otherToken, 'Other browser')],
    });
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(NOW),
    });

    const changed = await app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers: { authorization: `Bearer ${currentToken}` },
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(changed.statusCode).toBe(204);
    const nextToken = cookieToken(changed.headers['set-cookie']);
    expect(nextToken).toMatch(/^lq_sess_/u);

    for (const revokedToken of [currentToken, otherToken]) {
      const rejected = await app.inject({
        method: 'GET',
        url: '/v1/auth/session',
        headers: { authorization: `Bearer ${revokedToken}` },
      });
      expect(rejected.statusCode).toBe(401);
    }
    const active = await app.inject({
      method: 'GET',
      url: '/v1/auth/sessions',
      headers: { authorization: `Bearer ${nextToken}` },
    });
    expect(active.statusCode).toBe(200);
    expect(active.json<{ sessions: unknown[] }>().sessions).toHaveLength(1);
    await app.close();

    const staleToken = 'lq_sess_account_stale';
    const staleRepository = accountRepository({
      authSessions: [
        session(staleToken, 'Stale browser', new Date(NOW.getTime() - 16 * 60_000).toISOString()),
      ],
    });
    const staleApp = createApiApp({
      repository: staleRepository,
      authProvider: createLodariqAuthProvider(staleRepository),
      authClock: () => new Date(NOW),
    });
    const stale = await staleApp.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers: { authorization: `Bearer ${staleToken}` },
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(stale.statusCode).toBe(403);
    expect(stale.json<{ error: string }>().error).toBe('recent_authentication_required');
    await staleApp.close();
  });

  it('requires two different single-use proofs before changing an email address', async () => {
    const rawToken = 'lq_sess_account_email';
    const repository = accountRepository({ authSessions: [session(rawToken)] });
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(NOW),
      emailVerificationDelivery: {
        kind: 'email-verification-dispatcher-v1',
        secret: EMAIL_SECRET,
        keyId: 'test',
      },
    });

    const started = await app.inject({
      method: 'POST',
      url: '/v1/auth/email-change',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { newEmail: 'new-member@example.com', currentPassword: PASSWORD },
    });
    expect(started.statusCode).toBe(202);
    const change = started.json<{ id: string }>();
    const currentToken = createAccountEmailChangeToken(change.id, 'current_email', EMAIL_SECRET);
    const newToken = createAccountEmailChangeToken(change.id, 'new_email', EMAIL_SECRET);
    expect(hashAccountEmailChangeToken(currentToken)).not.toBe(
      hashAccountEmailChangeToken(newToken),
    );

    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/email-change/verify',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { challengeId: change.id, proof: 'current_email', token: currentToken },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json<{ status: string }>().status).toBe('proof_recorded');

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/email-change/verify',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { challengeId: change.id, proof: 'current_email', token: currentToken },
    });
    expect(replay.statusCode).toBe(400);

    const completed = await app.inject({
      method: 'POST',
      url: '/v1/auth/email-change/verify',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { challengeId: change.id, proof: 'new_email', token: newToken },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toEqual({ status: 'completed', email: 'new-member@example.com' });
    await expect(repository.getIdentityUser(USER_ID)).resolves.toMatchObject({
      email: 'new-member@example.com',
    });
    await app.close();
  });

  it('lists and revokes only the authenticated account sessions', async () => {
    const currentToken = 'lq_sess_account_list';
    const otherToken = 'lq_sess_account_revoke';
    const repository = accountRepository({
      authSessions: [session(currentToken), session(otherToken, 'Firefox on desktop')],
    });
    const app = createApiApp({ repository, authProvider: createLodariqAuthProvider(repository) });
    const listed = await app.inject({
      method: 'GET',
      url: '/v1/auth/sessions',
      headers: { authorization: `Bearer ${currentToken}` },
    });
    expect(listed.statusCode).toBe(200);
    const sessions = listed.json<{ sessions: Array<{ id: string; current: boolean }> }>().sessions;
    expect(sessions).toHaveLength(2);
    const other = sessions.find((candidate) => !candidate.current);
    expect(other).toBeDefined();

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/v1/auth/sessions/${other?.id}`,
      headers: { authorization: `Bearer ${currentToken}` },
      payload: {},
    });
    expect(revoked.statusCode).toBe(204);
    const otherSession = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(otherSession.statusCode).toBe(401);
    await expect(repository.listAccountSecurityEvents(USER_ID)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'session_revoked', targetId: other?.id }),
      ]),
    );

    const signedOut = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-out-everywhere',
      headers: { authorization: `Bearer ${currentToken}` },
      payload: {},
    });
    expect(signedOut.statusCode).toBe(204);
    const currentSession = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { authorization: `Bearer ${currentToken}` },
    });
    expect(currentSession.statusCode).toBe(401);
    await expect(repository.listAccountSecurityEvents(USER_ID)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ eventType: 'sessions_revoked_all' })]),
    );
    await app.close();
  });

  it('exports account data and blocks deletion by the final workspace owner', async () => {
    const rawToken = 'lq_sess_account_delete';
    const repository = accountRepository({ authSessions: [session(rawToken)] }, 'owner');
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(NOW),
    });
    const exported = await app.inject({
      method: 'GET',
      url: '/v1/auth/account-export',
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json()).toMatchObject({
      profile: { id: USER_ID, email: 'member@example.com' },
      workspaces: [{ id: WORKSPACE_ID, role: 'owner' }],
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/v1/auth/account',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { currentPassword: PASSWORD, confirmation: 'DELETE' },
    });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json<{ error: string }>().error).toBe('final_workspace_owner');
    await app.close();
  });
});

function accountRepository(
  overrides: InMemoryControlPlaneSeed = {},
  role: 'owner' | 'member' = 'member',
) {
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: USER_ID,
        legacyIdentityId: null,
        email: 'member@example.com',
        name: 'Account Member',
        emailVerifiedAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
      },
    ],
    userEmails: [
      {
        id: `email_account_${'e'.repeat(20)}`,
        userId: USER_ID,
        normalizedEmail: 'member@example.com',
        isPrimary: true,
        verifiedAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    authIdentities: [
      {
        id: `ident_account_${'i'.repeat(20)}`,
        userId: USER_ID,
        kind: 'password',
        issuer: 'https://lodariq.io',
        subject: `user:${USER_ID}`,
        providerTenantId: null,
        createdAt: NOW.toISOString(),
        lastAuthenticatedAt: NOW.toISOString(),
      },
    ],
    passwordCredentials: [credential],
    workspaces: [
      {
        id: WORKSPACE_ID,
        name: 'Account workspace',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: USER_ID, role, createdAt: NOW.toISOString() },
    ],
    ...overrides,
  });
}

function session(
  token: string,
  deviceLabel = 'Chrome on desktop',
  authenticatedAt = NOW.toISOString(),
): AuthSessionRecord {
  return {
    id: `authsess_${token.replace(/[^a-z0-9]/gu, '')}_${'s'.repeat(20)}`,
    userId: USER_ID,
    tokenHash: hashAuthSessionToken(token),
    activeWorkspaceId: WORKSPACE_ID,
    identityId: `ident_account_${'i'.repeat(20)}`,
    authenticationMethod: 'password',
    assuranceLevel: 'aal1',
    authenticatedAt,
    durationPolicy: 'standard',
    deviceLabel,
    createdAt: authenticatedAt,
    lastSeenAt: NOW.toISOString(),
    idleExpiresAt: '2026-08-16T00:00:00.000Z',
    absoluteExpiresAt: '2026-08-17T00:00:00.000Z',
    revokedAt: null,
  };
}

function cookieToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  const match = /lodariq_session_dev=([^;]+)/u.exec(value ?? '');
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}
