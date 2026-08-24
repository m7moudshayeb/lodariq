import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { LodariqDocument } from './document';

export const COMMERCIAL_PLAN_VERSION = '2026-08-22.1' as const;
export const AI_CREDIT_METER_VERSION = '2026-08-21.1' as const;
export const COMMERCIAL_PLAN_IDS = [
  'free',
  'starter',
  'growth',
  'scale',
  'business',
  'enterprise',
] as const;
export const COMMERCIAL_PLAN_LABELS = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  business: 'Business',
  enterprise: 'Enterprise',
} as const satisfies Record<(typeof COMMERCIAL_PLAN_IDS)[number], string>;

export const CommercialPlanId = Type.Union(
  COMMERCIAL_PLAN_IDS.map((plan) => Type.Literal(plan)),
  { $id: 'CommercialPlanId' },
);
export type CommercialPlanId = Static<typeof CommercialPlanId>;

export const COMMERCIAL_FEATURE_IDS = [
  'named-step-styles',
  'multiple-themes',
  'form-response-capture',
  'branching',
  'flow-map',
  'scheduling',
  'audience-segmentation',
  'custom-user-attributes',
  'event-triggers',
  'experiments',
  'batch-operations',
  'adoption-impact',
  'form-response-analytics',
  'audience-segment-results',
  'sequence-funnel',
  'experiment-comparison',
  'cohort-retention',
  'analytics-csv',
  'warehouse-sync',
  'raw-event-export',
  'copy-assist',
  'ask-assist',
  'auto-translate',
  'narration',
  'voice-cloning',
  'theme-generation',
  'predictive-layout-qa',
  'release-management',
  'recovery',
  'drift-alerts',
  'review-approval',
  'required-production-approval',
  'audit-log',
  'change-history-export',
  'presence',
  'step-locks',
  'comments',
  'roles',
  'sso',
  'scim',
  'custom-roles',
  'api-webhooks',
  'data-residency',
] as const;

export const CommercialFeatureId = Type.Union(
  COMMERCIAL_FEATURE_IDS.map((feature) => Type.Literal(feature)),
  { $id: 'CommercialFeatureId' },
);
export type CommercialFeatureId = Static<typeof CommercialFeatureId>;

/** Retained only so immutable snapshots from older plan versions remain decodable. */
export const RETIRED_COMMERCIAL_FEATURE_IDS = [
  'voice-cloning',
] as const satisfies readonly CommercialFeatureId[];
const RETIRED_COMMERCIAL_FEATURE_ID_SET = new Set<CommercialFeatureId>(
  RETIRED_COMMERCIAL_FEATURE_IDS,
);
export const ACTIVE_COMMERCIAL_FEATURE_IDS = COMMERCIAL_FEATURE_IDS.filter(
  (feature) => !RETIRED_COMMERCIAL_FEATURE_ID_SET.has(feature),
);

/** Product promises that commercial code must never gate. */
export const NEVER_GATED_CAPABILITIES = [
  'authoring',
  'semantic-targeting',
  'target-verification',
  'approach-recipes',
  'drift-repair',
  'accessibility-quality',
  'experience-types',
  'basic-outcome-evidence',
] as const;

const NullableLimit = Type.Union([
  Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  Type.Null(),
]);

export const CommercialEntitlements = Type.Object(
  {
    engagedUsersPerMonth: NullableLimit,
    liveExperiences: NullableLimit,
    creatorSeats: NullableLimit,
    applications: NullableLimit,
    locales: NullableLimit,
    environments: NullableLimit,
    assetBytes: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    removeBadge: Type.Boolean(),
    analyticsRetentionDays: Type.Integer({ minimum: 1, maximum: 3_650 }),
    analyticsExportsPerMonth: NullableLimit,
    adoptionSuccessEvents: NullableLimit,
    aiCreditsPerMonth: NullableLimit,
    versionRetentionDays: NullableLimit,
    themeGenerationRuns: NullableLimit,
    features: Type.Array(Type.Ref(CommercialFeatureId), {
      uniqueItems: true,
      maxItems: COMMERCIAL_FEATURE_IDS.length,
    }),
  },
  { $id: 'CommercialEntitlements', additionalProperties: false },
);
export type CommercialEntitlements = Static<typeof CommercialEntitlements>;

export const CommercialEntitlementOverrides = Type.Partial(CommercialEntitlements, {
  $id: 'CommercialEntitlementOverrides',
  additionalProperties: false,
});
export type CommercialEntitlementOverrides = Static<typeof CommercialEntitlementOverrides>;

const STARTER_FEATURES: CommercialFeatureId[] = [
  'named-step-styles',
  'flow-map',
  'scheduling',
  'copy-assist',
  'predictive-layout-qa',
  'release-management',
  'recovery',
  'drift-alerts',
  'roles',
  'theme-generation',
];

const GROWTH_FEATURES: CommercialFeatureId[] = [
  ...STARTER_FEATURES,
  'branching',
  'multiple-themes',
  'form-response-capture',
  'audience-segmentation',
  'custom-user-attributes',
  'event-triggers',
  'experiments',
  'batch-operations',
  'adoption-impact',
  'form-response-analytics',
  'audience-segment-results',
  'sequence-funnel',
  'experiment-comparison',
  'ask-assist',
  'auto-translate',
  'review-approval',
  'presence',
  'sso',
  'api-webhooks',
];

const SCALE_FEATURES: CommercialFeatureId[] = [
  ...GROWTH_FEATURES,
  'cohort-retention',
  'analytics-csv',
  'narration',
  'required-production-approval',
  'audit-log',
  'step-locks',
  'comments',
];

const BUSINESS_FEATURES: CommercialFeatureId[] = [
  ...SCALE_FEATURES,
  'warehouse-sync',
  'raw-event-export',
  'change-history-export',
  'scim',
  'custom-roles',
];

const MIB = 1_048_576;

/** Versioned packaging data. Deliberately excludes unvalidated prices. */
export const COMMERCIAL_PLAN_ENTITLEMENTS: Readonly<
  Record<CommercialPlanId, CommercialEntitlements>
> = {
  free: {
    engagedUsersPerMonth: 1_000,
    liveExperiences: 3,
    creatorSeats: 1,
    applications: 1,
    locales: 1,
    environments: 1,
    assetBytes: 5 * MIB,
    removeBadge: false,
    analyticsRetentionDays: 7,
    analyticsExportsPerMonth: 0,
    adoptionSuccessEvents: 0,
    aiCreditsPerMonth: 50,
    versionRetentionDays: 7,
    themeGenerationRuns: 1,
    features: ['theme-generation'],
  },
  starter: {
    engagedUsersPerMonth: 15_000,
    liveExperiences: 15,
    creatorSeats: 3,
    applications: 1,
    locales: 2,
    environments: 2,
    assetBytes: 5 * MIB,
    removeBadge: true,
    analyticsRetentionDays: 30,
    analyticsExportsPerMonth: 0,
    adoptionSuccessEvents: 0,
    aiCreditsPerMonth: 300,
    versionRetentionDays: 30,
    themeGenerationRuns: null,
    features: STARTER_FEATURES,
  },
  growth: {
    engagedUsersPerMonth: 75_000,
    liveExperiences: 60,
    creatorSeats: 10,
    applications: 3,
    locales: 10,
    environments: 3,
    assetBytes: 5 * MIB,
    removeBadge: true,
    analyticsRetentionDays: 365,
    analyticsExportsPerMonth: 0,
    adoptionSuccessEvents: 10,
    aiCreditsPerMonth: 1_500,
    versionRetentionDays: 365,
    themeGenerationRuns: null,
    features: GROWTH_FEATURES,
  },
  scale: {
    engagedUsersPerMonth: 300_000,
    liveExperiences: null,
    creatorSeats: null,
    applications: 10,
    locales: null,
    environments: null,
    assetBytes: 25 * MIB,
    removeBadge: true,
    analyticsRetentionDays: 730,
    analyticsExportsPerMonth: 100,
    adoptionSuccessEvents: 50,
    aiCreditsPerMonth: 5_000,
    versionRetentionDays: null,
    themeGenerationRuns: null,
    features: SCALE_FEATURES,
  },
  business: {
    engagedUsersPerMonth: 1_000_000,
    liveExperiences: null,
    creatorSeats: null,
    applications: null,
    locales: null,
    environments: null,
    assetBytes: 25 * MIB,
    removeBadge: true,
    analyticsRetentionDays: 730,
    analyticsExportsPerMonth: 1_000,
    adoptionSuccessEvents: null,
    aiCreditsPerMonth: 15_000,
    versionRetentionDays: null,
    themeGenerationRuns: null,
    features: BUSINESS_FEATURES,
  },
  enterprise: {
    engagedUsersPerMonth: null,
    liveExperiences: null,
    creatorSeats: null,
    applications: null,
    locales: null,
    environments: null,
    assetBytes: 25 * MIB,
    removeBadge: true,
    analyticsRetentionDays: 1_095,
    analyticsExportsPerMonth: null,
    adoptionSuccessEvents: null,
    aiCreditsPerMonth: null,
    versionRetentionDays: null,
    themeGenerationRuns: null,
    features: [...BUSINESS_FEATURES, 'data-residency'],
  },
};

export function resolveCommercialEntitlements(
  planId: CommercialPlanId,
  overrides: CommercialEntitlementOverrides = {},
): CommercialEntitlements {
  if (overrides.features?.some((feature) => RETIRED_COMMERCIAL_FEATURE_ID_SET.has(feature))) {
    throw new Error('Commercial entitlement overrides are invalid');
  }
  const base = COMMERCIAL_PLAN_ENTITLEMENTS[planId];
  const resolved = structuredClone({ ...base, ...overrides });
  if (!Value.Check(CommercialEntitlements, [CommercialFeatureId], resolved)) {
    throw new Error('Commercial entitlement overrides are invalid');
  }
  return resolved;
}

export function commercialFeatureEnabled(
  entitlements: Pick<CommercialEntitlements, 'features'>,
  feature: CommercialFeatureId,
): boolean {
  return !RETIRED_COMMERCIAL_FEATURE_ID_SET.has(feature) && entitlements.features.includes(feature);
}

/** Commercial features that are materially encoded in a canonical document. */
export function commercialDocumentFeatures(
  document: LodariqDocument,
): readonly CommercialFeatureId[] {
  const features = new Set<CommercialFeatureId>();
  if (document.trigger.type === 'event') features.add('event-triggers');
  if ((document.audience.rules?.length ?? 0) > 0) {
    features.add('audience-segmentation');
    if (document.audience.rules?.some((rule) => rule.source === 'identify')) {
      features.add('custom-user-attributes');
    }
  }
  if (usesNonLinearTransition(document.blocks)) features.add('branching');
  if (usesNarration(document.blocks)) features.add('narration');
  return [...features];
}

export const COMMERCIAL_USAGE_METRICS = [
  'engaged-users',
  'live-experiences',
  'creator-seats',
  'applications',
  'locales',
  'environments',
  'ai-credits',
  'theme-generation-runs',
] as const;
export const CommercialUsageMetric = Type.Union(
  COMMERCIAL_USAGE_METRICS.map((metric) => Type.Literal(metric)),
  { $id: 'CommercialUsageMetric' },
);
export type CommercialUsageMetric = Static<typeof CommercialUsageMetric>;

export const CommercialUsageValue = Type.Object(
  {
    used: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    limit: NullableLimit,
    enforcement: Type.Union([Type.Literal('hard'), Type.Literal('soft')]),
    status: Type.Union([Type.Literal('within'), Type.Literal('near'), Type.Literal('exceeded')]),
  },
  { $id: 'CommercialUsageValue', additionalProperties: false },
);
export type CommercialUsageValue = Static<typeof CommercialUsageValue>;

export const WorkspaceCommercialUsage = Type.Object(
  {
    planId: Type.Ref(CommercialPlanId),
    planVersion: Type.Literal(COMMERCIAL_PLAN_VERSION),
    periodStart: Type.String({ format: 'date-time' }),
    periodEnd: Type.String({ format: 'date-time' }),
    engagedUsers: Type.Ref(CommercialUsageValue),
    liveExperiences: Type.Ref(CommercialUsageValue),
    creatorSeats: Type.Ref(CommercialUsageValue),
    applications: Type.Ref(CommercialUsageValue),
    locales: Type.Ref(CommercialUsageValue),
    environments: Type.Ref(CommercialUsageValue),
    aiCredits: Type.Ref(CommercialUsageValue),
    themeGenerationRuns: Type.Ref(CommercialUsageValue),
    analyticsExports: Type.Ref(CommercialUsageValue),
    assetBytes: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    analyticsRetentionDays: Type.Integer({ minimum: 1, maximum: 3_650 }),
    versionRetentionDays: NullableLimit,
    removeBadge: Type.Boolean(),
    features: Type.Array(Type.Ref(CommercialFeatureId), {
      uniqueItems: true,
      maxItems: COMMERCIAL_FEATURE_IDS.length,
    }),
  },
  { $id: 'WorkspaceCommercialUsage', additionalProperties: false },
);
export type WorkspaceCommercialUsage = Static<typeof WorkspaceCommercialUsage>;

export function commercialUsageValue(
  used: number,
  limit: number | null,
  enforcement: 'hard' | 'soft',
): CommercialUsageValue {
  let status: CommercialUsageValue['status'] = 'within';
  if (limit !== null && used > limit) {
    status = 'exceeded';
  } else if (limit !== null && used >= limit * 0.8) {
    status = 'near';
  }
  return { used, limit, enforcement, status };
}

function usesNonLinearTransition(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(usesNonLinearTransition);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const transition = record['transition'];
  if (transition && typeof transition === 'object') {
    const transitionRecord = transition as Record<string, unknown>;
    if (Array.isArray(transitionRecord['rules']) && transitionRecord['rules'].length > 0) {
      return true;
    }
    const fallback = transitionRecord['fallback'];
    if (
      fallback &&
      typeof fallback === 'object' &&
      (fallback as Record<string, unknown>)['type'] !== 'next'
    ) {
      return true;
    }
  }
  return Object.values(record).some(usesNonLinearTransition);
}

function usesNarration(blocks: readonly LodariqDocument['blocks'][number][]): boolean {
  return blocks.some(
    (block) => Boolean(block.props.narration?.script.trim()) || usesNarration(block.children),
  );
}
