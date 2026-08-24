import { afterEach, describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  assertAccessibilityReleaseGate,
  createApiApp,
  createHeaderAuthProvider,
} from '@lodariq/api';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqDocument,
} from '@lodariq/schema';
import type { AccessibilitySweepResult } from '@lodariq/schema/accessibility-governance';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_accessibility';
const USER_ID = 'usr_accessibility_owner';
const DOCUMENT_ID = 'doc_accessibility';
const DOCUMENT_VERSION_ID = 'docv_accessibility';
const NOW = '2026-08-22T17:00:00.000Z';
const authHeaders = {
  'x-lodariq-workspace-id': WORKSPACE_ID,
  'x-lodariq-user-id': USER_ID,
  'x-lodariq-role': 'owner',
};

describe('workspace accessibility governance', () => {
  const apps: ReturnType<typeof createApiApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('sweeps every compiled locale, persists findings, gates the exact version, and resolves by CAS', async () => {
    const repository = await repositoryFixture();
    const app = createApiApp({ repository, authProvider: createHeaderAuthProvider() });
    apps.push(app);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/governance/accessibility-sweeps',
      headers: { ...authHeaders, 'idempotency-key': 'accessibility:sweep:one' },
    });
    expect(created.statusCode, created.body).toBe(201);
    const result = created.json<AccessibilitySweepResult>();
    expect(result.sweep).toMatchObject({
      status: 'completed',
      documentCount: 1,
      localeCount: 2,
    });
    expect(result.sweep.blockerCount).toBeGreaterThan(0);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: DOCUMENT_ID,
          documentVersionId: DOCUMENT_VERSION_ID,
          code: 'contrast_unusable',
          severity: 'blocker',
          status: 'open',
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('#000000');

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/governance/accessibility-sweeps',
      headers: { ...authHeaders, 'idempotency-key': 'accessibility:sweep:one' },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json<AccessibilitySweepResult>().sweep.id).toBe(result.sweep.id);
    await expect(
      assertAccessibilityReleaseGate(repository, WORKSPACE_ID, DOCUMENT_VERSION_ID),
    ).rejects.toMatchObject({ code: 'accessibility_sweep_blocked' });

    for (const finding of result.findings.filter((candidate) => candidate.severity === 'blocker')) {
      const resolved = await app.inject({
        method: 'POST',
        url: `/v1/governance/accessibility-findings/${finding.id}/resolve`,
        headers: authHeaders,
        payload: { expectedRevision: 1, resolutionNote: 'Verified after remediation review.' },
      });
      expect(resolved.statusCode, resolved.body).toBe(200);
      expect(resolved.json()).toMatchObject({ status: 'resolved', revision: 2 });
    }
    await expect(
      assertAccessibilityReleaseGate(repository, WORKSPACE_ID, DOCUMENT_VERSION_ID),
    ).resolves.toBeUndefined();
    const changeHistory = await repository.listGovernanceChangeHistory({
      workspaceId: WORKSPACE_ID,
      query: { category: 'governance', documentId: DOCUMENT_ID, limit: 100 },
    });
    expect(changeHistory.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'governance.accessibility_opened',
        'governance.accessibility_resolved',
      ]),
    );

    const open = await app.inject({
      method: 'GET',
      url: `/v1/governance/accessibility-findings?documentVersionId=${DOCUMENT_VERSION_ID}&status=open`,
      headers: authHeaders,
    });
    expect(open.statusCode, open.body).toBe(200);
    expect(
      open
        .json<{ findings: AccessibilitySweepResult['findings'] }>()
        .findings.every((finding) => finding.severity === 'warning'),
    ).toBe(true);

    const unversioned = await app.inject({
      method: 'POST',
      url: '/governance/accessibility-sweeps',
      headers: { ...authHeaders, 'idempotency-key': 'accessibility:sweep:unversioned' },
    });
    expect(unversioned.statusCode).toBe(404);
  });
});

async function repositoryFixture() {
  const document = structuredClone(tourFixture) as LodariqDocument;
  document.id = DOCUMENT_ID;
  document.workspaceId = WORKSPACE_ID;
  if (!document.localization) throw new Error('Accessibility fixture localization missing');
  document.localization = {
    ...document.localization,
    variants: document.localization.variants.slice(0, 1),
  };
  document.appearance = {
    preset: 'default',
    density: 'comfortable',
    width: 'standard',
    colorMode: 'light',
  };
  const tooltip = document.blocks[0]?.children.find((block) => block.type === 'tooltip');
  if (!tooltip) throw new Error('Accessibility fixture tooltip missing');
  tooltip.props.tooltipStyle = { surfaceColor: '#000000', textColor: '#000000' };
  const compiled = await compileDocument({
    document,
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  const artifact = {
    id: 'artifact_accessibility',
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    documentVersionId: DOCUMENT_VERSION_ID,
    contentHash: compiled.contentHash,
    compilerVersion: compiled.compilerVersion,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
    compiled,
    createdAt: NOW,
  };

  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: USER_ID,
        legacyIdentityId: null,
        email: 'accessibility-owner@example.com',
        name: 'Accessibility Owner',
        emailVerifiedAt: NOW,
        createdAt: NOW,
      },
    ],
    workspaces: [{ id: WORKSPACE_ID, name: 'Accessibility', createdAt: NOW, updatedAt: NOW }],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'owner', createdAt: NOW },
    ],
    documents: [document],
    documentVersions: [
      {
        id: DOCUMENT_VERSION_ID,
        workspaceId: WORKSPACE_ID,
        documentId: DOCUMENT_ID,
        version: 1,
        canonical: document,
        createdByUserId: USER_ID,
        createdAt: NOW,
      },
    ],
    compiledArtifacts: [artifact],
  });
}
