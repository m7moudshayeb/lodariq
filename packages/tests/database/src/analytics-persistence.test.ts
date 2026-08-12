import { describe, expect, it } from 'vitest';
import {
  createInMemoryControlPlaneRepository,
  tenantScopedTableNames,
  type PersistedAnalyticsEventRecord,
} from '@lodariq/database';
import type { AuthoritativeAnalyticsEvent } from '@lodariq/schema';
import { readInitialBaseline } from './migration-test-utils.js';

const stagingHash = `sha256-${'a'.repeat(64)}`;
const productionHash = `sha256-${'b'.repeat(64)}`;

describe('authoritative analytics persistence', () => {
  it('preserves server-owned delivery identity and keeps environment reads isolated', async () => {
    const repository = createInMemoryControlPlaneRepository();
    await repository.ingestAuthoritativeEvents({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      events: [
        event({
          environmentId: 'env_staging',
          publicationId: 'pub_staging',
          contentHash: stagingHash,
          pointerGeneration: 2,
          timestamp: '2026-08-09T08:00:00.000Z',
        }),
      ],
    });
    await repository.ingestAuthoritativeEvents({
      workspaceId: 'wk_a',
      environmentId: 'env_production',
      events: [
        event({
          environmentId: 'env_production',
          publicationId: 'pub_production',
          contentHash: productionHash,
          pointerGeneration: 7,
          timestamp: '2026-08-09T09:00:00.000Z',
        }),
      ],
    });

    const staging = await repository.listAnalyticsEvents({
      workspaceId: 'wk_a',
      query: { environmentId: 'env_staging' },
    });
    const production = await repository.listAnalyticsEvents({
      workspaceId: 'wk_a',
      query: { environmentId: 'env_production' },
    });

    expect(staging).toHaveLength(1);
    expect(staging[0]).toMatchObject({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      documentId: 'doc_a',
      publicationId: 'pub_staging',
      contentHash: stagingHash,
      pointerGeneration: 2,
      name: 'tour.opened',
      props: { source: 'launcher' },
    });
    expect(staging[0]?.id).toMatch(/^aevt_/u);
    expect(staging[0]?.ingestedAt).toMatch(/Z$/u);
    expect(production.map((item) => item.publicationId)).toEqual(['pub_production']);
  });

  it('rejects scope spoofing and prohibited properties before writing any batch member', async () => {
    const repository = createInMemoryControlPlaneRepository();

    await expect(
      repository.ingestAuthoritativeEvents({
        workspaceId: 'wk_a',
        environmentId: 'env_staging',
        events: [
          event(),
          event({ environmentId: 'env_production', publicationId: 'spoofed_publication' }),
        ],
      }),
    ).rejects.toThrow(/environment scope mismatch/u);
    await expect(
      repository.ingestAuthoritativeEvents({
        workspaceId: 'wk_a',
        environmentId: 'env_staging',
        events: [event({ workspaceId: 'wk_spoofed' })],
      }),
    ).rejects.toThrow(/workspace scope mismatch/u);
    await expect(
      repository.ingestAuthoritativeEvents({
        workspaceId: 'wk_a',
        environmentId: 'env_staging',
        events: [event({ props: { nested: { workspace_id: 'wk_spoofed' } } })],
      }),
    ).rejects.toThrow(/must not contain identity/u);
    const prohibitedProps: Array<NonNullable<AuthoritativeAnalyticsEvent['props']>> = [
      { callback: 'https://customer.example/private' },
      { contact: 'creator@customer.example' },
      { auth: 'Bearer live.session.jwt' },
      { credentialValue: 'lod_staging_private_token' },
    ];
    for (const props of prohibitedProps) {
      await expect(
        repository.ingestAuthoritativeEvents({
          workspaceId: 'wk_a',
          environmentId: 'env_staging',
          events: [event({ props })],
        }),
      ).rejects.toThrow(/raw host or credential data/u);
    }
    await expect(
      repository.ingestAuthoritativeEvents({
        workspaceId: 'wk_a',
        environmentId: 'env_staging',
        events: [
          event({
            props: { one: { two: { three: { four: { five: 'too-deep' } } } } },
          }),
        ],
      }),
    ).rejects.toThrow(/nesting depth limit/u);
    await expect(
      repository.ingestAuthoritativeEvents({
        workspaceId: 'wk_a',
        environmentId: 'env_staging',
        events: Array.from({ length: 101 }, () => event()),
      }),
    ).rejects.toThrow(/batch exceeds the event limit/u);

    await expect(
      repository.listAnalyticsEvents({
        workspaceId: 'wk_a',
        query: { environmentId: 'env_staging' },
      }),
    ).resolves.toEqual([]);
  });

  it('keeps rollback generations and immutable publications separate in aggregates', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const events: AuthoritativeAnalyticsEvent[] = [
      event({ timestamp: '2026-08-09T08:00:00.000Z' }),
      event({ timestamp: '2026-08-09T08:05:00.000Z' }),
      event({
        publicationId: 'pub_rollback',
        contentHash: productionHash,
        pointerGeneration: 4,
        timestamp: '2026-08-09T08:10:00.000Z',
      }),
    ];
    await repository.ingestAuthoritativeEvents({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      events,
    });

    const aggregates = await repository.aggregateAnalyticsEvents({
      workspaceId: 'wk_a',
      query: { environmentId: 'env_staging' },
    });

    expect(aggregates).toEqual([
      expect.objectContaining({
        publicationId: 'pub_staging',
        contentHash: stagingHash,
        pointerGeneration: 2,
        count: 2,
        firstTimestamp: '2026-08-09T08:00:00.000Z',
        lastTimestamp: '2026-08-09T08:05:00.000Z',
      }),
      expect.objectContaining({
        publicationId: 'pub_rollback',
        contentHash: productionHash,
        pointerGeneration: 4,
        count: 1,
      }),
    ]);
  });

  it('groups and filters delivery analytics by canonical content locale', async () => {
    const repository = createInMemoryControlPlaneRepository();
    await repository.ingestAuthoritativeEvents({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      events: [
        event({ timestamp: '2026-08-09T08:00:00.000Z', props: { locale: 'de' } }),
        event({ timestamp: '2026-08-09T08:05:00.000Z', props: { locale: 'de' } }),
        event({ timestamp: '2026-08-09T08:10:00.000Z', props: { locale: 'fr' } }),
        event({ timestamp: '2026-08-09T08:15:00.000Z', props: { locale: 'invalid_locale' } }),
      ],
    });

    const aggregates = await repository.aggregateAnalyticsEvents({
      workspaceId: 'wk_a',
      query: { environmentId: 'env_staging' },
    });
    expect(aggregates).toHaveLength(3);
    expect(aggregates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locale: 'de', count: 2 }),
        expect.objectContaining({ locale: 'fr', count: 1 }),
        expect.not.objectContaining({ locale: expect.anything() }),
      ]),
    );

    await expect(
      repository.listAnalyticsEvents({
        workspaceId: 'wk_a',
        query: { environmentId: 'env_staging', locale: 'de' },
      }),
    ).resolves.toHaveLength(2);
    await expect(
      repository.aggregateAnalyticsEvents({
        workspaceId: 'wk_a',
        query: { environmentId: 'env_staging', locale: 'fr' },
      }),
    ).resolves.toEqual([expect.objectContaining({ locale: 'fr', count: 1 })]);
  });

  it('groups only the closed privacy-safe target verdict and never trusts another value', async () => {
    const repository = createInMemoryControlPlaneRepository();
    await repository.ingestAuthoritativeEvents({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      events: [
        event({ name: 'target_resolution', props: { result: 'found' } }),
        event({ name: 'target_resolution', props: { result: 'found' } }),
        event({ name: 'target_resolution', props: { result: 'missing' } }),
        event({ name: 'target_resolution', props: { result: 'invented-status' } }),
      ],
    });

    await expect(
      repository.aggregateAnalyticsEvents({
        workspaceId: 'wk_a',
        query: { environmentId: 'env_staging' },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        name: 'target_resolution',
        targetResolutionStatus: 'found',
        count: 2,
      }),
      expect.objectContaining({
        name: 'target_resolution',
        targetResolutionStatus: 'missing',
        count: 1,
      }),
      expect.objectContaining({
        name: 'target_resolution',
        targetResolutionStatus: 'unknown',
        count: 1,
      }),
    ]);
  });

  it('requires a valid environment query and applies time and result bounds', async () => {
    const repository = createInMemoryControlPlaneRepository({
      analyticsEvents: [
        persistedEvent('aevt_1', event({ timestamp: '2026-08-09T08:00:00.000Z' })),
        persistedEvent('aevt_2', event({ timestamp: '2026-08-09T09:00:00.000Z' })),
        persistedEvent('aevt_3', event({ timestamp: '2026-08-09T10:00:00.000Z' })),
      ],
    });

    await expect(
      repository.listAnalyticsEvents({
        workspaceId: 'wk_a',
        query: { environmentId: '' },
      }),
    ).rejects.toThrow(/select one valid environment/u);
    await expect(
      repository.listAnalyticsEvents({
        workspaceId: 'wk_a',
        query: {
          environmentId: 'env_staging',
          from: '2026-08-09T08:30:00.000Z',
          to: '2026-08-09T10:30:00.000Z',
          limit: 1,
        },
      }),
    ).resolves.toMatchObject([{ id: 'aevt_3' }]);
  });

  it('retains legacy dashboard event ingestion separately', async () => {
    const repository = createInMemoryControlPlaneRepository();
    await expect(
      repository.ingestEvents({
        workspaceId: 'wk_a',
        events: [
          {
            name: 'dashboard.preview',
            sdkVersion: 'dashboard',
            timestamp: '2026-08-09T08:00:00.000Z',
          },
        ],
      }),
    ).resolves.toBe(1);
  });
});

describe('authoritative analytics database baseline', () => {
  it('uses required, queryable delivery dimensions with publication identity integrity', () => {
    const baseline = readInitialBaseline();
    expect(baseline).toContain('create table if not exists analytics_events');
    for (const column of [
      'workspace_id text not null',
      'environment_id text not null',
      'document_id text not null',
      'publication_id text not null',
      'content_hash text not null',
      'pointer_generation integer not null',
    ]) {
      expect(baseline).toContain(column);
    }
    expect(baseline).toContain('analytics_events_publication_identity_fk');
    expect(baseline).toContain(
      'foreign key (workspace_id, environment_id, document_id, publication_id, content_hash)',
    );
    expect(baseline).toContain('analytics_events_environment_occurred_idx');
  });

  it('protects the analytics table with the canonical workspace RLS policy', () => {
    const baseline = readInitialBaseline();
    expect(tenantScopedTableNames).toContain('analytics_events');
    expect(baseline).toContain('alter table analytics_events enable row level security');
    expect(baseline).toContain('alter table analytics_events force row level security');
    expect(baseline).toContain(
      'create policy analytics_events_workspace_isolation on analytics_events',
    );
    expect(baseline).toContain(
      'create policy analytics_events_workspace_insert on analytics_events',
    );
    expect(baseline).not.toMatch(
      /create policy analytics_events_workspace_isolation on analytics_events\s+using/u,
    );
  });
});

function event(overrides: Partial<AuthoritativeAnalyticsEvent> = {}): AuthoritativeAnalyticsEvent {
  return {
    workspaceId: 'wk_a',
    environmentId: 'env_staging',
    documentId: 'doc_a',
    publicationId: 'pub_staging',
    contentHash: stagingHash,
    pointerGeneration: 2,
    name: 'tour.opened',
    sdkVersion: '2.0.0',
    timestamp: '2026-08-09T08:00:00.000Z',
    props: { source: 'launcher' },
    ...overrides,
  };
}

function persistedEvent(
  id: string,
  analyticsEvent: AuthoritativeAnalyticsEvent,
): PersistedAnalyticsEventRecord {
  return {
    id,
    ingestedAt: '2026-08-09T12:00:00.000Z',
    ...analyticsEvent,
  };
}
