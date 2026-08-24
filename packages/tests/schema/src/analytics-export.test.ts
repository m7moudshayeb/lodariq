import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EXPORT_DEFINITION_VERSION,
  AnalyticsExportJob,
  CreateAnalyticsExportRequest,
  validate,
} from '@lodariq/schema';

describe('analytics export contracts', () => {
  it('accepts bounded requests and rejects unknown fields', () => {
    const request = {
      operationId: `anxop_${'a'.repeat(20)}`,
      kind: 'raw-events-jsonl',
      release: {
        publicationId: 'pub_release',
        contentHash: `sha256-${'b'.repeat(64)}`,
        pointerGeneration: 4,
      },
    };

    expect(validate(CreateAnalyticsExportRequest, request).valid).toBe(true);
    expect(validate(CreateAnalyticsExportRequest, { ...request, callbackUrl: 'https://bad.test' }).valid)
      .toBe(false);
    expect(validate(CreateAnalyticsExportRequest, { ...request, kind: 'warehouse' }).valid).toBe(
      false,
    );
  });

  it('exposes job state without result storage or credentials', () => {
    const job = {
      id: `anx_${'c'.repeat(20)}`,
      kind: 'summary-csv',
      status: 'completed',
      definitionVersion: ANALYTICS_EXPORT_DEFINITION_VERSION,
      environmentId: 'env_staging',
      documentId: 'doc_onboarding',
      retentionCutoff: '2026-01-01T00:00:00.000Z',
      attemptCount: 1,
      maxAttempts: 3,
      filename: 'lodariq-doc_onboarding-all-releases.csv',
      byteLength: 128,
      contentHash: `sha256-${'d'.repeat(64)}`,
      createdAt: '2026-08-21T09:00:00.000Z',
      completedAt: '2026-08-21T09:00:01.000Z',
      resultExpiresAt: '2026-08-22T09:00:01.000Z',
    };

    expect(validate(AnalyticsExportJob, job).valid).toBe(true);
    expect(validate(AnalyticsExportJob, { ...job, contentBase64: 'secret' }).valid).toBe(false);
    expect(validate(AnalyticsExportJob, { ...job, byteLength: 16_777_217 }).valid).toBe(false);
  });
});
