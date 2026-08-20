import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  getEnvironmentTokenPrefix,
  hashEnvironmentToken,
  type ControlPlaneRepository,
} from '@lodariq/database';
import {
  AUTHORING_SESSION_CAPABILITIES,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_ops';
const TOKEN = 'lod_staging_ops_token_12345678901234';
const SESSION_TOKEN = 'lqs_ops_session_token_1234567890';
const ORIGIN = 'https://staging.customer.example';
const AT = '2026-08-09T00:00:00.000Z';
const SOON = '2099-01-01T00:00:00.000Z';

const document = {
  ...(structuredClone(tourFixture) as LodariqDocument),
  workspaceId: WORKSPACE_ID,
};

const auth = { authorization: `Bearer ${TOKEN}`, origin: ORIGIN };
const withSession = { ...auth, 'x-lodariq-authoring-session': SESSION_TOKEN };

const ALL_CAPABILITIES = Object.values(AUTHORING_SESSION_CAPABILITIES);

function seed(capabilities: readonly string[] = ALL_CAPABILITIES) {
  return {
    users: [
      { id: 'user_ada', legacyIdentityId: null, email: 'a@lodariq.test', name: 'Ada Lovelace', createdAt: AT },
    ],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: 'user_ada', role: 'owner' as const, createdAt: AT },
    ],
    environments: [
      {
        id: 'env_staging',
        workspaceId: WORKSPACE_ID,
        kind: 'staging' as const,
        name: 'Staging',
        originAllowlist: [ORIGIN],
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
  };
}

function app(capabilities?: readonly string[]) {
  const repository: ControlPlaneRepository = createInMemoryControlPlaneRepository(
    seed(capabilities) as never,
  );
  return createApiApp({ repository, publicApiBaseUrl: 'https://api.lodariq.io' });
}

const OPS = '/v1/sdk/authoring/operations';

describe('Operations for the panel on the page', () => {
  it('answers with the session’s own experience, without being told which one', async () => {
    const api = app();
    const response = await api.inject({
      method: 'GET',
      url: `${OPS}/measurement`,
      headers: withSession,
    });
    expect(response.statusCode).toBe(200);
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

  it('serves the replay of recent runs', async () => {
    const api = app();
    const response = await api.inject({
      method: 'GET',
      url: `${OPS}/sessions`,
      headers: withSession,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sessions: [] });
    await api.close();
  });

  it('carries a review from one creator to the list the next one reads', async () => {
    const api = app();
    const created = await api.inject({
      method: 'POST',
      url: `${OPS}/comments`,
      headers: withSession,
      payload: { stepId: 'step_1', body: 'This step needs a shorter title.' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<{ comment: { author: string } }>().comment.author).toBe('Ada Lovelace');

    const listed = await api.inject({
      method: 'GET',
      url: `${OPS}/comments`,
      headers: withSession,
    });
    expect(listed.json<{ comments: unknown[] }>().comments).toHaveLength(1);
    await api.close();
  });

  it('hands back the winning lease when a step is claimed', async () => {
    const api = app();
    const response = await api.inject({
      method: 'POST',
      url: `${OPS}/step-locks`,
      headers: withSession,
      payload: { stepId: 'step_1', sessionId: 'tab_a' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ lock: { holderName: string } }>().lock.holderName).toBe('Ada Lovelace');
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
});

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
    const api = app([AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT]);
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
