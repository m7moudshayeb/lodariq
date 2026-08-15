import { describe, expect, it } from 'vitest';
import {
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type EnterpriseAuditEventRecord,
  type EnterpriseSsoConnectionRecord,
  type InMemoryControlPlaneSeed,
} from '@lodariq/database';

const NOW = '2026-08-15T12:00:00.000Z';
const LATER = '2026-08-15T12:05:00.000Z';
const WORKSPACE_ID = 'wk_enterprise_security';
const CONNECTION_ID = `sso_${'c'.repeat(24)}`;
const OWNER_ID = 'usr_enterprise_owner';
const SECOND_OWNER_ID = 'usr_enterprise_second_owner';

describe('@lodariq/database enterprise identity', () => {
  it('requires real validation evidence and rejects consumer OIDC as workspace SSO', async () => {
    const consumerIdentityId = `ident_${'g'.repeat(24)}`;
    const enterpriseIdentityId = `ident_${'e'.repeat(24)}`;
    const repository = createInMemoryControlPlaneRepository(
      enterpriseSeed({
        authIdentities: [
          identity(consumerIdentityId, OWNER_ID, 'https://accounts.google.com', 'google-subject'),
          identity(enterpriseIdentityId, OWNER_ID, 'https://login.example.com', 'enterprise-subject'),
        ],
        enterprisePrincipals: [
          {
            id: `ssoprincipal_${'p'.repeat(20)}`,
            workspaceId: WORKSPACE_ID,
            connectionId: CONNECTION_ID,
            userId: OWNER_ID,
            externalId: 'employee-1',
            issuer: 'https://login.example.com',
            subject: 'enterprise-subject',
            active: true,
            createdAt: NOW,
            updatedAt: NOW,
            deprovisionedAt: null,
          },
        ],
      }),
    );

    await expect(
      repository.updateWorkspaceEnterprisePolicy({
        workspaceId: WORKSPACE_ID,
        actorUserId: OWNER_ID,
        ssoRequired: true,
        minimumAssurance: 'aal1',
        passwordAllowed: false,
        updatedAt: NOW,
        breakGlassRequestId: null,
        breakGlassAuditEvent: null,
        auditEvent: event('workspace_auth_policy_updated', OWNER_ID),
      }),
    ).resolves.toBe('validation_required');

    await expect(
      repository.recordEnterpriseValidationEvidence({
        evidence: {
          id: `ssoevidence_${'v'.repeat(20)}`,
          connectionId: CONNECTION_ID,
          workspaceId: WORKSPACE_ID,
          target: 'okta',
          protocol: 'oidc',
          evidenceReference: 'runbook://okta-smoke/2026-08-15',
          validatedBy: 'deployment-operator',
          validatedAt: NOW,
          revokedAt: null,
        },
        auditEvent: event('sso_connection_validated', null, CONNECTION_ID),
      }),
    ).resolves.toBe('completed');
    await expect(
      repository.updateWorkspaceEnterprisePolicy({
        workspaceId: WORKSPACE_ID,
        actorUserId: OWNER_ID,
        ssoRequired: true,
        minimumAssurance: 'aal1',
        passwordAllowed: false,
        updatedAt: LATER,
        breakGlassRequestId: null,
        breakGlassAuditEvent: null,
        auditEvent: event('workspace_auth_policy_updated', OWNER_ID),
      }),
    ).resolves.toBe('completed');

    await expect(
      repository.identitySatisfiesWorkspaceSso(WORKSPACE_ID, consumerIdentityId),
    ).resolves.toBe(false);
    await expect(
      repository.identitySatisfiesWorkspaceSso(WORKSPACE_ID, enterpriseIdentityId),
    ).resolves.toBe(true);
  });

  it('reconciles managed group roles on sign-in and rejects a stale removed membership', async () => {
    const userId = 'usr_enterprise_managed';
    const principalId = `ssoprincipal_${'m'.repeat(20)}`;
    const repository = createInMemoryControlPlaneRepository(
      validatedSeed({
        users: [
          user(OWNER_ID, 'owner@example.com'),
          user(SECOND_OWNER_ID, 'second-owner@example.com'),
          user(userId, 'managed@example.com'),
        ],
        userEmails: [
          email(OWNER_ID, 'owner@example.com'),
          email(SECOND_OWNER_ID, 'second-owner@example.com'),
          email(userId, 'managed@example.com'),
        ],
        workspaceMemberships: [
          { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: 'owner', createdAt: NOW },
          { workspaceId: WORKSPACE_ID, userId: SECOND_OWNER_ID, role: 'owner', createdAt: NOW },
          { workspaceId: WORKSPACE_ID, userId, role: 'admin', createdAt: NOW },
        ],
        enterprisePrincipals: [
          {
            id: principalId,
            workspaceId: WORKSPACE_ID,
            connectionId: CONNECTION_ID,
            userId,
            externalId: 'managed-external-id',
            issuer: 'https://login.example.com',
            subject: null,
            active: true,
            createdAt: NOW,
            updatedAt: NOW,
            deprovisionedAt: null,
          },
        ],
        enterpriseGroupRoleMappings: [
          {
            id: `ssogroup_${'v'.repeat(20)}`,
            workspaceId: WORKSPACE_ID,
            connectionId: CONNECTION_ID,
            groupId: 'viewers',
            role: 'viewer',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      }),
    );

    const first = await repository.authenticateEnterpriseSso(
      enterpriseAuthenticationInput(userId, principalId, 'first', ['viewers']),
    );
    expect(first.status).toBe('authenticated');
    await expect(repository.resolveWorkspaceMembership(WORKSPACE_ID, userId)).resolves.toMatchObject({
      role: 'viewer',
    });

    await expect(
      repository.removeWorkspaceMember({
        workspaceId: WORKSPACE_ID,
        targetUserId: userId,
        actorUserId: OWNER_ID,
        removedAt: LATER,
        eventId: `tenantevt_${'r'.repeat(20)}`,
      }),
    ).resolves.toBe('completed');
    await expect(
      repository.authenticateEnterpriseSso(
        enterpriseAuthenticationInput(userId, principalId, 'second', ['viewers']),
      ),
    ).resolves.toEqual({ status: 'deprovisioned' });
  });

  it('never auto-links SCIM provisioning by email and deprovisioning revokes access immediately', async () => {
    const tokenHash = 'a'.repeat(64);
    const existing = createInMemoryControlPlaneRepository(
      validatedSeed({
        enterpriseScimConnections: [scimConnection(tokenHash)],
        enterpriseGroupRoleMappings: [
          {
            id: `ssogroup_${'g'.repeat(20)}`,
            workspaceId: WORKSPACE_ID,
            connectionId: CONNECTION_ID,
            groupId: 'engineering',
            role: 'admin',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      }),
    );
    await expect(
      existing.provisionEnterpriseScimUser(
        scimProvisionInput(tokenHash, OWNER_ID, 'owner@example.com', 'external-collision'),
      ),
    ).resolves.toEqual({ status: 'conflict' });

    const userId = 'usr_scim_managed';
    const principalId = `ssoprincipal_${'s'.repeat(20)}`;
    const provisioned = await existing.provisionEnterpriseScimUser(
      {
        ...scimProvisionInput(
          tokenHash,
          userId,
          'managed@example.com',
          'external-managed',
          principalId,
        ),
        groupIds: ['engineering'],
      },
    );
    expect(provisioned.status).toBe('created');

    const rawSession = 'scim-managed-session';
    const session = authSession(userId, rawSession);
    await existing.createAuthSession(session);
    await expect(existing.resolveWorkspaceMembership(WORKSPACE_ID, userId)).resolves.toMatchObject({
      role: 'admin',
    });
    await expect(
      existing.updateEnterpriseScimUser({
        scimConnectionId: `scim_${'t'.repeat(20)}`,
        scimTokenHash: tokenHash,
        principalId,
        active: false,
        occurredAt: LATER,
        auditEvent: event('scim_user_deprovisioned', null, CONNECTION_ID, userId),
      }),
    ).resolves.toBe('completed');
    await expect(existing.resolveWorkspaceMembership(WORKSPACE_ID, userId)).resolves.toBeNull();
    await expect(existing.resolveAuthSession(session.tokenHash, LATER)).resolves.toBeNull();
  });

  it('requires a different owner and consumes break-glass approval exactly once', async () => {
    const repository = createInMemoryControlPlaneRepository(validatedSeed());
    const requestId = `breakglass_${'b'.repeat(20)}`;
    await expect(
      repository.createEnterpriseBreakGlass({
        request: {
          id: requestId,
          workspaceId: WORKSPACE_ID,
          requestedByUserId: OWNER_ID,
          approvedByUserId: null,
          status: 'pending_approval',
          reason: 'The enterprise identity provider is unavailable.',
          expiresAt: '2026-08-15T12:15:00.000Z',
          approvedAt: null,
          consumedAt: null,
          createdAt: NOW,
        },
        auditEvent: event('break_glass_requested', OWNER_ID),
      }),
    ).resolves.toBe('completed');
    await expect(
      repository.approveEnterpriseBreakGlass({
        workspaceId: WORKSPACE_ID,
        requestId,
        approverUserId: OWNER_ID,
        approvedAt: LATER,
        auditEvent: event('break_glass_approved', OWNER_ID),
      }),
    ).resolves.toBe('conflict');
    await expect(
      repository.approveEnterpriseBreakGlass({
        workspaceId: WORKSPACE_ID,
        requestId,
        approverUserId: SECOND_OWNER_ID,
        approvedAt: LATER,
        auditEvent: event('break_glass_approved', SECOND_OWNER_ID),
      }),
    ).resolves.toBe('completed');

    const update = () =>
      repository.updateWorkspaceEnterprisePolicy({
        workspaceId: WORKSPACE_ID,
        actorUserId: OWNER_ID,
        ssoRequired: false,
        minimumAssurance: 'aal2',
        passwordAllowed: true,
        updatedAt: '2026-08-15T12:06:00.000Z',
        breakGlassRequestId: requestId,
        breakGlassAuditEvent: event('break_glass_consumed', OWNER_ID),
        auditEvent: event('workspace_auth_policy_updated', OWNER_ID),
      });
    await expect(update()).resolves.toBe('completed');
    await expect(update()).resolves.toBe('forbidden');
  });
});

function enterpriseSeed(overrides: InMemoryControlPlaneSeed = {}): InMemoryControlPlaneSeed {
  return {
    users: [
      user(OWNER_ID, 'owner@example.com'),
      user(SECOND_OWNER_ID, 'second-owner@example.com'),
      ...(overrides.users ?? []),
    ],
    userEmails: [
      email(OWNER_ID, 'owner@example.com'),
      email(SECOND_OWNER_ID, 'second-owner@example.com'),
      ...(overrides.userEmails ?? []),
    ],
    workspaces: [{ id: WORKSPACE_ID, name: 'Enterprise', createdAt: NOW, updatedAt: NOW }],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: 'owner', createdAt: NOW },
      { workspaceId: WORKSPACE_ID, userId: SECOND_OWNER_ID, role: 'owner', createdAt: NOW },
    ],
    enterpriseSsoConnections: [connection()],
    ...overrides,
  };
}

function validatedSeed(overrides: InMemoryControlPlaneSeed = {}): InMemoryControlPlaneSeed {
  return enterpriseSeed({
    enterpriseSsoConnections: [{ ...connection(), status: 'active', validatedAt: NOW }],
    enterpriseValidationEvidence: [
      {
        id: `ssoevidence_${'v'.repeat(20)}`,
        connectionId: CONNECTION_ID,
        workspaceId: WORKSPACE_ID,
        target: 'okta',
        protocol: 'oidc',
        evidenceReference: 'runbook://okta-smoke/2026-08-15',
        validatedBy: 'deployment-operator',
        validatedAt: NOW,
        revokedAt: null,
      },
    ],
    ...overrides,
  });
}

function connection(): EnterpriseSsoConnectionRecord {
  return {
    id: CONNECTION_ID,
    workspaceId: WORKSPACE_ID,
    provider: 'okta',
    protocol: 'oidc',
    issuer: 'https://login.example.com',
    clientId: 'lodariq-test-client',
    provisioningMode: 'invitation_only',
    status: 'validation_required',
    validatedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function scimConnection(tokenHash: string) {
  return {
    id: `scim_${'t'.repeat(20)}`,
    workspaceId: WORKSPACE_ID,
    connectionId: CONNECTION_ID,
    tokenHash,
    tokenPrefix: 'lq_scim_testtok',
    status: 'active' as const,
    createdByUserId: OWNER_ID,
    lastUsedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function scimProvisionInput(
  tokenHash: string,
  userId: string,
  normalizedEmail: string,
  externalId: string,
  principalId = `ssoprincipal_${'q'.repeat(20)}`,
) {
  return {
    scimConnectionId: `scim_${'t'.repeat(20)}`,
    scimTokenHash: tokenHash,
    user: user(userId, normalizedEmail),
    email: email(userId, normalizedEmail),
    principal: {
      id: principalId,
      workspaceId: WORKSPACE_ID,
      connectionId: CONNECTION_ID,
      userId,
      externalId,
      issuer: 'https://login.example.com',
      subject: null,
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
      deprovisionedAt: null,
    },
    role: 'viewer' as const,
    groupIds: [],
    occurredAt: NOW,
    auditEvent: event('scim_user_provisioned', null, CONNECTION_ID, userId),
  };
}

function user(id: string, normalizedEmail: string) {
  return {
    id,
    legacyIdentityId: null,
    email: normalizedEmail,
    name: null,
    emailVerifiedAt: NOW,
    deletedAt: null,
    retentionExpiresAt: null,
    createdAt: NOW,
  };
}

function email(userId: string, normalizedEmail: string) {
  return {
    id: `email_${userId.replace(/[^A-Za-z0-9_-]/gu, '_')}`,
    userId,
    normalizedEmail,
    isPrimary: true,
    verifiedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function identity(id: string, userId: string, issuer: string, subject: string) {
  return {
    id,
    userId,
    kind: 'oidc' as const,
    issuer,
    subject,
    providerTenantId: 'okta-tenant',
    createdAt: NOW,
    lastAuthenticatedAt: NOW,
  };
}

function authSession(userId: string, suffix: string): AuthSessionRecord {
  return {
    id: `authsess_${suffix.padEnd(20, 's')}`,
    userId,
    tokenHash: createHash(suffix),
    activeWorkspaceId: WORKSPACE_ID,
    identityId: null,
    authenticationMethod: 'oidc',
    assuranceLevel: 'aal1',
    authenticatedAt: NOW,
    durationPolicy: 'managed',
    createdAt: NOW,
    lastSeenAt: NOW,
    idleExpiresAt: '2026-08-15T13:00:00.000Z',
    absoluteExpiresAt: '2026-08-15T20:00:00.000Z',
    revokedAt: null,
  };
}

function enterpriseAuthenticationInput(
  userId: string,
  principalId: string,
  suffix: string,
  groupIds: string[],
) {
  const identityId = `ident_enterprise_${suffix.padEnd(20, 'i')}`;
  const session = { ...authSession(userId, `enterprise-${suffix}`), identityId };
  return {
    connectionId: CONNECTION_ID,
    externalId: 'managed-external-id',
    issuer: 'https://login.example.com',
    subject: 'managed-enterprise-subject',
    emailNormalized: 'managed@example.com',
    emailVerified: true,
    displayName: 'Managed user',
    groupIds,
    occurredAt: NOW,
    candidateUser: user(userId, 'managed@example.com'),
    candidateEmail: email(userId, 'managed@example.com'),
    candidateIdentity: identity(
      identityId,
      userId,
      'https://login.example.com',
      'managed-enterprise-subject',
    ),
    candidatePrincipal: {
      id: principalId,
      workspaceId: WORKSPACE_ID,
      connectionId: CONNECTION_ID,
      userId,
      externalId: 'managed-external-id',
      issuer: 'https://login.example.com',
      subject: 'managed-enterprise-subject',
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
      deprovisionedAt: null,
    },
    candidateSession: session,
    auditEvent: event('enterprise_sso_authenticated', null, CONNECTION_ID, userId),
  };
}

function event(
  eventType: EnterpriseAuditEventRecord['eventType'],
  actorUserId: string | null,
  connectionId: string | null = null,
  targetUserId: string | null = null,
): EnterpriseAuditEventRecord {
  return {
    id: `ssoevt_${randomSuffix()}`,
    workspaceId: WORKSPACE_ID,
    actorUserId,
    eventType,
    connectionId,
    targetUserId,
    correlationId: `corr_${randomSuffix()}`,
    metadata: {},
    occurredAt: NOW,
  };
}

let sequence = 0;
function randomSuffix(): string {
  sequence += 1;
  return String(sequence).padStart(20, 'x');
}

function createHash(value: string): string {
  return [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0).toString(16).padEnd(64, '0');
}
