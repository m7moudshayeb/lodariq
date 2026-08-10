import type {
  AnalyticsEvent,
  AnalyticsDocumentPointer,
  AnalyticsEventProperties,
  AnalyticsPropertyValue,
  SdkAnalyticsEvent,
} from '@lodariq/schema';
import {
  ANALYTICS_EVENT_LIMITS,
  ANALYTICS_FORBIDDEN_PAYLOAD_KEYS,
  ANALYTICS_RESERVED_IDENTITY_KEYS,
} from '@lodariq/schema/events-runtime';

export type RuntimeAnalyticsDocumentPointer = AnalyticsDocumentPointer;

interface CreateRuntimeAnalyticsEventInput {
  name: string;
  sdkVersion: string;
  timestamp: string;
  correlationId?: string;
  documentId?: string;
  stepId?: string;
  props?: Record<string, unknown>;
  pointer?: RuntimeAnalyticsDocumentPointer;
}

interface NormalizedRuntimeAnalyticsProperties {
  documentId?: string;
  stepId?: string;
  props?: AnalyticsEventProperties;
}

const RESERVED_IDENTITY_KEYS = new Set(ANALYTICS_RESERVED_IDENTITY_KEYS.map(normalizePropertyKey));
const FORBIDDEN_PAYLOAD_KEYS = new Set(ANALYTICS_FORBIDDEN_PAYLOAD_KEYS.map(normalizePropertyKey));
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_.-]*$/u;
const CREDENTIAL_PATTERN =
  /lod_(?:development|staging|production|authoring|activation|authorization|bootstrap)_[a-zA-Z0-9_-]+/gu;
const BEARER_PATTERN = /\bBearer\s+[\w.-]+/giu;
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gu;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gu;

/**
 * Builds the strict Phase 2 wire envelope whenever an active pointer is
 * available. The compatibility branch is retained only for local/legacy
 * installs that do not have a V2 pointer and is rejected by strict SDK
 * ingestion rather than being assigned server identity.
 */
export function createRuntimeAnalyticsEvent(
  input: CreateRuntimeAnalyticsEventInput,
): SdkAnalyticsEvent | AnalyticsEvent {
  if (!input.pointer) {
    const props = input.props ? sanitizeRecord(input.props, 0, new Set(), true) : undefined;
    return {
      name: input.name,
      sdkVersion: input.sdkVersion,
      timestamp: input.timestamp,
      ...(input.documentId ? { documentId: input.documentId } : {}),
      ...(input.stepId ? { stepId: input.stepId } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(props ? { props } : {}),
    };
  }

  const normalized = normalizeRuntimeAnalyticsProperties(input.props);
  const documentId = cleanIdentifier(input.documentId ?? normalized.documentId);
  const stepId = cleanIdentifier(input.stepId ?? normalized.stepId);
  const correlationId = cleanCorrelationId(input.correlationId);
  const common = {
    name: normalizeEventName(input.name),
    sdkVersion: cleanSdkVersion(input.sdkVersion),
    timestamp: input.timestamp,
    ...(stepId ? { stepId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(normalized.props ? { props: normalized.props } : {}),
  };

  if (documentId === input.pointer.documentId) {
    return {
      ...common,
      documentId,
      pointer: {
        generation: input.pointer.generation,
        publicationId: input.pointer.publicationId,
        contentHash: input.pointer.contentHash,
      },
    };
  }

  return { ...common, ...(documentId ? { documentId } : {}) };
}

/**
 * Pulls selector fields out of ordinary event props and bounds/redacts the
 * remaining client-controlled JSON before it enters the queue.
 */
export function normalizeRuntimeAnalyticsProperties(
  props: Record<string, unknown> | undefined,
): NormalizedRuntimeAnalyticsProperties {
  if (!props) return {};
  const documentId = cleanIdentifier(props['documentId']);
  const stepId = cleanIdentifier(props['stepId']);
  const safeProps = sanitizeRecord(props, 0, new Set(['documentid', 'stepid']));
  return {
    ...(documentId ? { documentId } : {}),
    ...(stepId ? { stepId } : {}),
    ...(Object.keys(safeProps).length > 0 ? { props: safeProps } : {}),
  };
}

function sanitizeRecord(
  value: Record<string, unknown>,
  depth: number,
  omittedKeys: ReadonlySet<string> = new Set(),
  preserveDocumentSelector = false,
): AnalyticsEventProperties {
  const next: Record<string, AnalyticsPropertyValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (Object.keys(next).length >= ANALYTICS_EVENT_LIMITS.propertyCount) break;
    const normalizedKey = normalizePropertyKey(key);
    if (
      !normalizedKey ||
      key.length > ANALYTICS_EVENT_LIMITS.propertyKeyLength ||
      omittedKeys.has(normalizedKey) ||
      (RESERVED_IDENTITY_KEYS.has(normalizedKey) &&
        (!preserveDocumentSelector || normalizedKey !== 'documentid')) ||
      FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey)
    ) {
      continue;
    }
    const sanitized = sanitizePropertyValue(item, depth + 1);
    if (sanitized !== undefined) next[key] = sanitized;
  }
  return next;
}

function sanitizePropertyValue(value: unknown, depth: number): AnalyticsPropertyValue | undefined {
  if (depth > ANALYTICS_EVENT_LIMITS.nestingDepth) return undefined;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const next: AnalyticsPropertyValue[] = [];
    for (const item of value.slice(0, ANALYTICS_EVENT_LIMITS.arrayLength)) {
      const sanitized = sanitizePropertyValue(item, depth + 1);
      if (sanitized !== undefined) next.push(sanitized);
    }
    return next;
  }
  if (!value || typeof value !== 'object') return undefined;
  return sanitizeRecord(value as Record<string, unknown>, depth);
}

function sanitizeString(value: string): string {
  return value
    .replace(URL_PATTERN, '<redacted-url>')
    .replace(BEARER_PATTERN, 'Bearer <redacted>')
    .replace(CREDENTIAL_PATTERN, 'lod_<redacted>')
    .replace(EMAIL_PATTERN, '<email>')
    .slice(0, ANALYTICS_EVENT_LIMITS.stringLength);
}

function normalizeEventName(value: string): string {
  const trimmed = value.trim().slice(0, ANALYTICS_EVENT_LIMITS.eventNameLength);
  return EVENT_NAME_PATTERN.test(trimmed) ? trimmed : 'invalid_event_name';
}

function cleanIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, ANALYTICS_EVENT_LIMITS.identifierLength);
  return trimmed || undefined;
}

function cleanCorrelationId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, ANALYTICS_EVENT_LIMITS.correlationIdLength);
  return trimmed || undefined;
}

function cleanSdkVersion(value: string): string {
  return value.trim().slice(0, 128) || 'unknown';
}

function normalizePropertyKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/gu, '').toLowerCase();
}
