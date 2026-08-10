import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, compileDocument } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type BrandThemeSnapshot,
  type LodariqDocument,
  type ProductStyleProposal,
  type ProductStyleSource,
} from '@lodariq/schema';
import type {
  AuthoringSessionRecord,
  ControlPlaneRepository,
  PersistedDocument,
  StyleSourceRecord,
  WorkspaceThemeRecord,
  WorkspaceThemeVersionRecord,
} from '@lodariq/database';
import {
  checkAuthoringBrandDrift,
  latestCompleteStyleSourceSet,
} from '../../../../apps/api/src/brand-drift';

const CHECKED_AT = '2026-08-09T12:00:00.000Z';
const APPROVED_AT = '2026-08-09T11:00:00.000Z';

describe('authoring Brand drift service', () => {
  it('returns an actionable proposal while appending only privacy-safe drift evidence', async () => {
    const baselineSource = source(hash('a'));
    const observedSource = source(hash('b'));
    const { repository, reads } = repositoryFixture({ baselineSource });
    const proposal = productStyleProposal(observedSource);
    const proposalBefore = JSON.stringify(proposal);

    const result = await checkAuthoringBrandDrift({
      repository,
      session: authoringSession(),
      request: { trigger: 'authoring_open', proposal },
      now: () => new Date(CHECKED_AT),
      createCheckId: () => 'check.brand-drift-api',
    });

    expect(result.drift).toMatchObject({
      classification: 'actionable',
      changedRoles: ['accent'],
      affectedExperiences: [
        {
          documentId: 'tour_current',
          bindingPolicy: 'workspace-current',
          impact: 'would_require_review_on_approval',
        },
      ],
    });
    expect(result.documentThemeReview).toMatchObject({
      policy: 'workspace-current',
      reviewState: 'current',
    });
    if (!result.runtimePreview) throw new Error('runtime preview missing');
    const [currentRuntime, proposedRuntime] = await Promise.all([
      compileDocument({
        document: documentFixture(),
        theme: result.runtimePreview.currentTheme,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      }),
      compileDocument({
        document: documentFixture(),
        theme: result.runtimePreview.proposedTheme,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      }),
    ]);
    expect(currentRuntime.theme.contentHash).toBe(result.runtimePreview.currentTheme.contentHash);
    expect(proposedRuntime.theme.contentHash).toBe(result.runtimePreview.proposedTheme.contentHash);
    expect(proposedRuntime.theme.contentHash).not.toBe(currentRuntime.theme.contentHash);
    expect(JSON.stringify(proposal)).toBe(proposalBefore);
    expect(reads.getDocument).toHaveBeenCalledOnce();
    expect(reads.listStyleSources).toHaveBeenCalledWith('wk_a', 'theme_primary');
    expect(reads.createBrandDriftRun).toHaveBeenCalledOnce();
    const persisted = reads.createBrandDriftRun.mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      documentId: 'tour_a',
      themeId: 'theme_primary',
      baselineThemeVersionId: 'themev_primary_v1',
      actorUserId: 'user_a',
      report: { classification: 'actionable' },
    });
    expect(persisted?.report).not.toHaveProperty('proposal');
    expect(jsonKeys(persisted?.report)).not.toContain('samples');
    expect(jsonKeys(persisted?.report)).not.toContain('tokens');
    expect(Object.keys(repository)).toEqual([
      'getDocument',
      'getWorkspaceTheme',
      'listWorkspaceThemeVersions',
      'listStyleSources',
      'listWorkspaceThemeImpact',
      'createBrandDriftRun',
    ]);
    const serialized = JSON.stringify({ result, persisted });
    for (const prohibited of ['selector', 'outerHTML', 'coordinates', 'https://', 'rawCss']) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it('reports workspace-current review while keeping pinned documents pinned', async () => {
    const nextTheme = themeSnapshot('themev_primary_v2', 2);
    const fixture = repositoryFixture({
      baselineSource: source(hash('a')),
      activeVersionId: nextTheme.themeVersionId,
      additionalVersion: nextTheme,
    });
    const workspaceCurrent = await checkAuthoringBrandDrift({
      repository: fixture.repository,
      session: authoringSession(),
      request: { trigger: 'creator_check', proposal: productStyleProposal(source(hash('a'))) },
      now: () => new Date(CHECKED_AT),
      createCheckId: () => 'check.workspace-current-review',
    });
    expect(workspaceCurrent.documentThemeReview).toMatchObject({
      policy: 'workspace-current',
      reviewState: 'needs_review',
      approvedThemeVersionId: 'themev_primary_v2',
      acknowledgedThemeVersionId: 'themev_primary_v1',
    });

    const pinnedDocument = documentFixture();
    pinnedDocument.themeBinding = {
      policy: 'pinned',
      themeId: 'theme_primary',
      themeVersionId: 'themev_primary_v1',
    };
    fixture.reads.getDocument.mockResolvedValue({
      document: pinnedDocument,
      createdByUserId: 'user_a',
      updatedByUserId: 'user_a',
      updatedAt: CHECKED_AT,
    });
    const pinned = await checkAuthoringBrandDrift({
      repository: fixture.repository,
      session: authoringSession(),
      request: { trigger: 'creator_check', proposal: productStyleProposal(source(hash('a'))) },
      now: () => new Date(CHECKED_AT),
      createCheckId: () => 'check.pinned-review',
    });
    expect(pinned.documentThemeReview).toEqual({
      policy: 'pinned',
      reviewState: 'pinned',
      themeId: 'theme_primary',
      themeVersionId: 'themev_primary_v1',
    });
  });

  it('fails closed when the authoring session is pinned to another theme version', async () => {
    const fixture = repositoryFixture({ baselineSource: source(hash('a')) });
    await expect(
      checkAuthoringBrandDrift({
        repository: fixture.repository,
        session: { ...authoringSession(), themeVersionId: 'themev_stale' },
        request: {
          trigger: 'authoring_open',
          proposal: productStyleProposal(source(hash('a'))),
        },
      }),
    ).rejects.toMatchObject({
      code: 'authoring_session_compatibility_changed',
      statusCode: 409,
    });
  });

  it('does not return a successful check when the immutable audit insert fails', async () => {
    const fixture = repositoryFixture({ baselineSource: source(hash('a')) });
    fixture.reads.createBrandDriftRun.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(
      checkAuthoringBrandDrift({
        repository: fixture.repository,
        session: authoringSession(),
        request: {
          trigger: 'creator_check',
          proposal: productStyleProposal(source(hash('b'))),
        },
        now: () => new Date(CHECKED_AT),
        createCheckId: () => 'check.audit-failure',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(fixture.reads.createBrandDriftRun).toHaveBeenCalledOnce();
  });

  it('selects only the latest complete source set from the exact environment before approval', () => {
    const completeOlder = [
      styleRecord('proposal.complete', 0, 2, 'env_staging', '2026-08-09T10:00:00.000Z'),
      styleRecord('proposal.complete', 1, 2, 'env_staging', '2026-08-09T10:00:00.000Z'),
    ];
    const records = [
      styleRecord('proposal.after-approval', 0, 1, 'env_staging', '2026-08-09T12:00:00.000Z'),
      styleRecord('proposal.other-environment', 0, 1, 'env_production', '2026-08-09T10:30:00.000Z'),
      styleRecord('proposal.incomplete', 0, 2, 'env_staging', '2026-08-09T10:20:00.000Z'),
      ...completeOlder,
    ];

    expect(
      latestCompleteStyleSourceSet(records, {
        environmentId: 'env_staging',
        approvedAt: APPROVED_AT,
      }).map((record) => `${record.proposalId}:${record.sourceOrdinal}`),
    ).toEqual(['proposal.complete:0', 'proposal.complete:1']);
  });
});

function repositoryFixture(options: {
  baselineSource: ProductStyleSource;
  activeVersionId?: string;
  additionalVersion?: BrandThemeSnapshot;
}): {
  repository: ControlPlaneRepository;
  reads: {
    getDocument: ReturnType<typeof vi.fn>;
    listStyleSources: ReturnType<typeof vi.fn>;
    createBrandDriftRun: ReturnType<typeof vi.fn>;
  };
} {
  const document = documentFixture();
  const baselineTheme = themeSnapshot('themev_primary_v1', 1);
  const baselineVersion = themeVersion(baselineTheme, APPROVED_AT);
  const activeVersionId = options.activeVersionId ?? baselineTheme.themeVersionId;
  const activeVersion = options.additionalVersion
    ? themeVersion(options.additionalVersion, '2026-08-09T11:30:00.000Z')
    : baselineVersion;
  const theme: WorkspaceThemeRecord = {
    id: 'theme_primary',
    workspaceId: 'wk_a',
    name: 'Primary',
    draft: structuredClone(activeVersion.snapshot.definition),
    revision: 3,
    isDefault: true,
    activeVersionId,
    activeVersion,
    createdByUserId: 'user_a',
    updatedByUserId: 'user_a',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-09T11:30:00.000Z',
  };
  const getDocument = vi.fn(async (): Promise<PersistedDocument> => ({
    document,
    createdByUserId: 'user_a',
    updatedByUserId: 'user_a',
    updatedAt: CHECKED_AT,
  }));
  const listStyleSources = vi.fn(async () => [
    {
      ...styleRecord('proposal.baseline', 0, 1, 'env_staging', '2026-08-09T10:00:00.000Z'),
      source: options.baselineSource,
      sourceHash: hash('c'),
    },
  ]);
  const createBrandDriftRun = vi.fn(async () => undefined);
  const repository = {
    getDocument,
    getWorkspaceTheme: vi.fn(async () => theme),
    listWorkspaceThemeVersions: vi.fn(async () => [
      baselineVersion,
      ...(options.additionalVersion ? [activeVersion] : []),
    ]),
    listStyleSources,
    listWorkspaceThemeImpact: vi.fn(async () => [
      {
        documentId: 'tour_current',
        title: 'Current',
        status: 'draft' as const,
        bindingPolicy: 'workspace-current' as const,
        acknowledgedThemeVersionId: 'themev_primary_v1',
        pinnedThemeVersionId: null,
        latestArtifactThemeVersionId: 'themev_primary_v1',
        activeEnvironmentIds: ['env_staging'],
      },
      {
        documentId: 'tour_pinned',
        title: 'Pinned',
        status: 'draft' as const,
        bindingPolicy: 'pinned' as const,
        acknowledgedThemeVersionId: null,
        pinnedThemeVersionId: 'themev_primary_v1',
        latestArtifactThemeVersionId: 'themev_primary_v1',
        activeEnvironmentIds: [],
      },
    ]),
    createBrandDriftRun,
  } as unknown as ControlPlaneRepository;
  return { repository, reads: { getDocument, listStyleSources, createBrandDriftRun } };
}

function authoringSession(): AuthoringSessionRecord {
  return {
    id: 'authsess_a',
    workspaceId: 'wk_a',
    environmentId: 'env_staging',
    environment: 'staging',
    documentId: 'tour_a',
    correlationId: 'corr_a',
    iframeSrc: 'https://editor.lodariq.com/authoring.html',
    createdByUserId: 'user_a',
    createdAt: '2026-08-09T09:00:00.000Z',
    expiresAt: '2026-08-09T13:00:00.000Z',
    themeVersionId: 'themev_primary_v1',
  };
}

function documentFixture(): LodariqDocument {
  return {
    schemaVersion: '1',
    id: 'tour_a',
    workspaceId: 'wk_a',
    type: 'tour',
    title: 'Tour',
    status: 'draft',
    themeBinding: {
      policy: 'workspace-current',
      themeId: 'theme_primary',
      acknowledgedThemeVersionId: 'themev_primary_v1',
    },
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    targets: [],
    blocks: [],
  };
}

function themeSnapshot(themeVersionId: string, version: number): BrandThemeSnapshot {
  const snapshot = {
    ...structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
    themeId: 'theme_primary',
    themeVersionId,
    version,
    name: 'Primary',
  };
  const immutableContent = structuredClone(snapshot) as Partial<BrandThemeSnapshot>;
  delete immutableContent.contentHash;
  return {
    ...snapshot,
    contentHash: `sha256-${createHash('sha256').update(canonicalJson(immutableContent)).digest('hex')}`,
  };
}

function themeVersion(
  snapshot: BrandThemeSnapshot,
  approvedAt: string,
): WorkspaceThemeVersionRecord {
  return {
    id: snapshot.themeVersionId,
    workspaceId: 'wk_a',
    themeId: snapshot.themeId,
    version: snapshot.version,
    schemaVersion: snapshot.schemaVersion,
    contractVersion: snapshot.contractVersion,
    snapshot,
    contentHash: snapshot.contentHash,
    approvedByUserId: 'admin_a',
    approvedAt,
    createdAt: approvedAt,
  };
}

function source(fingerprintHash: string): ProductStyleSource {
  return {
    sourceId: 'customer-design-system',
    kind: 'registered_tokens',
    revision: 'build_42',
    confidence: 100,
    fingerprintHash,
    capturedAt: '2026-08-09T10:00:00.000Z',
  };
}

function productStyleProposal(styleSource: ProductStyleSource): ProductStyleProposal {
  return {
    schemaVersion: '1',
    proposalId: 'proposal.drift-check',
    sources: [styleSource],
    samples: [],
    tokens: { modes: { light: { colors: { accent: '#7c3aed' } } } },
    confidence: 100,
    requiresConfirmation: false,
    createdAt: CHECKED_AT,
  };
}

function styleRecord(
  proposalId: string,
  sourceOrdinal: number,
  sourceCount: number,
  environmentId: string,
  createdAt: string,
): StyleSourceRecord {
  const styleSource = source(hash(String.fromCharCode(100 + sourceOrdinal)));
  return {
    id: `style_${proposalId}_${sourceOrdinal}`,
    workspaceId: 'wk_a',
    themeId: 'theme_primary',
    environmentId,
    proposalId,
    proposalHash: hash('e'),
    sourceOrdinal,
    sourceCount,
    appliedThemeRevision: 2,
    draftChanged: true,
    source: styleSource,
    sourceHash: hash('f'),
    createdByUserId: 'user_a',
    createdAt,
  };
}

function hash(character: string): string {
  return `sha256-${character.repeat(64)}`;
}

function jsonKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(jsonKeys);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...jsonKeys(child)]);
}
