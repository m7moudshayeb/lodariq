import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoritativeAnalyticsEvent, LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  ANALYTICS_EXPORT_LEASE_MS,
  AnalyticsExportGenerationError,
  assertAnalyticsExportResult,
  buildAnalyticsSummaryCsv,
  buildRawAnalyticsJsonl,
  type CreateAnalyticsExportJobInput,
  type PersistedAnalyticsEventRecord,
} from '@lodariq/database';
import {
  businessSubscription,
  createGrandfatheredInMemoryControlPlaneRepository,
} from '../../fixtures/commercial.js';

const WORKSPACE_ID = 'wk_exports';
const ENVIRONMENT_ID = 'env_staging';
const NOW = '2026-08-21T09:00:00.000Z';
const DOCUMENT = {
  ...(structuredClone(tourFixture) as LodariqDocument),
  id: 'doc_exports',
  workspaceId: WORKSPACE_ID,
};
const SCOPE = {
  workspaceId: WORKSPACE_ID,
  environmentId: ENVIRONMENT_ID,
  documentId: DOCUMENT.id,
};

describe('in-memory analytics exports', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it('deduplicates a concurrent request and meters only the winning job', async () => {
    const repository = createRepository();
    const input = request('same', 'summary-csv');
    const jobs = await Promise.all(
      Array.from({ length: 32 }, () => repository.createAnalyticsExportJob(input)),
    );

    expect(new Set(jobs.map((job) => job.id)).size).toBe(1);
    await expect(repository.listAnalyticsExportJobs(SCOPE)).resolves.toHaveLength(1);
    await expect(repository.listAnalyticsExportAuditEvents(SCOPE)).resolves.toMatchObject([
      { eventType: 'requested' },
    ]);
    await expect(repository.readWorkspaceCommercialUsage(WORKSPACE_ID)).resolves.toMatchObject({
      analyticsExports: { used: 1, limit: 1_000 },
    });
    await expect(
      repository.createAnalyticsExportJob({ ...input, actorUserId: 'usr_other' }),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('enforces feature, monthly quota, and active-job backpressure independently', async () => {
    const scale = createRepository({
      workspaceSubscriptions: [
        {
          ...businessSubscription(WORKSPACE_ID),
          planId: 'scale',
          entitlementOverrides: { analyticsExportsPerMonth: 1 },
        },
      ],
    });
    await expect(
      scale.createAnalyticsExportJob(request('scale', 'summary-csv')),
    ).resolves.toMatchObject({ kind: 'summary-csv' });
    await expect(
      scale.createAnalyticsExportJob(request('quota', 'summary-csv')),
    ).rejects.toMatchObject({ limitKey: 'analytics-export-jobs', used: 1, limit: 1 });
    await expect(
      scale.createAnalyticsExportJob(request('raw', 'raw-events-jsonl')),
    ).rejects.toMatchObject({ feature: 'raw-event-export' });

    const business = createRepository();
    const active = await Promise.all([
      business.createAnalyticsExportJob(request('one', 'summary-csv')),
      business.createAnalyticsExportJob(request('two', 'summary-csv')),
      business.createAnalyticsExportJob(request('three', 'raw-events-jsonl')),
    ]);
    expect(active[2]?.retentionCutoff).toBe('2026-07-22T09:00:00.000Z');
    await expect(
      business.createAnalyticsExportJob(request('four', 'summary-csv')),
    ).rejects.toMatchObject({ code: 'analytics_export_backpressure' });
  });

  it('recovers an expired lease and applies bounded retry backoff', async () => {
    const repository = createRepository();
    const queued = await repository.createAnalyticsExportJob(request('retry', 'summary-csv'));
    const [first] = await repository.claimAnalyticsExportJobs({
      workerId: 'worker_one',
      now: NOW,
      limit: 1,
    });
    expect(first).toMatchObject({ id: queued.id, status: 'processing', attemptCount: 1 });

    const failed = await repository.failAnalyticsExportJob({
      workspaceId: WORKSPACE_ID,
      jobId: queued.id,
      workerId: 'worker_one',
      errorCode: 'generation_failed',
      failedAt: NOW,
    });
    expect(failed).toMatchObject({ status: 'queued', attemptCount: 1 });
    await expect(
      repository.claimAnalyticsExportJobs({
        workerId: 'worker_two',
        now: new Date(Date.parse(NOW) + 999).toISOString(),
        limit: 1,
      }),
    ).resolves.toEqual([]);
    const [second] = await repository.claimAnalyticsExportJobs({
      workerId: 'worker_two',
      now: new Date(Date.parse(NOW) + 1_000).toISOString(),
      limit: 1,
    });
    expect(second).toMatchObject({ status: 'processing', attemptCount: 2 });

    const recovered = await repository.claimAnalyticsExportJobs({
      workerId: 'worker_three',
      now: new Date(Date.parse(NOW) + 1_000 + ANALYTICS_EXPORT_LEASE_MS).toISOString(),
      limit: 1,
    });
    expect(recovered[0]).toMatchObject({ id: queued.id, attemptCount: 3 });
  });

  it('neutralizes CSV formulas and omits private visitor hashes from raw JSONL', async () => {
    const repository = createRepository();
    await repository.ingestAuthoritativeEvents({
      workspaceId: WORKSPACE_ID,
      environmentId: ENVIRONMENT_ID,
      adaptiveVisitorKeyHash: 'f'.repeat(64),
      events: [authoritativeEvent({ correlationId: 'session_export' })],
    });
    const [event] = await repository.readAnalyticsExportEvents({
      ...SCOPE,
      retentionCutoff: '2026-07-22T09:00:00.000Z',
      requestedAt: NOW,
    });
    if (!event) throw new Error('analytics export event fixture is missing');
    await repository.recordFormResponses({
      ...SCOPE,
      responses: [
        {
          stepId: 'block_step_1',
          blockId: 'field_1',
          label: '=HYPERLINK("bad")',
          answer: 'safe',
          occurredAt: '2026-08-21T08:10:00.000Z',
        },
      ],
    });
    const job = await repository.createAnalyticsExportJob(request('content', 'summary-csv'));
    const analytics = await repository.readExperienceAnalytics({
      ...SCOPE,
      stepIdsInOrder: ['block_step_1'],
      asOf: NOW,
    });
    const csv = buildAnalyticsSummaryCsv(job, analytics);
    expect(csv.content).toContain("'=HYPERLINK");

    const raw = buildRawAnalyticsJsonl({ ...job, kind: 'raw-events-jsonl' }, [event]);
    expect(raw.content).toContain('experience_shown');
    expect(raw.content).toContain('audienceSegment');
    expect(raw.content).not.toContain('adaptiveVisitorKeyHash');
    expect(raw.content).not.toContain('visitorKeyHash');
    expect(raw.content).not.toContain('f'.repeat(64));
    expect(csv.content).toContain('pub_export');
    expect(csv.content).toContain('audience_segment_id');
    expect(csv.content).toContain('audience_segment_summary');
    expect(
      new Set(
        csv.content
          .trim()
          .split('\r\n')
          .map((row) => row.split(',').length),
      ),
    ).toEqual(new Set([16]));

    expect(() =>
      assertAnalyticsExportResult({
        workspaceId: WORKSPACE_ID,
        jobId: job.id,
        workerId: 'worker_invalid',
        filename: 'invalid.csv',
        contentType: 'text/csv; charset=utf-8',
        contentBase64: Buffer.from('safe').toString('base64'),
        byteLength: 4,
        contentHash: `sha256-${'0'.repeat(64)}`,
        completedAt: NOW,
      }),
    ).toThrowError(AnalyticsExportGenerationError);

    expect(() =>
      buildAnalyticsSummaryCsv(
        {
          ...job,
          release: {
            publicationId: 'pub_missing',
            contentHash: `sha256-${'9'.repeat(64)}`,
            pointerGeneration: 99,
          },
        },
        analytics,
      ),
    ).toThrowError(AnalyticsExportGenerationError);
  });

  it('fails closed when a raw export exceeds the bounded source window', async () => {
    const analyticsEvents = Array.from({ length: 50_001 }, (_unused, index) =>
      persistedEvent({ id: `aevt_${String(index).padStart(20, '0')}` }),
    );
    const repository = createRepository({ analyticsEvents });

    await expect(
      repository.readAnalyticsExportEvents({
        ...SCOPE,
        retentionCutoff: '2026-07-22T09:00:00.000Z',
        requestedAt: NOW,
      }),
    ).rejects.toMatchObject({ code: 'result_too_large' });
  });
});

function createRepository(
  overrides: Parameters<typeof createGrandfatheredInMemoryControlPlaneRepository>[0] = {},
) {
  return createGrandfatheredInMemoryControlPlaneRepository({
    ...overrides,
    documents: [DOCUMENT],
    environments: [
      {
        id: ENVIRONMENT_ID,
        workspaceId: WORKSPACE_ID,
        kind: 'staging',
        name: 'Staging',
        originAllowlist: ['https://staging.customer.test'],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  });
}

function request(
  suffix: string,
  kind: CreateAnalyticsExportJobInput['kind'],
): CreateAnalyticsExportJobInput {
  const hashCharacter = suffix.length.toString(16).slice(-1);
  return {
    ...SCOPE,
    operationId: `anxop_${suffix.padEnd(20, '_')}`,
    requestHash: `sha256-${hashCharacter.repeat(64)}`,
    kind,
    actorUserId: 'usr_exporter',
    requestedAt: NOW,
  };
}

function persistedEvent(
  overrides: Partial<PersistedAnalyticsEventRecord> = {},
): PersistedAnalyticsEventRecord {
  return {
    id: `aevt_${'a'.repeat(20)}`,
    ingestedAt: '2026-08-21T08:00:01.000Z',
    ...authoritativeEvent(),
    ...overrides,
  };
}

function authoritativeEvent(
  overrides: Partial<AuthoritativeAnalyticsEvent> = {},
): AuthoritativeAnalyticsEvent {
  return {
    workspaceId: WORKSPACE_ID,
    environmentId: ENVIRONMENT_ID,
    documentId: DOCUMENT.id,
    publicationId: 'pub_export',
    contentHash: `sha256-${'a'.repeat(64)}`,
    pointerGeneration: 2,
    audienceSegment: {
      id: `audseg_${'c'.repeat(64)}`,
      definitionVersion: 1,
      ruleCount: 2,
    },
    name: 'experience_shown',
    sdkVersion: '2.0.0',
    timestamp: '2026-08-21T08:00:00.000Z',
    ...overrides,
  };
}
