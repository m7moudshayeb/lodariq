import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnalyticsEventAggregate,
  AnalyticsTargetResolutionStatus,
} from '@lodariq/schema';
import {
  DASHBOARD_ANALYTICS_AGGREGATE_LIMIT,
  loadAnalyticsAggregates,
} from '../../../../apps/dashboard/src/lib/api';

const API_BASE_URL = 'https://api.dashboard.test';
const PRODUCTION_ID = 'env.production:opaque';
const originalEnvironment = {
  apiBaseUrl: process.env.LODARIQ_API_BASE_URL,
  workspaceId: process.env.LODARIQ_WORKSPACE_ID,
  userId: process.env.LODARIQ_DASHBOARD_USER_ID,
};

type TargetAnalyticsEventAggregate = AnalyticsEventAggregate & {
  name: 'target_resolution';
  targetResolutionStatus: AnalyticsTargetResolutionStatus;
};

describe('@lodariq/dashboard analytics aggregate API client', () => {
  beforeEach(() => {
    process.env.LODARIQ_API_BASE_URL = API_BASE_URL;
    process.env.LODARIQ_WORKSPACE_ID = 'wk.analytics:dashboard';
    process.env.LODARIQ_DASHBOARD_USER_ID = 'user.analytics:dashboard';
  });

  afterEach(() => {
    restoreEnvironment('LODARIQ_API_BASE_URL', originalEnvironment.apiBaseUrl);
    restoreEnvironment('LODARIQ_WORKSPACE_ID', originalEnvironment.workspaceId);
    restoreEnvironment('LODARIQ_DASHBOARD_USER_ID', originalEnvironment.userId);
    vi.unstubAllGlobals();
  });

  it('queries exactly one environment and preserves immutable release dimensions', async () => {
    const aggregates = [
      aggregate({
        publicationId: 'pub.analytics:original',
        contentHash: hash('a'),
        pointerGeneration: 2,
        count: 4,
      }),
      aggregate({
        publicationId: 'pub.analytics:rollback',
        contentHash: hash('a'),
        pointerGeneration: 5,
        count: 2,
      }),
      targetAggregate('ambiguous', {
        publicationId: 'pub.analytics:rollback',
        contentHash: hash('a'),
        pointerGeneration: 5,
        count: 3,
      }),
    ];
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ aggregates }));
    vi.stubGlobal('fetch', fetch);

    await expect(loadAnalyticsAggregates(PRODUCTION_ID)).resolves.toEqual({ aggregates });

    const [request, init] = fetch.mock.calls[0]!;
    const url = new URL(request.toString());
    expect(url.pathname).toBe('/v1/analytics/aggregate');
    expect([...url.searchParams.entries()]).toEqual([
      ['environmentId', PRODUCTION_ID],
      ['limit', String(DASHBOARD_ANALYTICS_AGGREGATE_LIMIT)],
    ]);
    expect(url.searchParams.getAll('environmentId')).toEqual([PRODUCTION_ID]);
    expect(init?.cache).toBe('no-store');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-lodariq-workspace-id')).toBe('wk.analytics:dashboard');
    expect(headers.get('x-lodariq-user-id')).toBe('user.analytics:dashboard');
    expect(aggregates.map(({ publicationId, contentHash, pointerGeneration }) => ({
      publicationId,
      contentHash,
      pointerGeneration,
    }))).toEqual([
      {
        publicationId: 'pub.analytics:original',
        contentHash: hash('a'),
        pointerGeneration: 2,
      },
      {
        publicationId: 'pub.analytics:rollback',
        contentHash: hash('a'),
        pointerGeneration: 5,
      },
      {
        publicationId: 'pub.analytics:rollback',
        contentHash: hash('a'),
        pointerGeneration: 5,
      },
    ]);
    expect(aggregates[2]).toMatchObject({
      name: 'target_resolution',
      targetResolutionStatus: 'ambiguous',
      count: 3,
    });
  });

  it('fails closed on mixed environment or workspace scope', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          jsonResponse({
            aggregates: [
              aggregate(),
              aggregate({ environmentId: 'env.staging:opaque' }),
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            aggregates: [
              aggregate(),
              aggregate({ workspaceId: 'wk.cross-scope' }),
            ],
          }),
        ),
    );

    await expect(loadAnalyticsAggregates(PRODUCTION_ID)).rejects.toMatchObject({
      name: 'DashboardApiError',
      statusCode: 502,
    });
    await expect(loadAnalyticsAggregates(PRODUCTION_ID)).rejects.toMatchObject({
      name: 'DashboardApiError',
      statusCode: 502,
    });
  });

  it('rejects malformed, extended, or chronologically impossible aggregate rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          jsonResponse({ aggregates: [{ ...aggregate(), rawUrl: 'https://customer.example' }] }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            aggregates: [
              aggregate({
                firstTimestamp: '2026-08-09T13:00:00.000Z',
                lastTimestamp: '2026-08-09T12:00:00.000Z',
              }),
            ],
          }),
        ),
    );

    await expect(loadAnalyticsAggregates(PRODUCTION_ID)).rejects.toMatchObject({
      statusCode: 502,
    });
    await expect(loadAnalyticsAggregates(PRODUCTION_ID)).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('enforces the closed target-resolution name/status discriminant', async () => {
    const { targetResolutionStatus: _missing, ...targetWithoutStatus } = targetAggregate('missing');
    void _missing;
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(jsonResponse({ aggregates: [targetWithoutStatus] }))
        .mockResolvedValueOnce(
          jsonResponse({
            aggregates: [
              { ...aggregate({ name: 'tour_started' }), targetResolutionStatus: 'missing' },
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            aggregates: [
              { ...targetAggregate('unknown'), targetResolutionStatus: 'blocked' },
            ],
          }),
        ),
    );

    await expect(loadAnalyticsAggregates(PRODUCTION_ID)).rejects.toMatchObject({
      statusCode: 502,
    });
    await expect(loadAnalyticsAggregates(PRODUCTION_ID)).rejects.toMatchObject({
      statusCode: 502,
    });
    await expect(loadAnalyticsAggregates(PRODUCTION_ID)).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});

function targetAggregate(
  status: AnalyticsTargetResolutionStatus,
  overrides: Partial<AnalyticsEventAggregate> = {},
): TargetAnalyticsEventAggregate {
  return {
    ...aggregate(overrides),
    name: 'target_resolution',
    targetResolutionStatus: status,
  } as TargetAnalyticsEventAggregate;
}

function aggregate(
  overrides: Partial<AnalyticsEventAggregate> = {},
): AnalyticsEventAggregate {
  return {
    workspaceId: 'wk.analytics:dashboard',
    environmentId: PRODUCTION_ID,
    documentId: 'doc.analytics:tour',
    publicationId: 'pub.analytics:production',
    contentHash: hash('b'),
    pointerGeneration: 3,
    name: 'tour_started',
    count: 1,
    firstTimestamp: '2026-08-09T12:00:00.000Z',
    lastTimestamp: '2026-08-09T12:05:00.000Z',
    ...overrides,
  };
}

function hash(character: string): `sha256-${string}` {
  return `sha256-${character.repeat(64)}`;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
