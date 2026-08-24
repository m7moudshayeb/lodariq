import { describe, expect, it, vi } from 'vitest';
import {
  createInMemoryControlPlaneRepository,
  type ControlPlaneRepository,
} from '@lodariq/database';
import {
  createDataResidencyWorker,
  type DataResidencyProvider,
} from '../../../../apps/api/src/index';

const WORKSPACE_ID = 'wk_residency_worker';
const NOW = '2026-08-22T12:00:00.000Z';
const DIGEST = `sha256-${'a'.repeat(64)}`;

describe('data residency worker', () => {
  it('copies, verifies, cuts over once, and persists value-free evidence', async () => {
    const repository = repositoryFixture();
    await requestMigration(repository);
    const result = {
      providerOperationId: 'storage-operation-one',
      sourceDigest: DIGEST,
      targetDigest: DIGEST,
      recordCount: 42,
    };
    const provider: DataResidencyProvider = {
      id: 'test-storage',
      copy: vi.fn(async () => ({ ...result, providerOperationId: 'copy-one' })),
      verify: vi.fn(async () => ({ ...result, providerOperationId: 'verify-one' })),
      cutover: vi.fn(async () => ({ ...result, providerOperationId: 'cutover-one' })),
    };
    const worker = createDataResidencyWorker({
      repository,
      provider,
      workerId: 'worker_residency_one',
      clock: () => new Date(NOW),
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    await expect(worker.runOnce()).resolves.toBe(1);
    await expect(worker.runOnce()).resolves.toBe(1);
    await expect(worker.runOnce()).resolves.toBe(1);
    await expect(worker.runOnce()).resolves.toBe(0);

    expect(provider.copy).toHaveBeenCalledOnce();
    expect(provider.verify).toHaveBeenCalledOnce();
    expect(provider.cutover).toHaveBeenCalledOnce();
    const route = await repository.resolveWorkspaceDataRoute(WORKSPACE_ID);
    expect(route).toEqual({
      workspaceId: WORKSPACE_ID,
      region: 'eu',
      routeKey: 'primary-eu',
      generation: 1,
    });
    const evidence = await repository.listDataResidencyMigrationEvidence(
      WORKSPACE_ID,
      migrationId(),
    );
    expect(evidence.map(({ phase }) => phase)).toEqual(['copy', 'verify', 'cutover']);
    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceDigest: DIGEST, targetDigest: DIGEST, recordCount: 42 }),
      ]),
    );
    expect(JSON.stringify(evidence)).not.toContain('tenant-record');
  });

  it('fails closed before cutover when provider verification does not reconcile', async () => {
    const repository = repositoryFixture();
    await requestMigration(repository);
    const provider: DataResidencyProvider = {
      id: 'test-storage',
      copy: vi.fn(async () => operation('copy-two', DIGEST)),
      verify: vi.fn(async () => operation('verify-two', `sha256-${'b'.repeat(64)}`)),
      cutover: vi.fn(async () => operation('cutover-two', DIGEST)),
    };
    const worker = createDataResidencyWorker({
      repository,
      provider,
      workerId: 'worker_residency_two',
      clock: () => new Date(NOW),
    });

    await worker.runOnce();
    await worker.runOnce();
    await worker.runOnce();

    expect(provider.cutover).not.toHaveBeenCalled();
    await expect(
      repository.resolveWorkspaceDataRoute(WORKSPACE_ID),
    ).resolves.toMatchObject({ region: 'us', routeKey: 'primary-us', generation: 0 });
    await expect(
      repository.getWorkspaceDataResidencyState(WORKSPACE_ID, 'usr_owner'),
    ).resolves.toMatchObject({ status: 'ok', value: { placement: { activeMigrationId: null } } });
  });
});

function operation(providerOperationId: string, targetDigest: string) {
  return {
    providerOperationId,
    sourceDigest: DIGEST,
    targetDigest,
    recordCount: 42,
  };
}

function repositoryFixture(): ControlPlaneRepository {
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: 'usr_owner',
        legacyIdentityId: null,
        email: 'owner@example.com',
        name: 'Owner',
        emailVerifiedAt: NOW,
        createdAt: NOW,
      },
    ],
    workspaces: [{ id: WORKSPACE_ID, name: 'Residency', createdAt: NOW, updatedAt: NOW }],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: 'usr_owner', role: 'owner', createdAt: NOW },
    ],
  });
}

async function requestMigration(repository: ControlPlaneRepository): Promise<void> {
  const result = await repository.requestDataResidencyMigration({
    migrationId: migrationId(),
    historyId: id('drhist', 'requested'),
    workspaceId: WORKSPACE_ID,
    targetRegion: 'eu',
    expectedPlacementGeneration: 0,
    idempotencyKey: 'residency:worker:eu',
    actorUserId: 'usr_owner',
    requestedAt: NOW,
    auditEventId: id('tenevt', 'requested'),
  });
  if (result.status !== 'completed') throw new Error('Data residency fixture failed');
}

function migrationId(): string {
  return id('drmig', 'worker-eu');
}

function id(prefix: string, suffix: string): string {
  return `${prefix}_${suffix}_${'x'.repeat(24)}`;
}
