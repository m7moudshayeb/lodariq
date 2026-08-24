import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileDocument, computeBrandThemeContentHash } from '@lodariq/compiler';
import {
  WorkspaceThemeApprovalRequiredError,
  WorkspaceThemeChangedError,
  createServerOwnedTourDraft,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  createGrandfatheredInMemoryControlPlaneRepository as createInMemoryControlPlaneRepository,
} from '../../fixtures/commercial.js';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type BasicVisualPreflightReport,
  type BrandThemeDefinition,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { readInitialBaseline } from './migration-test-utils.js';

const THEME_DRAFT: BrandThemeDefinition = structuredClone(
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition,
);
const ENVIRONMENT: WorkspaceEnvironment = {
  id: 'env_staging',
  workspaceId: 'wk_a',
  kind: 'staging',
  name: 'Staging',
  originAllowlist: ['https://staging.example.com'],
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
};
const VISUAL_REPORT: BasicVisualPreflightReport = {
  schemaVersion: '1',
  checkedAt: '2026-08-07T00:00:00.000Z',
  status: 'passed',
  issues: [],
};

afterEach(() => {
  vi.useRealTimers();
});

describe('workspace theme persistence', () => {
  it('binds new server-owned drafts to an approved default and otherwise keeps fallback semantics', () => {
    const withoutDefault = createServerOwnedTourDraft(
      'wk_a',
      'staging',
      'https://staging.example.com',
      { pathname: '/settings' },
    );
    const withDefault = createServerOwnedTourDraft(
      'wk_a',
      'staging',
      'https://staging.example.com',
      { pathname: '/settings' },
      { id: 'theme_primary', activeVersionId: 'themev_primary_v2' },
    );

    expect(withoutDefault.themeBinding).toBeUndefined();
    expect(withDefault.themeBinding).toEqual({
      policy: 'workspace-current',
      themeId: 'theme_primary',
      acknowledgedThemeVersionId: 'themev_primary_v2',
    });
  });

  it('keeps one default theme and scopes all reads to the requested workspace', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const first = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Primary brand',
      draft: THEME_DRAFT,
      actorUserId: 'user_admin',
    });
    const second = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Campaign brand',
      draft: THEME_DRAFT,
      actorUserId: 'user_admin',
    });

    expect(first.isDefault).toBe(false);
    expect(second.isDefault).toBe(false);
    await expect(repository.getDefaultWorkspaceTheme('wk_a')).resolves.toBeNull();
    await expect(
      repository.setDefaultWorkspaceTheme({
        workspaceId: 'wk_a',
        themeId: second.id,
        actorUserId: 'user_admin',
        expectedRevision: second.revision,
        expectedUpdatedAt: second.updatedAt,
      }),
    ).rejects.toBeInstanceOf(WorkspaceThemeApprovalRequiredError);

    const firstApproval = await repository.approveWorkspaceTheme({
      workspaceId: 'wk_a',
      themeId: first.id,
      actorUserId: 'user_admin',
      expectedRevision: first.revision,
      expectedUpdatedAt: first.updatedAt,
    });
    if (!firstApproval) throw new Error('first theme approval failed');
    expect(firstApproval.theme.isDefault).toBe(true);
    await expect(repository.getDefaultWorkspaceTheme('wk_a')).resolves.toMatchObject({
      id: first.id,
    });

    const secondApproval = await repository.approveWorkspaceTheme({
      workspaceId: 'wk_a',
      themeId: second.id,
      actorUserId: 'user_admin',
      expectedRevision: second.revision,
      expectedUpdatedAt: second.updatedAt,
    });
    if (!secondApproval) throw new Error('second theme approval failed');
    expect(secondApproval.theme.isDefault).toBe(false);
    await expect(repository.listWorkspaceThemes('wk_b')).resolves.toEqual([]);
    await expect(repository.getWorkspaceTheme('wk_b', first.id)).resolves.toBeNull();

    const nextDefault = await repository.setDefaultWorkspaceTheme({
      workspaceId: 'wk_a',
      themeId: second.id,
      actorUserId: 'user_admin',
      expectedRevision: secondApproval.theme.revision,
      expectedUpdatedAt: secondApproval.theme.updatedAt,
    });
    expect(nextDefault?.isDefault).toBe(true);
    const themes = await repository.listWorkspaceThemes('wk_a');
    expect(themes.filter((theme) => theme.isDefault)).toHaveLength(1);
    expect(themes.find((theme) => theme.isDefault)?.id).toBe(second.id);
  });

  it('uses revision and updatedAt CAS guards while appending immutable approvals', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const created = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Primary brand',
      draft: THEME_DRAFT,
      actorUserId: 'user_admin',
    });
    const updated = await repository.updateWorkspaceThemeDraft({
      workspaceId: 'wk_a',
      themeId: created.id,
      name: 'Primary product brand',
      draft: THEME_DRAFT,
      actorUserId: 'user_admin',
      expectedRevision: created.revision,
      expectedUpdatedAt: created.updatedAt,
    });
    if (!updated) throw new Error('theme update failed');

    await expect(
      repository.updateWorkspaceThemeDraft({
        workspaceId: 'wk_a',
        themeId: created.id,
        draft: THEME_DRAFT,
        actorUserId: 'user_admin',
        expectedRevision: created.revision,
        expectedUpdatedAt: created.updatedAt,
      }),
    ).rejects.toBeInstanceOf(WorkspaceThemeChangedError);

    const firstApproval = await repository.approveWorkspaceTheme({
      workspaceId: 'wk_a',
      themeId: created.id,
      actorUserId: 'user_admin',
      expectedRevision: updated.revision,
      expectedUpdatedAt: updated.updatedAt,
    });
    if (!firstApproval) throw new Error('first theme approval failed');
    expect(firstApproval.approvedVersion.version).toBe(1);
    await expect(
      computeBrandThemeContentHash(firstApproval.approvedVersion.snapshot),
    ).resolves.toBe(firstApproval.approvedVersion.contentHash);

    const secondApproval = await repository.approveWorkspaceTheme({
      workspaceId: 'wk_a',
      themeId: created.id,
      actorUserId: 'user_admin',
      expectedRevision: firstApproval.theme.revision,
      expectedUpdatedAt: firstApproval.theme.updatedAt,
    });
    if (!secondApproval) throw new Error('second theme approval failed');
    const versions = await repository.listWorkspaceThemeVersions('wk_a', created.id);
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions[1]).toEqual(firstApproval.approvedVersion);
    expect(secondApproval.theme.activeVersionId).toBe(secondApproval.approvedVersion.id);
  });

  it('persists bounded visual reports against exact artifact identities and reports theme impact', async () => {
    const repository = createInMemoryControlPlaneRepository({ environments: [ENVIRONMENT] });
    const theme = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Primary brand',
      draft: THEME_DRAFT,
      actorUserId: 'user_admin',
    });
    const approval = await repository.approveWorkspaceTheme({
      workspaceId: 'wk_a',
      themeId: theme.id,
      actorUserId: 'user_admin',
      expectedRevision: theme.revision,
      expectedUpdatedAt: theme.updatedAt,
    });
    if (!approval) throw new Error('theme approval failed');

    const document = themeBoundDocument(
      'doc_theme_impact',
      approval.theme.id,
      approval.approvedVersion.id,
    );
    const compiled = await compileDocument({
      document,
      theme: approval.approvedVersion.snapshot,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    const saved = await repository.saveDocument({
      workspaceId: 'wk_a',
      document,
      artifact: compiled,
      actorUserId: 'user_admin',
    });
    const artifact = saved.latestArtifact;
    if (!artifact?.documentVersionId) throw new Error('compiled artifact version missing');

    const run = await repository.createVisualCheckRun({
      workspaceId: 'wk_a',
      documentId: document.id,
      documentVersionId: artifact.documentVersionId,
      compiledArtifactId: artifact.id,
      themeVersionId: approval.approvedVersion.id,
      environmentId: ENVIRONMENT.id,
      contentHash: artifact.contentHash,
      report: VISUAL_REPORT,
      actorUserId: 'user_admin',
    });
    expect(run.status).toBe('passed');
    await expect(repository.listVisualCheckRuns('wk_a', document.id)).resolves.toEqual([run]);
    await expect(repository.listVisualCheckRuns('wk_b', document.id)).resolves.toEqual([]);

    await expect(repository.listWorkspaceThemeImpact('wk_a', theme.id)).resolves.toEqual([
      expect.objectContaining({
        documentId: document.id,
        bindingPolicy: 'workspace-current',
        acknowledgedThemeVersionId: approval.approvedVersion.id,
        latestArtifactThemeVersionId: approval.approvedVersion.id,
      }),
    ]);
  });
});

describe('document publication history persistence', () => {
  it('returns full history newest-first without crossing workspace or document scope', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T01:00:00.000Z'));
    const firstDocument = documentFixture('doc_history_a');
    const secondDocument = documentFixture('doc_history_b');
    const repository = createInMemoryControlPlaneRepository({ environments: [ENVIRONMENT] });
    const firstSaved = await saveWithFallbackTheme(repository, firstDocument);
    const secondSaved = await saveWithFallbackTheme(repository, secondDocument);
    if (!firstSaved.latestArtifact || !secondSaved.latestArtifact) {
      throw new Error('history fixture artifacts missing');
    }
    if (!firstSaved.latestArtifact.documentVersionId) {
      throw new Error('fallback visual-check document version missing');
    }
    const fallbackVisualCheck = await repository.createVisualCheckRun({
      workspaceId: 'wk_a',
      documentId: firstDocument.id,
      documentVersionId: firstSaved.latestArtifact.documentVersionId,
      compiledArtifactId: firstSaved.latestArtifact.id,
      themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
      environmentId: ENVIRONMENT.id,
      contentHash: firstSaved.latestArtifact.contentHash,
      report: VISUAL_REPORT,
      actorUserId: 'user_admin',
    });
    expect(fallbackVisualCheck.themeVersionId).toBe(
      LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
    );
    const firstPublication = await repository.publishCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: ENVIRONMENT.id,
      correlationId: 'corr_history_first',
      artifact: firstSaved.latestArtifact,
      actorUserId: 'user_admin',
    });
    await repository.publishCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: ENVIRONMENT.id,
      correlationId: 'corr_history_other_document',
      artifact: secondSaved.latestArtifact,
      actorUserId: 'user_admin',
    });
    vi.setSystemTime(new Date('2026-08-07T01:01:00.000Z'));
    const secondPublication = await repository.publishCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: ENVIRONMENT.id,
      correlationId: 'corr_history_second',
      artifact: firstSaved.latestArtifact,
      actorUserId: 'user_admin',
    });

    await expect(repository.listDocumentPublications('wk_a', firstDocument.id)).resolves.toEqual([
      secondPublication,
      firstPublication,
    ]);
    await expect(
      repository.listDocumentPublications('wk_a', secondDocument.id),
    ).resolves.toHaveLength(1);
    await expect(repository.listDocumentPublications('wk_b', firstDocument.id)).resolves.toEqual(
      [],
    );
  });
});

describe('Phase 2 brand staging baseline', () => {
  it('adds forced-RLS theme/version/visual tables without a data backfill', () => {
    const migration = readInitialBaseline();
    for (const table of ['themes', 'theme_versions', 'visual_check_runs']) {
      expect(migration).toContain(`create table if not exists ${table}`);
      expect(migration).toContain(`alter table ${table} enable row level security`);
      expect(migration).toContain(`alter table ${table} force row level security`);
      expect(migration).toContain(`create policy ${table}_workspace_isolation on ${table}`);
    }
    expect(migration).toContain('themes_workspace_default_idx');
    expect(migration).toContain('themes_default_requires_approved_version_check');
    expect(migration).toContain('theme_versions_workspace_theme_version_idx');
    expect(migration).toContain('visual_check_runs_document_version_scope_fk');
    expect(migration).toContain('add column if not exists compiler_version text');
    expect(migration).toContain('add column if not exists renderer_contract_version text');
    expect(migration).toContain('add column if not exists theme_contract_version text');
    expect(migration).toContain('add column if not exists theme_version_id text');
    expect(migration).toContain('authoring_sessions_compatibility_pins_check');
    for (const column of [
      'compiler_version',
      'renderer_contract_version',
      'theme_contract_version',
      'theme_version_id',
    ]) {
      expect(migration).toContain(`${column} is not null`);
    }
    expect(migration).not.toMatch(/insert\s+into\s+(?:themes|theme_versions|visual_check_runs)/iu);
  });
});

function documentFixture(id: string): LodariqDocument {
  const document = structuredClone(tourFixture) as LodariqDocument;
  document.id = id;
  document.workspaceId = 'wk_a';
  document.title = id;
  return document;
}

function themeBoundDocument(id: string, themeId: string, themeVersionId: string): LodariqDocument {
  const document = documentFixture(id);
  delete document.themeRef;
  document.themeBinding = {
    policy: 'workspace-current',
    themeId,
    acknowledgedThemeVersionId: themeVersionId,
  };
  return document;
}

async function saveWithFallbackTheme(
  repository: ReturnType<typeof createInMemoryControlPlaneRepository>,
  document: LodariqDocument,
) {
  const compiled = await compileDocument({
    document,
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  return repository.saveDocument({
    workspaceId: 'wk_a',
    document,
    artifact: compiled,
    actorUserId: 'user_admin',
  });
}
