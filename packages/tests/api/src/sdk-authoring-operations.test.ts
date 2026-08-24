import { describe, expect, it, vi } from 'vitest';
import {
  authoringAuditCsv,
  createApiApp,
  createAnalyticsExportWorker,
  type AuthoringAssistProvider,
  type NarrationProvider,
} from '@lodariq/api';
import { compileDocument } from '@lodariq/compiler';
import {
  createInMemoryControlPlaneRepository,
  getEnvironmentTokenPrefix,
  hashAuthoringSessionToken,
  hashEnvironmentToken,
  type ControlPlaneRepository,
} from '@lodariq/database';
import {
  AUTHORING_SESSION_CAPABILITIES,
  BROWSER_VERIFICATION_CHECK_CODES,
  COMMERCIAL_PLAN_VERSION,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type CommercialPlanId,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_ops';
const TOKEN = 'lod_staging_ops_token_12345678901234';
const SESSION_TOKEN = 'lqs_ops_session_token_1234567890';
const SECOND_SESSION_TOKEN = 'lqs_ops_second_tab_token_123456789';
const ORIGIN = 'https://staging.customer.example';
const AT = '2026-08-09T00:00:00.000Z';
const SOON = '2099-01-01T00:00:00.000Z';
const MULTI_APP_TEST_TIMEOUT_MS = 15_000;

const document = {
  ...(structuredClone(tourFixture) as LodariqDocument),
  workspaceId: WORKSPACE_ID,
};

const auth = { authorization: `Bearer ${TOKEN}`, origin: ORIGIN };
const withSession = { ...auth, 'x-lodariq-authoring-session': SESSION_TOKEN };
const withSecondSession = {
  ...auth,
  'x-lodariq-authoring-session': SECOND_SESSION_TOKEN,
};

const ALL_CAPABILITIES = Object.values(AUTHORING_SESSION_CAPABILITIES);

function seed(capabilities: readonly string[] = ALL_CAPABILITIES) {
  return {
    users: [
      {
        id: 'user_ada',
        legacyIdentityId: null,
        email: 'a@lodariq.test',
        name: 'Ada Lovelace',
        createdAt: AT,
      },
      {
        id: 'user_mina',
        legacyIdentityId: null,
        email: 'mina@lodariq.test',
        name: 'Mina Chen',
        createdAt: AT,
      },
    ],
    workspaces: [{ id: WORKSPACE_ID, name: 'Operations', createdAt: AT, updatedAt: AT }],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: 'user_ada', role: 'owner' as const, createdAt: AT },
    ],
    environments: [
      {
        id: 'env_development',
        workspaceId: WORKSPACE_ID,
        kind: 'development' as const,
        name: 'Development',
        originAllowlist: [],
        createdAt: AT,
        updatedAt: AT,
      },
      {
        id: 'env_staging',
        workspaceId: WORKSPACE_ID,
        kind: 'staging' as const,
        name: 'Staging',
        originAllowlist: [ORIGIN],
        createdAt: AT,
        updatedAt: AT,
      },
      {
        id: 'env_production',
        workspaceId: WORKSPACE_ID,
        kind: 'production' as const,
        name: 'Production',
        originAllowlist: [],
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    environmentTokens: [
      {
        id: 'tok_ops',
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_staging',
        environment: 'staging' as const,
        name: 'Ops',
        tokenHash: hashEnvironmentToken(TOKEN),
        tokenPrefix: getEnvironmentTokenPrefix(TOKEN),
        createdAt: AT,
        revokedAt: null,
      },
    ],
    documents: [document],
    authoringSessions: [
      {
        id: 'sess_ops',
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_staging',
        environment: 'staging' as const,
        documentId: document.id,
        correlationId: 'corr_ops',
        tokenHash: hashEnvironmentToken(SESSION_TOKEN),
        iframeSrc: ORIGIN,
        createdByUserId: 'user_ada',
        createdAt: AT,
        expiresAt: SOON,
        revokedAt: null,
        capabilities: [...capabilities],
      },
    ],
    tenantAuditEvents: [
      {
        id: `tenevt_${'a'.repeat(20)}`,
        workspaceId: WORKSPACE_ID,
        actorUserId: 'user_ada',
        eventType: 'invitation_created' as const,
        targetUserId: null,
        invitationId: `invite_${'a'.repeat(20)}`,
        previousRole: null,
        nextRole: 'member' as const,
        occurredAt: '2026-08-09T00:01:00.000Z',
      },
      {
        id: `tenevt_${'b'.repeat(20)}`,
        workspaceId: WORKSPACE_ID,
        actorUserId: 'user_ada',
        eventType: 'membership_role_changed' as const,
        targetUserId: 'user_mina',
        invitationId: null,
        previousRole: 'viewer' as const,
        nextRole: 'member' as const,
        occurredAt: '2026-08-09T00:02:00.000Z',
      },
    ],
  };
}

function app(
  capabilities?: readonly string[],
  authoringAssistProvider?: AuthoringAssistProvider | null,
) {
  const repository: ControlPlaneRepository = createInMemoryControlPlaneRepository(
    seed(capabilities) as never,
  );
  return createApiApp({
    repository,
    publicApiBaseUrl: 'https://api.lodariq.io',
    authoringAssistProvider,
  });
}

function collaborationApp() {
  const base = seed();
  const repository = createInMemoryControlPlaneRepository({
    ...base,
    authoringSessions: [
      ...base.authoringSessions,
      {
        ...base.authoringSessions[0]!,
        id: 'sess_ops_second_tab',
        correlationId: 'corr_ops_second_tab',
        tokenHash: hashAuthoringSessionToken(SECOND_SESSION_TOKEN),
      },
    ],
    workspaceSubscriptions: [
      {
        workspaceId: WORKSPACE_ID,
        planId: 'business',
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        revision: 1,
        createdAt: AT,
        updatedAt: AT,
      },
    ],
  } as never);
  return {
    repository,
    api: createApiApp({ repository, publicApiBaseUrl: 'https://api.lodariq.io' }),
  };
}

const OPS = '/v1/sdk/authoring/operations';

describe('Operations for the panel on the page', () => {
  it('reviews an immutable staging artifact and serves it through the runtime-only public demo player', async () => {
    const repository = createInMemoryControlPlaneRepository(seed() as never);
    const artifact = await compileDocument({
      document,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    const saved = await repository.saveDocument({
      workspaceId: WORKSPACE_ID,
      actorUserId: 'user_ada',
      document,
      artifact,
    });
    if (!saved.latestArtifact) throw new Error('demo fixture artifact missing');
    const staging = await repository.activateCompiledArtifact({
      workspaceId: WORKSPACE_ID,
      environmentId: 'env_staging',
      correlationId: 'corr_ops_demo',
      artifact: saved.latestArtifact,
      actorUserId: 'user_ada',
      idempotencyKey: 'publish:ops:demo',
      requestHash: saved.latestArtifact.contentHash,
      expectedGeneration: 0,
      expectedEnvironmentPolicyUpdatedAt: AT,
    });
    const api = createApiApp({
      repository,
      publicApiBaseUrl: 'https://api.lodariq.io',
      demoLinkSecret: 'demo-route-test-secret-0123456789012345',
    });

    const reviewed = await api.inject({
      method: 'POST',
      url: `${OPS}/demo-links/review`,
      headers: withSession,
      payload: {
        publicationId: staging.publication.id,
        contentHash: staging.publication.contentHash,
      },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(reviewed.json()).toMatchObject({
      schemaVersion: '1',
      policyVersion: '1',
      approved: true,
    });

    const created = await api.inject({
      method: 'POST',
      url: `${OPS}/demo-links`,
      headers: withSession,
      payload: {
        schemaVersion: '1',
        operationId: `demoop_${'r'.repeat(20)}`,
        publicationId: staging.publication.id,
        contentHash: staging.publication.contentHash,
        expiresInSeconds: 3_600,
        reviewHash: reviewed.json().reviewHash,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const demoPath = new URL(created.json().url).pathname;

    const shell = await api.inject({
      method: 'GET',
      url: demoPath,
      headers: { host: 'demo.lodariq.io' },
    });
    expect(shell.statusCode, shell.body).toBe(200);
    expect(shell.headers['content-type']).toContain('text/html');
    expect(shell.headers['content-security-policy']).toContain('script-src https://cdn.lodariq.io');
    expect(shell.body).toContain('/sdk/lodariq-demo-player.js');
    const cookie = String(shell.headers['set-cookie']).split(';', 1)[0];

    const publicArtifact = await api.inject({
      method: 'GET',
      url: `/v1/demos/${created.json().id}/artifact`,
      headers: { host: 'demo.lodariq.io', cookie },
    });
    expect(publicArtifact.statusCode, publicArtifact.body).toBe(200);
    expect(publicArtifact.json()).toMatchObject({
      schemaVersion: '1',
      contentHash: staging.publication.contentHash,
      artifact: { targets: [] },
    });
    expect(
      publicArtifact
        .json()
        .artifact.steps.every(
          (step: Record<string, unknown>) => !step['targetId'] && !step['lifecycle'],
        ),
    ).toBe(true);

    const event = await api.inject({
      method: 'POST',
      url: `/v1/demos/${created.json().id}/events`,
      headers: { host: 'demo.lodariq.io', cookie },
      payload: { schemaVersion: '1', event: 'viewed' },
    });
    expect(event.statusCode, event.body).toBe(204);
    await api.close();
  });

  it('creates an idempotent standalone template draft without mutating the open document', async () => {
    const repository = createInMemoryControlPlaneRepository(seed() as never);
    const api = createApiApp({ repository, publicApiBaseUrl: 'https://api.lodariq.io' });
    const before = structuredClone(
      (await repository.getDocument(WORKSPACE_ID, document.id))!.document,
    );
    const payload = {
      operationId: `tplop_${'t'.repeat(20)}`,
      templateId: 'guided-tour',
    };
    const created = await api.inject({
      method: 'POST',
      url: `${OPS}/templates/instantiate`,
      headers: withSession,
      payload,
    });
    expect(created.statusCode, created.body).toBe(201);
    const result = created.json<{
      documentId: string;
      created: boolean;
      templateVersion: number;
    }>();
    expect(result).toMatchObject({ created: true, templateVersion: 1 });
    expect(result.documentId).not.toBe(document.id);

    const persisted = await repository.getDocument(WORKSPACE_ID, result.documentId);
    expect(persisted?.document).toMatchObject({
      id: result.documentId,
      workspaceId: WORKSPACE_ID,
      type: 'tour',
      status: 'draft',
      title: 'Guided tour',
    });
    expect(persisted?.latestArtifact?.documentId).toBe(result.documentId);
    expect(await repository.getDocument(WORKSPACE_ID, document.id)).toMatchObject({
      document: before,
    });

    const retried = await api.inject({
      method: 'POST',
      url: `${OPS}/templates/instantiate`,
      headers: withSession,
      payload,
    });
    expect(retried.statusCode, retried.body).toBe(201);
    expect(retried.json()).toMatchObject({ documentId: result.documentId, created: false });
    expect(await repository.listDocuments(WORKSPACE_ID)).toHaveLength(2);
    await api.close();
  });

  it('compares two persisted canonical versions and their immutable compiled artifacts', async () => {
    const repository = createInMemoryControlPlaneRepository(seed() as never);
    for (const title of ['First saved title', 'Second saved title']) {
      const next = { ...structuredClone(document), title };
      const artifact = await compileDocument({
        document: next,
        theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      });
      await repository.saveDocument({
        workspaceId: WORKSPACE_ID,
        document: next,
        artifact,
        actorUserId: 'user_ada',
      });
    }
    const api = createApiApp({ repository, publicApiBaseUrl: 'https://api.lodariq.io' });
    const history = await api.inject({
      method: 'GET',
      url: `${OPS}/document-versions`,
      headers: withSession,
    });
    expect(history.statusCode, history.body).toBe(200);
    const versions = history.json<{
      versions: Array<{ id: string; version: number; hasCompiledArtifact: boolean }>;
    }>().versions;
    expect(versions.slice(0, 2)).toMatchObject([
      { version: 3, hasCompiledArtifact: true },
      { version: 2, hasCompiledArtifact: true },
    ]);

    const compared = await api.inject({
      method: 'POST',
      url: `${OPS}/document-version-diff`,
      headers: withSession,
      payload: {
        beforeVersionId: versions[1]!.id,
        afterVersionId: versions[0]!.id,
      },
    });
    expect(compared.statusCode, compared.body).toBe(200);
    expect(compared.json()).toMatchObject({
      beforeId: versions[1]!.id,
      afterId: versions[0]!.id,
      requiresReview: true,
      entries: expect.arrayContaining([
        expect.objectContaining({ category: 'content', path: 'document.title' }),
      ]),
    });
    await api.close();
  });

  it('persists bounded copy suggestions and records review decisions as append-only events', async () => {
    const repository = createInMemoryControlPlaneRepository(seed() as never);
    for (const copy of ['Reference project copy', 'Current project copy']) {
      const next = structuredClone(document);
      replaceBlockContent(next.blocks, 'block_paragraph_1', copy);
      const artifact = await compileDocument({
        document: next,
        theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      });
      await repository.saveDocument({
        workspaceId: WORKSPACE_ID,
        document: next,
        artifact,
        actorUserId: 'user_ada',
      });
    }
    const versions = await repository.listDocumentVersions(WORKSPACE_ID, document.id);
    const api = createApiApp({ repository, publicApiBaseUrl: 'https://api.lodariq.io' });
    const generated = await api.inject({
      method: 'POST',
      url: `${OPS}/copy-suggestions`,
      headers: withSession,
      payload: {
        operationId: `copyop_${'g'.repeat(20)}`,
        beforeVersionId: versions[0]!.id,
        afterVersionId: versions[1]!.id,
      },
    });
    expect(generated.statusCode, generated.body).toBe(201);
    const suggestion = generated
      .json<{
        suggestions: Array<{ id: string; before: string; after: string; status: string }>;
      }>()
      .suggestions.find((candidate) => candidate.before === 'Current project copy');
    expect(suggestion).toMatchObject({
      before: 'Current project copy',
      after: 'Reference project copy',
      status: 'pending',
    });

    const decided = await api.inject({
      method: 'POST',
      url: `${OPS}/copy-suggestions/decisions`,
      headers: withSession,
      payload: {
        operationId: `copyop_${'d'.repeat(20)}`,
        suggestionId: suggestion!.id,
        decision: 'applied',
      },
    });
    expect(decided.statusCode, decided.body).toBe(201);
    expect(decided.json()).toMatchObject({ id: suggestion!.id, status: 'applied' });

    const [suggestionRecords, eventRecords] = await Promise.all([
      repository.listAuthoringCopyRecords(WORKSPACE_ID, document.id, 'suggestion'),
      repository.listAuthoringCopyRecords(WORKSPACE_ID, document.id, 'decision'),
    ]);
    expect(suggestionRecords).toHaveLength(1);
    expect(suggestionRecords[0]?.payload).toMatchObject({ status: 'pending' });
    expect(eventRecords).toHaveLength(1);
    expect(eventRecords[0]?.payload).toMatchObject({
      suggestionId: suggestion!.id,
      decision: 'applied',
    });
    await api.close();
  });

  it('answers with the session’s own experience, without being told which one', async () => {
    const api = app();
    const response = await api.inject({
      method: 'GET',
      url: `${OPS}/measurement`,
      headers: withSession,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ documentId: document.id });
    await api.close();
  });

  it('declares a success event and reads it straight back', async () => {
    const api = app();
    const declared = await api.inject({
      method: 'PATCH',
      url: `${OPS}/measurement`,
      headers: withSession,
      payload: { successEvent: { eventName: 'invited_teammate', windowDays: 30 } },
    });
    expect(declared.statusCode).toBe(200);
    expect(declared.json()).toMatchObject({
      successEvent: { eventName: 'invited_teammate', windowDays: 30 },
    });

    const reread = await api.inject({
      method: 'GET',
      url: `${OPS}/measurement`,
      headers: withSession,
    });
    expect(reread.json()).toMatchObject({ successEvent: { eventName: 'invited_teammate' } });
    await api.close();
  });

  it('returns the funnel in document order for the session’s environment', async () => {
    const api = app();
    const response = await api.inject({
      method: 'GET',
      url: `${OPS}/analytics`,
      headers: withSession,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ environmentId: string; funnel: unknown[] }>();
    expect(body.environmentId).toBe('env_staging');
    expect(body.funnel.length).toBeGreaterThan(0);
    await api.close();
  });

  it('queues, polls, downloads, and audits an asynchronous analytics export', async () => {
    const repository = createInMemoryControlPlaneRepository(seed() as never);
    const api = createApiApp({
      repository,
      publicApiBaseUrl: 'https://api.lodariq.io',
      analyticsExportWorker: null,
    });
    const queued = await api.inject({
      method: 'POST',
      url: `${OPS}/analytics-exports`,
      headers: withSession,
      payload: {
        operationId: `anxop_${'a'.repeat(20)}`,
        kind: 'summary-csv',
      },
    });
    expect(queued.statusCode, queued.body).toBe(202);
    const jobId = queued.json<{ id: string; status: string }>().id;
    expect(queued.json()).toMatchObject({ id: jobId, status: 'queued' });

    const earlyDownload = await api.inject({
      method: 'GET',
      url: `${OPS}/analytics-exports/${jobId}/download`,
      headers: withSession,
    });
    expect(earlyDownload.statusCode).toBe(409);

    const worker = createAnalyticsExportWorker({
      repository,
      workerId: 'analytics_export_test_worker',
      clock: () => new Date(),
    });
    await expect(worker.runOnce()).resolves.toBe(1);
    const completed = await api.inject({
      method: 'GET',
      url: `${OPS}/analytics-exports/${jobId}`,
      headers: withSession,
    });
    expect(completed.statusCode, completed.body).toBe(200);
    const completedJob = completed.json<{
      status: string;
      filename: string;
      resultExpiresAt: string;
    }>();
    expect(completedJob).toMatchObject({ status: 'completed', filename: expect.any(String) });
    expect(completed.json()).not.toHaveProperty('contentBase64');

    const downloaded = await api.inject({
      method: 'GET',
      url: `${OPS}/analytics-exports/${jobId}/download`,
      headers: withSession,
    });
    expect(downloaded.statusCode, downloaded.body).toBe(200);
    expect(downloaded.headers['cache-control']).toBe('private, no-store');
    expect(downloaded.headers['content-type']).toContain('text/csv');
    expect(downloaded.body).toContain('record_type');
    await expect(repository.expireAnalyticsExportJobs(completedJob.resultExpiresAt)).resolves.toBe(
      1,
    );
    const expired = await api.inject({
      method: 'GET',
      url: `${OPS}/analytics-exports/${jobId}/download`,
      headers: withSession,
    });
    expect(expired.statusCode).toBe(410);
    await expect(
      repository.listAnalyticsExportAuditEvents({
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_staging',
        documentId: document.id,
      }),
    ).resolves.toMatchObject([
      { eventType: 'requested' },
      { eventType: 'completed' },
      { eventType: 'downloaded', actorUserId: 'user_ada' },
      { eventType: 'expired' },
    ]);
    await worker.stop();
    await api.close();
  });

  it('serves the replay of recent runs', async () => {
    const api = app();
    const response = await api.inject({
      method: 'GET',
      url: `${OPS}/sessions`,
      headers: withSession,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ sessions: [] });
    await api.close();
  });

  it('carries a review from one creator to the list the next one reads', async () => {
    const api = app();
    const created = await api.inject({
      method: 'POST',
      url: `${OPS}/comments`,
      headers: withSession,
      payload: {
        anchor: { type: 'step', stepId: 'block_step_1' },
        body: 'This step needs a shorter title.',
      },
    });
    expect(created.statusCode).toBe(201);
    const comment = created.json<{ comment: { id: string; author: string } }>().comment;
    expect(comment.author).toBe('Ada Lovelace');

    const replied = await api.inject({
      method: 'POST',
      url: `${OPS}/comments/${comment.id}/replies`,
      headers: withSession,
      payload: { body: 'Agreed — this is clearer.' },
    });
    expect(replied.statusCode).toBe(201);
    expect(replied.json()).toMatchObject({
      comment: { replies: [{ body: 'Agreed — this is clearer.' }] },
    });

    const listed = await api.inject({
      method: 'GET',
      url: `${OPS}/comments`,
      headers: withSession,
    });
    expect(listed.json()).toMatchObject({
      comments: [
        {
          anchor: { type: 'step', stepId: 'block_step_1' },
          replies: [{ body: 'Agreed — this is clearer.' }],
        },
      ],
    });
    await api.close();
  });

  it('hands back the winning lease when a step is claimed', async () => {
    const api = app();
    const response = await api.inject({
      method: 'POST',
      url: `${OPS}/step-locks`,
      headers: withSession,
      payload: { stepId: 'step_1', sessionId: 'untrusted_tab_id' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ acquired: boolean }>().acquired).toBe(true);
    expect(response.json<{ lock: { holderName: string } }>().lock.holderName).toBe('Ada Lovelace');
    const renewed = await api.inject({
      method: 'POST',
      url: `${OPS}/step-locks`,
      headers: withSession,
      payload: { stepId: 'step_1', sessionId: 'another_untrusted_id' },
    });
    expect(renewed.statusCode).toBe(201);
    expect(renewed.json<{ acquired: boolean }>().acquired).toBe(true);

    const released = await api.inject({
      method: 'DELETE',
      url: `${OPS}/step-locks`,
      headers: withSession,
      payload: { stepId: 'step_1', sessionId: 'cannot_spoof_release' },
    });
    expect(released.statusCode).toBe(204);
    await api.close();
  });

  it('coordinates duplicate tabs, locks, comments, conflicts, and departure', async () => {
    const { api, repository } = collaborationApp();
    const initial = await repository.getDocument(WORKSPACE_ID, document.id);
    expect(initial).not.toBeNull();
    const first = await api.inject({
      method: 'PUT',
      url: `${OPS}/collaboration/presence`,
      headers: withSession,
      payload: {
        stepId: 'block_step_1',
        selection: { type: 'block', blockId: 'block_heading_1' },
        documentUpdatedAt: initial!.updatedAt,
      },
    });
    expect(first.statusCode, first.body).toBe(200);

    await api.inject({
      method: 'POST',
      url: `${OPS}/comments`,
      headers: withSession,
      payload: { anchor: { type: 'step', stepId: 'block_step_1' }, body: 'Review this.' },
    });
    await api.inject({
      method: 'POST',
      url: `${OPS}/step-locks`,
      headers: withSession,
      payload: { stepId: 'block_step_1' },
    });

    const second = await api.inject({
      method: 'PUT',
      url: `${OPS}/collaboration/presence`,
      headers: withSecondSession,
      payload: {
        stepId: 'block_step_2',
        selection: { type: 'block', blockId: 'block_heading_2' },
        documentUpdatedAt: initial!.updatedAt,
      },
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json()).toMatchObject({
      draftChanged: false,
      peers: [
        {
          creatorId: 'user_ada',
          sameCreator: true,
          stepId: 'block_step_1',
          selection: { type: 'block', blockId: 'block_heading_1' },
        },
      ],
      locks: [{ stepId: 'block_step_1', holderName: 'Ada Lovelace' }],
      comments: [{ body: 'Review this.' }],
    });

    await repository.saveDocument({
      workspaceId: WORKSPACE_ID,
      document: structuredClone(document),
      actorUserId: 'user_ada',
      expectedUpdatedAt: initial!.updatedAt,
    });
    const conflicted = await api.inject({
      method: 'PUT',
      url: `${OPS}/collaboration/presence`,
      headers: withSession,
      payload: {
        stepId: 'block_step_1',
        selection: { type: 'block', blockId: 'block_heading_1' },
        documentUpdatedAt: initial!.updatedAt,
      },
    });
    expect(conflicted.json()).toMatchObject({ draftChanged: true });

    const invalid = await api.inject({
      method: 'PUT',
      url: `${OPS}/collaboration/presence`,
      headers: withSession,
      payload: { stepId: 'another_tenant_step', selection: null },
    });
    expect(invalid.statusCode).toBe(422);

    expect(
      (
        await api.inject({
          method: 'DELETE',
          url: `${OPS}/collaboration/presence`,
          headers: withSession,
        })
      ).statusCode,
    ).toBe(204);
    const afterLeave = await api.inject({
      method: 'PUT',
      url: `${OPS}/collaboration/presence`,
      headers: withSecondSession,
      payload: { stepId: null, selection: null },
    });
    expect(afterLeave.json<{ peers: unknown[] }>().peers).toEqual([]);
    await api.close();
  });

  it('preflights heartbeat and event-stream methods for the exact SDK origin', async () => {
    const api = app();
    const heartbeat = await api.inject({
      method: 'OPTIONS',
      url: `${OPS}/collaboration/presence`,
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization,x-lodariq-authoring-session,content-type',
      },
    });
    expect(heartbeat.statusCode).toBe(204);
    expect(heartbeat.headers['access-control-allow-methods']).toContain('PUT');
    expect(heartbeat.headers['access-control-allow-origin']).toBe(ORIGIN);

    const events = await api.inject({
      method: 'OPTIONS',
      url: `${OPS}/collaboration/events`,
      headers: { origin: ORIGIN, 'access-control-request-method': 'GET' },
    });
    expect(events.statusCode).toBe(204);
    expect(events.headers['access-control-allow-methods']).toContain('GET');
    await api.close();
  });

  it('lists the applications a handoff can reach', async () => {
    const api = app();
    const response = await api.inject({
      method: 'GET',
      url: `${OPS}/applications`,
      headers: withSession,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ applications: [] });
    await api.close();
  });

  it('reads the value-free data catalog and schedules one verified artifact for production', async () => {
    const repository = createInMemoryControlPlaneRepository(seed() as never);
    await repository.observeWorkspaceDataCatalog({
      workspaceId: WORKSPACE_ID,
      environmentId: 'env_staging',
      observations: [
        {
          source: 'identify_trait',
          key: 'account.plan',
          valueType: 'string',
          observedAt: AT,
        },
      ],
    });
    const artifact = await compileDocument({
      document,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    const saved = await repository.saveDocument({
      workspaceId: WORKSPACE_ID,
      actorUserId: 'user_ada',
      document,
      artifact,
    });
    if (!saved.latestArtifact) throw new Error('schedule fixture artifact missing');
    const staging = await repository.activateCompiledArtifact({
      workspaceId: WORKSPACE_ID,
      environmentId: 'env_staging',
      correlationId: 'corr_ops_schedule',
      artifact: saved.latestArtifact,
      actorUserId: 'user_ada',
      idempotencyKey: 'publish:ops:schedule',
      requestHash: saved.latestArtifact.contentHash,
      expectedGeneration: 0,
      expectedEnvironmentPolicyUpdatedAt: AT,
    });
    await repository.createPublicationVerification({
      workspaceId: WORKSPACE_ID,
      environmentId: 'env_staging',
      documentId: document.id,
      expectedPublicationId: staging.publication.id,
      report: {
        schemaVersion: '1',
        checkedAt: AT,
        sdkVersion: '0.3.0',
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
        status: 'passed',
        checks: BROWSER_VERIFICATION_CHECK_CODES.map((code) => ({
          code,
          status: 'passed' as const,
        })),
      },
      verifiedOrigin: ORIGIN,
      actorUserId: 'user_ada',
    });
    const api = createApiApp({ repository, publicApiBaseUrl: 'https://api.lodariq.io' });

    const catalog = await api.inject({
      method: 'GET',
      url: `${OPS}/data-catalog`,
      headers: withSession,
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toMatchObject({
      version: 1,
      entries: [{ source: 'identify_trait', key: 'account.plan' }],
    });

    const scheduled = await api.inject({
      method: 'POST',
      url: `${OPS}/delivery-schedules`,
      headers: withSession,
      payload: {
        environmentId: 'env_production',
        publicationId: staging.publication.id,
        startAt: '2099-01-01T01:00:00.000Z',
        endAt: '2099-01-01T02:00:00.000Z',
        expectedGeneration: 0,
        idempotencyKey: 'schedule:ops:production',
      },
    });
    expect(scheduled.statusCode, scheduled.body).toBe(201);
    expect(scheduled.json()).toMatchObject({
      environmentId: 'env_production',
      artifactId: saved.latestArtifact.id,
      status: 'scheduled',
    });

    const listed = await api.inject({
      method: 'GET',
      url: `${OPS}/delivery-schedules`,
      headers: withSession,
    });
    expect(listed.json()).toMatchObject({ schedules: [{ status: 'scheduled' }] });
    await api.close();
  });

  it('browses the enriched audit log newest first and exports fixed CSV columns', async () => {
    const api = app();
    const listed = await api.inject({
      method: 'GET',
      url: `${OPS}/audit-events`,
      headers: withSession,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      events: [
        {
          eventType: 'membership_role_changed',
          actorName: 'Ada Lovelace',
          targetName: 'Mina Chen',
        },
        { eventType: 'invitation_created', actorName: 'Ada Lovelace', targetName: null },
      ],
    });

    const exported = await api.inject({
      method: 'GET',
      url: `${OPS}/audit-events.csv`,
      headers: withSession,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.headers['content-disposition']).toBe(
      'attachment; filename="lodariq-audit-log.csv"',
    );
    expect(exported.body).toContain('"occurred_at","event_type","actor_user_id"');
    expect(exported.body.indexOf('membership_role_changed')).toBeLessThan(
      exported.body.indexOf('invitation_created'),
    );
    await api.close();
  });

  it('neutralizes spreadsheet formulas in audit CSV values', () => {
    const csv = authoringAuditCsv([
      {
        id: `tenevt_${'c'.repeat(20)}`,
        workspaceId: WORKSPACE_ID,
        actorUserId: 'user_formula',
        actorName: '=2+2',
        eventType: 'workspace_deletion_scheduled',
        targetUserId: null,
        targetName: null,
        invitationId: null,
        previousRole: null,
        nextRole: null,
        occurredAt: AT,
      },
    ]);
    expect(csv).toContain('"\'=2+2"');
  });

  it('exports the maximum audit page without dropping rows', () => {
    const events = Array.from({ length: 10_000 }, (_, index) => ({
      id: `tenevt_${String(index).padStart(20, '0')}`,
      workspaceId: WORKSPACE_ID,
      actorUserId: 'user_ada',
      actorName: 'Ada Lovelace',
      eventType: 'workspace_deletion_cancelled' as const,
      targetUserId: null,
      targetName: null,
      invitationId: null,
      previousRole: null,
      nextRole: null,
      occurredAt: AT,
    }));

    expect(authoringAuditCsv(events).trimEnd().split('\r\n')).toHaveLength(10_001);
  });

  it('returns one bounded proposal for repeated operation retries', async () => {
    const propose = vi.fn(async () => ({
      proposal: {
        proposalId: 'proposal_server_1',
        summary: 'Shorter copy',
        edits: [
          {
            path: 'block:block_paragraph_1/content',
            before: "Projects help organize your team's work.",
            after: 'Keep projects organized.',
          },
        ],
      },
      usage: providerUsage(),
    }));
    const api = app(undefined, { propose });
    const payload = {
      operationId: `aiop_${'a'.repeat(20)}`,
      request: {
        kind: 'command',
        scope: 'step',
        prompt: 'Make this clearer',
        stepIds: ['block_step_1'],
      },
    };
    const first = await api.inject({
      method: 'POST',
      url: `${OPS}/assist`,
      headers: withSession,
      payload,
    });
    const replay = await api.inject({
      method: 'POST',
      url: `${OPS}/assist`,
      headers: withSession,
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ operationId: payload.operationId, replayed: false });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ operationId: payload.operationId, replayed: true });
    expect(propose).toHaveBeenCalledOnce();
    await api.close();
  });

  it('coalesces concurrent retries into one provider request', async () => {
    const propose = vi.fn(async () => ({
      proposal: {
        proposalId: 'proposal_concurrent',
        summary: 'Clearer copy',
        edits: [
          {
            path: 'block:block_paragraph_1/content',
            before: "Projects help organize your team's work.",
            after: 'Organize project work.',
          },
        ],
      },
      usage: providerUsage(),
    }));
    const api = app(undefined, { propose });
    const payload = {
      operationId: `aiop_${'r'.repeat(20)}`,
      request: {
        kind: 'command' as const,
        scope: 'step' as const,
        prompt: 'Make this clearer',
        stepIds: ['block_step_1'],
      },
    };
    const responses = await Promise.all(
      Array.from({ length: 32 }, () =>
        api.inject({ method: 'POST', url: `${OPS}/assist`, headers: withSession, payload }),
      ),
    );

    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(
      responses.filter((response) => response.json<{ replayed: boolean }>().replayed),
    ).toHaveLength(31);
    expect(propose).toHaveBeenCalledOnce();
    await api.close();
  });

  it(
    'rejects scope escapes, invalid provider paths, and operation-id reuse',
    async () => {
      const propose = vi.fn(async () => ({
        proposal: {
          proposalId: 'proposal_bad_1',
          summary: 'Unsafe change',
          edits: [{ path: 'theme.colors.primary', before: '#000', after: '#fff' }],
        },
        usage: providerUsage(),
      }));
      const api = app(undefined, { propose });
      const operationId = `aiop_${'b'.repeat(20)}`;
      const invalidScope = await api.inject({
        method: 'POST',
        url: `${OPS}/assist`,
        headers: withSession,
        payload: {
          operationId,
          request: { kind: 'command', scope: 'step', prompt: 'Rewrite', stepIds: ['missing_step'] },
        },
      });
      expect(invalidScope.statusCode).toBe(422);

      const invalidProposal = await api.inject({
        method: 'POST',
        url: `${OPS}/assist`,
        headers: withSession,
        payload: {
          operationId,
          request: {
            kind: 'command',
            scope: 'step',
            prompt: 'Rewrite',
            stepIds: ['block_step_1'],
          },
        },
      });
      expect(invalidProposal.statusCode).toBe(502);

      const validProvider = vi.fn(async () => ({
        proposal: {
          proposalId: 'proposal_ok_1',
          summary: 'Clearer',
          edits: [
            {
              path: 'block:block_paragraph_1/content',
              before: "Projects help organize your team's work.",
              after: 'Organize project work.',
            },
          ],
        },
        usage: providerUsage(),
      }));
      const nextApi = app(undefined, { propose: validProvider });
      const basePayload = {
        operationId: `aiop_${'c'.repeat(20)}`,
        request: {
          kind: 'command',
          scope: 'step',
          prompt: 'Rewrite',
          stepIds: ['block_step_1'],
        },
      };
      expect(
        (
          await nextApi.inject({
            method: 'POST',
            url: `${OPS}/assist`,
            headers: withSession,
            payload: basePayload,
          })
        ).statusCode,
      ).toBe(200);
      const conflict = await nextApi.inject({
        method: 'POST',
        url: `${OPS}/assist`,
        headers: withSession,
        payload: {
          ...basePayload,
          request: { ...basePayload.request, prompt: 'A different request' },
        },
      });
      expect(conflict.statusCode).toBe(409);
      await api.close();
      await nextApi.close();
    },
    MULTI_APP_TEST_TIMEOUT_MS,
  );

  it('caps new assist operations per session without charging idempotent replays', async () => {
    const propose = vi.fn(async () => ({
      proposal: {
        proposalId: 'proposal_quota',
        summary: 'Clearer',
        edits: [
          {
            path: 'block:block_paragraph_1/content',
            before: "Projects help organize your team's work.",
            after: 'Organize project work.',
          },
        ],
      },
      usage: providerUsage(),
    }));
    const api = app(undefined, { propose });
    const responses = [];
    for (let index = 0; index < 21; index += 1) {
      responses.push(
        await api.inject({
          method: 'POST',
          url: `${OPS}/assist`,
          headers: withSession,
          payload: {
            operationId: `aiop_${String(index).padStart(20, '0')}`,
            request: {
              kind: 'command',
              scope: 'step',
              prompt: 'Rewrite',
              stepIds: ['block_step_1'],
            },
          },
        }),
      );
    }
    expect(responses.slice(0, 20).every((response) => response.statusCode === 200)).toBe(true);
    expect(responses[20]?.statusCode).toBe(429);
    expect(responses[20]?.headers['retry-after']).toBeDefined();
    expect(propose).toHaveBeenCalledTimes(20);
    await api.close();
  });

  it('returns authoritative plan usage and charges an idempotent assist only once', async () => {
    const propose = vi.fn(async () => ({
      proposal: {
        proposalId: 'proposal_metered',
        summary: 'Clearer',
        edits: [
          {
            path: 'block:block_paragraph_1/content',
            before: "Projects help organize your team's work.",
            after: 'Organize project work.',
          },
        ],
      },
      usage: providerUsage(),
    }));
    const api = app(undefined, { propose });
    const payload = {
      operationId: `aiop_${'m'.repeat(20)}`,
      request: {
        kind: 'command',
        scope: 'step',
        prompt: 'Rewrite',
        stepIds: ['block_step_1'],
      },
    };

    const before = await api.inject({
      method: 'GET',
      url: `${OPS}/commercial-usage`,
      headers: withSession,
    });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({
      planId: 'business',
      aiCredits: { used: 0, limit: 15_000 },
    });
    expect(
      (await api.inject({ method: 'POST', url: `${OPS}/assist`, headers: withSession, payload }))
        .statusCode,
    ).toBe(200);
    expect(
      (await api.inject({ method: 'POST', url: `${OPS}/assist`, headers: withSession, payload }))
        .statusCode,
    ).toBe(200);

    const after = await api.inject({
      method: 'GET',
      url: `${OPS}/commercial-usage`,
      headers: withSession,
    });
    expect(after.json()).toMatchObject({ aiCredits: { used: 1, limit: 15_000 } });
    expect(propose).toHaveBeenCalledOnce();
    await api.close();
  });

  it('allows Starter copy assist while rejecting Ask before provider execution', async () => {
    const propose = vi.fn(async () => ({
      proposal: {
        proposalId: 'proposal_starter_copy',
        summary: 'Shorter',
        edits: [
          {
            path: 'block:block_paragraph_1/content',
            before: "Projects help organize your team's work.",
            after: 'Organize project work.',
          },
        ],
      },
      usage: providerUsage(),
    }));
    const api = appForPlan('starter', { propose });
    const ask = await api.inject({
      method: 'POST',
      url: `${OPS}/assist`,
      headers: withSession,
      payload: {
        operationId: `aiop_${'s'.repeat(20)}`,
        request: {
          kind: 'command',
          scope: 'step',
          prompt: 'Rewrite',
          stepIds: ['block_step_1'],
        },
      },
    });
    expect(ask.statusCode).toBe(403);
    expect(propose).not.toHaveBeenCalled();

    const rewrite = await api.inject({
      method: 'POST',
      url: `${OPS}/assist`,
      headers: withSession,
      payload: {
        operationId: `aiop_${'t'.repeat(20)}`,
        request: {
          kind: 'rewrite',
          scope: 'selection',
          verb: 'shorter',
          text: "Projects help organize your team's work.",
        },
      },
    });
    expect(rewrite.statusCode).toBe(200);
    expect(propose).toHaveBeenCalledOnce();
    await api.close();
  });
});

function replaceBlockContent(
  blocks: LodariqDocument['blocks'],
  blockId: string,
  content: string,
): boolean {
  for (const block of blocks) {
    if (block.id === blockId) {
      block.content = content;
      return true;
    }
    if (replaceBlockContent(block.children, blockId, content)) return true;
  }
  return false;
}

function providerUsage() {
  return {
    provider: 'test-provider',
    usageUnit: 'tokens' as const,
    inputUnits: 100,
    outputUnits: 50,
    providerCostMicros: 250,
  };
}

function appForPlan(planId: CommercialPlanId, authoringAssistProvider: AuthoringAssistProvider) {
  const repository = createInMemoryControlPlaneRepository({
    ...seed(),
    workspaceSubscriptions: [
      {
        workspaceId: WORKSPACE_ID,
        planId,
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        revision: 1,
        createdAt: AT,
        updatedAt: AT,
      },
    ],
  } as never);
  return createApiApp({
    repository,
    publicApiBaseUrl: 'https://api.lodariq.io',
    authoringAssistProvider,
  });
}

describe('immutable narration generation', () => {
  it('generates once, stores one private audio asset, and debits credits once on replay', async () => {
    const generate = vi.fn(async () => narrationProviderResult());
    const { api, repository } = appWithNarration({ voices: [narrationVoice()], generate });
    const payload = { operationId: `ttsop_${'a'.repeat(20)}`, stepId: 'block_step_1' };

    const first = await api.inject({
      method: 'POST',
      url: `${OPS}/narration`,
      headers: withSession,
      payload,
    });
    const replay = await api.inject({
      method: 'POST',
      url: `${OPS}/narration`,
      headers: withSession,
      payload,
    });

    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      operationId: payload.operationId,
      replayed: false,
      audio: { contentType: 'audio/wav', durationMs: 1_000 },
      asset: { kind: 'audio' },
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toMatchObject({
      replayed: true,
      audio: { assetId: first.json<{ audio: { assetId: string } }>().audio.assetId },
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(await repository.listAuthoringMediaAssets(WORKSPACE_ID)).toHaveLength(1);
    const unpublished = await api.inject({
      method: 'GET',
      url: `/v1/sdk/media-assets/${first.json<{ audio: { assetId: string } }>().audio.assetId}`,
    });
    expect(unpublished.statusCode).toBe(404);
    expect((await repository.readWorkspaceCommercialUsage(WORKSPACE_ID)).aiCredits.used).toBe(1);
    await api.close();
  });

  it('rejects reused operation ids for different narration sources', async () => {
    const generate = vi.fn(async () => narrationProviderResult());
    const { api } = appWithNarration({ voices: [narrationVoice()], generate }, 'business', true);
    const operationId = `ttsop_${'b'.repeat(20)}`;
    const first = await api.inject({
      method: 'POST',
      url: `${OPS}/narration`,
      headers: withSession,
      payload: { operationId, stepId: 'block_step_1' },
    });
    const conflict = await api.inject({
      method: 'POST',
      url: `${OPS}/narration`,
      headers: withSession,
      payload: { operationId, stepId: 'block_step_2' },
    });

    expect(first.statusCode).toBe(200);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: 'idempotency_conflict' });
    expect(generate).toHaveBeenCalledOnce();
    await api.close();
  });

  it('coalesces concurrent retries into one provider call, asset, and credit debit', async () => {
    const generate = vi.fn(async () => narrationProviderResult());
    const { api, repository } = appWithNarration({ voices: [narrationVoice()], generate });
    const payload = { operationId: `ttsop_${'g'.repeat(20)}`, stepId: 'block_step_1' };

    const responses = await Promise.all(
      Array.from({ length: 32 }, () =>
        api.inject({ method: 'POST', url: `${OPS}/narration`, headers: withSession, payload }),
      ),
    );

    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(
      responses.filter((response) => !response.json<{ replayed: boolean }>().replayed),
    ).toHaveLength(1);
    expect(generate).toHaveBeenCalledOnce();
    expect(await repository.listAuthoringMediaAssets(WORKSPACE_ID)).toHaveLength(1);
    expect((await repository.readWorkspaceCommercialUsage(WORKSPACE_ID)).aiCredits.used).toBe(1);
    await api.close();
  });

  it('fails closed on malformed provider audio without storing or charging it', async () => {
    const generate = vi.fn(async () => ({
      ...narrationProviderResult(),
      bytes: new TextEncoder().encode('not audio'),
      cues: [{ text: 'Welcome.', startMs: 950, durationMs: 500 }],
    }));
    const { api, repository } = appWithNarration({ voices: [narrationVoice()], generate });
    const response = await api.inject({
      method: 'POST',
      url: `${OPS}/narration`,
      headers: withSession,
      payload: { operationId: `ttsop_${'c'.repeat(20)}`, stepId: 'block_step_1' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: 'invalid_provider_response' });
    expect(await repository.listAuthoringMediaAssets(WORKSPACE_ID)).toHaveLength(0);
    expect((await repository.readWorkspaceCommercialUsage(WORKSPACE_ID)).aiCredits.used).toBe(0);
    await api.close();
  });

  it('keeps cloned voices unavailable until the consent lifecycle exists', async () => {
    const generate = vi.fn(async () => narrationProviderResult());
    const { api } = appWithNarration({
      voices: [{ ...narrationVoice(), cloned: true }],
      generate,
    });
    const response = await api.inject({
      method: 'POST',
      url: `${OPS}/narration`,
      headers: withSession,
      payload: { operationId: `ttsop_${'d'.repeat(20)}`, stepId: 'block_step_1' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: 'voice_consent_required' });
    expect(generate).not.toHaveBeenCalled();
    await api.close();
  });

  it('requires both a configured provider and a narration-entitled plan', async () => {
    const unavailable = app();
    const noProvider = await unavailable.inject({
      method: 'POST',
      url: `${OPS}/narration`,
      headers: withSession,
      payload: { operationId: `ttsop_${'e'.repeat(20)}`, stepId: 'block_step_1' },
    });
    expect(noProvider.statusCode).toBe(503);
    await unavailable.close();

    const generate = vi.fn(async () => narrationProviderResult());
    const { api } = appWithNarration({ voices: [narrationVoice()], generate }, 'starter');
    const gated = await api.inject({
      method: 'POST',
      url: `${OPS}/narration`,
      headers: withSession,
      payload: { operationId: `ttsop_${'f'.repeat(20)}`, stepId: 'block_step_1' },
    });
    expect(gated.statusCode).toBe(403);
    expect(generate).not.toHaveBeenCalled();
    await api.close();
  });
});

function appWithNarration(
  narrationProvider: NarrationProvider,
  planId: CommercialPlanId = 'business',
  narrateSecondStep = false,
) {
  const narrated = structuredClone(document);
  const first = narrated.blocks.find((block) => block.id === 'block_step_1');
  if (!first || first.type !== 'tourStep') throw new Error('first tour step fixture is missing');
  first.props.narration = {
    script: 'Welcome to your first project.',
    voiceId: 'voice_en',
    startOffsetMs: 250,
    advanceOnEnd: true,
  };
  if (narrateSecondStep) {
    const second = narrated.blocks.find((block) => block.id === 'block_step_2');
    if (!second || second.type !== 'tourStep')
      throw new Error('second tour step fixture is missing');
    second.props.narration = { script: 'This is a different source.', voiceId: 'voice_en' };
  }
  const repository = createInMemoryControlPlaneRepository({
    ...seed(),
    documents: [narrated],
    workspaceSubscriptions: [
      {
        workspaceId: WORKSPACE_ID,
        planId,
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        revision: 1,
        createdAt: AT,
        updatedAt: AT,
      },
    ],
  } as never);
  return {
    api: createApiApp({
      repository,
      publicApiBaseUrl: 'https://api.lodariq.io',
      narrationProvider,
    }),
    repository,
  };
}

function narrationVoice() {
  return { id: 'voice_en', name: 'Avery', locale: 'en-US' } as const;
}

function narrationProviderResult() {
  return {
    bytes: Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]),
    contentType: 'audio/wav' as const,
    durationMs: 1_000,
    cues: [{ text: 'Welcome.', startMs: 0, durationMs: 1_000 }],
    model: 'test-tts-v1',
    usage: {
      provider: 'test-tts',
      usageUnit: 'characters' as const,
      inputUnits: 29,
      outputUnits: 0,
      providerCostMicros: 150,
    },
  };
}

describe('what an Operations credential is allowed to do', () => {
  it('refuses a request with no authoring session, only an environment token', async () => {
    const api = app();
    const response = await api.inject({ method: 'GET', url: `${OPS}/measurement`, headers: auth });
    expect(response.statusCode).toBe(401);
    await api.close();
  });

  it('refuses an origin the environment does not allow', async () => {
    const api = app();
    const response = await api.inject({
      method: 'GET',
      url: `${OPS}/measurement`,
      headers: { ...withSession, origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    await api.close();
  });

  it('lets a read-only session read but not change what success means', async () => {
    const api = app([AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT], {
      propose: async () => {
        throw new Error('must not run');
      },
    });
    const read = await api.inject({
      method: 'GET',
      url: `${OPS}/measurement`,
      headers: withSession,
    });
    expect(read.statusCode).toBe(200);

    const write = await api.inject({
      method: 'PATCH',
      url: `${OPS}/measurement`,
      headers: withSession,
      payload: { successEvent: { eventName: 'invited_teammate', windowDays: 30 } },
    });
    expect(write.statusCode).toBe(403);
    expect(write.json<{ error: string }>().error).toBe('authoring_capability_forbidden');

    const assist = await api.inject({
      method: 'POST',
      url: `${OPS}/assist`,
      headers: withSession,
      payload: {
        operationId: `aiop_${'z'.repeat(20)}`,
        request: {
          kind: 'command',
          scope: 'step',
          prompt: 'Rewrite',
          stepIds: ['block_step_1'],
        },
      },
    });
    expect(assist.statusCode).toBe(403);
    await api.close();
  });

  it('refuses a session with no document capability at all', async () => {
    const api = app([AUTHORING_SESSION_CAPABILITIES.SELECT_TARGET]);
    const response = await api.inject({
      method: 'GET',
      url: `${OPS}/measurement`,
      headers: withSession,
    });
    expect(response.statusCode).toBe(403);
    await api.close();
  });
});
