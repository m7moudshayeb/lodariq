import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createApiApp,
  createLodariqAuthProvider,
  EnterpriseOidcProvider,
  hashAuthSessionToken,
  readEnterpriseOidcConfiguration,
  type EnterpriseOidcConfiguration,
} from '@lodariq/api';
import { createInMemoryControlPlaneRepository, type AuthSessionRecord } from '@lodariq/database';

const NOW = new Date('2026-08-15T16:00:00.000Z');
// authenticateOwnedSession uses wall-clock expiry, not authClock.
const SESSION_IDLE_EXPIRES_AT = new Date(Date.now() + 12 * 60 * 60 * 1_000).toISOString();
const SESSION_ABSOLUTE_EXPIRES_AT = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
const WORKSPACE_ID = 'wk_enterprise_api';
const OWNER_ID = 'usr_enterprise_api_owner';
const CONNECTION_ID = `sso_${'c'.repeat(24)}`;
const SCIM_ID = `scim_${'s'.repeat(24)}`;
const DOMAIN_ID = `ssodomain_${'d'.repeat(20)}`;
const PENDING_DOMAIN_ID = `ssodomain_${'p'.repeat(20)}`;
const CONSUMER_IDENTITY_ID = `ident_${'g'.repeat(24)}`;
const OWNER_TOKEN = 'lq_sess_enterprise_api_owner';
const SCIM_TOKEN = `lq_scim_${'t'.repeat(43)}`;

describe('@lodariq/api enterprise identity', () => {
  it('discovers only a validated verified-domain connection and stops immediately when disabled', async () => {
    const repository = enterpriseRepository();
    const app = enterpriseApp(repository);
    const discovered = await app.inject({
      method: 'POST',
      url: '/v1/auth/sso/discover',
      payload: { email: 'any-person@example.com' },
    });
    expect(discovered.statusCode).toBe(200);
    expect(discovered.json()).toEqual({
      available: true,
      connectionId: CONNECTION_ID,
      protocol: 'oidc',
      provider: 'okta',
    });
    expect(JSON.stringify(discovered.json())).not.toContain('user');

    const disabled = await app.inject({
      method: 'DELETE',
      url: `/v1/workspaces/${WORKSPACE_ID}/enterprise/sso-connections/${CONNECTION_ID}`,
      headers: { authorization: `Bearer ${OWNER_TOKEN}` },
    });
    expect(disabled.statusCode).toBe(204);
    const afterDisable = await app.inject({
      method: 'POST',
      url: '/v1/auth/sso/discover',
      payload: { email: 'any-person@example.com' },
    });
    expect(afterDisable.json()).toEqual({ available: false });
    await app.close();
  });

  it('requires a recent AAL2 owner session for enterprise mutations', async () => {
    const weakToken = 'lq_sess_enterprise_weak_owner';
    const repository = enterpriseRepository([session(weakToken, 'password', 'aal1')]);
    const app = enterpriseApp(repository);
    const response = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${WORKSPACE_ID}/enterprise/domains`,
      headers: { authorization: `Bearer ${weakToken}` },
      payload: { connectionId: CONNECTION_ID, domain: 'new.example.com' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('minimum_assurance_required');
    await app.close();
  });

  it('verifies DNS against the server-owned pending domain rather than a caller-supplied domain', async () => {
    const rawProof = 'pending-domain-verification-proof';
    const verifyTxtRecord = vi.fn(async () => true);
    const repository = enterpriseRepository();
    const app = enterpriseApp(repository, null, { verifyTxtRecord });
    const response = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${WORKSPACE_ID}/enterprise/domains/${PENDING_DOMAIN_ID}/verify`,
      headers: {
        authorization: `Bearer ${OWNER_TOKEN}`,
        'x-lodariq-domain': 'attacker.example.net',
        'x-lodariq-domain-verification': rawProof,
      },
      payload: {},
    });
    expect(response.statusCode).toBe(204);
    expect(verifyTxtRecord).toHaveBeenCalledWith(
      '_lodariq.pending.example.com',
      `lodariq-domain-verification=${rawProof}`,
    );
    await app.close();
  });

  it('does not treat a linked consumer OIDC identity as workspace enterprise SSO', async () => {
    const consumerToken = 'lq_sess_enterprise_consumer_oidc';
    const consumerSession = {
      ...session(consumerToken, 'oidc', 'aal2'),
      identityId: CONSUMER_IDENTITY_ID,
    };
    const repository = enterpriseRepository([consumerSession], {
      ssoRequired: true,
      passwordAllowed: false,
    });
    const app = enterpriseApp(repository);
    const response = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${WORKSPACE_ID}/select`,
      headers: { authorization: `Bearer ${consumerToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('enterprise_sso_required');
    await app.close();
  });

  it('supports bounded SCIM lookup/provision/deprovision and token revocation without email linking', async () => {
    const repository = enterpriseRepository();
    const app = enterpriseApp(repository);
    const collision = await app.inject({
      method: 'POST',
      url: '/v1/scim/Users',
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: scimUser('existing-owner', 'owner@example.com'),
    });
    expect(collision.statusCode).toBe(409);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/scim/Users',
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: scimUser('managed-external-id', 'managed@example.com'),
    });
    expect(created.statusCode).toBe(201);
    const principalId = created.json<{ id: string }>().id;

    const lookup = await app.inject({
      method: 'GET',
      url: `/v1/scim/Users?filter=${encodeURIComponent('userName eq "managed@example.com"')}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
    });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json()).toMatchObject({
      totalResults: 1,
      Resources: [{ id: principalId, userName: 'managed@example.com', active: true }],
    });

    const deprovisioned = await app.inject({
      method: 'PATCH',
      url: `/v1/scim/Users/${principalId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'Replace', path: 'active', value: 'False' }],
      },
    });
    expect(deprovisioned.statusCode).toBe(204);
    const deprovisionedUser = await app.inject({
      method: 'GET',
      url: `/v1/scim/Users/${principalId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
    });
    expect(deprovisionedUser.json()).toMatchObject({ active: false });

    const disabled = await app.inject({
      method: 'DELETE',
      url: `/v1/workspaces/${WORKSPACE_ID}/enterprise/scim-tokens/${SCIM_ID}`,
      headers: { authorization: `Bearer ${OWNER_TOKEN}` },
    });
    expect(disabled.statusCode).toBe(204);
    const rejected = await app.inject({
      method: 'GET',
      url: `/v1/scim/Users/${principalId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
    });
    expect(rejected.statusCode).toBe(401);
    await app.close();
  });

  it('pins the enterprise callback and secret map while rejecting untrusted Okta issuers before discovery', async () => {
    const configuration = enterpriseOidcConfiguration();
    expect(await configuration.resolveClientSecret(CONNECTION_ID)).toBe(
      'enterprise-client-secret-at-least-thirty-two-bytes',
    );
    expect(await configuration.resolveClientSecret(`sso_${'x'.repeat(24)}`)).toBeNull();

    const provider = new EnterpriseOidcProvider(configuration);
    await expect(
      provider.begin(
        {
          ...activeConnection(),
          issuer: 'https://untrusted.example.com/oauth2/default',
        },
        oidcProof(),
      ),
    ).rejects.toThrow(/supported Okta tenant hostname/u);
  });

  it('accepts only same-origin metadata for a reviewed Okta tenant and consumes cancellation state once', async () => {
    const discovery = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            issuer: 'https://tenant.okta.com/oauth2/default',
            authorization_endpoint: 'https://tenant.okta.com/oauth2/default/v1/authorize',
            token_endpoint: 'https://tenant.okta.com/oauth2/default/v1/token',
            jwks_uri: 'https://tenant.okta.com/oauth2/default/v1/keys',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', discovery);
    const repository = enterpriseRepository();
    const app = enterpriseApp(repository, enterpriseOidcConfiguration());
    try {
      const begin = await app.inject({
        method: 'POST',
        url: '/v1/auth/enterprise/oidc/begin',
        payload: { connectionId: CONNECTION_ID, returnTo: '/authoring/activate' },
      });
      expect(begin.statusCode).toBe(200);
      const state = new URL(
        begin.json<{ authorizationUrl: string }>().authorizationUrl,
      ).searchParams.get('state');
      expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      const cancelled = await app.inject({
        method: 'POST',
        url: '/v1/auth/enterprise/oidc/callback',
        payload: { state, error: 'access_denied' },
      });
      expect(cancelled.statusCode).toBe(400);
      const replay = await app.inject({
        method: 'POST',
        url: '/v1/auth/enterprise/oidc/callback',
        payload: { state, error: 'access_denied' },
      });
      expect(replay.statusCode).toBe(400);
      expect(discovery).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
      vi.unstubAllGlobals();
    }
  });
});

function enterpriseApp(
  repository: ReturnType<typeof enterpriseRepository>,
  enterpriseOidcConfiguration: EnterpriseOidcConfiguration | null = null,
  enterpriseDomainVerification?: {
    verifyTxtRecord(recordName: string, expectedValue: string): Promise<boolean>;
  },
) {
  return createApiApp({
    repository,
    authProvider: createLodariqAuthProvider(repository),
    authClock: () => new Date(NOW),
    enterpriseOidcConfiguration,
    enterpriseDomainVerification,
    oidcConfiguration: null,
    webAuthnConfiguration: null,
  });
}

function enterpriseOidcConfiguration(): EnterpriseOidcConfiguration {
  return readEnterpriseOidcConfiguration({
    LODARIQ_ENTERPRISE_OIDC_MODE: 'enabled',
    LODARIQ_OIDC_STATE_SECRET: 'enterprise-oidc-state-secret-at-least-thirty-two-bytes',
    LODARIQ_ENTERPRISE_OIDC_REDIRECT_URI: 'https://app.lodariq.io/v1/auth/enterprise/oidc/callback',
    LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS: JSON.stringify({
      [CONNECTION_ID]: 'enterprise-client-secret-at-least-thirty-two-bytes',
    }),
  })!;
}

function activeConnection() {
  const now = NOW.toISOString();
  return {
    id: CONNECTION_ID,
    workspaceId: WORKSPACE_ID,
    provider: 'okta' as const,
    protocol: 'oidc' as const,
    issuer: 'https://tenant.okta.com/oauth2/default',
    clientId: 'enterprise-client-id',
    provisioningMode: 'jit' as const,
    status: 'active' as const,
    validatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function oidcProof() {
  return {
    state: 's'.repeat(43),
    nonce: 'n'.repeat(43),
    codeChallenge: 'c'.repeat(43),
  };
}

function enterpriseRepository(
  additionalSessions: AuthSessionRecord[] = [],
  policyOverrides: Partial<{
    ssoRequired: boolean;
    minimumAssurance: 'aal1' | 'aal2';
    passwordAllowed: boolean;
  }> = {},
) {
  const now = NOW.toISOString();
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: OWNER_ID,
        legacyIdentityId: null,
        email: 'owner@example.com',
        name: 'Owner',
        emailVerifiedAt: now,
        deletedAt: null,
        retentionExpiresAt: null,
        createdAt: now,
      },
    ],
    userEmails: [
      {
        id: `email_${'o'.repeat(24)}`,
        userId: OWNER_ID,
        normalizedEmail: 'owner@example.com',
        isPrimary: true,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    authIdentities: [
      {
        id: CONSUMER_IDENTITY_ID,
        userId: OWNER_ID,
        kind: 'oidc',
        issuer: 'https://accounts.google.com',
        subject: 'consumer-google-subject',
        providerTenantId: 'google',
        createdAt: now,
        lastAuthenticatedAt: now,
        disabledAt: null,
      },
    ],
    workspaces: [{ id: WORKSPACE_ID, name: 'Enterprise API', createdAt: now, updatedAt: now }],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: 'owner', createdAt: now },
    ],
    workspaceAuthPolicies: [
      {
        workspaceId: WORKSPACE_ID,
        ssoRequired: false,
        minimumAssurance: 'aal1',
        passwordAllowed: true,
        createdAt: now,
        updatedAt: now,
        ...policyOverrides,
      },
    ],
    authSessions: [session(OWNER_TOKEN, 'passkey', 'aal2'), ...additionalSessions],
    enterpriseSsoConnections: [
      {
        id: CONNECTION_ID,
        workspaceId: WORKSPACE_ID,
        provider: 'okta',
        protocol: 'oidc',
        issuer: 'https://tenant.okta.com/oauth2/default',
        clientId: 'enterprise-client-id',
        provisioningMode: 'jit',
        status: 'active',
        validatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    enterpriseValidationEvidence: [
      {
        id: `ssoevidence_${'e'.repeat(20)}`,
        connectionId: CONNECTION_ID,
        workspaceId: WORKSPACE_ID,
        target: 'okta',
        protocol: 'oidc',
        evidenceReference: 'ticket://enterprise-validation/1234',
        validatedBy: 'release-operator',
        validatedAt: now,
        revokedAt: null,
      },
    ],
    enterpriseVerifiedDomains: [
      {
        id: DOMAIN_ID,
        workspaceId: WORKSPACE_ID,
        connectionId: CONNECTION_ID,
        domain: 'example.com',
        status: 'verified',
        verificationTokenHash: 'd'.repeat(64),
        verificationRecordName: '_lodariq.example.com',
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: PENDING_DOMAIN_ID,
        workspaceId: WORKSPACE_ID,
        connectionId: CONNECTION_ID,
        domain: 'pending.example.com',
        status: 'pending',
        verificationTokenHash: digest('pending-domain-verification-proof'),
        verificationRecordName: '_lodariq.pending.example.com',
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    enterpriseScimConnections: [
      {
        id: SCIM_ID,
        workspaceId: WORKSPACE_ID,
        connectionId: CONNECTION_ID,
        tokenHash: digest(SCIM_TOKEN),
        tokenPrefix: SCIM_TOKEN.slice(0, 16),
        status: 'active',
        createdByUserId: OWNER_ID,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
}

function session(
  rawToken: string,
  method: 'oidc' | 'passkey' | 'password',
  assurance: 'aal1' | 'aal2',
): AuthSessionRecord {
  const now = NOW.toISOString();
  return {
    id: `authsess_${digest(rawToken).slice(0, 24)}`,
    userId: OWNER_ID,
    tokenHash: hashAuthSessionToken(rawToken),
    activeWorkspaceId: WORKSPACE_ID,
    identityId: null,
    authenticationMethod: method,
    assuranceLevel: assurance,
    authenticatedAt: now,
    durationPolicy: 'standard',
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt: SESSION_IDLE_EXPIRES_AT,
    absoluteExpiresAt: SESSION_ABSOLUTE_EXPIRES_AT,
    revokedAt: null,
  };
}

function scimUser(externalId: string, userName: string) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    externalId,
    userName,
    active: true,
    displayName: 'Managed User',
    emails: [{ value: userName, type: 'work', primary: true }],
  };
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
