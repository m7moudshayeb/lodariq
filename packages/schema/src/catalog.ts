import { Type, type Static } from '@sinclair/typebox';
import { Environment } from './common';

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
    environments: Type.Array(Environment),
    lastSeenAt: Type.Optional(Type.String()),
    valueType: Type.Optional(
      Type.Union([
        Type.Literal('string'),
        Type.Literal('number'),
        Type.Literal('boolean'),
        Type.Literal('date'),
        Type.Literal('enum'),
        Type.Literal('unknown'),
      ]),
    ),
    /** Only surfaced when safe; sensitive/high-cardinality values are hidden (PRD §6.3). */
    sampleValues: Type.Optional(Type.Array(Type.String())),
    isHighCardinality: Type.Optional(Type.Boolean()),
    isSensitive: Type.Optional(Type.Boolean()),
  },
  { $id: 'DataCatalogEntry' },
);
export type DataCatalogEntry = Static<typeof DataCatalogEntry>;
