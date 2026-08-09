/**
 * Canonical schema version stamped onto every Lodariq document.
 *
 * Bump this whenever a breaking change to the block JSON shape requires a
 * migration (PRD §7.2 "Versioned migrations for older block JSON").
 */
export const SCHEMA_VERSION = '1.0.0' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

/** Delivery artifact contract emitted by the Phase 2 compiler. */
export const COMPILED_ARTIFACT_SCHEMA_VERSION = '2' as const;

/** Compiler implementation pinned into artifacts and authoring sessions. */
export const COMPILER_VERSION = '0.3.0' as const;

/** Safe semantic Brand Theme contract versions (PRD §7.10). */
export const BRAND_THEME_SCHEMA_VERSION = '1' as const;
export const BRAND_THEME_CONTRACT_VERSION = '1' as const;

/** Runtime renderer recipe contract pinned into every new artifact. */
export const RENDERER_CONTRACT_VERSION = '2' as const;
