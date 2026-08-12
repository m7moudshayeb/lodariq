import { describe, expect, it } from 'vitest';
import { createApiApp, createLodariqAuthProvider, hashAuthSessionToken } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  createPublicSdkBootstrapGrant,
  createPublicSdkInstallationId,
  hashAuthoringAuthorizationState,
  hashPublicSdkBootstrapGrant,
  type ControlPlaneRepository,
} from '@lodariq/database';
import { LODARIQ_APP_ORIGIN } from '@lodariq/schema';

describe('owned identity authoring approval', () => {
  it('resolves the request workspace through membership without changing the active workspace', async () => {
    const now = Date.now();
    const rawMemberSession = 'lq_sess_member_workspace_a';
    const rawNonMemberSession = 'lq_sess_non_member_workspace_c';
    const repository = createInMemoryControlPlaneRepository({
      workspaces: [workspace('wk_a', now), workspace('wk_b', now), workspace('wk_c', now)],
      users: [user('usr_member', now), user('usr_non_member', now)],
      workspaceMemberships: [
        membership('wk_a', 'usr_member', 'owner', now),
        membership('wk_b', 'usr_member', 'member', now),
        membership('wk_c', 'usr_non_member', 'owner', now),
      ],
      environments: [
        {
          id: 'env_b_staging',
          workspaceId: 'wk_b',
          kind: 'staging',
          name: 'B staging',
          originAllowlist: ['https://customer.example'],
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
        },
      ],
      authSessions: [
        session(rawMemberSession, 'usr_member', 'wk_a', now),
        session(rawNonMemberSession, 'usr_non_member', 'wk_c', now),
      ],
    });
    const installationId = await configureAuthoringInstallation(repository);
    const first = await createPendingRequest(repository, installationId, 'state-a'.padEnd(40, 'a'));
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
    });

    const inspect = await app.inject({
      method: 'GET',
      url: `/v1/authoring/authorization-requests/${first.requestId}`,
      headers: {
        authorization: `Bearer ${rawMemberSession}`,
        origin: LODARIQ_APP_ORIGIN,
      },
    });
    expect(inspect.statusCode).toBe(200);
    expect(inspect.json<{ environmentId: string }>().environmentId).toBe('env_b_staging');

    const approve = await app.inject({
      method: 'POST',
      url: `/v1/authoring/authorization-requests/${first.requestId}/approve`,
      headers: {
        authorization: `Bearer ${rawMemberSession}`,
        origin: LODARIQ_APP_ORIGIN,
      },
      payload: { state: first.state },
    });
    expect(approve.statusCode).toBe(200);
    const stillWorkspaceA = await repository.resolveAuthSession(
      hashAuthSessionToken(rawMemberSession),
      new Date().toISOString(),
    );
    expect(stillWorkspaceA?.activeWorkspaceId).toBe('wk_a');

    const second = await createPendingRequest(
      repository,
      installationId,
      'state-b'.padEnd(40, 'b'),
    );
    const denied = await app.inject({
      method: 'GET',
      url: `/v1/authoring/authorization-requests/${second.requestId}`,
      headers: {
        authorization: `Bearer ${rawNonMemberSession}`,
        origin: LODARIQ_APP_ORIGIN,
      },
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.json()).toEqual({
      error: 'not_found',
      message: 'Pending authoring authorization request not found',
    });
    await app.close();
  });
});

async function configureAuthoringInstallation(repository: ControlPlaneRepository): Promise<string> {
  const installationId = createPublicSdkInstallationId();
  await repository.getOrCreatePublicSdkInstallation({
    workspaceId: 'wk_b',
    installationId,
    name: 'B installation',
    actorUserId: 'usr_member',
  });
  await repository.setPublicSdkInstallationOrigin({
    workspaceId: 'wk_b',
    installationId,
    environmentId: 'env_b_staging',
    origin: 'https://customer.example',
    authoringEnabled: true,
  });
  return installationId;
}

async function createPendingRequest(
  repository: ControlPlaneRepository,
  installationId: string,
  state: string,
) {
  const rawBootstrapGrant = createPublicSdkBootstrapGrant();
  await repository.createPublicSdkBootstrapGrant({
    workspaceId: 'wk_b',
    installationId,
    environmentId: 'env_b_staging',
    exactOrigin: 'https://customer.example',
    grantHash: hashPublicSdkBootstrapGrant(rawBootstrapGrant),
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  });
  const request = await repository.createAuthoringAuthorizationRequest({
    installationId,
    exactOrigin: 'https://customer.example',
    bootstrapGrantHash: hashPublicSdkBootstrapGrant(rawBootstrapGrant),
    stateHash: hashAuthoringAuthorizationState(state),
    codeChallenge: 'A'.repeat(43),
    requestedCapabilities: ['documents:list'],
    expiresAt: new Date(Date.now() + 100_000).toISOString(),
  });
  if (!request) throw new Error('Failed to create pending request');
  return { requestId: request.requestId, state };
}

function workspace(id: string, now: number) {
  const timestamp = new Date(now).toISOString();
  return { id, name: id, createdAt: timestamp, updatedAt: timestamp };
}

function user(id: string, now: number) {
  const timestamp = new Date(now).toISOString();
  return {
    id,
    legacyIdentityId: null,
    email: `${id}@example.com`,
    name: id,
    emailVerifiedAt: timestamp,
    createdAt: timestamp,
  };
}

function membership(workspaceId: string, userId: string, role: string, now: number) {
  return { workspaceId, userId, role, createdAt: new Date(now).toISOString() };
}

function session(rawToken: string, userId: string, activeWorkspaceId: string, now: number) {
  const timestamp = new Date(now).toISOString();
  return {
    id: `authsess_${userId.padEnd(24, 'x')}`,
    userId,
    tokenHash: hashAuthSessionToken(rawToken),
    activeWorkspaceId,
    createdAt: timestamp,
    lastSeenAt: timestamp,
    idleExpiresAt: new Date(now + 60 * 60 * 1_000).toISOString(),
    absoluteExpiresAt: new Date(now + 24 * 60 * 60 * 1_000).toISOString(),
    revokedAt: null,
  };
}
