import {
  ANALYTICS_EVENT_LIMITS,
  ANALYTICS_FORBIDDEN_PAYLOAD_KEYS,
  ANALYTICS_RESERVED_IDENTITY_KEYS,
  ANALYTICS_TARGET_RESOLUTION_STATUSES,
  AnalyticsEnvironmentQuery as AnalyticsEnvironmentQuerySchema,
  AuthoritativeAnalyticsEvent as AuthoritativeAnalyticsEventSchema,
  validate,
  type AnalyticsEvent,
  type AnalyticsEventAggregate,
  type AnalyticsEnvironmentQuery,
  type AnalyticsTargetResolutionStatus,
  type AuthoritativeAnalyticsEvent,
} from '@lodariq/schema';
import { assertWorkspaceScope } from '../rls';
import type { EnvironmentTokenRecord } from './sdk-authoring';

export interface IngestEventsInput {
  workspaceId: string;
  events: AnalyticsEvent[];
}

/**
 * A server-authoritative SDK analytics batch. The duplicated scope is
 * intentional: repositories reject any event whose server-owned envelope does
 * not match the transaction scope before writing any part of the batch.
 */
export interface IngestAuthoritativeEventsInput {
  workspaceId: string;
  environmentId: string;
  events: AuthoritativeAnalyticsEvent[];
}

export interface PersistedAnalyticsEventRecord extends AuthoritativeAnalyticsEvent {
  id: string;
  ingestedAt: string;
}

export interface QueryAnalyticsEventsInput {
  workspaceId: string;
  query: AnalyticsEnvironmentQuery;
}

/**
 * Aggregates retain every immutable delivery dimension. This prevents events
 * before and after a rollback from being silently attributed to one release.
 */
export const DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT = 100;

export function assertAuthoritativeAnalyticsBatch(input: IngestAuthoritativeEventsInput): void {
  if (input.events.length > ANALYTICS_EVENT_LIMITS.batchSize) {
    throw new Error('authoritative analytics batch exceeds the event limit');
  }
  for (const event of input.events) {
    assertAuthoritativeAnalyticsEvent(event, input.workspaceId, input.environmentId);
  }
}

export interface ResolvedEnvironmentToken extends EnvironmentTokenRecord {
  originAllowlist: string[];
}

export function assertAuthoritativeAnalyticsEvent(
  event: AuthoritativeAnalyticsEvent,
  workspaceId: string,
  environmentId: string,
): void {
  const validation = validate(AuthoritativeAnalyticsEventSchema, event);
  if (!validation.valid) {
    throw new Error('authoritative analytics event must match AuthoritativeAnalyticsEvent');
  }
  assertWorkspaceScope(event.workspaceId, workspaceId);
  if (event.environmentId !== environmentId) {
    throw new Error('analytics environment scope mismatch');
  }
  if (event.props) assertSafeAnalyticsProperties(event.props);
}

export function assertAnalyticsEnvironmentQuery(query: AnalyticsEnvironmentQuery): void {
  if (!validate(AnalyticsEnvironmentQuerySchema, query).valid) {
    throw new Error('analytics query must select one valid environment');
  }
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) {
    throw new Error('analytics query from must not be after to');
  }
}

export function compareAnalyticsEventsNewestFirst(
  left: PersistedAnalyticsEventRecord,
  right: PersistedAnalyticsEventRecord,
): number {
  return (
    Date.parse(right.timestamp) - Date.parse(left.timestamp) || right.id.localeCompare(left.id)
  );
}

const FORBIDDEN_ANALYTICS_PROPERTY_KEYS = new Set(
  [...ANALYTICS_RESERVED_IDENTITY_KEYS, ...ANALYTICS_FORBIDDEN_PAYLOAD_KEYS].map((key) =>
    normalizeAnalyticsPropertyKey(key),
  ),
);
const RAW_ANALYTICS_URL_PATTERN = /https?:\/\//iu;
const ANALYTICS_EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/u;
const ANALYTICS_CREDENTIAL_PATTERN =
  /\bBearer\s+|lod_(?:development|staging|production|authoring|activation|authorization|bootstrap)_/iu;

function assertSafeAnalyticsProperties(value: unknown, depth = 0): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('analytics event properties must be a bounded object');
  }
  if (depth > ANALYTICS_EVENT_LIMITS.nestingDepth) {
    throw new Error('analytics event properties exceed the nesting depth limit');
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_ANALYTICS_PROPERTY_KEYS.has(normalizeAnalyticsPropertyKey(key))) {
      throw new Error('analytics event properties must not contain identity or raw host data');
    }
    assertSafeAnalyticsPropertyValue(nestedValue, depth + 1);
  }
}

function assertSafeAnalyticsPropertyValue(value: unknown, depth: number): void {
  if (depth > ANALYTICS_EVENT_LIMITS.nestingDepth) {
    throw new Error('analytics event properties exceed the nesting depth limit');
  }
  if (typeof value === 'string') {
    if (
      RAW_ANALYTICS_URL_PATTERN.test(value) ||
      ANALYTICS_EMAIL_PATTERN.test(value) ||
      ANALYTICS_CREDENTIAL_PATTERN.test(value)
    ) {
      throw new Error('analytics event properties must not contain raw host or credential data');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeAnalyticsPropertyValue(item, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    assertSafeAnalyticsProperties(value, depth);
  }
}

function normalizeAnalyticsPropertyKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/gu, '').toLowerCase();
}

export function analyticsAggregateKey(event: PersistedAnalyticsEventRecord): string {
  return [
    event.workspaceId,
    event.environmentId,
    event.documentId,
    event.publicationId,
    event.contentHash,
    event.pointerGeneration,
    event.name,
    event.name === 'target_resolution' ? analyticsTargetResolutionStatus(event) : '',
  ].join('\0');
}

export function analyticsTargetResolutionStatus(
  event: PersistedAnalyticsEventRecord,
): AnalyticsTargetResolutionStatus {
  const result = event.props?.['result'];
  if (
    typeof result === 'string' &&
    (ANALYTICS_TARGET_RESOLUTION_STATUSES as readonly string[]).includes(result)
  ) {
    return result as AnalyticsTargetResolutionStatus;
  }
  return 'unknown';
}

export function compareAnalyticsAggregates(
  left: AnalyticsEventAggregate,
  right: AnalyticsEventAggregate,
): number {
  return (
    right.count - left.count ||
    right.lastTimestamp.localeCompare(left.lastTimestamp) ||
    left.name.localeCompare(right.name) ||
    left.publicationId.localeCompare(right.publicationId) ||
    left.pointerGeneration - right.pointerGeneration
  );
}
