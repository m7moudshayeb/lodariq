/**
 * Canonical schema version stamped onto every Talmeh document.
 *
 * Bump this whenever a breaking change to the block JSON shape requires a
 * migration (PRD §7.2 "Versioned migrations for older block JSON").
 */
export const SCHEMA_VERSION = '1.0.0' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;
