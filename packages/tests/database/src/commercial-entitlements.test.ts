import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_CREDIT_METER_VERSION,
  COMMERCIAL_PLAN_VERSION,
  resolveCommercialEntitlements,
  type CommercialPlanId,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  createInMemoryControlPlaneRepository,
  analyticsExportLimitForSnapshot,
  type InMemoryControlPlaneSeed,
  type WorkspaceSubscriptionRecord,
} from '@lodariq/database';

const NOW = '2026-08-21T09:00:00.000Z';
const WORKSPACE_ID = 'wk_commercial';

describe('in-memory commercial entitlements', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it('derives the export quota for immutable snapshots from the previous plan version', () => {
    const entitlements = resolveCommercialEntitlements('scale') as Partial<
      ReturnType<typeof resolveCommercialEntitlements>
    >;
    delete entitlements.analyticsExportsPerMonth;
    expect(
      analyticsExportLimitForSnapshot({
        planId: 'scale',
        entitlements: entitlements as ReturnType<typeof resolveCommercialEntitlements>,
      }),
    ).toBe(100);
  });

  it('creates new workspaces on Free and changes subscriptions with compare-and-swap snapshots', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const initial = await repository.readWorkspaceEntitlementSnapshot(WORKSPACE_ID);

    expect(initial).toMatchObject({
      workspaceId: WORKSPACE_ID,
      subscriptionRevision: 1,
      planId: 'free',
      planVersion: COMMERCIAL_PLAN_VERSION,
      reason: 'workspace_created',
      changeActorId: 'system:repository',
      entitlementHash: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
    });

    const changed = await repository.changeWorkspaceSubscription({
      workspaceId: WORKSPACE_ID,
      planId: 'growth',
      expectedRevision: 1,
      changeActorId: 'usr_billing_admin',
      changedAt: NOW,
    });
    expect(changed).toMatchObject({
      subscriptionRevision: 2,
      planId: 'growth',
      reason: 'plan_changed',
      changeActorId: 'usr_billing_admin',
    });
    await expect(
      repository.changeWorkspaceSubscription({
        workspaceId: WORKSPACE_ID,
        planId: 'scale',
        expectedRevision: 1,
        changeActorId: 'usr_stale',
        changedAt: NOW,
      }),
    ).resolves.toBeNull();
    await expect(repository.readWorkspaceEntitlementSnapshot(WORKSPACE_ID)).resolves.toEqual(
      changed,
    );
  });

  it('deduplicates monthly usage by environment and exposes configured resource counts', async () => {
    const repository = createRepository('growth', {
      environments: [
        environment('env_dev', 'development', ['http://localhost:3000']),
        environment('env_staging', 'staging', [], true),
        environment('env_disabled', 'production', ['https://example.com'], false),
      ],
    });

    await expect(
      repository.recordWorkspaceUsage({
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_dev',
        metric: 'engaged-users',
        quantity: 1,
        dedupeKey: 'engagement-user-1',
        occurredAt: NOW,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.recordWorkspaceUsage({
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_dev',
        metric: 'engaged-users',
        quantity: 1,
        dedupeKey: 'engagement-user-1',
        occurredAt: NOW,
      }),
    ).resolves.toBe(false);
    await expect(
      repository.recordWorkspaceUsage({
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_staging',
        metric: 'engaged-users',
        quantity: 2,
        dedupeKey: 'engagement-user-1',
        occurredAt: NOW,
      }),
    ).resolves.toBe(true);

    await expect(repository.readWorkspaceCommercialUsage(WORKSPACE_ID)).resolves.toMatchObject({
      planId: 'growth',
      engagedUsers: { used: 3, limit: 75_000, enforcement: 'soft' },
      environments: { used: 1, limit: 3, enforcement: 'hard' },
    });
  });

  it('debits AI credits idempotently, rejects conflicts, and isolates calendar months', async () => {
    const repository = createRepository('free');
    const first = aiDebit('a', 40, '2026-08-21T09:00:00.000Z');

    const record = await repository.debitAiCredits(first);
    expect(record).toMatchObject({
      operationId: first.operationId,
      meterVersion: AI_CREDIT_METER_VERSION,
      creditsDebited: 40,
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-09-01T00:00:00.000Z',
    });
    await expect(repository.debitAiCredits(first)).resolves.toEqual(record);
    await expect(repository.debitAiCredits({ ...first, credits: 39 })).rejects.toThrow(
      'AI operation usage conflict',
    );
    await expect(
      repository.debitAiCredits(aiDebit('b', 11, '2026-08-21T09:00:00.000Z')),
    ).rejects.toMatchObject({ limitKey: 'ai-credits', used: 40, limit: 50 });
    await expect(
      repository.debitAiCredits(aiDebit('c', 50, '2026-09-01T00:00:00.000Z')),
    ).resolves.toMatchObject({ periodStart: '2026-09-01T00:00:00.000Z' });

    await expect(repository.readWorkspaceCommercialUsage(WORKSPACE_ID)).resolves.toMatchObject({
      aiCredits: { used: 40, limit: 50, status: 'near' },
    });
  });

  it('allows one idempotent Free theme-generation run per calendar month', async () => {
    const repository = createRepository('free');
    const first = {
      workspaceId: WORKSPACE_ID,
      operationId: 'proposal-first',
      occurredAt: NOW,
    };

    await expect(repository.consumeThemeGenerationRun(first)).resolves.toBe(true);
    await expect(repository.consumeThemeGenerationRun(first)).resolves.toBe(false);
    await expect(
      repository.consumeThemeGenerationRun({ ...first, operationId: 'proposal-second' }),
    ).rejects.toMatchObject({ limitKey: 'theme-generation-runs', used: 1, limit: 1 });
    await expect(repository.readWorkspaceCommercialUsage(WORKSPACE_ID)).resolves.toMatchObject({
      themeGenerationRuns: { used: 1, limit: 1, status: 'near' },
    });
  });

  it('enforces application, locale, feature, and asset limits while allowing later upgrades', async () => {
    const repository = createRepository('free');
    await repository.upsertWorkspaceApplication(application('app_one'));
    await expect(
      repository.upsertWorkspaceApplication(application('app_two')),
    ).rejects.toMatchObject({ limitKey: 'applications', used: 1, limit: 1 });

    const localized = documentFor(WORKSPACE_ID);
    localized.localization = {
      defaultLocale: 'en',
      variants: [{ locale: 'de', fallbackLocale: 'en', blocks: [] }],
    };
    await expect(
      repository.saveDocument({
        workspaceId: WORKSPACE_ID,
        actorUserId: 'usr_author',
        document: localized,
      }),
    ).rejects.toMatchObject({ limitKey: 'locales', used: 2, limit: 1 });

    const branched = documentFor(WORKSPACE_ID);
    branched.localization = { defaultLocale: 'en', variants: [] };
    branched.blocks[0]!.children[0]!.children[2]!.props.action = {
      type: 'next',
      transition: { rules: [], fallback: { type: 'complete' } },
    };
    await expect(
      repository.saveDocument({
        workspaceId: WORKSPACE_ID,
        actorUserId: 'usr_author',
        document: branched,
      }),
    ).rejects.toMatchObject({ limitKey: 'feature', feature: 'branching' });

    await expect(
      repository.createAuthoringMediaAsset({
        workspaceId: WORKSPACE_ID,
        actorUserId: 'usr_author',
        kind: 'image',
        filename: 'oversized.png',
        contentType: 'image/png',
        contentBase64: 'AA==',
        byteLength: 5 * 1_048_576 + 1,
        contentHash: `sha256-${'a'.repeat(64)}`,
        savedToLibrary: false,
      }),
    ).rejects.toMatchObject({ limitKey: 'asset-bytes', limit: 5 * 1_048_576 });

    await repository.changeWorkspaceSubscription({
      workspaceId: WORKSPACE_ID,
      planId: 'growth',
      expectedRevision: 1,
      changeActorId: 'usr_billing_admin',
      changedAt: NOW,
    });
    await expect(
      repository.upsertWorkspaceApplication(application('app_two')),
    ).resolves.toMatchObject({
      id: 'app_two',
    });
    await expect(
      repository.saveDocument({
        workspaceId: WORKSPACE_ID,
        actorUserId: 'usr_author',
        document: branched,
      }),
    ).resolves.toMatchObject({ document: { id: branched.id } });
  });

  it('applies plan retention at read time without deleting immutable versions', async () => {
    const canonical = documentFor(WORKSPACE_ID);
    const versions = [
      documentVersion('version-old', canonical, 1, '2026-08-01T09:00:00.000Z'),
      documentVersion('version-current', canonical, 2, '2026-08-20T09:00:00.000Z'),
    ];
    const repository = createRepository('free', { documentVersions: versions });

    await expect(
      repository.listDocumentVersions(WORKSPACE_ID, canonical.id),
    ).resolves.toMatchObject([{ id: 'version-current' }]);
    await repository.changeWorkspaceSubscription({
      workspaceId: WORKSPACE_ID,
      planId: 'enterprise',
      expectedRevision: 1,
      changeActorId: 'usr_billing_admin',
      changedAt: NOW,
    });
    await expect(
      repository.listDocumentVersions(WORKSPACE_ID, canonical.id),
    ).resolves.toMatchObject([{ id: 'version-current' }, { id: 'version-old' }]);
  });
});

function createRepository(planId: CommercialPlanId, seed: InMemoryControlPlaneSeed = {}) {
  return createInMemoryControlPlaneRepository({
    ...seed,
    workspaceSubscriptions: [subscription(planId)],
  });
}

function subscription(planId: CommercialPlanId): WorkspaceSubscriptionRecord {
  return {
    workspaceId: WORKSPACE_ID,
    planId,
    planVersion: COMMERCIAL_PLAN_VERSION,
    status: 'active',
    entitlementOverrides: {},
    currentPeriodStart: '2026-08-01T00:00:00.000Z',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function environment(
  id: string,
  kind: 'development' | 'staging' | 'production',
  originAllowlist: string[],
  enabled = true,
) {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    kind,
    name: id,
    originAllowlist,
    enabled,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function aiDebit(suffix: string, credits: number, occurredAt: string) {
  return {
    workspaceId: WORKSPACE_ID,
    operationId: `aiop_${suffix.repeat(24)}`,
    provider: 'test-provider',
    meterVersion: AI_CREDIT_METER_VERSION,
    usageUnit: 'tokens' as const,
    inputUnits: 100,
    outputUnits: 50,
    providerCostMicros: 125,
    credits,
    occurredAt,
  };
}

function application(id: string) {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    name: id,
    originPatterns: ['https://example.com'],
    isPrimary: id === 'app_one',
  };
}

function documentFor(workspaceId: string): LodariqDocument {
  return { ...(structuredClone(tourFixture) as LodariqDocument), workspaceId };
}

function documentVersion(
  id: string,
  canonical: LodariqDocument,
  version: number,
  createdAt: string,
) {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    documentId: canonical.id,
    version,
    canonical,
    createdByUserId: 'usr_author',
    createdAt,
  };
}
