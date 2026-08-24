import {
  SUPPORTED_DELIVERY_CONTRACT_KEYS,
  type SupportedDeliveryContract,
} from './delivery-compatibility';

export * from './delivery-compatibility';

/**
 * Canonical schema version stamped onto every Lodariq document.
 *
 * Bump this whenever a breaking change to the block JSON shape requires a
 * migration (PRD §7.2 "Versioned migrations for older block JSON").
 */
export const SCHEMA_VERSION = '2.0.0' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

/** Delivery artifact contract emitted by the localized compiler. */
/** Compiler implementation pinned into artifacts and authoring sessions. */
export const COMPILER_VERSION = '0.6.0' as const;

/** Safe semantic Brand Theme contract versions (PRD §7.10). */
export const BRAND_THEME_SCHEMA_VERSION = '1' as const;

/**
 * Artifact, renderer, and theme combinations implemented by this runtime.
 * Compiler versions are deliberately absent: they are immutable provenance,
 * while the emitted contract tuple determines playback compatibility.
 */
export const SUPPORTED_DELIVERY_CONTRACTS = [
  ...SUPPORTED_DELIVERY_CONTRACT_KEYS.map((key) => {
    const [artifactSchemaVersion, rendererContractVersion, themeContractVersion] = key.split(
      ':',
    ) as [string, string, string];
    return {
      artifactSchemaVersion,
      rendererContractVersion,
      themeContractVersion,
    };
  }),
] as readonly SupportedDeliveryContract[];
