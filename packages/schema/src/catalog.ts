import { Type, type Static } from '@sinclair/typebox';
import { Environment } from './common';

export const DATA_CATALOG_SCHEMA_VERSION = '1' as const;

export const DATA_CATALOG_VALUE_TYPES = [
  'string',
  'number',
  'boolean',
  'date',
  'enum',
  'unknown',
] as const;

export const DataCatalogValueType = Type.Union(
  DATA_CATALOG_VALUE_TYPES.map((value) => Type.Literal(value)),
  { $id: 'DataCatalogValueType' },
);
export type DataCatalogValueType = Static<typeof DataCatalogValueType>;

/**
 * Workspace data catalog entry (PRD §6.3).
 *
 * Built from observed SDK/API/integration inputs. Powers grouped dropdowns in
 * the rule builder. Lodariq NEVER queries the customer database — every entry
 * maps to an explicitly provided data source.
 */
export const DataCatalogEntry = Type.Object(
  {
    id: Type.String(),
    source: Type.Union([
      Type.Literal('identify_trait'),
      Type.Literal('track_event'),
      Type.Literal('lodariq_activity'),
      Type.Literal('page_context'),
      Type.Literal('integration'),
    ]),
    key: Type.String(),
    displayName: Type.Optional(Type.String()),
    environments: Type.Array(Type.Ref(Environment)),
    lastSeenAt: Type.Optional(Type.String()),
    valueType: Type.Optional(Type.Ref(DataCatalogValueType)),
    /** Only surfaced when safe; sensitive/high-cardinality values are hidden (PRD §6.3). */
    sampleValues: Type.Optional(Type.Array(Type.String())),
    isHighCardinality: Type.Optional(Type.Boolean()),
    isSensitive: Type.Optional(Type.Boolean()),
  },
  { $id: 'DataCatalogEntry' },
);
export type DataCatalogEntry = Static<typeof DataCatalogEntry>;

/** Value-free observation sent by an installed SDK. */
export const DataCatalogObservation = Type.Object(
  {
    source: Type.Union([Type.Literal('identify_trait'), Type.Literal('track_event')]),
    key: Type.String({ minLength: 1, maxLength: 120, pattern: '^[A-Za-z][A-Za-z0-9._:-]*$' }),
    valueType: Type.Ref(DataCatalogValueType),
    observedAt: Type.String({
      minLength: 20,
      maxLength: 64,
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$',
    }),
  },
  { $id: 'DataCatalogObservation', additionalProperties: false },
);
export type DataCatalogObservation = Static<typeof DataCatalogObservation>;

export const DataCatalogObservationBatch = Type.Object(
  {
    schemaVersion: Type.Literal(DATA_CATALOG_SCHEMA_VERSION),
    observations: Type.Array(Type.Ref(DataCatalogObservation), { minItems: 1, maxItems: 100 }),
  },
  { $id: 'DataCatalogObservationBatch', additionalProperties: false },
);
export type DataCatalogObservationBatch = Static<typeof DataCatalogObservationBatch>;

export const WorkspaceDataCatalog = Type.Object(
  {
    schemaVersion: Type.Literal(DATA_CATALOG_SCHEMA_VERSION),
    version: Type.Integer({ minimum: 0 }),
    entries: Type.Array(Type.Ref(DataCatalogEntry), { maxItems: 1_000 }),
    updatedAt: Type.Optional(Type.String({ minLength: 20, maxLength: 64 })),
  },
  { $id: 'WorkspaceDataCatalog', additionalProperties: false },
);
export type WorkspaceDataCatalog = Static<typeof WorkspaceDataCatalog>;
