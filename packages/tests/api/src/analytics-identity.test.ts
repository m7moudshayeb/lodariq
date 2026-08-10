import { describe, expect, it } from 'vitest';
import {
  resolveAuthoritativeAnalyticsBatch,
  type ActiveAnalyticsPointer,
  type ResolvedAnalyticsPointer,
} from '../../../../apps/api/src/analytics/authoritative-events';

const CONTENT_HASH = `sha256-${'a'.repeat(64)}`;
const ROLLBACK_CONTENT_HASH = `sha256-${'b'.repeat(64)}`;

const scope = {
  workspaceId: 'wk_authoritative',
  environmentId: 'env_staging',
};

const activePointer: ActiveAnalyticsPointer = {
  state: 'active',
  ...scope,
  documentId: 'doc_welcome',
  generation: 4,
  publicationId: 'pub_welcome_4',
  contentHash: CONTENT_HASH,
};

function event(pointer: ActiveAnalyticsPointer = activePointer) {
  return {
    name: 'tour_started',
    documentId: pointer.documentId,
    pointer: {
      generation: pointer.generation,
      publicationId: pointer.publicationId,
      contentHash: pointer.contentHash,
    },
    stepId: 'step_intro',
    sdkVersion: '0.0.0-test',
    correlationId: 'corr_runtime_1',
    timestamp: '2026-08-09T12:00:00.000Z',
    props: { trigger: 'manual', attempts: 1 },
  };
}

describe('authoritative analytics identity', () => {
  it('stamps every persisted dimension from the resolved active pointer', async () => {
    const result = await resolveAuthoritativeAnalyticsBatch(scope, [event()], async () =>
      Promise.resolve(activePointer),
    );

    expect(result.result).toEqual({ accepted: 1, rejected: 0, diagnostics: [] });
    expect(result.events).toEqual([
      {
        workspaceId: 'wk_authoritative',
        environmentId: 'env_staging',
        documentId: 'doc_welcome',
        publicationId: 'pub_welcome_4',
        contentHash: CONTENT_HASH,
        pointerGeneration: 4,
        name: 'tour_started',
        stepId: 'step_intro',
        sdkVersion: '0.0.0-test',
        correlationId: 'corr_runtime_1',
        timestamp: '2026-08-09T12:00:00.000Z',
        props: { trigger: 'manual', attempts: 1 },
      },
    ]);
    expect(result.events[0]).not.toHaveProperty('pointer');
  });

  it('rejects top-level and nested attempts to spoof server-owned identity', async () => {
    const topLevelSpoof = { ...event(), workspaceId: 'wk_spoofed' };
    const nestedSpoof = {
      ...event(),
      props: { safe: true, nested: { environment_id: 'env_spoofed' } },
    };
    const result = await resolveAuthoritativeAnalyticsBatch(
      scope,
      [topLevelSpoof, nestedSpoof],
      async () => Promise.resolve(activePointer),
    );

    expect(result.events).toEqual([]);
    expect(result.result).toEqual({
      accepted: 0,
      rejected: 2,
      diagnostics: [{ code: 'identity_forbidden', count: 2 }],
    });
  });

  it('rejects missing, inactive, stale, and cross-scope pointers with fixed codes only', async () => {
    const pointers = new Map<string, ResolvedAnalyticsPointer | null>([
      ['doc_missing', null],
      [
        'doc_inactive',
        {
          state: 'inactive',
          ...scope,
          documentId: 'doc_inactive',
          generation: 5,
        },
      ],
      ['doc_stale', { ...activePointer, documentId: 'doc_stale' }],
      [
        'doc_cross_scope',
        {
          ...activePointer,
          environmentId: 'env_production',
          documentId: 'doc_cross_scope',
        },
      ],
    ]);
    const forDocument = (documentId: string, overrides: Record<string, unknown> = {}) => ({
      ...event(),
      documentId,
      pointer: {
        generation: 99,
        publicationId: 'pub_asserted',
        contentHash: CONTENT_HASH,
      },
      ...overrides,
    });

    const result = await resolveAuthoritativeAnalyticsBatch(
      scope,
      [
        forDocument('doc_missing'),
        forDocument('doc_inactive'),
        forDocument('doc_stale'),
        forDocument('doc_cross_scope'),
      ],
      async (documentId) => Promise.resolve(pointers.get(documentId) ?? null),
    );

    expect(result.events).toEqual([]);
    expect(result.result).toEqual({
      accepted: 0,
      rejected: 4,
      diagnostics: [
        { code: 'pointer_not_found', count: 1 },
        { code: 'pointer_inactive', count: 1 },
        { code: 'pointer_stale', count: 1 },
        { code: 'scope_mismatch', count: 1 },
      ],
    });
    expect(JSON.stringify(result.result)).not.toContain('doc_');
    expect(JSON.stringify(result.result)).not.toContain('env_production');
  });

  it('does not admit raw URLs, credentials, email addresses, or unbounded payloads', async () => {
    const candidates = [
      { ...event(), props: { url: 'https://customer.example/private' } },
      { ...event(), props: { auth: 'Bearer live.session.jwt' } },
      { ...event(), props: { owner: 'owner@example.com' } },
      { ...event(), props: { host: 'customer.example' } },
      { ...event(), props: { values: Array.from({ length: 33 }, (_, index) => index) } },
    ];
    const result = await resolveAuthoritativeAnalyticsBatch(scope, candidates, async () =>
      Promise.resolve(activePointer),
    );

    expect(result.events).toEqual([]);
    expect(result.result).toEqual({
      accepted: 0,
      rejected: 5,
      diagnostics: [{ code: 'event_invalid', count: 5 }],
    });
  });

  it('keeps rollback analytics continuous while stamping the new pointer generation', async () => {
    let currentPointer: ActiveAnalyticsPointer = {
      ...activePointer,
      generation: 2,
      publicationId: 'pub_original',
      contentHash: ROLLBACK_CONTENT_HASH,
    };
    const beforeRollback = await resolveAuthoritativeAnalyticsBatch(
      scope,
      [event(currentPointer)],
      async () => Promise.resolve(currentPointer),
    );

    currentPointer = {
      ...currentPointer,
      generation: 6,
      publicationId: 'pub_rollback_operation',
      contentHash: ROLLBACK_CONTENT_HASH,
    };
    const afterRollback = await resolveAuthoritativeAnalyticsBatch(
      scope,
      [event(currentPointer)],
      async () => Promise.resolve(currentPointer),
    );

    expect(beforeRollback.events[0]).toMatchObject({
      publicationId: 'pub_original',
      pointerGeneration: 2,
      contentHash: ROLLBACK_CONTENT_HASH,
    });
    expect(afterRollback.events[0]).toMatchObject({
      publicationId: 'pub_rollback_operation',
      pointerGeneration: 6,
      contentHash: ROLLBACK_CONTENT_HASH,
    });
  });
});
