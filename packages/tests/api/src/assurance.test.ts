import { beforeAll, describe, expect, it } from 'vitest';
import {
  createApiApp,
  createLodariqAuthProvider,
  createRecoveryCodes,
  hashAuthSessionToken,
  hashOwnedPassword,
  hashRecoveryCode,
  normalizeRecoveryCode,
  readWebAuthnConfiguration,
} from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type PasswordCredentialRecord,
} from '@lodariq/database';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const USER_ID = 'usr_assurance_member';
const WORKSPACE_ID = 'wk_assurance_member';
const HIGH_ASSURANCE_WORKSPACE_ID = 'wk_assurance_protected';
const IDENTITY_ID = `ident_assurance_${'i'.repeat(20)}`;
const PASSKEY_IDENTITY_ID = `ident_assurance_passkey_${'p'.repeat(20)}`;
const PASSWORD = 'correct-assurance-password';
let credential: PasswordCredentialRecord;

beforeAll(async () => {
  credential = await hashOwnedPassword(USER_ID, 'assurance@example.com', PASSWORD, NOW);
});

describe('@lodariq/api assurance and recovery', () => {
  it('generates high-entropy normalized recovery codes without ambiguous characters', () => {
    const codes = createRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes)).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^LQRC-(?:[23456789A-HJ-NP-Z]{5}-){3}[23456789A-HJ-NP-Z]{5}$/u);
      expect(normalizeRecoveryCode(` ${code.toLowerCase()} `)).toBe(code);
      expect(hashRecoveryCode(code)).toMatch(/^[0-9a-f]{64}$/u);
    }
    expect(normalizeRecoveryCode('LQRC-OOOOO-11111-IIIII-LLLLL')).toBeNull();
  });

  it('requires an exact HTTPS WebAuthn origin bound to the RP ID', () => {
    expect(
      readWebAuthnConfiguration({
        NODE_ENV: 'production',
        LODARIQ_WEBAUTHN_MODE: 'enabled',
        LODARIQ_WEBAUTHN_RP_ID: 'app.lodariq.io',
        LODARIQ_WEBAUTHN_ORIGIN: 'https://app.lodariq.io',
      }),
    ).toEqual({
      rpId: 'app.lodariq.io',
      rpName: 'Lodariq',
      origin: 'https://app.lodariq.io',
    });
    expect(() =>
      readWebAuthnConfiguration({
        NODE_ENV: 'production',
        LODARIQ_WEBAUTHN_MODE: 'enabled',
        LODARIQ_WEBAUTHN_RP_ID: 'lodariq.io',
        LODARIQ_WEBAUTHN_ORIGIN: 'https://attacker.example',
      }),
    ).toThrow(/RP_ID/u);
    expect(() =>
      readWebAuthnConfiguration({
        NODE_ENV: 'production',
        LODARIQ_WEBAUTHN_MODE: 'enabled',
        LODARIQ_WEBAUTHN_RP_ID: 'lodariq.io',
        LODARIQ_WEBAUTHN_ORIGIN: 'http://app.lodariq.io',
      }),
    ).toThrow(/HTTPS/u);
  });

  it('enrolls, confirms, consumes once, and revokes hash-stored recovery codes', async () => {
    const rawToken = 'lq_sess_assurance_current';
    const repository = assuranceRepository(session(rawToken));
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(NOW),
      webAuthnConfiguration: null,
    });

    const generated = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery-codes',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { currentPassword: PASSWORD },
    });
    expect(generated.statusCode).toBe(201);
    expect(generated.headers['cache-control']).toBe('no-store');
    const enrollment = generated.json<{ setId: string; codes: string[] }>();
    expect(enrollment.codes).toHaveLength(10);

    const pending = await repository.getRecoveryCodeStatus(USER_ID);
    expect(pending).toMatchObject({ setId: enrollment.setId, confirmed: false, remaining: 10 });
    const confirmed = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery-codes/confirm',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { setId: enrollment.setId, code: enrollment.codes[0] },
    });
    expect(confirmed.statusCode).toBe(204);

    const used = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery-code/sign-in',
      payload: {
        identifier: 'assurance@example.com',
        code: enrollment.codes[0],
        rememberMe: true,
      },
    });
    expect(used.statusCode).toBe(200);
    expect(String(used.headers['set-cookie'])).toContain('Expires=');
    expect(await repository.getRecoveryCodeStatus(USER_ID)).toMatchObject({ remaining: 9 });

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery-code/sign-in',
      payload: { identifier: 'assurance@example.com', code: enrollment.codes[0] },
    });
    expect(replay.statusCode).toBe(401);

    const revoked = await app.inject({
      method: 'DELETE',
      url: '/v1/auth/recovery-codes',
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(revoked.statusCode).toBe(204);
    const rejectedAfterRevocation = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery-code/sign-in',
      payload: { identifier: 'assurance@example.com', code: enrollment.codes[1] },
    });
    expect(rejectedAfterRevocation.statusCode).toBe(401);
    await expect(repository.listAccountSecurityEvents(USER_ID)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'recovery_codes_generated' }),
        expect.objectContaining({ eventType: 'recovery_codes_confirmed' }),
        expect.objectContaining({ eventType: 'recovery_code_used' }),
        expect.objectContaining({ eventType: 'recovery_codes_revoked' }),
      ]),
    );
    await app.close();
  });

  it('rejects recovery-code enrollment from a stale session', async () => {
    const rawToken = 'lq_sess_assurance_stale';
    const staleAt = new Date(NOW.getTime() - 16 * 60_000).toISOString();
    const repository = assuranceRepository(session(rawToken, staleAt));
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(NOW),
      webAuthnConfiguration: null,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery-codes',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { currentPassword: PASSWORD },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('recent_authentication_required');
    await app.close();
  });

  it('blocks an AAL1 session from selecting an AAL2 workspace and admits an AAL2 session', async () => {
    const passwordToken = 'lq_sess_assurance_aal1';
    const passwordRepository = assuranceRepository(session(passwordToken));
    const passwordApp = createApiApp({
      repository: passwordRepository,
      authProvider: createLodariqAuthProvider(passwordRepository),
      webAuthnConfiguration: null,
    });
    const blocked = await passwordApp.inject({
      method: 'POST',
      url: `/v1/workspaces/${HIGH_ASSURANCE_WORKSPACE_ID}/select`,
      headers: { authorization: `Bearer ${passwordToken}` },
      payload: {},
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json<{ error: string }>().error).toBe('minimum_assurance_required');
    await passwordApp.close();

    const passkeyToken = 'lq_sess_assurance_aal2';
    const passkeyRepository = assuranceRepository(
      session(passkeyToken, new Date(Date.now() - 1_000).toISOString(), 'passkey'),
    );
    const passkeyApp = createApiApp({
      repository: passkeyRepository,
      authProvider: createLodariqAuthProvider(passkeyRepository),
      webAuthnConfiguration: null,
    });
    const admitted = await passkeyApp.inject({
      method: 'POST',
      url: `/v1/workspaces/${HIGH_ASSURANCE_WORKSPACE_ID}/select`,
      headers: { authorization: `Bearer ${passkeyToken}` },
      payload: {},
    });
    expect(admitted.statusCode).toBe(200);
    expect(admitted.json<{ activeWorkspaceId: string }>().activeWorkspaceId).toBe(
      HIGH_ASSURANCE_WORKSPACE_ID,
    );
    await passkeyApp.close();
  });
});

function assuranceRepository(authSession: AuthSessionRecord) {
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: USER_ID,
        legacyIdentityId: null,
        email: 'assurance@example.com',
        name: 'Assurance Member',
        emailVerifiedAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
      },
    ],
    userEmails: [
      {
        id: `email_assurance_${'e'.repeat(20)}`,
        userId: USER_ID,
        normalizedEmail: 'assurance@example.com',
        isPrimary: true,
        verifiedAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    authIdentities: [
      {
        id: IDENTITY_ID,
        userId: USER_ID,
        kind: 'password',
        issuer: 'https://lodariq.io',
        subject: `user:${USER_ID}`,
        providerTenantId: null,
        createdAt: NOW.toISOString(),
        lastAuthenticatedAt: NOW.toISOString(),
      },
      {
        id: PASSKEY_IDENTITY_ID,
        userId: USER_ID,
        kind: 'passkey',
        issuer: 'https://lodariq.io',
        subject: `passkey:${USER_ID}`,
        providerTenantId: null,
        createdAt: NOW.toISOString(),
        lastAuthenticatedAt: NOW.toISOString(),
      },
    ],
    passwordCredentials: [credential],
    authSessions: [authSession],
    workspaces: [
      {
        id: WORKSPACE_ID,
        name: 'Assurance workspace',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      {
        id: HIGH_ASSURANCE_WORKSPACE_ID,
        name: 'Protected assurance workspace',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'member', createdAt: NOW.toISOString() },
      {
        workspaceId: HIGH_ASSURANCE_WORKSPACE_ID,
        userId: USER_ID,
        role: 'member',
        createdAt: NOW.toISOString(),
      },
    ],
    workspaceAuthPolicies: [
      {
        workspaceId: HIGH_ASSURANCE_WORKSPACE_ID,
        ssoRequired: false,
        minimumAssurance: 'aal2',
        passwordAllowed: true,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
  });
}

function session(
  rawToken: string,
  authenticatedAt = NOW.toISOString(),
  method: 'password' | 'passkey' = 'password',
): AuthSessionRecord {
  return {
    id: `authsess_assurance_${rawToken.replace(/[^a-z0-9]/gu, '')}_${'s'.repeat(20)}`,
    userId: USER_ID,
    tokenHash: hashAuthSessionToken(rawToken),
    activeWorkspaceId: WORKSPACE_ID,
    identityId: method === 'passkey' ? PASSKEY_IDENTITY_ID : IDENTITY_ID,
    authenticationMethod: method,
    assuranceLevel: method === 'passkey' ? 'aal2' : 'aal1',
    authenticatedAt,
    durationPolicy: 'standard',
    deviceLabel: 'Test browser',
    createdAt: authenticatedAt,
    lastSeenAt: NOW.toISOString(),
    idleExpiresAt: '2026-08-16T00:00:00.000Z',
    absoluteExpiresAt: '2026-08-17T00:00:00.000Z',
    revokedAt: null,
  };
}
