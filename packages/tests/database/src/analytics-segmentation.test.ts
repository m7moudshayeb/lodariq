import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import { deriveAnalyticsAudienceSegment } from '@lodariq/database';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type AuthoritativeAnalyticsEvent,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  businessSubscription,
  createGrandfatheredInMemoryControlPlaneRepository,
} from '../../fixtures/commercial.js';

const NOW = '2026-08-21T12:00:00.000Z';
const WORKSPACE_ID = 'wk_segments';
const ENVIRONMENT_ID = 'env_staging';
const USER_ID = 'user_segments';
const ENVIRONMENT = {
  id: ENVIRONMENT_ID,
  workspaceId: WORKSPACE_ID,
  kind: 'staging' as const,
  name: 'Staging',
  originAllowlist: ['https://staging.customer.test'],
  createdAt: NOW,
  updatedAt: NOW,
};
const DOCUMENT = {
  ...(structuredClone(tourFixture) as LodariqDocument),
  id: 'doc_segments',
  workspaceId: WORKSPACE_ID,
};
const SEGMENT = {
  id: `audseg_${'c'.repeat(64)}`,
  definitionVersion: 1 as const,
  ruleCount: 2,
};
const OTHER_SEGMENT = {
  id: `audseg_${'d'.repeat(64)}`,
  definitionVersion: 1 as const,
  ruleCount: 1,
};

describe('trusted audience analytics', () => {
  it.each([
    ['free', false],
    ['growth', true],
  ] as const)(
    'enforces %s audience-result entitlement at the report boundary',
    async (planId, included) => {
      const repository = repositoryForPlan(planId);
      await repository.ingestAuthoritativeEvents({
        workspaceId: WORKSPACE_ID,
        environmentId: ENVIRONMENT_ID,
        events: [
          event('experience_shown', 'session_1'),
          event('experience_completed', 'session_1'),
        ],
      });

      const analytics = await repository.readExperienceAnalytics({
        workspaceId: WORKSPACE_ID,
        environmentId: ENVIRONMENT_ID,
        documentId: DOCUMENT.id,
        stepIdsInOrder: ['block_step_1'],
        asOf: NOW,
      });

      if (included) {
        expect(analytics.breakdown?.audienceSegments).toMatchObject([
          { ...SEGMENT, shown: 1, completed: 1 },
        ]);
        expect(analytics.breakdown?.releases[0]?.audienceSegment).toEqual(SEGMENT);
      } else {
        expect(analytics.breakdown).not.toHaveProperty('audienceSegments');
        expect(analytics.breakdown?.releases[0]).not.toHaveProperty('audienceSegment');
      }
    },
  );

  it('keeps low-level analytics useful without exposing plan-gated segment results', async () => {
    const repository = repositoryForPlan('free');
    await repository.ingestAuthoritativeEvents({
      workspaceId: WORKSPACE_ID,
      environmentId: ENVIRONMENT_ID,
      events: [
        event('experience_shown', 'session_1'),
        {
          ...event('experience_shown', 'session_2'),
          audienceSegment: OTHER_SEGMENT,
          timestamp: '2026-08-21T11:01:00.000Z',
        },
      ],
    });

    const listed = await repository.listAnalyticsEvents({
      workspaceId: WORKSPACE_ID,
      query: { environmentId: ENVIRONMENT_ID },
    });
    expect(listed).toHaveLength(2);
    expect(listed.every((item) => !('audienceSegment' in item))).toBe(true);
    const aggregates = await repository.aggregateAnalyticsEvents({
      workspaceId: WORKSPACE_ID,
      query: { environmentId: ENVIRONMENT_ID },
    });
    expect(aggregates).toEqual([expect.objectContaining({ name: 'experience_shown', count: 2 })]);
    expect(aggregates[0]).not.toHaveProperty('audienceSegment');
    await expect(
      repository.listAnalyticsEvents({
        workspaceId: WORKSPACE_ID,
        query: { environmentId: ENVIRONMENT_ID, audienceSegmentId: SEGMENT.id },
      }),
    ).rejects.toThrow(/not included/u);
  });

  it('keeps a maximum batch separated for Growth and coalesced for Free', async () => {
    const free = repositoryForPlan('free');
    const growth = repositoryForPlan('growth');
    const events = Array.from({ length: 100 }, (_unused, index) => ({
      ...event('experience_shown', `session_${String(index)}`),
      audienceSegment: index % 2 === 0 ? SEGMENT : OTHER_SEGMENT,
      timestamp: new Date(Date.UTC(2026, 7, 21, 11, 0, index)).toISOString(),
    }));
    await Promise.all(
      [free, growth].map((repository) =>
        repository.ingestAuthoritativeEvents({
          workspaceId: WORKSPACE_ID,
          environmentId: ENVIRONMENT_ID,
          events,
        }),
      ),
    );

    const [freeAggregates, growthAggregates] = await Promise.all([
      free.aggregateAnalyticsEvents({
        workspaceId: WORKSPACE_ID,
        query: { environmentId: ENVIRONMENT_ID },
      }),
      growth.aggregateAnalyticsEvents({
        workspaceId: WORKSPACE_ID,
        query: { environmentId: ENVIRONMENT_ID },
      }),
    ]);
    expect(freeAggregates).toEqual([expect.objectContaining({ count: 100 })]);
    expect(freeAggregates[0]).not.toHaveProperty('audienceSegment');
    expect(growthAggregates).toHaveLength(2);
    expect(growthAggregates.map((aggregate) => aggregate.count)).toEqual([50, 50]);
    expect(growthAggregates.every((aggregate) => Boolean(aggregate.audienceSegment))).toBe(true);
  });

  it('derives retained legacy attribution from the immutable compiled audience', async () => {
    const document = structuredClone(DOCUMENT);
    document.audience.rules = [
      { source: 'identify', key: 'account.plan', operator: 'equals', value: 'growth' },
      { source: 'event', key: 'invited_teammate', operator: 'exists' },
    ];
    const compiled = await compileDocument({
      document,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    const repository = createGrandfatheredInMemoryControlPlaneRepository({
      environments: [ENVIRONMENT],
      workspaceMemberships: [
        { workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'admin', createdAt: NOW },
      ],
      workspaceSubscriptions: [{ ...businessSubscription(WORKSPACE_ID), planId: 'growth' }],
    });
    const saved = await repository.saveDocument({
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      document,
      artifact: compiled,
    });
    if (!saved.latestArtifact) throw new Error('compiled segment fixture missing');
    const activated = await repository.activateCompiledArtifact({
      workspaceId: WORKSPACE_ID,
      environmentId: ENVIRONMENT_ID,
      correlationId: 'corr_segment_legacy',
      artifact: saved.latestArtifact,
      actorUserId: USER_ID,
      idempotencyKey: 'publish:segment:legacy',
      requestHash: saved.latestArtifact.contentHash,
      expectedGeneration: 0,
      expectedEnvironmentPolicyUpdatedAt: ENVIRONMENT.updatedAt,
    });
    const { audienceSegment: _segment, ...legacyEvent } = event(
      'experience_shown',
      'legacy_session',
    );
    await repository.ingestAuthoritativeEvents({
      workspaceId: WORKSPACE_ID,
      environmentId: ENVIRONMENT_ID,
      events: [
        {
          ...legacyEvent,
          publicationId: activated.publication.id,
          contentHash: activated.publication.contentHash,
          pointerGeneration: activated.deployment.generation,
        },
      ],
    });

    const analytics = await repository.readExperienceAnalytics({
      workspaceId: WORKSPACE_ID,
      environmentId: ENVIRONMENT_ID,
      documentId: document.id,
      stepIdsInOrder: [],
      asOf: NOW,
    });
    const expected = deriveAnalyticsAudienceSegment(document.audience);
    expect(analytics.breakdown?.audienceSegments?.[0]).toMatchObject({ ...expected, shown: 1 });
    expect(analytics.breakdown?.releases[0]?.audienceSegment).toEqual(expected);
    expect(JSON.stringify(analytics.breakdown?.audienceSegments)).not.toMatch(
      /growth|account\.plan|invited_teammate/u,
    );
  });
});

function event(name: string, correlationId: string): AuthoritativeAnalyticsEvent {
  return {
    workspaceId: WORKSPACE_ID,
    environmentId: ENVIRONMENT_ID,
    documentId: DOCUMENT.id,
    publicationId: 'pub_segments',
    contentHash: `sha256-${'a'.repeat(64)}`,
    pointerGeneration: 1,
    audienceSegment: SEGMENT,
    name,
    sdkVersion: '2.0.0',
    correlationId,
    timestamp: '2026-08-21T11:00:00.000Z',
  };
}

function repositoryForPlan(planId: 'free' | 'growth') {
  return createGrandfatheredInMemoryControlPlaneRepository({
    documents: [DOCUMENT],
    environments: [ENVIRONMENT],
    workspaceSubscriptions: [{ ...businessSubscription(WORKSPACE_ID), planId }],
  });
}
