/** Delivery artifact contract emitted by the localized compiler. */
export const COMPILED_ARTIFACT_SCHEMA_VERSION = '5' as const;

/** Stable envelope for public document-scoped delivery pointers. */
export const PUBLIC_MANIFEST_SCHEMA_VERSION = '4' as const;

/** Safe semantic Brand Theme contract embedded in delivery artifacts. */
export const BRAND_THEME_CONTRACT_VERSION = '1' as const;

/** Runtime renderer recipe contract pinned into every new artifact. */
export const RENDERER_CONTRACT_VERSION = '5' as const;

/** Compact source of truth for production artifact/renderer/theme tuples. */
export const SUPPORTED_DELIVERY_CONTRACT_KEYS = [
  `2:2:${BRAND_THEME_CONTRACT_VERSION}`,
  `3:3:${BRAND_THEME_CONTRACT_VERSION}`,
  `4:4:${BRAND_THEME_CONTRACT_VERSION}`,
  `${COMPILED_ARTIFACT_SCHEMA_VERSION}:${RENDERER_CONTRACT_VERSION}:${BRAND_THEME_CONTRACT_VERSION}`,
] as const;

type SupportedDeliveryContractKey = (typeof SUPPORTED_DELIVERY_CONTRACT_KEYS)[number];
type DeliveryContractFromKey<TKey extends string> = TKey extends TKey
  ? TKey extends `${infer TArtifact}:${infer TRenderer}:${infer TTheme}`
    ? {
        artifactSchemaVersion: TArtifact;
        rendererContractVersion: TRenderer;
        themeContractVersion: TTheme;
      }
    : never
  : never;

export type SupportedDeliveryContract = DeliveryContractFromKey<SupportedDeliveryContractKey>;
export type SupportedArtifactSchemaVersion = SupportedDeliveryContract['artifactSchemaVersion'];
export type SupportedRendererContractVersion = SupportedDeliveryContract['rendererContractVersion'];

export function isSupportedDeliveryContract(
  artifactSchemaVersion: unknown,
  rendererContractVersion: unknown,
  themeContractVersion: unknown,
): artifactSchemaVersion is SupportedArtifactSchemaVersion {
  return SUPPORTED_DELIVERY_CONTRACT_KEYS.includes(
    `${String(artifactSchemaVersion)}:${String(rendererContractVersion)}:${String(themeContractVersion)}` as SupportedDeliveryContractKey,
  );
}

export function findSupportedDeliveryContract(
  artifactSchemaVersion: unknown,
  rendererContractVersion: unknown,
  themeContractVersion: unknown,
): SupportedDeliveryContract | null {
  return isSupportedDeliveryContract(
    artifactSchemaVersion,
    rendererContractVersion,
    themeContractVersion,
  )
    ? ({
        artifactSchemaVersion,
        rendererContractVersion,
        themeContractVersion,
      } as SupportedDeliveryContract)
    : null;
}
