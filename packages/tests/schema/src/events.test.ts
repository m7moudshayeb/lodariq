import { describe, expect, it } from 'vitest';
import {
  AnalyticsAggregateResponse,
  AnalyticsEnvironmentQuery,
  AuthoritativeAnalyticsEvent,
  SdkAnalyticsEvent,
  validate,
} from '@lodariq/schema';

const CONTENT_HASH = `sha256-${'a'.repeat(64)}`;

const sdkEvent = {
  name: 'tour_started',
  documentId: 'doc_welcome',
  pointer: {
    generation: 3,
    publicationId: 'pub_welcome_3',
    contentHash: CONTENT_HASH,
  },
  sdkVersion: '0.0.0-test',
  timestamp: '2026-08-09T12:00:00.000Z',
  props: { trigger: 'manual', nested: { count: 1 } },
};

describe('Phase 2 analytics contracts', () => {
  it('accepts a bounded identity-free SDK event with a current-pointer assertion', () => {
    expect(validate(SdkAnalyticsEvent, sdkEvent)).toEqual({ valid: true, value: sdkEvent });
  });

  it('rejects server identity fields and incomplete pointer assertions on the wire', () => {
    expect(validate(SdkAnalyticsEvent, { ...sdkEvent, workspaceId: 'wk_spoofed' }).valid).toBe(
      false,
    );
    expect(validate(SdkAnalyticsEvent, { ...sdkEvent, pointer: undefined }).valid).toBe(false);
    expect(
      validate(SdkAnalyticsEvent, {
        ...sdkEvent,
        pointer: { ...sdkEvent.pointer, contentHash: 'not-content-addressed' },
      }).valid,
    ).toBe(false);
  });

  it('bounds recursive event properties', () => {
    expect(
      validate(SdkAnalyticsEvent, {
        ...sdkEvent,
        props: { values: Array.from({ length: 33 }, (_, index) => index) },
      }).valid,
    ).toBe(false);
    expect(
      validate(SdkAnalyticsEvent, {
        ...sdkEvent,
        props: { message: 'x'.repeat(501) },
      }).valid,
    ).toBe(false);
  });

  it('requires all authoritative storage dimensions', () => {
    const authoritative = {
      workspaceId: 'wk_authoritative',
      environmentId: 'env_staging',
      documentId: 'doc_welcome',
      publicationId: 'pub_welcome_3',
      contentHash: CONTENT_HASH,
      pointerGeneration: 3,
      name: sdkEvent.name,
      sdkVersion: sdkEvent.sdkVersion,
      timestamp: sdkEvent.timestamp,
    };
    expect(validate(AuthoritativeAnalyticsEvent, authoritative).valid).toBe(true);
    const { environmentId: _environmentId, ...withoutEnvironment } = authoritative;
    expect(validate(AuthoritativeAnalyticsEvent, withoutEnvironment).valid).toBe(false);
  });

  it('makes one environment mandatory for every analytics read', () => {
    expect(
      validate(AnalyticsEnvironmentQuery, {
        environmentId: 'env_staging',
        documentId: 'doc_welcome',
        locale: 'de',
      }).valid,
    ).toBe(true);
    expect(validate(AnalyticsEnvironmentQuery, { documentId: 'doc_welcome' }).valid).toBe(false);
    expect(
      validate(AnalyticsEnvironmentQuery, {
        environmentId: 'env_staging',
        locale: 'not_a_locale',
      }).valid,
    ).toBe(false);
    expect(
      validate(AnalyticsEnvironmentQuery, {
        environmentId: 'env_staging',
        environments: ['env_staging', 'env_production'],
      }).valid,
    ).toBe(false);
  });

  it('keeps every immutable release dimension in a closed aggregate response', () => {
    const aggregate = {
      workspaceId: 'wk_authoritative',
      environmentId: 'env_production',
      documentId: 'doc_welcome',
      publicationId: 'pub_welcome_3',
      contentHash: CONTENT_HASH,
      pointerGeneration: 3,
      locale: 'de',
      name: 'tour_completed',
      count: 7,
      firstTimestamp: '2026-08-09T12:00:00.000Z',
      lastTimestamp: '2026-08-09T12:05:00.000Z',
    };

    expect(validate(AnalyticsAggregateResponse, { aggregates: [aggregate] }).valid).toBe(true);
    expect(
      validate(AnalyticsAggregateResponse, {
        aggregates: [{ ...aggregate, environmentId: undefined }],
      }).valid,
    ).toBe(false);
    expect(
      validate(AnalyticsAggregateResponse, {
        aggregates: [{ ...aggregate, conversionRate: 0.5 }],
      }).valid,
    ).toBe(false);
    expect(
      validate(AnalyticsAggregateResponse, {
        aggregates: [
          {
            ...aggregate,
            name: 'target_resolution',
            targetResolutionStatus: 'missing',
          },
        ],
      }).valid,
    ).toBe(true);
    expect(
      validate(AnalyticsAggregateResponse, {
        aggregates: [{ ...aggregate, targetResolutionStatus: 'failed' }],
      }).valid,
    ).toBe(false);
  });
});
