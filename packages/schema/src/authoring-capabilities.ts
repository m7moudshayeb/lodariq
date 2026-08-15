import { Type, type Static } from '@sinclair/typebox';
import { COMPILER_VERSION, RENDERER_CONTRACT_VERSION } from './version';

/**
 * Closed capabilities jointly supported by the deployed server compiler and
 * renderer. The editor must not expose canonical fields outside this set.
 */
export const AUTHORING_DELIVERY_CAPABILITIES = [
  'transactions.v2',
  'choreography.v1',
  'flow.v1',
  'presentation.v1',
  'media-assets.v1',
] as const;

export const AuthoringDeliveryCapability = Type.Union(
  AUTHORING_DELIVERY_CAPABILITIES.map((value) => Type.Literal(value)),
  { $id: 'AuthoringDeliveryCapability' },
);
export type AuthoringDeliveryCapability = Static<typeof AuthoringDeliveryCapability>;

export const AuthoringDeliveryCapabilityMetadata = Type.Object(
  {
    compilerVersion: Type.Literal(COMPILER_VERSION),
    rendererContractVersion: Type.Literal(RENDERER_CONTRACT_VERSION),
    capabilities: Type.Array(Type.Ref(AuthoringDeliveryCapability), {
      maxItems: AUTHORING_DELIVERY_CAPABILITIES.length,
      uniqueItems: true,
    }),
  },
  { $id: 'AuthoringDeliveryCapabilityMetadata', additionalProperties: false },
);
export type AuthoringDeliveryCapabilityMetadata = Static<
  typeof AuthoringDeliveryCapabilityMetadata
>;

export const CURRENT_AUTHORING_DELIVERY_CAPABILITY_METADATA: AuthoringDeliveryCapabilityMetadata = {
  compilerVersion: COMPILER_VERSION,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  capabilities: [...AUTHORING_DELIVERY_CAPABILITIES],
};
