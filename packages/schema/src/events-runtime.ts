/**
 * Dependency-free analytics constants shared with the production runtime.
 * Keep this module free of TypeBox so viewer bundles do not pull in the full
 * authoring/control-plane schema graph.
 */
export const ANALYTICS_EVENT_LIMITS = {
  batchSize: 100,
  eventNameLength: 80,
  identifierLength: 256,
  correlationIdLength: 256,
  propertyCount: 32,
  propertyKeyLength: 64,
  arrayLength: 32,
  stringLength: 500,
  nestingDepth: 4,
} as const;

/** Identity dimensions are reserved for the server-owned event envelope. */
export const ANALYTICS_RESERVED_IDENTITY_KEYS = [
  'workspaceId',
  'environment',
  'environmentId',
  'documentId',
  'publicationId',
  'contentHash',
  'pointerGeneration',
] as const;

/** Raw host/application data and credentials are never valid event props. */
export const ANALYTICS_FORBIDDEN_PAYLOAD_KEYS = [
  'authorization',
  'credential',
  'grant',
  'password',
  'secret',
  'session',
  'token',
  'url',
  'href',
  'origin',
  'host',
  'hostname',
  'pathname',
  'selector',
  'css',
  'html',
  'dom',
  'screenshot',
  'coordinates',
] as const;

export const ANALYTICS_INGEST_DIAGNOSTIC_CODES = [
  'event_invalid',
  'identity_forbidden',
  'pointer_required',
  'pointer_not_found',
  'pointer_inactive',
  'pointer_stale',
  'scope_mismatch',
] as const;
