import { describe, expect, it } from 'vitest';
import {
  createDefaultControlPlaneEnvironments,
  createInMemoryControlPlaneRepository,
  type ControlPlaneRepository,
} from '@lodariq/database';
import {
  resolveEnvironmentGovernanceCapabilities,
  type GovernanceCapabilityProfile,
} from '@lodariq/schema';

const WORKSPACE_ID = 'wk_governance_platform';
const OTHER_WORKSPACE_ID = 'wk_governance_other';
const NOW = '2026-08-22T08:00:00.000Z';
const LATER = '2026-08-22T08:01:00.000Z';

describe('governance platform repository', () => {
  it('persists narrowing profiles, enforces base-role assignment, and isolates tenants', async () => {
    const repository = createRepository();
    const profile = memberProfile();
    await expect(
      repository.createGovernanceCapabilityProfile({
        profile,
        actorUserId: 'usr_owner',
        auditEventId: id('tenevt', 'profile-created'),
      }),
    ).resolves.toMatchObject({ status: 'completed', value: profile });
    await expect(
      repository.createGovernanceCapabilityProfile({
        profile: { ...profile, id: id('gcp', 'viewer-forge'), baseRole: 'viewer' },
        actorUserId: 'usr_owner',
        auditEventId: id('tenevt', 'viewer-forge'),
      }),
    ).resolves.toEqual({ status: 'invalid_capabilities' });
    await expect(
      repository.assignGovernanceCapabilityProfile({
        assignment: {
          workspaceId: WORKSPACE_ID,
          environmentId: 'env_staging',
          userId: 'usr_admin',
          profileId: profile.id,
          assignedByUserId: 'usr_owner',
          assignedAt: NOW,
        },
        actorUserId: 'usr_owner',
        auditEventId: id('tenevt', 'wrong-role'),
      }),
    ).resolves.toEqual({ status: 'base_role_mismatch' });
    await expect(
      repository.assignGovernanceCapabilityProfile({
        assignment: {
          workspaceId: WORKSPACE_ID,
          environmentId: 'env_staging',
          userId: 'usr_member',
          profileId: profile.id,
          assignedByUserId: 'usr_owner',
          assignedAt: NOW,
        },
        actorUserId: 'usr_owner',
        auditEventId: id('tenevt', 'assigned'),
      }),
    ).resolves.toMatchObject({ status: 'completed' });
    const resolved = await repository.resolveGovernanceCapabilityProfile(
      WORKSPACE_ID,
      'env_staging',
      'usr_member',
    );
    const environment = (await repository.listEnvironments(WORKSPACE_ID)).find(
      ({ id: environmentId }) => environmentId === 'env_staging',
    );
    expect(
      resolveEnvironmentGovernanceCapabilities({
        role: resolved!.membershipRole,
        profile: resolved!.profile,
        environmentCapabilities: environment!.governanceCapabilities!,
      }),
    ).toEqual(['authoring:read', 'authoring:write', 'release:verify']);
    await expect(
      repository.listGovernanceCapabilityProfiles(WORKSPACE_ID, 'usr_viewer'),
    ).resolves.toEqual({ status: 'forbidden' });
    await expect(
      repository.listGovernanceCapabilityProfiles(WORKSPACE_ID, 'usr_other_owner'),
    ).resolves.toEqual({ status: 'forbidden' });

    const adminProfile: GovernanceCapabilityProfile = {
      ...memberProfile(),
      id: id('gcp', 'admin-audit-only'),
      name: 'Admin audit only',
      baseRole: 'admin' as const,
      capabilities: ['audit:export'],
    };
    await expect(
      repository.createGovernanceCapabilityProfile({
        profile: adminProfile,
        actorUserId: 'usr_owner',
        auditEventId: id('tenevt', 'admin-profile-created'),
      }),
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(
      repository.assignWorkspaceGovernanceCapabilityProfile({
        assignment: {
          workspaceId: WORKSPACE_ID,
          userId: 'usr_admin',
          profileId: adminProfile.id,
          assignedByUserId: 'usr_owner',
          assignedAt: NOW,
        },
        actorUserId: 'usr_owner',
        auditEventId: id('tenevt', 'workspace-assigned'),
      }),
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(
      repository.resolveWorkspaceGovernanceCapabilityProfile(WORKSPACE_ID, 'usr_admin'),
    ).resolves.toMatchObject({ membershipRole: 'admin', profile: { id: adminProfile.id } });
  });

  it('fans out idempotent webhook events and moves exhausted retries to replayable dead letter', async () => {
    const repository = createRepository();
    await createEndpoint(repository, 'primary', ['brand.drift_detected']);
    await createEndpoint(repository, 'release-only', ['release.activated']);
    const event = {
      schemaVersion: '1' as const,
      id: id('whevt', 'drift'),
      workspaceId: WORKSPACE_ID,
      type: 'brand.drift_detected' as const,
      occurredAt: NOW,
      data: { documentId: 'doc_one', classification: 'actionable' },
    };
    const enqueue = () =>
      repository.enqueueWebhookEvent({
        event,
        deliveryIdForEndpoint: (endpointId) => id('whdel', endpointId),
      });
    await expect(enqueue()).resolves.toHaveLength(1);
    await expect(enqueue()).resolves.toHaveLength(1);

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const leased = await repository.leaseWebhookDeliveries(
        'worker_one',
        `2026-08-22T08:${String(attempt).padStart(2, '0')}:00.000Z`,
        `2026-08-22T08:${String(attempt).padStart(2, '0')}:30.000Z`,
        10,
      );
      expect(leased).toHaveLength(1);
      await repository.failWebhookDelivery({
        workspaceId: WORKSPACE_ID,
        deliveryId: leased[0]!.delivery.id,
        leaseOwner: 'worker_one',
        failedAt: leased[0]!.delivery.updatedAt,
        responseStatus: 503,
        errorCode: 'http_error',
        nextAvailableAt: `2026-08-22T08:${String(attempt + 1).padStart(2, '0')}:00.000Z`,
      });
    }
    const dead = await repository.listWebhookDeliveries(WORKSPACE_ID, 'usr_owner');
    expect(dead).toMatchObject({ status: 'ok', value: [{ status: 'dead', attempts: 8 }] });
    if (dead.status !== 'ok') throw new Error('Expected webhook deliveries');
    await expect(
      repository.replayWebhookDelivery({
        workspaceId: WORKSPACE_ID,
        deliveryId: dead.value[0]!.id,
        actorUserId: 'usr_owner',
        replayedAt: '2026-08-22T09:00:00.000Z',
        auditEventId: id('tenevt', 'replayed'),
      }),
    ).resolves.toMatchObject({ status: 'completed' });
  });

  it('requires ordered residency verification and performs one CAS cutover without copies', async () => {
    const repository = createRepository();
    const request = {
      migrationId: id('drmig', 'eu'),
      historyId: id('drhist', 'requested'),
      workspaceId: WORKSPACE_ID,
      targetRegion: 'eu' as const,
      expectedPlacementGeneration: 0,
      idempotencyKey: 'residency:eu:one',
      actorUserId: 'usr_owner',
      requestedAt: NOW,
      auditEventId: id('tenevt', 'residency-requested'),
    };
    await expect(repository.requestDataResidencyMigration(request)).resolves.toMatchObject({
      status: 'completed',
      value: { status: 'requested', sourceRegion: 'us', targetRegion: 'eu' },
    });
    await expect(repository.requestDataResidencyMigration(request)).resolves.toMatchObject({
      status: 'completed',
    });
    await expect(
      repository.requestDataResidencyMigration({ ...request, targetRegion: 'apac' }),
    ).resolves.toEqual({ status: 'conflict' });
    await expect(
      transition(repository, 'requested', 'completed', 'invalid-direct'),
    ).resolves.toEqual({ status: 'conflict' });
    await expect(transition(repository, 'requested', 'copying', 'copying')).resolves.toMatchObject({
      status: 'completed',
    });
    await expect(
      transition(repository, 'copying', 'verifying', 'verifying'),
    ).resolves.toMatchObject({
      status: 'completed',
    });
    await expect(
      transition(repository, 'verifying', 'cutover-ready', 'cutover-ready'),
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(
      transition(repository, 'cutover-ready', 'completed', 'completed'),
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(
      repository.getWorkspaceDataResidencyState(WORKSPACE_ID, 'usr_owner'),
    ).resolves.toMatchObject({
      status: 'ok',
      value: {
        placement: { region: 'eu', generation: 1, activeMigrationId: null },
        migration: null,
      },
    });
  });
});

function createRepository(): ControlPlaneRepository {
  const environments = createDefaultControlPlaneEnvironments(WORKSPACE_ID);
  return createInMemoryControlPlaneRepository({
    users: [
      user('usr_owner'),
      user('usr_admin'),
      user('usr_member'),
      user('usr_viewer'),
      user('usr_other_owner'),
    ],
    workspaces: [workspace(WORKSPACE_ID), workspace(OTHER_WORKSPACE_ID)],
    workspaceMemberships: [
      membership(WORKSPACE_ID, 'usr_owner', 'owner'),
      membership(WORKSPACE_ID, 'usr_admin', 'admin'),
      membership(WORKSPACE_ID, 'usr_member', 'member'),
      membership(WORKSPACE_ID, 'usr_viewer', 'viewer'),
      membership(OTHER_WORKSPACE_ID, 'usr_other_owner', 'owner'),
    ],
    environments,
  });
}

function memberProfile(): GovernanceCapabilityProfile {
  return {
    schemaVersion: '1' as const,
    id: id('gcp', 'member-reviewer'),
    workspaceId: WORKSPACE_ID,
    name: 'Member reviewer',
    baseRole: 'member' as const,
    capabilities: ['authoring:read', 'authoring:write', 'release:verify'],
    revision: 1,
    createdByUserId: 'usr_owner',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function createEndpoint(
  repository: ControlPlaneRepository,
  suffix: string,
  eventTypes: Array<'brand.drift_detected' | 'release.activated'>,
) {
  return repository.createWebhookEndpoint({
    endpoint: {
      id: id('whep', suffix),
      workspaceId: WORKSPACE_ID,
      url: `https://${suffix}.example.com/lodariq`,
      eventTypes,
      secretVersion: 1,
      enabled: true,
      createdByUserId: 'usr_owner',
      createdAt: NOW,
      updatedAt: NOW,
    },
    actorUserId: 'usr_owner',
    auditEventId: id('tenevt', `endpoint-${suffix}`),
  });
}

function transition(
  repository: ControlPlaneRepository,
  expectedStatus: 'requested' | 'copying' | 'verifying' | 'cutover-ready',
  nextStatus: 'copying' | 'verifying' | 'cutover-ready' | 'completed',
  suffix: string,
) {
  return repository.transitionDataResidencyMigration({
    workspaceId: WORKSPACE_ID,
    migrationId: id('drmig', 'eu'),
    historyId: id('drhist', suffix),
    expectedStatus,
    nextStatus,
    transitionedAt: LATER,
    actorId: 'system:residency-worker',
    auditEventId: id('tenevt', `transition-${suffix}`),
  });
}

function user(idValue: string) {
  return {
    id: idValue,
    legacyIdentityId: null,
    email: `${idValue}@example.com`,
    name: idValue,
    emailVerifiedAt: NOW,
    createdAt: NOW,
  };
}

function workspace(idValue: string) {
  return { id: idValue, name: idValue, createdAt: NOW, updatedAt: NOW };
}

function membership(
  workspaceId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member' | 'viewer',
) {
  return { workspaceId, userId, role, createdAt: NOW };
}

function id(prefix: string, suffix: string): string {
  return `${prefix}_${suffix.replace(/[^A-Za-z0-9_-]/gu, '_')}_${'x'.repeat(20)}`;
}
