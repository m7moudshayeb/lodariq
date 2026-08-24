import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type ControlPlaneRepository,
} from '@lodariq/database';
import { COMMERCIAL_PLAN_VERSION, type LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_measurement';
const NOW = '2026-06-30T00:00:00.000Z';
const API_INTEGRATION_TIMEOUT_MS = 30_000;

const owner = { 'x-lodariq-workspace-id': WORKSPACE_ID, 'x-lodariq-user-id': 'user_owner' };
const member = { 'x-lodariq-workspace-id': WORKSPACE_ID, 'x-lodariq-user-id': 'user_member' };
const viewer = { 'x-lodariq-workspace-id': WORKSPACE_ID, 'x-lodariq-user-id': 'user_viewer' };
const stranger = { 'x-lodariq-workspace-id': 'wk_other', 'x-lodariq-user-id': 'user_stranger' };

function repository(): ControlPlaneRepository {
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: 'user_owner',
        legacyIdentityId: null,
        email: 'o@lodariq.test',
        name: 'Ada Lovelace',
        createdAt: NOW,
      },
      {
        id: 'user_member',
        legacyIdentityId: null,
        email: 'm@lodariq.test',
        name: 'Katherine Johnson',
        createdAt: NOW,
      },
      {
        id: 'user_viewer',
        legacyIdentityId: null,
        email: 'v@lodariq.test',
        name: 'Grace Hopper',
        createdAt: NOW,
      },
    ],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: 'user_owner', role: 'owner', createdAt: NOW },
      { workspaceId: WORKSPACE_ID, userId: 'user_member', role: 'member', createdAt: NOW },
      { workspaceId: WORKSPACE_ID, userId: 'user_viewer', role: 'viewer', createdAt: NOW },
    ],
    environments: [
      {
        id: 'env_staging',
        workspaceId: WORKSPACE_ID,
        kind: 'staging',
        name: 'Staging',
        originAllowlist: ['https://staging.lodariq.io'],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    workspaceSubscriptions: [
      {
        workspaceId: WORKSPACE_ID,
        planId: 'business',
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: '2026-06-01T00:00:00.000Z',
        currentPeriodEnd: '2026-07-01T00:00:00.000Z',
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  });
}

async function appWithDocument(store: ControlPlaneRepository = repository()) {
  const app = createApiApp({
    repository: store,
    publicApiBaseUrl: 'https://api.lodariq.io',
  });
  const document = {
    ...structuredClone(tourFixture as LodariqDocument),
    workspaceId: WORKSPACE_ID,
  };
  const created = await app.inject({
    method: 'POST',
    url: '/v1/documents',
    headers: owner,
    payload: document,
  });
  expect(created.statusCode).toBe(201);
  return { app, documentId: document.id, repository: store };
}

describe('experience measurement API', { timeout: API_INTEGRATION_TIMEOUT_MS }, () => {
  it('starts with no success event and adaptive off, so nothing is measured by surprise', async () => {
    const { app, documentId } = await appWithDocument();
    const response = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/measurement`,
      headers: owner,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      documentId,
      adaptivePolicy: { enabled: false, minimumOccurrences: 2, lookbackDays: 30 },
    });
    await app.close();
  });

  it('declares and then clears a success event', async () => {
    const { app, documentId } = await appWithDocument();
    const declared = await app.inject({
      method: 'PATCH',
      url: `/v1/documents/${documentId}/measurement`,
      headers: owner,
      payload: { successEvent: { eventName: 'invited_teammate', windowDays: 7 } },
    });
    expect(declared.statusCode).toBe(200);
    expect(declared.json<{ successEvent?: unknown }>().successEvent).toEqual({
      eventName: 'invited_teammate',
      windowDays: 7,
    });

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/v1/documents/${documentId}/measurement`,
      headers: owner,
      payload: { successEvent: null },
    });
    expect(cleared.json<{ successEvent?: unknown }>().successEvent).toBeUndefined();
    await app.close();
  });

  it('rejects a success event name that is not an event name', async () => {
    const { app, documentId } = await appWithDocument();
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/documents/${documentId}/measurement`,
      headers: owner,
      payload: { successEvent: { eventName: 'Invited Teammate!', windowDays: 7 } },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('keeps a viewer out of configuration but lets them read', async () => {
    const { app, documentId } = await appWithDocument();
    const write = await app.inject({
      method: 'PATCH',
      url: `/v1/documents/${documentId}/measurement`,
      headers: viewer,
      payload: { adaptivePolicy: { enabled: true, minimumOccurrences: 2, lookbackDays: 30 } },
    });
    expect(write.statusCode).toBe(403);

    const read = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/measurement`,
      headers: viewer,
    });
    expect(read.statusCode).toBe(200);
    await app.close();
  });

  it('does not leak another workspace’s experience', async () => {
    const { app, documentId } = await appWithDocument();
    const response = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/measurement`,
      headers: stranger,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns an empty funnel in document order before anything is delivered', async () => {
    const { app, documentId } = await appWithDocument();
    const response = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/analytics?environmentId=env_staging`,
      headers: owner,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ shown: number; funnel: Array<{ reached: number }> }>();
    expect(body.shown).toBe(0);
    expect(body.funnel.length).toBeGreaterThan(0);
    expect(body.funnel.every((entry) => entry.reached === 0)).toBe(true);
    await app.close();
  });

  it('rejects analytics for an environment that is not in this workspace', async () => {
    const { app, documentId } = await appWithDocument();
    const response = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/analytics?environmentId=env_ghost`,
      headers: owner,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

const DELIVERY = {
  workspaceId: WORKSPACE_ID,
  environmentId: 'env_staging',
  publicationId: 'pub_1',
  contentHash: `sha256-${'a'.repeat(64)}`,
  pointerGeneration: 1,
  sdkVersion: '0.0.0-test',
};

async function ingest(
  store: ControlPlaneRepository,
  documentId: string,
  events: ReadonlyArray<{
    name: string;
    at: string;
    correlationId: string;
    stepId?: string;
    props?: Record<string, string>;
  }>,
): Promise<void> {
  await store.ingestAuthoritativeEvents({
    workspaceId: WORKSPACE_ID,
    environmentId: DELIVERY.environmentId,
    events: events.map((event) => ({
      ...DELIVERY,
      documentId,
      name: event.name,
      timestamp: event.at,
      correlationId: event.correlationId,
      ...(event.stepId ? { stepId: event.stepId } : {}),
      ...(event.props ? { props: event.props } : {}),
    })),
  });
}

describe('session replay API', { timeout: API_INTEGRATION_TIMEOUT_MS }, () => {
  it('rebuilds one visitor’s run from the beats already collected', async () => {
    const store = repository();
    const { app, documentId } = await appWithDocument(store);
    await ingest(store, documentId, [
      { name: 'tour_started', at: '2026-06-30T10:00:00.000Z', correlationId: 'visitor_a' },
      {
        name: 'tour_step_changed',
        at: '2026-06-30T10:00:03.000Z',
        correlationId: 'visitor_a',
        stepId: 'step_1',
      },
      {
        name: 'target_resolution',
        at: '2026-06-30T10:00:12.000Z',
        correlationId: 'visitor_a',
        stepId: 'step_2',
        props: { result: 'not_found', reasonCode: 'ambiguous' },
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/sessions?environmentId=env_staging`,
      headers: owner,
    });
    expect(response.statusCode).toBe(200);
    const [session] = response.json<{
      sessions: Array<{
        correlationId: string;
        outcome: string;
        durationMs: number;
        unresolvedStepIds: string[];
        beats: Array<{ name: string; offsetMs: number }>;
      }>;
    }>().sessions;
    expect(session).toMatchObject({
      correlationId: 'visitor_a',
      outcome: 'abandoned',
      durationMs: 12_000,
      unresolvedStepIds: ['step_2'],
    });
    expect(session?.beats.map((beat) => beat.offsetMs)).toEqual([0, 3_000, 12_000]);
    await app.close();
  });

  it('keeps each visitor’s run separate and puts the newest first', async () => {
    const store = repository();
    const { app, documentId } = await appWithDocument(store);
    await ingest(store, documentId, [
      { name: 'tour_started', at: '2026-06-30T10:00:00.000Z', correlationId: 'visitor_a' },
      { name: 'tour_completed', at: '2026-06-30T10:00:30.000Z', correlationId: 'visitor_a' },
      { name: 'tour_started', at: '2026-06-30T11:00:00.000Z', correlationId: 'visitor_b' },
      { name: 'tour_dismissed', at: '2026-06-30T11:00:04.000Z', correlationId: 'visitor_b' },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/sessions?environmentId=env_staging&limit=10`,
      headers: owner,
    });
    const { sessions } = response.json<{
      sessions: Array<{ correlationId: string; outcome: string }>;
    }>();
    expect(sessions).toEqual([
      expect.objectContaining({ correlationId: 'visitor_b', outcome: 'dismissed' }),
      expect.objectContaining({ correlationId: 'visitor_a', outcome: 'completed' }),
    ]);
    await app.close();
  });

  it('does not hand another workspace’s sessions to a stranger', async () => {
    const store = repository();
    const { app, documentId } = await appWithDocument(store);
    await ingest(store, documentId, [
      { name: 'tour_started', at: '2026-06-30T10:00:00.000Z', correlationId: 'visitor_a' },
    ]);
    const response = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/sessions?environmentId=env_staging`,
      headers: stranger,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('rejects an environment that is not in this workspace', async () => {
    const { app, documentId } = await appWithDocument();
    const response = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/sessions?environmentId=env_ghost`,
      headers: owner,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('is readable by a viewer, because replay is a read', async () => {
    const { app, documentId } = await appWithDocument();
    const response = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/sessions?environmentId=env_staging`,
      headers: viewer,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sessions: [] });
    await app.close();
  });
});

describe('experiments API', { timeout: API_INTEGRATION_TIMEOUT_MS }, () => {
  const arms = [
    { id: 'A' as const, label: 'Control', trafficPercent: 50 },
    { id: 'B' as const, label: 'Variant', trafficPercent: 50 },
  ];

  it('creates one experiment and refuses a second while it is live', async () => {
    const { app, documentId } = await appWithDocument();
    const payload = { varies: 'copy', successEventName: 'invited_teammate', arms };
    const first = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/experiment`,
      headers: owner,
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/experiment`,
      headers: owner,
      payload,
    });
    expect(second.statusCode).toBe(409);
    await app.close();
  });

  it('refuses a split that does not total 100', async () => {
    const { app, documentId } = await appWithDocument();
    const response = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/experiment`,
      headers: owner,
      payload: {
        varies: 'copy',
        successEventName: 'invited_teammate',
        arms: [
          { id: 'A', label: 'Control', trafficPercent: 60 },
          { id: 'B', label: 'Variant', trafficPercent: 60 },
        ],
      },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('keeps assignments stable across allocation revisions and freezes live variants', async () => {
    const { app, documentId, repository: store } = await appWithDocument();
    const created = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/experiment`,
      headers: owner,
      payload: {
        varies: 'copy',
        successEventName: 'invited_teammate',
        arms: [
          { ...arms[0], overrides: [] },
          {
            ...arms[1],
            overrides: [{ type: 'copy', blockId: 'block_heading_1', text: 'Variant copy' }],
          },
        ],
      },
    });
    const experiment = created.json<{ experiment: { id: string } }>().experiment;
    await store.updateExperiment({
      workspaceId: WORKSPACE_ID,
      documentId,
      experimentId: experiment.id,
      status: 'running',
    });
    const assignmentInput = {
      workspaceId: WORKSPACE_ID,
      environmentId: 'env_staging',
      documentId,
      experimentId: experiment.id,
      assignmentKey: `lqv_${'1'.repeat(32)}`,
    };
    const first = await store.getOrCreateExperimentAssignment(assignmentInput);
    expect(await store.getOrCreateExperimentAssignment(assignmentInput)).toEqual(first);

    const changed = await store.updateExperiment({
      workspaceId: WORKSPACE_ID,
      documentId,
      experimentId: experiment.id,
      arms: [
        { ...arms[0]!, trafficPercent: 60, overrides: [] },
        {
          ...arms[1]!,
          trafficPercent: 40,
          overrides: [{ type: 'copy', blockId: 'block_heading_1', text: 'Variant copy' }],
        },
      ],
    });
    expect(changed?.allocationRevision).toBe(2);
    expect((await store.getOrCreateExperimentAssignment(assignmentInput))?.allocationRevision).toBe(
      1,
    );
    await expect(
      store.updateExperiment({
        workspaceId: WORKSPACE_ID,
        documentId,
        experimentId: experiment.id,
        arms: [
          { ...arms[0]!, trafficPercent: 60, overrides: [] },
          {
            ...arms[1]!,
            trafficPercent: 40,
            overrides: [{ type: 'copy', blockId: 'block_heading_1', text: 'Changed live' }],
          },
        ],
      }),
    ).rejects.toThrow(/immutable/);
    await app.close();
  });

  it('applies the promoted arm without rewriting allocation history', async () => {
    const { app, documentId } = await appWithDocument();
    const created = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/experiment`,
      headers: owner,
      payload: { varies: 'copy', successEventName: 'invited_teammate', arms },
    });
    const experimentId = created.json<{ experiment: { id: string } }>().experiment.id;

    const promoted = await app.inject({
      method: 'PATCH',
      url: `/v1/experiments/${experimentId}`,
      headers: owner,
      payload: { promotedArmId: 'B' },
    });
    expect(promoted.statusCode).toBe(200);
    const experiment = promoted.json<{
      experiment: { status: string; arms: Array<{ id: string; trafficPercent: number }> };
    }>().experiment;
    expect(experiment.status).toBe('promoted');
    expect(experiment.arms).toEqual(arms);

    const next = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/experiment`,
      headers: owner,
      payload: { varies: 'placement', successEventName: 'invited_teammate', arms },
    });
    expect(next.statusCode).toBe(201);

    const live = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/experiment?environmentId=env_staging`,
      headers: owner,
    });
    expect(live.json<{ experiment: { id: string } }>().experiment.id).toBe(
      next.json<{ experiment: { id: string } }>().experiment.id,
    );
    await app.close();
  });
});

describe('collaboration API', { timeout: API_INTEGRATION_TIMEOUT_MS }, () => {
  it('keeps semantic review threads and their audit history', async () => {
    const { app, documentId, repository } = await appWithDocument();
    const created = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/comments`,
      headers: owner,
      payload: {
        anchor: {
          type: 'target',
          stepId: 'block_step_1',
          targetId: 'target_new_project',
        },
        body: 'This target moves on mobile.',
      },
    });
    expect(created.statusCode).toBe(201);
    const comment = created.json<{
      comment: { author: string; resolved: boolean; id: string; replies: unknown[] };
    }>().comment;
    expect(comment.author).toBe('Ada Lovelace');
    expect(JSON.stringify(comment)).not.toContain('@lodariq.test');
    expect(comment.resolved).toBe(false);
    expect(comment.replies).toEqual([]);

    const replied = await app.inject({
      method: 'POST',
      url: `/v1/comments/${comment.id}/replies`,
      headers: owner,
      payload: { body: 'Confirmed in the narrow layout.' },
    });
    expect(replied.statusCode).toBe(201);
    expect(
      replied.json<{ comment: { replies: Array<{ body: string }> } }>().comment.replies,
    ).toEqual([expect.objectContaining({ body: 'Confirmed in the narrow layout.' })]);

    const resolved = await app.inject({
      method: 'PATCH',
      url: `/v1/comments/${comment.id}`,
      headers: owner,
      payload: { resolved: true },
    });
    expect(resolved.json<{ comment: { resolved: boolean } }>().comment.resolved).toBe(true);

    const listed = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/comments`,
      headers: viewer,
    });
    expect(listed.json()).toMatchObject({
      comments: [
        {
          anchor: {
            type: 'target',
            stepId: 'block_step_1',
            targetId: 'target_new_project',
          },
          resolved: true,
          replies: [{ body: 'Confirmed in the narrow layout.' }],
        },
      ],
    });
    expect(
      await repository.listExperienceCommentAuditEvents({ workspaceId: WORKSPACE_ID, documentId }),
    ).toMatchObject([
      { eventType: 'thread_created', commentId: comment.id },
      { eventType: 'reply_added', threadId: comment.id },
      { eventType: 'thread_resolved', commentId: comment.id },
    ]);
    await app.close();
  });

  it('rejects stale anchors and keeps viewers read-only', async () => {
    const { app, documentId } = await appWithDocument();
    const stale = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/comments`,
      headers: owner,
      payload: { anchor: { type: 'step', stepId: 'missing_step' }, body: 'Stale.' },
    });
    expect(stale.statusCode).toBe(422);

    const forbidden = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/comments`,
      headers: viewer,
      payload: { anchor: { type: 'step', stepId: 'block_step_1' }, body: 'No write role.' },
    });
    expect(forbidden.statusCode).toBe(403);
    await app.close();
  });

  it('gives the step to one creator and tells the other who holds it', async () => {
    const { app, documentId } = await appWithDocument();
    const claim = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/step-locks`,
      headers: owner,
      payload: { stepId: 'step_1', sessionId: 'sess_a' },
    });
    expect(claim.statusCode).toBe(201);
    expect(claim.json<{ acquired: boolean }>().acquired).toBe(true);

    const contested = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/step-locks`,
      headers: member,
      payload: { stepId: 'step_1', sessionId: 'sess_b' },
    });
    expect(contested.statusCode).toBe(409);
    expect(contested.json<{ acquired: boolean }>().acquired).toBe(false);
    expect(contested.json<{ lock: { holderName: string } }>().lock.holderName).toBe('Ada Lovelace');

    const duplicateTab = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/step-locks`,
      headers: owner,
      payload: { stepId: 'step_1', sessionId: 'sess_b' },
    });
    expect(duplicateTab.statusCode).toBe(409);

    const forbiddenTakeover = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/step-locks`,
      headers: member,
      payload: { stepId: 'step_1', sessionId: 'sess_b', takeover: true },
    });
    expect(forbiddenTakeover.statusCode).toBe(403);

    const viewerClaim = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/step-locks`,
      headers: viewer,
      payload: { stepId: 'step_1', sessionId: 'viewer_session' },
    });
    expect(viewerClaim.statusCode).toBe(403);

    const takeover = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentId}/step-locks`,
      headers: owner,
      payload: { stepId: 'step_1', sessionId: 'sess_b', takeover: true },
    });
    expect(takeover.statusCode).toBe(201);
    expect(takeover.json()).toMatchObject({ acquired: true, canTakeover: true });

    const released = await app.inject({
      method: 'DELETE',
      url: `/v1/documents/${documentId}/step-locks`,
      headers: owner,
      payload: { stepId: 'step_1', sessionId: 'sess_b' },
    });
    expect(released.statusCode).toBe(204);

    const locks = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/step-locks`,
      headers: viewer,
    });
    expect(locks.json<{ locks: unknown[] }>().locks).toHaveLength(0);
    await app.close();
  });

  it('keeps exactly one winner when many editing sessions claim together', async () => {
    const { app, documentId } = await appWithDocument();
    const claims = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        app.inject({
          method: 'POST',
          url: `/v1/documents/${documentId}/step-locks`,
          headers: index % 2 === 0 ? owner : member,
          payload: { stepId: 'step_1', sessionId: `stress_session_${index}` },
        }),
      ),
    );
    expect(claims.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(claims.filter((response) => response.statusCode === 409)).toHaveLength(23);
    const locks = await app.inject({
      method: 'GET',
      url: `/v1/documents/${documentId}/step-locks`,
      headers: viewer,
    });
    expect(locks.json<{ locks: unknown[] }>().locks).toHaveLength(1);
    await app.close();
  });
});

describe('applications API', { timeout: API_INTEGRATION_TIMEOUT_MS }, () => {
  const application = {
    id: 'billing',
    name: 'Meridian Billing',
    originPatterns: ['billing.meridian.test'],
    isPrimary: true,
  };

  it('registers an application and keeps exactly one primary', async () => {
    const { app } = await appWithDocument();
    const first = await app.inject({
      method: 'PUT',
      url: '/v1/applications/billing',
      headers: owner,
      payload: application,
    });
    expect(first.statusCode).toBe(200);

    await app.inject({
      method: 'PUT',
      url: '/v1/applications/app',
      headers: owner,
      payload: {
        ...application,
        id: 'app',
        name: 'Meridian',
        originPatterns: ['app.meridian.test'],
      },
    });

    const listed = await app.inject({ method: 'GET', url: '/v1/applications', headers: owner });
    const applications = listed.json<{ applications: Array<{ id: string; isPrimary: boolean }> }>()
      .applications;
    expect(applications.filter((entry) => entry.isPrimary)).toHaveLength(1);
    expect(applications.find((entry) => entry.isPrimary)?.id).toBe('app');
    await app.close();
  });

  it('refuses a body whose id disagrees with the path', async () => {
    const { app } = await appWithDocument();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/applications/billing',
      headers: owner,
      payload: { ...application, id: 'other' },
    });
    expect(response.statusCode).toBe(422);
    await app.close();
  });

  it('keeps registration to admins', async () => {
    const { app } = await appWithDocument();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/applications/billing',
      headers: viewer,
      payload: application,
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
