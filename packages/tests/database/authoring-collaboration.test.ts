import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authoringPresenceParticipantId,
  createInMemoryControlPlaneRepository,
} from '@lodariq/database';
import { AUTHORING_PRESENCE_TTL_SECONDS, COMMERCIAL_PLAN_VERSION } from '@lodariq/schema';

const NOW = '2026-08-21T10:00:00.000Z';

function subscription(workspaceId: string, planId: 'starter' | 'growth' = 'growth') {
  return {
    workspaceId,
    planId,
    planVersion: COMMERCIAL_PLAN_VERSION,
    status: 'active' as const,
    entitlementOverrides: {},
    currentPeriodStart: '2026-08-01T00:00:00.000Z',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('authoring collaboration presence repository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it('isolates tenants, preserves semantic state, and distinguishes duplicate tabs', async () => {
    const repository = createInMemoryControlPlaneRepository({
      workspaceSubscriptions: [subscription('wk_a'), subscription('wk_b')],
    });
    await repository.heartbeatAuthoringPresence({
      workspaceId: 'wk_a',
      documentId: 'doc_shared',
      sessionId: 'session_a_1',
      creatorId: 'user_ada',
      creatorName: 'Ada Lovelace',
      stepId: 'step_1',
      selection: { type: 'block', blockId: 'heading_1' },
      documentUpdatedAt: NOW,
    });
    await repository.heartbeatAuthoringPresence({
      workspaceId: 'wk_a',
      documentId: 'doc_shared',
      sessionId: 'session_a_2',
      creatorId: 'user_ada',
      creatorName: 'Ada Lovelace',
      stepId: 'step_2',
      selection: { type: 'target', targetId: 'target_2' },
    });
    await repository.heartbeatAuthoringPresence({
      workspaceId: 'wk_b',
      documentId: 'doc_shared',
      sessionId: 'session_b_1',
      creatorId: 'user_b',
      creatorName: 'Tenant B',
      stepId: null,
      selection: null,
    });

    const tenantA = await repository.listAuthoringPresence({
      workspaceId: 'wk_a',
      documentId: 'doc_shared',
    });
    expect(tenantA).toHaveLength(2);
    expect(tenantA.map((entry) => entry.creatorId)).toEqual(['user_ada', 'user_ada']);
    expect(tenantA.map((entry) => entry.selection)).toEqual([
      { type: 'block', blockId: 'heading_1' },
      { type: 'target', targetId: 'target_2' },
    ]);
    expect(
      await repository.listAuthoringPresence({ workspaceId: 'wk_b', documentId: 'doc_shared' }),
    ).toMatchObject([{ creatorId: 'user_b' }]);
    expect(authoringPresenceParticipantId('session_a_1')).toMatch(/^presence_[a-f0-9]{24}$/u);
    expect(authoringPresenceParticipantId('session_a_1')).not.toBe(
      authoringPresenceParticipantId('session_a_2'),
    );
  });

  it('expires inactive clients and removes an explicit departure immediately', async () => {
    const repository = createInMemoryControlPlaneRepository({
      workspaceSubscriptions: [subscription('wk_a')],
    });
    const input = {
      workspaceId: 'wk_a',
      documentId: 'doc_1',
      sessionId: 'session_1',
      creatorId: 'user_1',
      creatorName: 'Ada',
      stepId: null,
      selection: null,
    } as const;
    await repository.heartbeatAuthoringPresence(input);
    vi.advanceTimersByTime(AUTHORING_PRESENCE_TTL_SECONDS * 1_000 - 1);
    expect(await repository.listAuthoringPresence(input)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(await repository.listAuthoringPresence(input)).toEqual([]);

    await repository.heartbeatAuthoringPresence(input);
    await repository.leaveAuthoringPresence(input);
    expect(await repository.listAuthoringPresence(input)).toEqual([]);
  });

  it('fails closed when presence is not in the workspace plan', async () => {
    const repository = createInMemoryControlPlaneRepository({
      workspaceSubscriptions: [subscription('wk_starter', 'starter')],
    });
    await expect(
      repository.heartbeatAuthoringPresence({
        workspaceId: 'wk_starter',
        documentId: 'doc_1',
        sessionId: 'session_1',
        creatorId: 'user_1',
        creatorName: 'Ada',
        stepId: null,
        selection: null,
      }),
    ).rejects.toMatchObject({ code: 'commercial_entitlement_exceeded' });
  });
});
