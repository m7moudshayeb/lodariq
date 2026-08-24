import { Type, type Static } from '@sinclair/typebox';

export const PRODUCT_CAPABILITY_STATES = ['implemented', 'partial', 'disabled', 'absent'] as const;

export const ProductCapabilityState = Type.Union(
  PRODUCT_CAPABILITY_STATES.map((state) => Type.Literal(state)),
  { $id: 'ProductCapabilityState' },
);
export type ProductCapabilityState = Static<typeof ProductCapabilityState>;

export const PRODUCT_CAPABILITY_LAYERS = [
  'authoring',
  'runtime',
  'delivery',
  'analytics',
  'collaboration',
  'governance',
  'commercial',
  'platform',
] as const;

export const ProductCapabilityLayer = Type.Union(
  PRODUCT_CAPABILITY_LAYERS.map((layer) => Type.Literal(layer)),
  { $id: 'ProductCapabilityLayer' },
);
export type ProductCapabilityLayer = Static<typeof ProductCapabilityLayer>;

export const PRODUCT_CAPABILITY_IDS = [
  'authoring.spotlight-motion',
  'authoring.target-styling',
  'runtime.target-focus',
  'runtime.motion-presets',
  'authoring.narrated-autoplay',
  'authoring.shareable-demo-links',
  'authoring.voice-driven',
  'authoring.record-to-author',
  'authoring.transient-state-targets',
  'authoring.data-relative-targets',
  'authoring.multi-app-journeys',
  'authoring.storyboard',
  'authoring.templates',
  'authoring.side-by-side',
  'authoring.version-diff',
  'authoring.change-aware-copy',
  'authoring.simulated-user',
  'delivery.adaptive',
  'authoring.locale-media',
  'delivery.ab-testing',
  'analytics.scoped-replay',
  'runtime.block-conditions',
  'collaboration.live-cursors',
  'collaboration.comment-threads',
  'authoring.figma-token-import',
  'commercial.entitlements',
  'commercial.metering',
  'delivery.scheduling',
  'delivery.audience-rules',
  'delivery.event-triggers',
  'delivery.lifecycle-triggers',
  'runtime.experience-parity',
  'analytics.completion',
  'analytics.forms',
  'analytics.funnels',
  'analytics.adoption',
  'analytics.retention',
  'analytics.segmentation',
  'analytics.cohorts',
  'analytics.csv-export',
  'analytics.warehouse-sync',
  'analytics.raw-export',
  'analytics.release-history',
  'authoring.ask-lodariq',
  'authoring.translation',
  'authoring.add-locale',
  'authoring.locale-layout-qa',
  'authoring.narration-audio',
  'authoring.voice-cloning',
  'brand.theme-variants',
  'brand.drift-notifications',
  'governance.audit-browsing',
  'governance.change-export',
  'collaboration.presence',
  'collaboration.locks',
  'governance.base-roles',
  'governance.custom-roles',
  'platform.api',
  'platform.webhooks',
  'platform.data-residency',
  'governance.scim',
  'governance.production-approval',
  'delivery.immutable-publication',
  'delivery.direct-production-publish',
  'authoring.demo-capture',
  'governance.accessibility-sweep',
] as const;

export const ProductCapabilityId = Type.Union(
  PRODUCT_CAPABILITY_IDS.map((id) => Type.Literal(id)),
  { $id: 'ProductCapabilityId' },
);
export type ProductCapabilityId = Static<typeof ProductCapabilityId>;

export const ProductCapabilityClaim = Type.Object(
  {
    id: Type.Ref(ProductCapabilityId),
    layer: Type.Ref(ProductCapabilityLayer),
    state: Type.Ref(ProductCapabilityState),
    note: Type.String({ minLength: 1 }),
    evidence: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
  },
  { $id: 'ProductCapabilityClaim', additionalProperties: false },
);
export type ProductCapabilityClaim = Static<typeof ProductCapabilityClaim>;
