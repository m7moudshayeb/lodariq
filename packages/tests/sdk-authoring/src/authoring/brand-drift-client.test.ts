import { describe, expect, it, vi } from 'vitest';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  classifyBrandDrift,
  type AuthoringBrandDriftCheckResult,
  type ProductStyleProposal,
  type ProductStyleSource,
} from '@lodariq/schema';
import { requestAuthoringBrandDrift } from '../../../../../packages/sdk-authoring/src/authoring/brand-drift-client';

const CHECKED_AT = '2026-08-09T12:00:00.000Z';

describe('authoring Brand drift client', () => {
  it('validates and scopes one authorized hosted/direct response', async () => {
    const result = checkResult();
    const fetchAuthorized = vi.fn(async (body: string) => {
      expect(JSON.parse(body)).toEqual({ trigger: 'creator_check', proposal: proposal() });
      return Response.json(result);
    });

    await expect(
      requestAuthoringBrandDrift({
        request: { trigger: 'creator_check', proposal: proposal() },
        expectedDocumentId: 'tour_a',
        expectedThemeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
        expectedThemeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
        fetchAuthorized,
      }),
    ).resolves.toEqual(result);
    expect(fetchAuthorized).toHaveBeenCalledOnce();
  });

  it('rejects a valid response for another exact theme version', async () => {
    await expect(
      requestAuthoringBrandDrift({
        request: { trigger: 'authoring_open', proposal: proposal() },
        expectedDocumentId: 'tour_a',
        expectedThemeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
        expectedThemeVersionId: 'themev_other',
        fetchAuthorized: async () => Response.json(checkResult()),
      }),
    ).rejects.toMatchObject({
      code: 'invalid_brand_drift_response',
      status: 502,
    });
  });

  it('keeps server failure details bounded', async () => {
    await expect(
      requestAuthoringBrandDrift({
        request: { trigger: 'creator_check', proposal: proposal() },
        expectedDocumentId: 'tour_a',
        expectedThemeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
        expectedThemeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
        fetchAuthorized: async () =>
          Response.json(
            {
              error: 'not safe: https://customer.example/private',
              message: 'private host-page details',
            },
            { status: 409 },
          ),
      }),
    ).rejects.toMatchObject({
      code: 'brand_drift_check_failed',
      status: 409,
      message: 'Brand drift could not be checked',
    });
  });
});

function checkResult(): AuthoringBrandDriftCheckResult {
  const drift = classifyBrandDrift({
    checkId: 'check.brand-drift-client',
    checkedAt: CHECKED_AT,
    trigger: 'creator_check',
    baselineTheme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    baselineSources: [source('a')],
    observedProposal: proposal(),
  });
  return {
    documentId: 'tour_a',
    drift,
    documentThemeReview: null,
    documentUpdatedAt: CHECKED_AT,
  };
}

function proposal(): ProductStyleProposal {
  return {
    schemaVersion: '1',
    proposalId: 'proposal.brand-drift-client',
    sources: [source('b')],
    samples: [],
    tokens: { modes: { light: { colors: { accent: '#7c3aed' } } } },
    confidence: 100,
    requiresConfirmation: false,
    createdAt: CHECKED_AT,
  };
}

function source(character: string): ProductStyleSource {
  return {
    sourceId: 'customer-design-system',
    kind: 'registered_tokens',
    revision: 'build_42',
    confidence: 100,
    fingerprintHash: `sha256-${character.repeat(64)}`,
    capturedAt: CHECKED_AT,
  };
}
