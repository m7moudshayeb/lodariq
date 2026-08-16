import { describe, expect, it } from 'vitest';
import { createApiApp, createLodariqAuthProvider, hashAuthSessionToken } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type InMemoryControlPlaneSeed,
} from '@lodariq/database';

const NOW = new Date('2026-08-15T10:00:00.000Z');
const WORKSPACE_ID = 'wk_api_tenant';

describe('@lodariq/api tenant administration', () => {
  it('issues a token once and accepts it only for the authenticated matching email', async () => {
    const ownerToken = 'lq_sess_api_owner';
    const inviteeToken = 'lq_sess_api_invitee';
    const repository = tenantRepository({
      authSessions: [
        authSession('usr_api_owner', ownerToken),
        authSession('usr_api_invitee', inviteeToken, null),
      ],
    });
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(NOW),
    });

    const issued = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${WORKSPACE_ID}/invitations`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'invitee@example.com', role: 'member' },
    });
    expect(issued.statusCode).toBe(201);
    expect(issued.headers['cache-control']).toBe('no-store');
    const invitation = issued.json<{
      id: string;
      workspaceId: string;
      role: string;
      expiresAt: string;
      invitationToken: string;
    }>();
    expect(invitation).toMatchObject({ workspaceId: WORKSPACE_ID, role: 'member' });
    expect(invitation.invitationToken).toMatch(/^lq_invite_[A-Za-z0-9_-]{43}$/u);

    const pending = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WORKSPACE_ID}/invitations`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json<{ invitations: Array<{ id: string }> }>().invitations).toEqual([
      expect.objectContaining({ id: invitation.id }),
    ]);
    await expect(
      repository.claimDue({ now: NOW.toISOString(), limit: 1, leaseDurationMs: 60_000 }),
    ).resolves.toEqual([
      expect.objectContaining({
        purpose: 'workspace_invitation',
        challengeId: invitation.id,
      }),
    ]);

    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/workspace-invitations/accept',
      headers: { authorization: `Bearer ${inviteeToken}` },
      payload: { invitationId: invitation.id, token: invitation.invitationToken },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ workspaceId: WORKSPACE_ID, role: 'member' });

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/workspace-invitations/accept',
      headers: { authorization: `Bearer ${inviteeToken}` },
      payload: { invitationId: invitation.id, token: invitation.invitationToken },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json<{ error: string }>().error).toBe('invitation_invalid_or_expired');

    const members = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WORKSPACE_ID}/members`,
      headers: { authorization: `Bearer ${inviteeToken}` },
    });
    expect(members.statusCode).toBe(200);
    expect(members.json<{ members: Array<{ userId: string }> }>().members).toContainEqual(
      expect.objectContaining({ userId: 'usr_api_invitee' }),
    );
    await app.close();
  });

  it('ignores browser role claims and resolves authoritative membership for every mutation', async () => {
    const ownerToken = 'lq_sess_matrix_owner';
    const memberToken = 'lq_sess_matrix_member';
    const crossToken = 'lq_sess_matrix_cross';
    const repository = tenantRepository({
      authSessions: [
        authSession('usr_api_owner', ownerToken),
        authSession('usr_api_member', memberToken),
        authSession('usr_api_cross', crossToken, 'wk_api_other'),
      ],
    });
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(NOW),
    });

    const forgedBody = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${WORKSPACE_ID}/invitations`,
      headers: {
        authorization: `Bearer ${memberToken}`,
        'x-lodariq-role': 'owner',
      },
      payload: { email: 'new@example.com', role: 'member', actorRole: 'owner' },
    });
    expect(forgedBody.statusCode).toBe(400);

    const forgedHeader = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${WORKSPACE_ID}/invitations`,
      headers: {
        authorization: `Bearer ${memberToken}`,
        'x-lodariq-role': 'owner',
        'x-lodariq-workspace-id': WORKSPACE_ID,
      },
      payload: { email: 'new@example.com', role: 'member' },
    });
    expect(forgedHeader.statusCode).toBe(403);

    const crossWorkspace = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WORKSPACE_ID}/members`,
      headers: {
        authorization: `Bearer ${crossToken}`,
        'x-lodariq-role': 'owner',
        'x-lodariq-workspace-id': WORKSPACE_ID,
      },
    });
    expect(crossWorkspace.statusCode).toBe(403);

    const ownerList = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WORKSPACE_ID}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerList.statusCode).toBe(200);
    await app.close();
  });

  it('rejects cross-origin mutation and protects the final owner', async () => {
    const ownerToken = 'lq_sess_final_owner';
    const repository = tenantRepository({
      authSessions: [authSession('usr_api_owner', ownerToken)],
    });
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(NOW),
    });

    const crossOrigin = await app.inject({
      method: 'DELETE',
      url: `/v1/workspaces/${WORKSPACE_ID}/members/usr_api_member`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      },
    });
    expect(crossOrigin.statusCode).toBe(403);

    const finalOwner = await app.inject({
      method: 'DELETE',
      url: `/v1/workspaces/${WORKSPACE_ID}/members/usr_api_owner`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(finalOwner.statusCode).toBe(409);
    expect(finalOwner.json<{ error: string }>().error).toBe('final_owner_required');
    await app.close();
  });
});

function tenantRepository(overrides: InMemoryControlPlaneSeed = {}) {
  const users = [
    user('usr_api_owner', 'owner@example.com'),
    user('usr_api_member', 'member@example.com'),
    user('usr_api_invitee', 'invitee@example.com'),
    user('usr_api_cross', 'cross@example.com'),
  ];
  return createInMemoryControlPlaneRepository({
    users,
    userEmails: users.map((record, index) => ({
      id: `email_api_tenant_${index}_${'e'.repeat(20)}`,
      userId: record.id,
      normalizedEmail: record.email,
      isPrimary: true,
      verifiedAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    })),
    workspaces: [
      {
        id: WORKSPACE_ID,
        name: 'API tenant',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      {
        id: 'wk_api_other',
        name: 'Other tenant',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    workspaceMemberships: [
      {
        workspaceId: WORKSPACE_ID,
        userId: 'usr_api_owner',
        role: 'owner',
        createdAt: NOW.toISOString(),
      },
      {
        workspaceId: WORKSPACE_ID,
        userId: 'usr_api_member',
        role: 'member',
        createdAt: NOW.toISOString(),
      },
      {
        workspaceId: 'wk_api_other',
        userId: 'usr_api_cross',
        role: 'owner',
        createdAt: NOW.toISOString(),
      },
    ],
    ...overrides,
  });
}

function user(id: string, email: string) {
  return {
    id,
    legacyIdentityId: null,
    email,
    name: id,
    emailVerifiedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
  };
}

function authSession(
  userId: string,
  rawToken: string,
  activeWorkspaceId: string | null = WORKSPACE_ID,
): AuthSessionRecord {
  return {
    id: `authsess_${userId}_${'s'.repeat(20)}`,
    userId,
    tokenHash: hashAuthSessionToken(rawToken),
    activeWorkspaceId,
    identityId: null,
    authenticationMethod: 'password',
    assuranceLevel: 'aal1',
    authenticatedAt: NOW.toISOString(),
    durationPolicy: 'standard',
    createdAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    idleExpiresAt: '2026-09-01T00:00:00.000Z',
    absoluteExpiresAt: '2026-10-01T00:00:00.000Z',
    revokedAt: null,
  };
}
