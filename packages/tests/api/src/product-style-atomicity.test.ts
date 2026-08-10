import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import { computeBrandThemeContentHash } from '@lodariq/compiler';
import {
  AuthoringProductMatchApplyResult,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  validate,
  type AuthoringProductMatchApplyResult as AuthoringProductMatchApplyResultType,
  type ProductStyleProposal,
} from '@lodariq/schema';

const AUTH_HEADERS = {
  'x-lodariq-workspace-id': 'wk_a',
  'x-lodariq-user-id': 'user_a',
  'x-lodariq-role': 'admin',
};
const CAPTURED_AT = '2026-08-09T09:00:00.000Z';

describe('Product match API atomicity', () => {
  it('returns the canonical persisted draft receipt and idempotently preserves all provenance', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      defaultUserId: 'user_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const created = await app.inject({
      method: 'POST',
      url: '/v1/themes',
      headers: AUTH_HEADERS,
      payload: {
        name: 'Atomic Product Brand',
        draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      },
    });
    expect(created.statusCode).toBe(201);
    const createdTheme = created.json<{
      theme: { id: string; revision: number; updatedAt: string };
    }>().theme;
    const approval = await app.inject({
      method: 'POST',
      url: `/v1/themes/${createdTheme.id}/approve`,
      headers: AUTH_HEADERS,
      payload: {
        expectedRevision: createdTheme.revision,
        expectedUpdatedAt: createdTheme.updatedAt,
      },
    });
    expect(approval.statusCode).toBe(200);
    const approved = approval.json<{
      theme: { activeVersionId: string; revision: number; updatedAt: string };
    }>().theme;
    const payload = { environmentId: 'env_staging', proposal: proposal() };

    const applied = await app.inject({
      method: 'POST',
      url: `/v1/themes/${createdTheme.id}/style-sources`,
      headers: AUTH_HEADERS,
      payload,
    });
    expect(applied.statusCode).toBe(201);
    const body = applied.json<{
      productMatch: AuthoringProductMatchApplyResultType;
      source: { id: string; source: { sourceId: string } };
      sources: Array<{ id: string; source: { sourceId: string } }>;
      theme: {
        activeVersionId: string;
        revision: number;
        updatedAt: string;
        draft: typeof LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition;
      };
      previewTheme: AuthoringProductMatchApplyResultType['previewTheme'];
      draftChanged: boolean;
      replayed: boolean;
    }>();
    expect(validate(AuthoringProductMatchApplyResult, body.productMatch)).toEqual({
      valid: true,
      value: body.productMatch,
    });
    expect(body).toMatchObject({
      draftChanged: true,
      replayed: false,
      source: { source: { sourceId: 'selected.primary' } },
      theme: {
        activeVersionId: approved.activeVersionId,
        revision: approved.revision + 1,
      },
      productMatch: {
        proposalId: 'proposal.api.atomic.1',
        draftRevision: approved.revision + 1,
        draftChanged: true,
        replayed: false,
      },
    });
    expect(body.sources.map((source) => source.source.sourceId)).toEqual([
      'selected.primary',
      'page.fallback',
    ]);
    expect(body.productMatch.sources.map((source) => source.sourceId)).toEqual(
      body.sources.map((source) => source.id),
    );
    expect(body.productMatch.previewTheme).toEqual(body.previewTheme);
    await expect(computeBrandThemeContentHash(body.previewTheme)).resolves.toBe(
      body.previewTheme.contentHash,
    );

    const originalReceipt = structuredClone(body.productMatch);
    const laterDraft = structuredClone(body.theme.draft);
    laterDraft.tokens.modes.light.colors.surface = '#f1f3f7';
    const laterMutation = await app.inject({
      method: 'PATCH',
      url: `/v1/themes/${createdTheme.id}`,
      headers: AUTH_HEADERS,
      payload: {
        draft: laterDraft,
        expectedRevision: body.theme.revision,
        expectedUpdatedAt: body.theme.updatedAt,
      },
    });
    expect(laterMutation.statusCode).toBe(200);
    const laterTheme = laterMutation.json<{ theme: { revision: number; updatedAt: string } }>()
      .theme;

    const replay = await app.inject({
      method: 'POST',
      url: `/v1/themes/${createdTheme.id}/style-sources`,
      headers: AUTH_HEADERS,
      payload,
    });
    expect(replay.statusCode).toBe(201);
    const replayBody = replay.json<{
      productMatch: AuthoringProductMatchApplyResultType;
      previewTheme: AuthoringProductMatchApplyResultType['previewTheme'];
      theme: { revision: number; updatedAt: string };
      replayed: boolean;
      draftChanged: boolean;
    }>();
    expect(replayBody).toMatchObject({
      replayed: true,
      draftChanged: true,
      theme: laterTheme,
      productMatch: {
        proposalId: 'proposal.api.atomic.1',
        replayed: true,
        draftRevision: approved.revision + 1,
      },
    });
    expect(replayBody.productMatch).toEqual({ ...originalReceipt, replayed: true });
    expect(replayBody.previewTheme).toEqual(originalReceipt.previewTheme);
    expect(replayBody.theme.revision).toBeGreaterThan(originalReceipt.draftRevision);
    const history = await app.inject({
      method: 'GET',
      url: `/v1/themes/${createdTheme.id}/style-sources`,
      headers: AUTH_HEADERS,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json<{ sources: unknown[] }>().sources).toHaveLength(2);

    const conflictingProposal = proposal();
    conflictingProposal.tokens.radii = { md: 14 };
    const conflict = await app.inject({
      method: 'POST',
      url: `/v1/themes/${createdTheme.id}/style-sources`,
      headers: AUTH_HEADERS,
      payload: { environmentId: 'env_staging', proposal: conflictingProposal },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: 'product_style_proposal_conflict',
      proposalId: 'proposal.api.atomic.1',
    });

    await app.close();
  });

  it('rejects an open or unsafe proposal before any theme or provenance write', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      defaultUserId: 'user_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const created = await app.inject({
      method: 'POST',
      url: '/v1/themes',
      headers: AUTH_HEADERS,
      payload: {
        name: 'Closed proposal Brand',
        draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      },
    });
    const theme = created.json<{ theme: { id: string; revision: number } }>().theme;
    const unsafe = { ...proposal('proposal.api.unsafe'), rawCss: ':root { --secret: value; }' };
    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/themes/${theme.id}/style-sources`,
      headers: AUTH_HEADERS,
      payload: { environmentId: 'env_staging', proposal: unsafe },
    });
    expect(rejected.statusCode).toBe(400);

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/themes/${theme.id}`,
      headers: AUTH_HEADERS,
    });
    expect(detail.json()).toMatchObject({
      theme: { revision: theme.revision, latestStyleSource: null },
    });
    const history = await app.inject({
      method: 'GET',
      url: `/v1/themes/${theme.id}/style-sources`,
      headers: AUTH_HEADERS,
    });
    expect(history.json()).toEqual({ sources: [] });
    await app.close();
  });
});

function proposal(proposalId = 'proposal.api.atomic.1'): ProductStyleProposal {
  return {
    schemaVersion: '1',
    proposalId,
    sources: [
      {
        sourceId: 'selected.primary',
        kind: 'selected_element',
        confidence: 92,
        fingerprintHash: `sha256-${'a'.repeat(64)}`,
        capturedAt: CAPTURED_AT,
      },
      {
        sourceId: 'page.fallback',
        kind: 'page_typography',
        confidence: 70,
        fingerprintHash: `sha256-${'b'.repeat(64)}`,
        capturedAt: CAPTURED_AT,
      },
    ],
    samples: [],
    tokens: {
      modes: { light: { colors: { accent: '#2457ff', onAccent: '#ffffff' } } },
      radii: { md: 12 },
    },
    confidence: 92,
    requiresConfirmation: false,
    createdAt: CAPTURED_AT,
  };
}
