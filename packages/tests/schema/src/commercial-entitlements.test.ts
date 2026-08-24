import { describe, expect, it } from 'vitest';
import {
  ACTIVE_COMMERCIAL_FEATURE_IDS,
  COMMERCIAL_FEATURE_IDS,
  COMMERCIAL_PLAN_ENTITLEMENTS,
  COMMERCIAL_PLAN_IDS,
  COMMERCIAL_PLAN_LABELS,
  COMMERCIAL_PLAN_VERSION,
  NEVER_GATED_CAPABILITIES,
  RETIRED_COMMERCIAL_FEATURE_IDS,
  commercialFeatureEnabled,
  commercialDocumentFeatures,
  commercialUsageValue,
  documentLocaleCount,
  resolveCommercialEntitlements,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const MIB = 1_048_576;

describe('commercial entitlement contracts', () => {
  it('encodes the complete versioned plan matrix without prices', () => {
    expect(COMMERCIAL_PLAN_VERSION).toBe('2026-08-22.1');
    expect(COMMERCIAL_PLAN_IDS).toEqual([
      'free',
      'starter',
      'growth',
      'scale',
      'business',
      'enterprise',
    ]);
    expect(COMMERCIAL_PLAN_LABELS).toEqual({
      free: 'Free',
      starter: 'Starter',
      growth: 'Growth',
      scale: 'Scale',
      business: 'Business',
      enterprise: 'Enterprise',
    });

    expect(
      Object.fromEntries(
        COMMERCIAL_PLAN_IDS.map((planId) => {
          const plan = COMMERCIAL_PLAN_ENTITLEMENTS[planId];
          return [
            planId,
            {
              engaged: plan.engagedUsersPerMonth,
              live: plan.liveExperiences,
              seats: plan.creatorSeats,
              apps: plan.applications,
              locales: plan.locales,
              environments: plan.environments,
              assetBytes: plan.assetBytes,
              analyticsDays: plan.analyticsRetentionDays,
              analyticsExports: plan.analyticsExportsPerMonth,
              adoptionEvents: plan.adoptionSuccessEvents,
              aiCredits: plan.aiCreditsPerMonth,
              versionDays: plan.versionRetentionDays,
              themeRuns: plan.themeGenerationRuns,
              removeBadge: plan.removeBadge,
            },
          ];
        }),
      ),
    ).toEqual({
      free: planLimits(1_000, 3, 1, 1, 1, 1, 5 * MIB, 7, 0, 0, 50, 7, 1, false),
      starter: planLimits(15_000, 15, 3, 1, 2, 2, 5 * MIB, 30, 0, 0, 300, 30),
      growth: planLimits(75_000, 60, 10, 3, 10, 3, 5 * MIB, 365, 0, 10, 1_500, 365),
      scale: planLimits(300_000, null, null, 10, null, null, 25 * MIB, 730, 100, 50, 5_000),
      business: planLimits(
        1_000_000,
        null,
        null,
        null,
        null,
        null,
        25 * MIB,
        730,
        1_000,
        null,
        15_000,
      ),
      enterprise: planLimits(null, null, null, null, null, null, 25 * MIB, 1_095, null, null, null),
    });
  });

  it('adds commercial features monotonically and keeps product promises outside gates', () => {
    for (let index = 1; index < COMMERCIAL_PLAN_IDS.length; index += 1) {
      const previous = COMMERCIAL_PLAN_ENTITLEMENTS[COMMERCIAL_PLAN_IDS[index - 1]!].features;
      const current = COMMERCIAL_PLAN_ENTITLEMENTS[COMMERCIAL_PLAN_IDS[index]!].features;
      expect(previous.every((feature) => current.includes(feature))).toBe(true);
    }
    expect(new Set(COMMERCIAL_PLAN_ENTITLEMENTS.enterprise.features)).toEqual(
      new Set(ACTIVE_COMMERCIAL_FEATURE_IDS),
    );
    expect(RETIRED_COMMERCIAL_FEATURE_IDS).toEqual(['voice-cloning']);
    expect(
      COMMERCIAL_PLAN_IDS.every(
        (planId) => !COMMERCIAL_PLAN_ENTITLEMENTS[planId].features.includes('voice-cloning'),
      ),
    ).toBe(true);
    expect(NEVER_GATED_CAPABILITIES).toEqual([
      'authoring',
      'semantic-targeting',
      'target-verification',
      'approach-recipes',
      'drift-repair',
      'accessibility-quality',
      'experience-types',
      'basic-outcome-evidence',
    ]);
    expect(
      NEVER_GATED_CAPABILITIES.some((capability) =>
        COMMERCIAL_FEATURE_IDS.includes(capability as (typeof COMMERCIAL_FEATURE_IDS)[number]),
      ),
    ).toBe(false);
  });

  it('clones valid overrides and rejects malformed values', () => {
    const resolved = resolveCommercialEntitlements('enterprise', {
      assetBytes: 50 * MIB,
      aiCreditsPerMonth: 25_000,
    });
    expect(resolved.assetBytes).toBe(50 * MIB);
    expect(resolved.aiCreditsPerMonth).toBe(25_000);
    expect(COMMERCIAL_PLAN_ENTITLEMENTS.enterprise.assetBytes).toBe(25 * MIB);

    expect(() => resolveCommercialEntitlements('free', { assetBytes: 0 })).toThrow(
      'Commercial entitlement overrides are invalid',
    );
    expect(() =>
      resolveCommercialEntitlements('free', {
        features: ['theme-generation', 'theme-generation'],
      }),
    ).toThrow('Commercial entitlement overrides are invalid');
    expect(() =>
      resolveCommercialEntitlements('enterprise', { features: ['voice-cloning'] }),
    ).toThrow('Commercial entitlement overrides are invalid');
    expect(commercialFeatureEnabled({ features: ['voice-cloning'] }, 'voice-cloning')).toBe(false);
  });

  it('reports soft and hard usage status at the plan boundary', () => {
    expect(commercialUsageValue(79, 100, 'soft')).toEqual({
      used: 79,
      limit: 100,
      enforcement: 'soft',
      status: 'within',
    });
    expect(commercialUsageValue(80, 100, 'soft').status).toBe('near');
    expect(commercialUsageValue(100, 100, 'hard').status).toBe('near');
    expect(commercialUsageValue(101, 100, 'hard').status).toBe('exceeded');
    expect(commercialUsageValue(1_000_000, null, 'hard').status).toBe('within');
  });

  it('detects only commercially gated structure in canonical documents', () => {
    const document = structuredClone(tourFixture) as LodariqDocument;
    expect(commercialDocumentFeatures(document)).toEqual([]);

    document.trigger = { type: 'event', config: { eventName: 'project.created' } };
    document.audience.rules = [
      { source: 'identify', key: 'plan', operator: 'equals', value: 'pro' },
    ];
    document.blocks[0]!.children[0]!.children[2]!.props.action = {
      type: 'next',
      transition: {
        rules: [
          {
            all: [{ source: 'identifyTrait', key: 'plan', operator: 'equals', value: 'pro' }],
            to: { type: 'complete' },
          },
        ],
        fallback: { type: 'next' },
      },
    };
    document.blocks[0]!.props.narration = {
      script: 'Create your first project.',
      voiceId: 'voice-default',
    };

    expect(new Set(commercialDocumentFeatures(document))).toEqual(
      new Set([
        'event-triggers',
        'audience-segmentation',
        'custom-user-attributes',
        'branching',
        'narration',
      ]),
    );
  });

  it('counts the default locale and unique localized variants', () => {
    const document = structuredClone(tourFixture) as LodariqDocument;
    document.localization = undefined;
    expect(documentLocaleCount(document)).toBe(1);
    document.localization = {
      defaultLocale: 'en',
      variants: [
        { locale: 'de', fallbackLocale: 'en', blocks: [] },
        { locale: 'de', fallbackLocale: 'en', blocks: [] },
        { locale: 'fr', fallbackLocale: 'en', blocks: [] },
      ],
    };
    expect(documentLocaleCount(document)).toBe(3);
  });
});

function planLimits(
  engaged: number | null,
  live: number | null,
  seats: number | null,
  apps: number | null,
  locales: number | null,
  environments: number | null,
  assetBytes: number,
  analyticsDays: number,
  analyticsExports: number | null,
  adoptionEvents: number | null,
  aiCredits: number | null,
  versionDays: number | null = null,
  themeRuns: number | null = null,
  removeBadge = true,
) {
  return {
    engaged,
    live,
    seats,
    apps,
    locales,
    environments,
    assetBytes,
    analyticsDays,
    analyticsExports,
    adoptionEvents,
    aiCredits,
    versionDays,
    themeRuns,
    removeBadge,
  };
}
