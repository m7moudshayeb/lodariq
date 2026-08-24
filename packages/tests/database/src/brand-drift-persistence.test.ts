import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { createInMemoryControlPlaneRepository, type WorkspaceEnvironment } from '@lodariq/database';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  classifyBrandDrift,
  createBrandDriftAuditReport,
  type LodariqDocument,
  type ProductStyleProposal,
} from '@lodariq/schema';
import { readInitialBaseline } from './migration-test-utils.js';

const CREATED_AT = '2026-08-09T08:00:00.000Z';
const ENVIRONMENT: WorkspaceEnvironment = {
  id: 'env_staging',
  workspaceId: 'wk_a',
  kind: 'staging',
  name: 'Staging',
  originAllowlist: ['https://staging.example.test'],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

describe('append-only Brand drift evidence', () => {
  it('persists only bounded audit evidence against an exact tenant/theme version identity', async () => {
    const repository = createInMemoryControlPlaneRepository({
      environments: [ENVIRONMENT],
      workspaceMemberships: [
        { workspaceId: 'wk_a', userId: 'user_a', role: 'admin', createdAt: CREATED_AT },
      ],
    });
    const theme = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Primary',
      draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      actorUserId: 'user_a',
    });
    const approval = await repository.approveWorkspaceTheme({
      workspaceId: 'wk_a',
      themeId: theme.id,
      actorUserId: 'user_a',
      expectedRevision: theme.revision,
      expectedUpdatedAt: theme.updatedAt,
    });
    if (!approval) throw new Error('theme approval failed');
    const document = documentFixture(theme.id, approval.approvedVersion.id);
    const artifact = await compileDocument({
      document,
      theme: approval.approvedVersion.snapshot,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    await repository.saveDocument({
      workspaceId: 'wk_a',
      document,
      artifact,
      actorUserId: 'user_a',
    });
    const proposal = productStyleProposal();
    const drift = classifyBrandDrift({
      checkId: 'check.persistence',
      checkedAt: CREATED_AT,
      trigger: 'creator_check',
      baselineTheme: approval.approvedVersion.snapshot,
      baselineSources: [],
      observedProposal: proposal,
      affectedExperiences: [],
    });
    const report = createBrandDriftAuditReport(drift);
    const input = {
      workspaceId: 'wk_a',
      environmentId: ENVIRONMENT.id,
      documentId: document.id,
      themeId: theme.id,
      baselineThemeVersionId: approval.approvedVersion.id,
      report,
      actorUserId: 'user_a',
    } as const;

    const run = await repository.createBrandDriftRun(input);
    expect(run).toMatchObject({
      id: 'check.persistence',
      classification: drift.classification,
      baselineThemeVersionId: approval.approvedVersion.id,
    });
    expect(jsonKeys(run.report)).not.toEqual(
      expect.arrayContaining(['proposal', 'samples', 'tokens']),
    );
    await expect(repository.listBrandDriftRuns('wk_a', document.id)).resolves.toEqual([run]);
    await expect(repository.listBrandDriftRuns('wk_b', document.id)).resolves.toEqual([]);
    await expect(repository.createBrandDriftRun(input)).rejects.toThrow(
      'Brand drift check identity already exists',
    );
    await expect(
      repository.createBrandDriftRun({ ...input, actorUserId: 'user_unknown' }),
    ).rejects.toThrow('not a workspace member');
    await expect(
      repository.createBrandDriftRun({
        ...input,
        report: { ...report, checkId: 'check.cross-theme', baselineThemeVersionId: 'themev_other' },
        baselineThemeVersionId: 'themev_other',
      }),
    ).rejects.toThrow('baseline theme version not found');
    expect(JSON.stringify(proposal)).not.toContain('rawCss');
  });

  it('keeps Brand drift evidence forced-RLS and insert/select-only in the clean baseline', () => {
    const baseline = readInitialBaseline();
    expect(baseline).toContain('alter table brand_drift_runs enable row level security');
    expect(baseline).toContain('alter table brand_drift_runs force row level security');
    expect(baseline).toContain('create policy brand_drift_runs_workspace_isolation');
    expect(baseline).toContain('create policy brand_drift_runs_workspace_insert');
    expect(baseline).not.toContain('create policy brand_drift_runs_workspace_update');
    expect(baseline).not.toContain('create policy brand_drift_runs_workspace_delete');
  });
});

function documentFixture(themeId: string, themeVersionId: string): LodariqDocument {
  const document = structuredClone(tourFixture) as LodariqDocument;
  delete document.localization;
  document.blocks = document.blocks.slice(0, 1);
  document.targets = document.targets.slice(0, 1);
  return {
    ...document,
    id: 'tour_drift_persistence',
    workspaceId: 'wk_a',
    title: 'Drift persistence',
    themeBinding: {
      policy: 'workspace-current',
      themeId,
      acknowledgedThemeVersionId: themeVersionId,
    },
  };
}

function productStyleProposal(): ProductStyleProposal {
  return {
    schemaVersion: '1',
    proposalId: 'proposal.persistence',
    sources: [
      {
        sourceId: 'registered.product',
        kind: 'registered_tokens',
        confidence: 100,
        fingerprintHash: `sha256-${'b'.repeat(64)}`,
        capturedAt: CREATED_AT,
      },
    ],
    samples: [],
    tokens: { modes: { light: { colors: { accent: '#335eea' } } } },
    confidence: 100,
    requiresConfirmation: false,
    createdAt: CREATED_AT,
  };
}

function jsonKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(jsonKeys);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...jsonKeys(child)]);
}
