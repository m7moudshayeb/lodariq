import { createHash } from 'node:crypto';
import type {
  AnalyticsExportJob,
  AnalyticsExportKind,
  AnalyticsExportRelease,
  AnalyticsExportStatus,
  CommercialFeatureId,
  ExperienceAnalytics,
} from '@lodariq/schema';
import { ANALYTICS_EXPORT_DEFINITION_VERSION } from '@lodariq/schema';
import type { PersistedAnalyticsEventRecord } from './analytics';

export const ANALYTICS_EXPORT_MAX_ACTIVE_JOBS = 3;
export const ANALYTICS_EXPORT_MAX_ATTEMPTS = 3;
export const ANALYTICS_EXPORT_MAX_SOURCE_EVENTS = 50_000;
export const ANALYTICS_EXPORT_MAX_RESULT_BYTES = 16 * 1_048_576;
export const ANALYTICS_RAW_EXPORT_RETENTION_DAYS = 30;
export const ANALYTICS_EXPORT_RESULT_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const ANALYTICS_EXPORT_LEASE_MS = 2 * 60 * 1_000;

export const ANALYTICS_EXPORT_FEATURES = {
  'summary-csv': 'analytics-csv',
  'raw-events-jsonl': 'raw-event-export',
} as const satisfies Record<AnalyticsExportKind, CommercialFeatureId>;

export type AnalyticsExportErrorCode =
  'source_unavailable' | 'result_too_large' | 'generation_failed';

export interface PersistedAnalyticsExportJob {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  operationId: string;
  requestHash: string;
  kind: AnalyticsExportKind;
  status: AnalyticsExportStatus;
  definitionVersion: typeof ANALYTICS_EXPORT_DEFINITION_VERSION;
  release?: AnalyticsExportRelease;
  retentionCutoff: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseWorkerId?: string;
  leaseExpiresAt?: string;
  filename?: string;
  contentType?: string;
  byteLength?: number;
  contentHash?: string;
  contentBase64?: string;
  errorCode?: AnalyticsExportErrorCode;
  requestedByUserId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  resultExpiresAt?: string;
  updatedAt: string;
}

export type AnalyticsExportAuditEventType =
  'requested' | 'completed' | 'failed' | 'downloaded' | 'expired';

export interface AnalyticsExportAuditEventRecord {
  id: string;
  workspaceId: string;
  jobId: string;
  eventType: AnalyticsExportAuditEventType;
  actorUserId: string;
  errorCode?: AnalyticsExportErrorCode;
  occurredAt: string;
}

export interface CreateAnalyticsExportJobInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  operationId: string;
  requestHash: string;
  kind: AnalyticsExportKind;
  release?: AnalyticsExportRelease;
  actorUserId: string;
  requestedAt: string;
}

export interface AnalyticsExportScope {
  workspaceId: string;
  environmentId: string;
  documentId: string;
}

export interface ClaimAnalyticsExportJobsInput {
  workerId: string;
  now: string;
  limit: number;
}

export interface ReadAnalyticsExportEventsInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  retentionCutoff: string;
  requestedAt: string;
  release?: AnalyticsExportRelease;
}

export interface CompleteAnalyticsExportJobInput {
  workspaceId: string;
  jobId: string;
  workerId: string;
  filename: string;
  contentType: string;
  contentBase64: string;
  byteLength: number;
  contentHash: string;
  completedAt: string;
}

export interface FailAnalyticsExportJobInput {
  workspaceId: string;
  jobId: string;
  workerId: string;
  errorCode: AnalyticsExportErrorCode;
  failedAt: string;
}

export interface AnalyticsExportContent {
  filename: string;
  contentType: string;
  content: string;
  byteLength: number;
  contentHash: string;
}

export class AnalyticsExportBackpressureError extends Error {
  readonly code = 'analytics_export_backpressure';

  constructor() {
    super('Too many analytics exports are already queued');
    this.name = 'AnalyticsExportBackpressureError';
  }
}

export function assertAnalyticsExportResult(input: CompleteAnalyticsExportJobInput): void {
  const decoded = Buffer.from(input.contentBase64, 'base64');
  const contentHash = `sha256-${createHash('sha256').update(decoded).digest('hex')}`;
  if (
    !input.filename ||
    input.filename.length > 240 ||
    !new Set(['text/csv; charset=utf-8', 'application/x-ndjson; charset=utf-8']).has(
      input.contentType,
    ) ||
    decoded.length > ANALYTICS_EXPORT_MAX_RESULT_BYTES ||
    input.byteLength !== decoded.length ||
    decoded.toString('base64') !== input.contentBase64 ||
    input.contentHash !== contentHash
  ) {
    throw new AnalyticsExportGenerationError('generation_failed');
  }
}

export function toAnalyticsExportJob(record: PersistedAnalyticsExportJob): AnalyticsExportJob {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    definitionVersion: record.definitionVersion,
    environmentId: record.environmentId,
    documentId: record.documentId,
    ...(record.release ? { release: structuredClone(record.release) } : {}),
    retentionCutoff: record.retentionCutoff,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    ...(record.filename ? { filename: record.filename } : {}),
    ...(record.byteLength !== undefined ? { byteLength: record.byteLength } : {}),
    ...(record.contentHash ? { contentHash: record.contentHash } : {}),
    ...(record.errorCode ? { errorCode: record.errorCode } : {}),
    createdAt: record.createdAt,
    ...(record.startedAt ? { startedAt: record.startedAt } : {}),
    ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    ...(record.resultExpiresAt ? { resultExpiresAt: record.resultExpiresAt } : {}),
  };
}

export function buildAnalyticsSummaryCsv(
  job: PersistedAnalyticsExportJob,
  analytics: ExperienceAnalytics,
): AnalyticsExportContent {
  const rows: Array<readonly unknown[]> = [
    [
      'record_type',
      'document_id',
      'environment_id',
      'as_of',
      'retention_cutoff',
      'publication_id',
      'content_hash',
      'pointer_generation',
      'locale',
      'audience_segment_id',
      'audience_segment_definition_version',
      'audience_segment_rule_count',
      'step_id',
      'metric',
      'value',
      'label',
    ],
  ];
  const breakdown = analytics.breakdown;
  const release = job.release
    ? breakdown?.releases.find(
        (candidate) =>
          candidate.publicationId === job.release?.publicationId &&
          candidate.contentHash === job.release.contentHash &&
          candidate.pointerGeneration === job.release.pointerGeneration,
      )
    : undefined;
  if (job.release && !release) {
    throw new AnalyticsExportGenerationError('source_unavailable');
  }
  const common = [
    job.documentId,
    job.environmentId,
    breakdown?.asOf ?? job.createdAt,
    breakdown?.retentionCutoff ?? job.retentionCutoff,
  ];
  if (release) {
    appendAnalyticsReportRows(rows, common, release, [
      release.publicationId,
      release.contentHash,
      release.pointerGeneration,
    ]);
    if (release.audienceSegment) {
      appendAnalyticsReportRows(
        rows,
        common,
        release,
        [release.publicationId, release.contentHash, release.pointerGeneration],
        '',
        [
          release.audienceSegment.id,
          release.audienceSegment.definitionVersion,
          release.audienceSegment.ruleCount,
        ],
        'audience_segment',
      );
    }
  } else {
    appendAnalyticsReportRows(rows, common, analytics, ['', '', '']);
  }
  if (!job.release && breakdown) {
    for (const candidate of breakdown.releases) {
      appendAnalyticsReportRows(rows, common, candidate, [
        candidate.publicationId,
        candidate.contentHash,
        candidate.pointerGeneration,
      ]);
    }
    for (const locale of breakdown.locales) {
      appendAnalyticsReportRows(rows, common, locale, ['', '', ''], locale.locale);
    }
    for (const segment of breakdown.audienceSegments ?? []) {
      appendAnalyticsReportRows(
        rows,
        common,
        segment,
        ['', '', ''],
        '',
        [segment.id, segment.definitionVersion, segment.ruleCount],
        'audience_segment',
      );
    }
    const overall = [...common, '', '', '', '', '', '', ''];
    for (const week of breakdown.retention) {
      rows.push(
        ['retention', ...overall, '', `week_${week.week}_exposed_cohort`, week.exposedCohort, ''],
        [
          'retention',
          ...overall,
          '',
          `week_${week.week}_exposed_returned`,
          week.exposedReturned,
          '',
        ],
        ['retention', ...overall, '', `week_${week.week}_baseline_cohort`, week.baselineCohort, ''],
        [
          'retention',
          ...overall,
          '',
          `week_${week.week}_baseline_returned`,
          week.baselineReturned,
          '',
        ],
      );
    }
  }
  return exportContent(
    `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`,
    exportFilename(job, 'csv'),
    'text/csv; charset=utf-8',
  );
}

type AnalyticsReportCounts = Pick<
  ExperienceAnalytics,
  'shown' | 'completed' | 'dismissed' | 'funnel' | 'adoption' | 'formResponses'
>;

function appendAnalyticsReportRows(
  rows: Array<readonly unknown[]>,
  common: readonly unknown[],
  report: AnalyticsReportCounts,
  identity: readonly [string, string, number] | readonly ['', '', ''],
  locale = '',
  audienceSegment: readonly [string, number, number] | readonly ['', '', ''] = ['', '', ''],
  recordPrefix = '',
): void {
  const scope = [...common, ...identity, locale, ...audienceSegment];
  const recordType = (name: string) => (recordPrefix ? `${recordPrefix}_${name}` : name);
  rows.push(
    [recordType('summary'), ...scope, '', 'shown', report.shown, ''],
    [recordType('summary'), ...scope, '', 'completed', report.completed, ''],
    [recordType('summary'), ...scope, '', 'dismissed', report.dismissed, ''],
  );
  for (const step of report.funnel) {
    rows.push(
      [recordType('funnel'), ...scope, step.stepId, 'reached', step.reached, ''],
      [recordType('funnel'), ...scope, step.stepId, 'completed', step.completed, ''],
    );
  }
  for (const impact of report.adoption) {
    rows.push(
      [recordType('adoption'), ...scope, '', 'treated_rate', impact.treatedRate, impact.eventName],
      [
        recordType('adoption'),
        ...scope,
        '',
        'baseline_rate',
        impact.baselineRate,
        impact.eventName,
      ],
      [
        recordType('adoption'),
        ...scope,
        '',
        'treated_count',
        impact.treatedCount,
        impact.eventName,
      ],
      [
        recordType('adoption'),
        ...scope,
        '',
        'baseline_count',
        impact.baselineCount,
        impact.eventName,
      ],
    );
  }
  for (const response of report.formResponses) {
    rows.push([
      recordType('form_response'),
      ...scope,
      response.blockId,
      'answer_count',
      response.answerCount,
      response.label,
    ]);
  }
}

export function buildRawAnalyticsJsonl(
  job: PersistedAnalyticsExportJob,
  events: readonly PersistedAnalyticsEventRecord[],
): AnalyticsExportContent {
  const lines = events
    .map((event) =>
      JSON.stringify({
        schemaVersion: ANALYTICS_EXPORT_DEFINITION_VERSION,
        eventId: event.id,
        environmentId: event.environmentId,
        documentId: event.documentId,
        publicationId: event.publicationId,
        contentHash: event.contentHash,
        pointerGeneration: event.pointerGeneration,
        ...(event.experimentId ? { experimentId: event.experimentId } : {}),
        ...(event.armId ? { armId: event.armId } : {}),
        ...(event.experimentAllocationRevision
          ? { experimentAllocationRevision: event.experimentAllocationRevision }
          : {}),
        ...(event.audienceSegment
          ? { audienceSegment: structuredClone(event.audienceSegment) }
          : {}),
        name: event.name,
        ...(event.stepId ? { stepId: event.stepId } : {}),
        sdkVersion: event.sdkVersion,
        ...(event.correlationId ? { correlationId: event.correlationId } : {}),
        timestamp: event.timestamp,
        ...(event.props ? { props: event.props } : {}),
        ingestedAt: event.ingestedAt,
      }),
    )
    .join('\n');
  const content = lines ? `${lines}\n` : '';
  return exportContent(
    content,
    exportFilename(job, 'jsonl'),
    'application/x-ndjson; charset=utf-8',
  );
}

function exportContent(
  content: string,
  filename: string,
  contentType: string,
): AnalyticsExportContent {
  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength > ANALYTICS_EXPORT_MAX_RESULT_BYTES) {
    throw new AnalyticsExportGenerationError('result_too_large');
  }
  return {
    filename,
    contentType,
    content,
    byteLength,
    contentHash: `sha256-${createHash('sha256').update(content, 'utf8').digest('hex')}`,
  };
}

export class AnalyticsExportGenerationError extends Error {
  constructor(readonly code: AnalyticsExportErrorCode) {
    super(code);
    this.name = 'AnalyticsExportGenerationError';
  }
}

function exportFilename(job: PersistedAnalyticsExportJob, extension: string): string {
  const scope = job.release ? `generation-${job.release.pointerGeneration}` : 'all-releases';
  const document = job.documentId.replace(/[^A-Za-z0-9_-]/gu, '-').slice(0, 80);
  return `lodariq-${document}-${scope}.${extension}`;
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\t\r ]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
