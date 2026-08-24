import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import { AuthoringDemoLinkError, AuthoringDemoLinks, renderPublicDemoShell } from '@lodariq/api';
import { createInMemoryControlPlaneRepository, type WorkspaceEnvironment } from '@lodariq/database';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_demo_links';
const USER_ID = 'user_demo_owner';
const DOCUMENT_ID = 'doc_demo_links';
const ENVIRONMENT_ID = 'env_staging';
const CREATED_AT = '2026-08-22T00:00:00.000Z';

const environment: WorkspaceEnvironment = {
  id: ENVIRONMENT_ID,
  workspaceId: WORKSPACE_ID,
  kind: 'staging',
  name: 'Staging',
  originAllowlist: ['https://staging.demo.test'],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

async function fixture() {
  const document = {
    ...(structuredClone(tourFixture) as LodariqDocument),
    id: DOCUMENT_ID,
    workspaceId: WORKSPACE_ID,
  };
  const repository = createInMemoryControlPlaneRepository({
    workspaces: [
      { id: WORKSPACE_ID, name: 'Demo links', createdAt: CREATED_AT, updatedAt: CREATED_AT },
    ],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'owner', createdAt: CREATED_AT },
    ],
    environments: [environment],
    documents: [document],
  });
  const compiled = await compileDocument({
    document,
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  const saved = await repository.saveDocument({
    workspaceId: WORKSPACE_ID,
    document,
    artifact: compiled,
    actorUserId: USER_ID,
  });
  if (!saved.latestArtifact) throw new Error('demo fixture artifact was not persisted');
  const published = await repository.activateCompiledArtifact({
    workspaceId: WORKSPACE_ID,
    environmentId: ENVIRONMENT_ID,
    correlationId: 'corr_demo_links',
    artifact: saved.latestArtifact,
    actorUserId: USER_ID,
    idempotencyKey: 'publish:demo-links',
    requestHash: saved.latestArtifact.contentHash,
    expectedGeneration: 0,
    expectedEnvironmentPolicyUpdatedAt: CREATED_AT,
  });
  return { repository, document, publication: published.publication };
}

describe('shareable demo links', () => {
  it('pins one immutable publication, binds public access to the exact demo origin, and records bounded anonymous events', async () => {
    const { repository, document, publication } = await fixture();
    const demos = new AuthoringDemoLinks(repository, 'demo-link-test-secret-0123456789012345');
    const review = await demos.review({
      workspaceId: WORKSPACE_ID,
      environmentId: ENVIRONMENT_ID,
      documentId: document.id,
      request: { publicationId: publication.id, contentHash: publication.contentHash },
    });
    expect(review).toMatchObject({
      schemaVersion: '1',
      policyVersion: '1',
      approved: true,
      publicationId: publication.id,
      sourceContentHash: publication.contentHash,
    });
    expect(review.summary.targetBindingsRemoved).toBeGreaterThan(0);
    const link = await demos.create({
      workspaceId: WORKSPACE_ID,
      environmentId: ENVIRONMENT_ID,
      documentId: document.id,
      actorUserId: USER_ID,
      request: {
        schemaVersion: '1',
        operationId: 'demoop_12345678901234567890',
        publicationId: publication.id,
        contentHash: publication.contentHash,
        expiresInSeconds: 3_600,
        reviewHash: review.reviewHash,
      },
    });

    expect(link.url).toMatch(/^https:\/\/demo\.lodariq\.io\/d\/demo_/u);
    expect(link.scope).toMatchObject({
      workspaceId: WORKSPACE_ID,
      documentId: document.id,
      publicationId: publication.id,
      redaction: 'structured-artifact',
      analytics: 'scoped-anonymous',
    });
    expect(link.url).not.toMatch(/token|secret|bearer|sha256-/iu);

    const first = await demos.publicArtifact({
      demoId: link.id,
      requestOrigin: 'https://demo.lodariq.io',
    });
    expect(first.setCookie).toContain('HttpOnly');
    expect(first.setCookie).toContain('Secure');
    expect(first.artifact.contentHash).toBe(publication.contentHash);
    expect(first.artifact.schemaVersion).toBe('1');
    expect(first.artifact.presentationContentHash).toBe(review.presentationContentHash);
    expect(first.artifact.artifact.contentHash).toBe(review.presentationContentHash);
    expect(first.artifact.artifact.targets).toEqual([]);
    expect(first.artifact.artifact.steps.every((step) => !step.targetId && !step.lifecycle)).toBe(
      true,
    );
    const cookie = first.setCookie!.split(';', 1)[0];

    await expect(
      demos.publicShell({
        demoId: link.id,
        requestOrigin: 'https://demo.lodariq.io',
        cookieHeader: cookie,
      }),
    ).resolves.toEqual({});

    await expect(
      demos.publicArtifact({
        demoId: link.id,
        requestOrigin: 'https://evil.example',
        cookieHeader: cookie,
      }),
    ).rejects.toMatchObject({ code: 'demo_origin_invalid' });
    await expect(
      demos.publicArtifact({
        demoId: link.id,
        requestOrigin: 'https://demo.lodariq.io',
        cookieHeader: `${cookie}x`,
      }),
    ).rejects.toMatchObject({ code: 'demo_session_invalid' });

    await demos.recordPublicEvent({
      demoId: link.id,
      event: { schemaVersion: '1', event: 'viewed' },
      requestOrigin: 'https://demo.lodariq.io',
      cookieHeader: cookie,
    });
    await demos.recordPublicEvent({
      demoId: link.id,
      event: {
        schemaVersion: '1',
        event: 'step_started',
        stepId: first.artifact.artifact.steps[0]!.id,
      },
      requestOrigin: 'https://demo.lodariq.io',
      cookieHeader: cookie,
    });
    const analytics = await demos.analytics({
      workspaceId: WORKSPACE_ID,
      environmentId: ENVIRONMENT_ID,
      documentId: document.id,
    });
    expect(analytics).toEqual({
      schemaVersion: '1',
      views: 1,
      completions: 0,
      dismissals: 0,
      lastStepIds: [first.artifact.artifact.steps[0]!.id],
    });

    await demos.revoke({
      workspaceId: WORKSPACE_ID,
      environmentId: ENVIRONMENT_ID,
      documentId: document.id,
      id: link.id,
    });
    expect(
      (
        await demos.list({
          workspaceId: WORKSPACE_ID,
          environmentId: ENVIRONMENT_ID,
          documentId: document.id,
        })
      )[0]?.status,
    ).toBe('revoked');
    await expect(
      demos.publicArtifact({ demoId: link.id, requestOrigin: 'https://demo.lodariq.io' }),
    ).rejects.toBeInstanceOf(AuthoringDemoLinkError);
  });

  it('does not recreate an operation with a changed publication pin', async () => {
    const { repository, document, publication } = await fixture();
    const demos = new AuthoringDemoLinks(repository, 'demo-link-test-secret-0123456789012345');
    await expect(
      demos.create({
        workspaceId: WORKSPACE_ID,
        environmentId: ENVIRONMENT_ID,
        documentId: document.id,
        actorUserId: USER_ID,
        request: {
          schemaVersion: '1',
          operationId: 'demoop_12345678901234567890',
          publicationId: publication.id,
          contentHash: 'sha256-0000000000000000000000000000000000000000000000000000000000000000',
          expiresInSeconds: 3_600,
          reviewHash: 'sha256-0000000000000000000000000000000000000000000000000000000000000000',
        },
      }),
    ).rejects.toMatchObject({ code: 'publication_content_changed' });
  });

  it('serves a credential-free CSP shell that loads only the runtime demo entry', () => {
    const shell = renderPublicDemoShell('nonce_12345678901234567890');
    expect(shell.contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(shell.contentSecurityPolicy).toContain('script-src https://cdn.lodariq.io');
    expect(shell.html).toContain('https://cdn.lodariq.io/sdk/lodariq-demo-player.js');
    expect(shell.html).not.toMatch(/authoring|bearer|token=/iu);
  });
});
