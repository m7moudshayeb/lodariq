import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  createInMemoryControlPlaneRepository,
  type AcknowledgeDocumentThemeInput,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqDocument,
} from '@lodariq/schema';

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

describe('atomic document Brand acknowledgement', () => {
  it('requires the locked session creator and lets only one stale-guarded acknowledgement win', async () => {
    const fixture = await acknowledgementFixture('workspace-current');
    const wrongActor = { ...fixture.input, actorUserId: 'user_other' };

    await expect(fixture.repository.acknowledgeDocumentTheme(wrongActor)).resolves.toBeNull();
    await expect(
      fixture.repository.getDocument('wk_a', fixture.document.id),
    ).resolves.toMatchObject({
      document: {
        themeBinding: {
          policy: 'workspace-current',
          acknowledgedThemeVersionId: fixture.previousThemeVersionId,
        },
      },
    });

    const [winner, stale] = await Promise.all([
      fixture.repository.acknowledgeDocumentTheme(fixture.input),
      fixture.repository.acknowledgeDocumentTheme(fixture.input),
    ]);
    expect([winner, stale].filter(Boolean)).toHaveLength(1);
    expect([winner, stale].filter((result) => result === null)).toHaveLength(1);
    await expect(
      fixture.repository.listDocumentVersions('wk_a', fixture.document.id),
    ).resolves.toHaveLength(2);
    await expect(
      fixture.repository.resolveAuthoringSession('wk_a', 'a'.repeat(64)),
    ).resolves.toMatchObject({ themeVersionId: fixture.reviewedThemeVersionId });
  });

  it('rejects pinned documents without changing their immutable binding', async () => {
    const fixture = await acknowledgementFixture('pinned');

    await expect(fixture.repository.acknowledgeDocumentTheme(fixture.input)).resolves.toBeNull();
    await expect(
      fixture.repository.getDocument('wk_a', fixture.document.id),
    ).resolves.toMatchObject({
      document: {
        themeBinding: {
          policy: 'pinned',
          themeVersionId: fixture.previousThemeVersionId,
        },
      },
    });
    await expect(
      fixture.repository.listDocumentVersions('wk_a', fixture.document.id),
    ).resolves.toHaveLength(1);
  });
});

async function acknowledgementFixture(bindingPolicy: 'pinned' | 'workspace-current') {
  const repository = createInMemoryControlPlaneRepository({
    environments: [ENVIRONMENT],
    workspaceMemberships: [
      { workspaceId: 'wk_a', userId: 'user_a', role: 'admin', createdAt: CREATED_AT },
      { workspaceId: 'wk_a', userId: 'user_other', role: 'member', createdAt: CREATED_AT },
    ],
  });
  const theme = await repository.createWorkspaceTheme({
    workspaceId: 'wk_a',
    name: 'Primary',
    draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
    actorUserId: 'user_a',
  });
  const firstApproval = await repository.approveWorkspaceTheme({
    workspaceId: 'wk_a',
    themeId: theme.id,
    actorUserId: 'user_a',
    expectedRevision: theme.revision,
    expectedUpdatedAt: theme.updatedAt,
  });
  if (!firstApproval) throw new Error('first theme approval failed');
  const document = documentFixture(theme.id, firstApproval.approvedVersion.id, bindingPolicy);
  const initialArtifact = await compileDocument({
    document,
    theme: firstApproval.approvedVersion.snapshot,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  const saved = await repository.saveDocument({
    workspaceId: 'wk_a',
    document,
    artifact: initialArtifact,
    actorUserId: 'user_a',
  });
  const session = await repository.createAuthoringSession({
    workspaceId: 'wk_a',
    environmentId: ENVIRONMENT.id,
    documentId: document.id,
    correlationId: 'corr_ack',
    tokenHash: 'a'.repeat(64),
    iframeSrc: 'https://editor.lodariq.io/authoring.html',
    expiresAt: '2099-01-01T00:00:00.000Z',
    actorUserId: 'user_a',
  });
  const secondApproval = await repository.approveWorkspaceTheme({
    workspaceId: 'wk_a',
    themeId: theme.id,
    actorUserId: 'user_a',
    expectedRevision: firstApproval.theme.revision,
    expectedUpdatedAt: firstApproval.theme.updatedAt,
  });
  if (!secondApproval) throw new Error('second theme approval failed');

  const reviewedDocument = structuredClone(document);
  reviewedDocument.themeBinding = {
    policy: 'workspace-current',
    themeId: theme.id,
    acknowledgedThemeVersionId: secondApproval.approvedVersion.id,
  };
  const reviewedArtifact = await compileDocument({
    document: reviewedDocument,
    theme: secondApproval.approvedVersion.snapshot,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  const input: AcknowledgeDocumentThemeInput = {
    workspaceId: 'wk_a',
    sessionId: session.id,
    documentId: document.id,
    actorUserId: 'user_a',
    expectedDocumentUpdatedAt: saved.updatedAt,
    expectedThemeVersionId: firstApproval.approvedVersion.id,
    reviewedThemeVersionId: secondApproval.approvedVersion.id,
    document: reviewedDocument,
    artifact: reviewedArtifact,
  };
  return {
    repository,
    document,
    input,
    previousThemeVersionId: firstApproval.approvedVersion.id,
    reviewedThemeVersionId: secondApproval.approvedVersion.id,
  };
}

function documentFixture(
  themeId: string,
  themeVersionId: string,
  bindingPolicy: 'pinned' | 'workspace-current',
): LodariqDocument {
  return {
    schemaVersion: '1',
    id: `tour_ack_${bindingPolicy}`,
    workspaceId: 'wk_a',
    type: 'tour',
    title: 'Acknowledgement',
    status: 'draft',
    themeBinding:
      bindingPolicy === 'pinned'
        ? { policy: 'pinned', themeId, themeVersionId }
        : { policy: 'workspace-current', themeId, acknowledgedThemeVersionId: themeVersionId },
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    targets: [],
    blocks: [],
  };
}
