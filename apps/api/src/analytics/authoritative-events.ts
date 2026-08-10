import {
  ANALYTICS_EVENT_LIMITS,
  ANALYTICS_FORBIDDEN_PAYLOAD_KEYS,
  ANALYTICS_INGEST_DIAGNOSTIC_CODES,
  ANALYTICS_RESERVED_IDENTITY_KEYS,
  type AnalyticsEventProperties,
  type AnalyticsIngestDiagnosticCode,
  type AnalyticsIngestResult,
  type AuthoritativeAnalyticsEvent,
  type SdkAnalyticsEvent,
} from '@lodariq/schema';

export interface AuthoritativeAnalyticsScope {
  workspaceId: string;
  environmentId: string;
}

export interface ActiveAnalyticsPointer {
  state: 'active';
  workspaceId: string;
  environmentId: string;
  documentId: string;
  generation: number;
  publicationId: string;
  contentHash: string;
}

export interface InactiveAnalyticsPointer {
  state: 'inactive';
  workspaceId: string;
  environmentId: string;
  documentId: string;
  generation: number;
}

export type ResolvedAnalyticsPointer = ActiveAnalyticsPointer | InactiveAnalyticsPointer;

export type ResolveAnalyticsPointer = (
  documentId: string,
) => Promise<ResolvedAnalyticsPointer | null>;

export interface AuthoritativeAnalyticsBatch {
  events: AuthoritativeAnalyticsEvent[];
  result: AnalyticsIngestResult;
}

const ALLOWED_EVENT_KEYS = new Set([
  'name',
  'documentId',
  'pointer',
  'stepId',
  'sdkVersion',
  'correlationId',
  'timestamp',
  'props',
]);
const ALLOWED_POINTER_KEYS = new Set(['generation', 'publicationId', 'contentHash']);
const RESERVED_IDENTITY_KEYS = new Set(ANALYTICS_RESERVED_IDENTITY_KEYS.map(normalizePropertyKey));
const FORBIDDEN_PAYLOAD_KEYS = new Set(ANALYTICS_FORBIDDEN_PAYLOAD_KEYS.map(normalizePropertyKey));
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_.-]*$/u;
const CONTENT_HASH_PATTERN = /^sha256-[0-9a-f]{64}$/u;
const RFC_3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;
const RAW_URL_PATTERN = /https?:\/\//iu;
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/u;
const CREDENTIAL_PATTERN =
  /\bBearer\s+|lod_(?:development|staging|production|authoring|activation|authorization|bootstrap)_/iu;

/**
 * Resolves every untrusted SDK event against the current server-owned pointer
 * and returns storage-ready envelopes. A mismatch rejects that individual
 * event; client assertion fields are never copied into the accepted result.
 */
export async function resolveAuthoritativeAnalyticsBatch(
  scope: AuthoritativeAnalyticsScope,
  candidates: readonly unknown[],
  resolvePointer: ResolveAnalyticsPointer,
): Promise<AuthoritativeAnalyticsBatch> {
  const diagnostics = new Map<AnalyticsIngestDiagnosticCode, number>();
  const events: AuthoritativeAnalyticsEvent[] = [];

  if (candidates.length === 0 || candidates.length > ANALYTICS_EVENT_LIMITS.batchSize) {
    const rejected = Math.min(Math.max(candidates.length, 1), ANALYTICS_EVENT_LIMITS.batchSize);
    incrementDiagnostic(diagnostics, 'event_invalid', rejected);
    return { events, result: createIngestResult(events.length, rejected, diagnostics) };
  }

  for (const candidate of candidates) {
    const parsed = inspectSdkAnalyticsEvent(candidate);
    if (parsed.code) {
      incrementDiagnostic(diagnostics, parsed.code);
      continue;
    }

    const event = parsed.event;
    const pointer = await resolvePointer(event.documentId);
    const pointerError = classifyPointerError(scope, event, pointer);
    if (pointerError) {
      incrementDiagnostic(diagnostics, pointerError);
      continue;
    }

    const activePointer = pointer as ActiveAnalyticsPointer;
    events.push({
      workspaceId: activePointer.workspaceId,
      environmentId: activePointer.environmentId,
      documentId: activePointer.documentId,
      publicationId: activePointer.publicationId,
      contentHash: activePointer.contentHash,
      pointerGeneration: activePointer.generation,
      name: event.name,
      ...(event.stepId ? { stepId: event.stepId } : {}),
      sdkVersion: event.sdkVersion,
      ...(event.correlationId ? { correlationId: event.correlationId } : {}),
      timestamp: event.timestamp,
      ...(event.props ? { props: event.props } : {}),
    });
  }

  return {
    events,
    result: createIngestResult(events.length, candidates.length - events.length, diagnostics),
  };
}

function classifyPointerError(
  scope: AuthoritativeAnalyticsScope,
  event: SdkAnalyticsEvent,
  pointer: ResolvedAnalyticsPointer | null,
): AnalyticsIngestDiagnosticCode | null {
  if (!pointer) return 'pointer_not_found';
  if (
    pointer.workspaceId !== scope.workspaceId ||
    pointer.environmentId !== scope.environmentId ||
    pointer.documentId !== event.documentId
  ) {
    return 'scope_mismatch';
  }
  if (pointer.state === 'inactive') return 'pointer_inactive';
  if (
    pointer.generation !== event.pointer.generation ||
    pointer.publicationId !== event.pointer.publicationId ||
    pointer.contentHash !== event.pointer.contentHash
  ) {
    return 'pointer_stale';
  }
  return null;
}

function inspectSdkAnalyticsEvent(
  value: unknown,
):
  | { event: SdkAnalyticsEvent; code?: never }
  | { event?: never; code: AnalyticsIngestDiagnosticCode } {
  if (!isRecord(value)) return { code: 'event_invalid' };
  for (const key of Object.keys(value)) {
    if (ALLOWED_EVENT_KEYS.has(key)) continue;
    if (RESERVED_IDENTITY_KEYS.has(normalizePropertyKey(key))) {
      return { code: 'identity_forbidden' };
    }
    return { code: 'event_invalid' };
  }

  if (
    !Object.prototype.hasOwnProperty.call(value, 'documentId') ||
    !Object.prototype.hasOwnProperty.call(value, 'pointer')
  ) {
    return { code: 'pointer_required' };
  }

  if (
    !isBoundedString(value['name'], ANALYTICS_EVENT_LIMITS.eventNameLength) ||
    !EVENT_NAME_PATTERN.test(value['name']) ||
    !isBoundedString(value['documentId'], ANALYTICS_EVENT_LIMITS.identifierLength) ||
    !isBoundedString(value['sdkVersion'], 128) ||
    !isDateTime(value['timestamp']) ||
    (value['stepId'] !== undefined &&
      !isBoundedString(value['stepId'], ANALYTICS_EVENT_LIMITS.identifierLength)) ||
    (value['correlationId'] !== undefined &&
      !isBoundedString(value['correlationId'], ANALYTICS_EVENT_LIMITS.correlationIdLength))
  ) {
    return { code: 'event_invalid' };
  }

  if (!isRecord(value['pointer'])) return { code: 'event_invalid' };
  const pointer = value['pointer'];
  if (Object.keys(pointer).some((key) => !ALLOWED_POINTER_KEYS.has(key))) {
    return { code: 'identity_forbidden' };
  }
  if (
    !Number.isInteger(pointer['generation']) ||
    Number(pointer['generation']) < 1 ||
    !isBoundedString(pointer['publicationId'], ANALYTICS_EVENT_LIMITS.identifierLength) ||
    typeof pointer['contentHash'] !== 'string' ||
    !CONTENT_HASH_PATTERN.test(pointer['contentHash'])
  ) {
    return { code: 'event_invalid' };
  }

  let props: AnalyticsEventProperties | undefined;
  if (value['props'] !== undefined) {
    const propertyInspection = inspectProperties(value['props'], 0);
    if (propertyInspection !== 'valid') return { code: propertyInspection };
    props = value['props'] as AnalyticsEventProperties;
  }

  return {
    event: {
      name: value['name'],
      documentId: value['documentId'],
      pointer: {
        generation: Number(pointer['generation']),
        publicationId: pointer['publicationId'],
        contentHash: pointer['contentHash'],
      },
      ...(value['stepId'] ? { stepId: value['stepId'] } : {}),
      sdkVersion: value['sdkVersion'],
      ...(value['correlationId'] ? { correlationId: value['correlationId'] } : {}),
      timestamp: value['timestamp'],
      ...(props ? { props } : {}),
    },
  };
}

function inspectProperties(
  value: unknown,
  depth: number,
): 'valid' | 'identity_forbidden' | 'event_invalid' {
  if (!isRecord(value) || depth > ANALYTICS_EVENT_LIMITS.nestingDepth) return 'event_invalid';
  const entries = Object.entries(value);
  if (entries.length > ANALYTICS_EVENT_LIMITS.propertyCount) return 'event_invalid';
  for (const [key, item] of entries) {
    if (!key || key.length > ANALYTICS_EVENT_LIMITS.propertyKeyLength) return 'event_invalid';
    if (RESERVED_IDENTITY_KEYS.has(normalizePropertyKey(key))) return 'identity_forbidden';
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalizePropertyKey(key))) return 'event_invalid';
    const result = inspectPropertyValue(item, depth + 1);
    if (result !== 'valid') return result;
  }
  return 'valid';
}

function inspectPropertyValue(
  value: unknown,
  depth: number,
): 'valid' | 'identity_forbidden' | 'event_invalid' {
  if (depth > ANALYTICS_EVENT_LIMITS.nestingDepth) return 'event_invalid';
  if (typeof value === 'string') {
    if (
      value.length > ANALYTICS_EVENT_LIMITS.stringLength ||
      RAW_URL_PATTERN.test(value) ||
      EMAIL_PATTERN.test(value) ||
      CREDENTIAL_PATTERN.test(value)
    ) {
      return 'event_invalid';
    }
    return 'valid';
  }
  if (typeof value === 'number') return Number.isFinite(value) ? 'valid' : 'event_invalid';
  if (typeof value === 'boolean' || value === null) return 'valid';
  if (Array.isArray(value)) {
    if (value.length > ANALYTICS_EVENT_LIMITS.arrayLength) return 'event_invalid';
    for (const item of value) {
      const result = inspectPropertyValue(item, depth + 1);
      if (result !== 'valid') return result;
    }
    return 'valid';
  }
  return inspectProperties(value, depth);
}

function createIngestResult(
  accepted: number,
  rejected: number,
  diagnostics: ReadonlyMap<AnalyticsIngestDiagnosticCode, number>,
): AnalyticsIngestResult {
  return {
    accepted,
    rejected,
    diagnostics: ANALYTICS_INGEST_DIAGNOSTIC_CODES.flatMap((code) => {
      const count = diagnostics.get(code);
      return count ? [{ code, count }] : [];
    }),
  };
}

function incrementDiagnostic(
  diagnostics: Map<AnalyticsIngestDiagnosticCode, number>,
  code: AnalyticsIngestDiagnosticCode,
  count = 1,
): void {
  diagnostics.set(code, (diagnostics.get(code) ?? 0) + count);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = RFC_3339_DATE_TIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizePropertyKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/gu, '').toLowerCase();
}
