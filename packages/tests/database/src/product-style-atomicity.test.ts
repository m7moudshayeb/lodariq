import { describe, expect, it } from 'vitest';
import { computeBrandThemeContentHash } from '@lodariq/compiler';
import {
  ProductStyleProposalConflictError,
  WorkspaceThemeChangedError,
  createInMemoryControlPlaneRepository,
  createWorkspaceThemeDraftPreviewSnapshot,
  hashCanonicalJson,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  BrandThemeSnapshot,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  validate,
  type ProductStyleProposal,
} from '@lodariq/schema';
import { readInitialBaseline } from './migration-test-utils.js';

const CREATED_AT = '2026-08-09T08:00:00.000Z';
const ENVIRONMENT: WorkspaceEnvironment = {
  id: 'env_staging',
  workspaceId: 'wk_a',
  kind: 'staging',
  name: 'Staging',
  originAllowlist: ['https://staging.example.com'],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};
const MEMBERSHIPS = [
  {
    workspaceId: 'wk_a',
    userId: 'user_admin',
    role: 'admin' as const,
    createdAt: CREATED_AT,
  },
];

describe('atomic Product match persistence', () => {
  it('commits the draft and complete ordered provenance set without mutating approval state', async () => {
    const repository = createRepository();
    const created = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Product Brand',
      draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      actorUserId: 'user_admin',
    });
    const approval = await repository.approveWorkspaceTheme({
      workspaceId: 'wk_a',
      themeId: created.id,
      actorUserId: 'user_admin',
      expectedRevision: created.revision,
      expectedUpdatedAt: created.updatedAt,
    });
    if (!approval) throw new Error('theme approval failed');
    const nextDraft = structuredClone(approval.theme.draft);
    nextDraft.tokens.modes.light.colors.accent = '#335eea';

    const applied = await repository.applyProductStyleProposal({
      workspaceId: 'wk_a',
      themeId: created.id,
      environmentId: ENVIRONMENT.id,
      proposal: proposal(),
      draft: nextDraft,
      actorUserId: 'user_admin',
      expectedRevision: approval.theme.revision,
      expectedUpdatedAt: approval.theme.updatedAt,
    });

    expect(applied).toMatchObject({
      draftChanged: true,
      replayed: false,
      application: {
        environmentId: ENVIRONMENT.id,
        receipt: {
          proposalId: 'proposal.atomic.1',
          draftRevision: approval.theme.revision + 1,
          draftChanged: true,
        },
      },
      theme: {
        revision: approval.theme.revision + 1,
        activeVersionId: approval.approvedVersion.id,
        isDefault: true,
      },
    });
    expect(applied?.sources.map((record) => record.source.sourceId)).toEqual([
      'selected.primary',
      'page.fallback',
    ]);
    expect(applied?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId: 'proposal.atomic.1',
          sourceOrdinal: 0,
          sourceCount: 2,
          appliedThemeRevision: approval.theme.revision + 1,
          draftChanged: true,
        }),
        expect.objectContaining({
          proposalId: 'proposal.atomic.1',
          sourceOrdinal: 1,
          sourceCount: 2,
          appliedThemeRevision: approval.theme.revision + 1,
          draftChanged: true,
        }),
      ]),
    );
    await expect(repository.listWorkspaceThemeVersions('wk_a', created.id)).resolves.toEqual([
      approval.approvedVersion,
    ]);
    await expect(repository.listStyleSources('wk_a', created.id)).resolves.toHaveLength(2);

    if (!applied) throw new Error('Product match application missing');
    const preview = createWorkspaceThemeDraftPreviewSnapshot(applied.theme);
    expect(validate(BrandThemeSnapshot, preview).valid).toBe(true);
    await expect(computeBrandThemeContentHash(preview)).resolves.toBe(preview.contentHash);
    expect(applied.application.receipt.previewTheme).toEqual(preview);
    expect(applied.application.receipt.sources).toEqual(
      applied.sources.map((source) => ({ sourceId: source.id, sourceHash: source.sourceHash })),
    );
    expect(applied.application.sourceSetHash).toBe(
      hashCanonicalJson(applied.application.receipt.sources),
    );
    expect(new Set(applied.sources.map((source) => source.proposalHash))).toEqual(
      new Set([applied.application.requestHash]),
    );
  });

  it('replays the same proposal deterministically without a second draft write or duplicate evidence', async () => {
    const repository = createRepository();
    const theme = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Product Brand',
      draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      actorUserId: 'user_admin',
    });
    const nextDraft = structuredClone(theme.draft);
    nextDraft.tokens.radii.md = 12;
    const input = {
      workspaceId: 'wk_a',
      themeId: theme.id,
      environmentId: ENVIRONMENT.id,
      proposal: proposal(),
      draft: nextDraft,
      actorUserId: 'user_admin',
      expectedRevision: theme.revision,
      expectedUpdatedAt: theme.updatedAt,
    } as const;

    const [first, replay] = [
      await repository.applyProductStyleProposal(input),
      await repository.applyProductStyleProposal(input),
    ];

    expect(first?.replayed).toBe(false);
    expect(replay).toMatchObject({
      replayed: true,
      draftChanged: true,
      theme: { revision: theme.revision + 1 },
    });
    expect(replay?.sources).toEqual(first?.sources);
    await expect(repository.listStyleSources('wk_a', theme.id)).resolves.toHaveLength(2);
  });

  it('replays the exact original receipt after a later unrelated draft mutation', async () => {
    const repository = createRepository();
    const theme = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Product Brand',
      draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      actorUserId: 'user_admin',
    });
    const matchedDraft = structuredClone(theme.draft);
    matchedDraft.tokens.radii.md = 12;
    const originalInput = {
      workspaceId: 'wk_a',
      themeId: theme.id,
      environmentId: ENVIRONMENT.id,
      proposal: proposal('proposal.atomic.exact-replay'),
      draft: matchedDraft,
      actorUserId: 'user_admin',
      expectedRevision: theme.revision,
      expectedUpdatedAt: theme.updatedAt,
    } as const;
    const first = await repository.applyProductStyleProposal(originalInput);
    if (!first) throw new Error('Product match application missing');

    const laterDraft = structuredClone(first.theme.draft);
    laterDraft.tokens.modes.light.colors.surface = '#f1f3f7';
    const laterTheme = await repository.updateWorkspaceThemeDraft({
      workspaceId: 'wk_a',
      themeId: theme.id,
      draft: laterDraft,
      actorUserId: 'user_admin',
      expectedRevision: first.theme.revision,
      expectedUpdatedAt: first.theme.updatedAt,
    });
    if (!laterTheme) throw new Error('later theme mutation missing');

    const replay = await repository.applyProductStyleProposal(originalInput);
    if (!replay) throw new Error('Product match replay missing');
    expect(replay.replayed).toBe(true);
    expect(replay.application).toEqual(first.application);
    expect(replay.sources).toEqual(first.sources);
    expect(replay.theme).toEqual(laterTheme);
    expect(replay.theme.revision).toBeGreaterThan(first.application.receipt.draftRevision);
    expect(createWorkspaceThemeDraftPreviewSnapshot(replay.theme).contentHash).not.toBe(
      first.application.receipt.previewTheme.contentHash,
    );
  });

  it('rejects stale, conflicting, invalid, and cross-tenant requests without partial writes', async () => {
    const repository = createRepository();
    const theme = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Product Brand',
      draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      actorUserId: 'user_admin',
    });
    const nextDraft = structuredClone(theme.draft);
    nextDraft.tokens.radii.md = 12;
    const first = await repository.applyProductStyleProposal({
      workspaceId: 'wk_a',
      themeId: theme.id,
      environmentId: ENVIRONMENT.id,
      proposal: proposal(),
      draft: nextDraft,
      actorUserId: 'user_admin',
      expectedRevision: theme.revision,
      expectedUpdatedAt: theme.updatedAt,
    });
    if (!first) throw new Error('Product match application missing');

    const conflicting = proposal();
    conflicting.tokens.radii = { md: 14 };
    await expect(
      repository.applyProductStyleProposal({
        workspaceId: 'wk_a',
        themeId: theme.id,
        environmentId: ENVIRONMENT.id,
        proposal: conflicting,
        draft: nextDraft,
        actorUserId: 'user_admin',
        expectedRevision: first.theme.revision,
        expectedUpdatedAt: first.theme.updatedAt,
      }),
    ).rejects.toBeInstanceOf(ProductStyleProposalConflictError);

    const staleProposal = proposal('proposal.atomic.stale');
    await expect(
      repository.applyProductStyleProposal({
        workspaceId: 'wk_a',
        themeId: theme.id,
        environmentId: ENVIRONMENT.id,
        proposal: staleProposal,
        draft: nextDraft,
        actorUserId: 'user_admin',
        expectedRevision: theme.revision,
        expectedUpdatedAt: theme.updatedAt,
      }),
    ).rejects.toBeInstanceOf(WorkspaceThemeChangedError);

    const invalid = {
      ...proposal('proposal.atomic.invalid'),
      rawCss: ':root { --secret: value; }',
    } as ProductStyleProposal;
    await expect(
      repository.applyProductStyleProposal({
        workspaceId: 'wk_a',
        themeId: theme.id,
        environmentId: ENVIRONMENT.id,
        proposal: invalid,
        draft: nextDraft,
        actorUserId: 'user_admin',
        expectedRevision: first.theme.revision,
        expectedUpdatedAt: first.theme.updatedAt,
      }),
    ).rejects.toThrow('must match ProductStyleProposal');

    await expect(
      repository.applyProductStyleProposal({
        workspaceId: 'wk_b',
        themeId: theme.id,
        environmentId: ENVIRONMENT.id,
        proposal: proposal('proposal.atomic.tenant'),
        draft: nextDraft,
        actorUserId: 'user_admin',
        expectedRevision: first.theme.revision,
        expectedUpdatedAt: first.theme.updatedAt,
      }),
    ).resolves.toBeNull();
    await expect(repository.listStyleSources('wk_a', theme.id)).resolves.toHaveLength(2);
    await expect(repository.listStyleSources('wk_b', theme.id)).resolves.toEqual([]);
    await expect(repository.getWorkspaceTheme('wk_a', theme.id)).resolves.toEqual(first.theme);
  });

  it('allows only one different proposal to win the same theme CAS', async () => {
    const repository = createRepository();
    const theme = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Product Brand',
      draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      actorUserId: 'user_admin',
    });
    const firstDraft = structuredClone(theme.draft);
    firstDraft.tokens.radii.md = 11;
    const secondDraft = structuredClone(theme.draft);
    secondDraft.tokens.radii.md = 14;

    const results = await Promise.allSettled([
      repository.applyProductStyleProposal({
        workspaceId: 'wk_a',
        themeId: theme.id,
        environmentId: ENVIRONMENT.id,
        proposal: proposal('proposal.atomic.concurrent.a'),
        draft: firstDraft,
        actorUserId: 'user_admin',
        expectedRevision: theme.revision,
        expectedUpdatedAt: theme.updatedAt,
      }),
      repository.applyProductStyleProposal({
        workspaceId: 'wk_a',
        themeId: theme.id,
        environmentId: ENVIRONMENT.id,
        proposal: proposal('proposal.atomic.concurrent.b'),
        draft: secondDraft,
        actorUserId: 'user_admin',
        expectedRevision: theme.revision,
        expectedUpdatedAt: theme.updatedAt,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.any(WorkspaceThemeChangedError),
    });
    await expect(repository.listStyleSources('wk_a', theme.id)).resolves.toHaveLength(2);
  });
});

describe('atomic Product match baseline', () => {
  it('enforces proposal idempotency metadata and forced tenant isolation in the clean baseline', () => {
    const migration = readInitialBaseline();
    expect(migration).toContain('proposal_id text not null');
    expect(migration).toContain('proposal_hash text not null');
    expect(migration).toContain('source_ordinal integer not null');
    expect(migration).toContain('source_count integer not null');
    expect(migration).toContain('applied_theme_revision integer not null');
    expect(migration).toContain('style_sources_proposal_source_idx');
    expect(migration).toContain('create table if not exists product_style_applications');
    expect(migration).toContain('request_hash text not null');
    expect(migration).toContain('source_set_hash text not null');
    expect(migration).toContain('preview_theme_json jsonb not null');
    expect(migration).toContain('source_receipts_json jsonb not null');
    expect(migration).toContain('product_style_applications_proposal_idx');
    expect(migration).toContain('alter table style_sources force row level security');
    expect(migration).toContain('alter table product_style_applications force row level security');
    expect(migration).not.toContain('create policy style_sources_workspace_update');
    expect(migration).not.toContain('create policy product_style_applications_workspace_update');
  });
});

function createRepository() {
  return createInMemoryControlPlaneRepository({
    environments: [ENVIRONMENT],
    workspaceMemberships: MEMBERSHIPS,
  });
}

function proposal(proposalId = 'proposal.atomic.1'): ProductStyleProposal {
  return {
    schemaVersion: '1',
    proposalId,
    sources: [
      {
        sourceId: 'selected.primary',
        kind: 'selected_element',
        confidence: 94,
        fingerprintHash: `sha256-${'a'.repeat(64)}`,
        capturedAt: CREATED_AT,
      },
      {
        sourceId: 'page.fallback',
        kind: 'page_typography',
        confidence: 72,
        fingerprintHash: `sha256-${'b'.repeat(64)}`,
        capturedAt: CREATED_AT,
      },
    ],
    samples: [],
    tokens: {
      modes: { light: { colors: { accent: '#2457ff' } } },
      radii: { md: 12 },
    },
    confidence: 94,
    requiresConfirmation: false,
    createdAt: CREATED_AT,
  };
}
