import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_WORKSPACES_PER_USER,
  createDefaultControlPlaneEnvironments,
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type ControlPlaneRepository,
  type InMemoryControlPlaneSeed,
} from '@lodariq/database';

const NOW = '2026-08-15T10:00:00.000Z';
const LATER = '2026-08-15T10:01:00.000Z';
const EXPIRES = '2026-08-22T10:00:00.000Z';
const WORKSPACE_ID = 'wk_tenant_admin';
const SECOND_WORKSPACE_ID = 'wk_other_tenant';

describe('@lodariq/database tenant administration', () => {
  it('enforces the owner/admin/member/viewer/removed/cross-workspace capability matrix', async () => {
    const repository = createTenantRepository();

    for (const actor of ['usr_owner', 'usr_admin', 'usr_member', 'usr_viewer']) {
      await expect(repository.listWorkspaceMembers(WORKSPACE_ID, actor)).resolves.toMatchObject({
        status: 'ok',
        value: expect.any(Array),
      });
    }
    await expect(repository.listWorkspaceMembers(WORKSPACE_ID, 'usr_removed')).resolves.toEqual({
      status: 'forbidden',
    });
    await expect(repository.listWorkspaceMembers(WORKSPACE_ID, 'usr_cross')).resolves.toEqual({
      status: 'forbidden',
    });

    await expect(
      repository.createWorkspaceInvitation(
        invitationInput('owner', 'usr_owner', 'owner-invite@example.com', 'admin'),
      ),
    ).resolves.toMatchObject({ status: 'created' });
    await expect(
      repository.createWorkspaceInvitation(
        invitationInput('admin', 'usr_admin', 'admin-invite@example.com', 'member'),
      ),
    ).resolves.toMatchObject({ status: 'created' });
    await expect(
      repository.createWorkspaceInvitation(
        invitationInput('admin-escalation', 'usr_admin', 'escalate@example.com', 'admin'),
      ),
    ).resolves.toEqual({ status: 'forbidden' });
    for (const actor of ['usr_member', 'usr_viewer', 'usr_removed', 'usr_cross']) {
      await expect(
        repository.createWorkspaceInvitation(
          invitationInput(actor, actor, `${actor}@example.com`, 'member'),
        ),
      ).resolves.toEqual({ status: 'forbidden' });
    }
  });

  it('accepts a verified-email invitation once and stores only the supplied digest', async () => {
    const repository = createTenantRepository();
    const rawToken = `lq_invite_${'a'.repeat(43)}`;
    const tokenHash = sha256(rawToken);
    const input = invitationInput(
      'accept',
      'usr_owner',
      'invitee@example.com',
      'member',
      tokenHash,
    );

    await expect(repository.createWorkspaceInvitation(input)).resolves.toMatchObject({
      status: 'created',
    });
    await expect(
      repository.acceptWorkspaceInvitation({
        invitationId: input.invitation.id,
        tokenHash,
        userId: 'usr_invitee',
        acceptedAt: LATER,
        eventId: tenantEventId('accepted'),
      }),
    ).resolves.toEqual({ status: 'accepted', workspaceId: WORKSPACE_ID, role: 'member' });
    await expect(
      repository.acceptWorkspaceInvitation({
        invitationId: input.invitation.id,
        tokenHash,
        userId: 'usr_invitee',
        acceptedAt: '2026-08-15T10:02:00.000Z',
        eventId: tenantEventId('replay'),
      }),
    ).resolves.toEqual({ status: 'invalid_or_expired' });
    await expect(
      repository.resolveWorkspaceMembership(WORKSPACE_ID, 'usr_invitee'),
    ).resolves.toMatchObject({
      role: 'member',
    });

    const audit = await repository.listTenantAuditEvents(WORKSPACE_ID, 'usr_owner');
    expect(audit).toMatchObject({ status: 'ok' });
    if (audit.status !== 'ok') throw new Error('Expected tenant audit history');
    expect(audit.value.map(({ eventType }) => eventType)).toEqual([
      'invitation_created',
      'invitation_accepted',
    ]);
    expect(JSON.stringify(audit.value)).not.toContain(rawToken);
  });

  it('protects role hierarchy and the final owner while revoking downgraded sessions', async () => {
    const adminTokenHash = sha256('admin-session-token');
    const repository = createTenantRepository({
      authSessions: [authSession('usr_admin', adminTokenHash, WORKSPACE_ID)],
    });

    await expect(
      repository.updateWorkspaceMemberRole({
        workspaceId: WORKSPACE_ID,
        targetUserId: 'usr_admin',
        actorUserId: 'usr_admin',
        nextRole: 'member',
        changedAt: LATER,
        eventId: tenantEventId('admin-self'),
      }),
    ).resolves.toBe('forbidden');
    await expect(
      repository.updateWorkspaceMemberRole({
        workspaceId: WORKSPACE_ID,
        targetUserId: 'usr_owner',
        actorUserId: 'usr_owner',
        nextRole: 'admin',
        changedAt: LATER,
        eventId: tenantEventId('final-owner'),
      }),
    ).resolves.toBe('final_owner');
    await expect(
      repository.updateWorkspaceMemberRole({
        workspaceId: WORKSPACE_ID,
        targetUserId: 'usr_admin',
        actorUserId: 'usr_owner',
        nextRole: 'member',
        changedAt: LATER,
        eventId: tenantEventId('admin-downgrade'),
      }),
    ).resolves.toBe('completed');
    await expect(repository.resolveAuthSession(adminTokenHash, LATER)).resolves.toBeNull();
    await expect(
      repository.removeWorkspaceMember({
        workspaceId: WORKSPACE_ID,
        targetUserId: 'usr_owner',
        actorUserId: 'usr_owner',
        removedAt: LATER,
        eventId: tenantEventId('owner-remove'),
      }),
    ).resolves.toBe('final_owner');
  });

  it('transfers ownership atomically and soft-deletes with a bounded recovery window', async () => {
    const ownerTokenHash = sha256('owner-session-token');
    const repository = createTenantRepository({
      authSessions: [authSession('usr_owner', ownerTokenHash, WORKSPACE_ID)],
    });

    await expect(
      repository.transferWorkspaceOwnership({
        workspaceId: WORKSPACE_ID,
        actorUserId: 'usr_owner',
        targetUserId: 'usr_member',
        transferredAt: LATER,
        eventId: tenantEventId('transfer'),
      }),
    ).resolves.toBe('completed');
    await expect(repository.resolveAuthSession(ownerTokenHash, LATER)).resolves.toBeNull();
    await expect(
      repository.resolveWorkspaceMembership(WORKSPACE_ID, 'usr_member'),
    ).resolves.toMatchObject({
      role: 'owner',
    });

    const deletionAt = '2026-08-15T11:00:00.000Z';
    const retentionExpiresAt = '2026-09-14T11:00:00.000Z';
    await expect(
      repository.scheduleWorkspaceDeletion({
        workspaceId: WORKSPACE_ID,
        actorUserId: 'usr_member',
        changedAt: deletionAt,
        retentionExpiresAt,
        eventId: tenantEventId('delete'),
      }),
    ).resolves.toEqual({
      status: 'completed',
      deletion: { workspaceId: WORKSPACE_ID, deletedAt: deletionAt, retentionExpiresAt },
    });
    await expect(repository.listIdentityWorkspaces('usr_member')).resolves.toEqual([]);
    await expect(
      repository.resolveWorkspaceMembership(WORKSPACE_ID, 'usr_member'),
    ).resolves.toBeNull();
    await expect(
      repository.cancelWorkspaceDeletion({
        workspaceId: WORKSPACE_ID,
        actorUserId: 'usr_member',
        changedAt: '2026-08-16T11:00:00.000Z',
        eventId: tenantEventId('cancel-delete'),
      }),
    ).resolves.toBe('completed');
    await expect(
      repository.resolveWorkspaceMembership(WORKSPACE_ID, 'usr_member'),
    ).resolves.toMatchObject({
      role: 'owner',
    });
  });

  it('caps active owned workspaces while excluding invited and soft-deleted tenants', async () => {
    const workspaces = Array.from({ length: MAX_ACTIVE_WORKSPACES_PER_USER }, (_, index) => ({
      id: `wk_quota_${index}`,
      name: `Quota ${index}`,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: index === 0 ? NOW : null,
      retentionExpiresAt: index === 0 ? EXPIRES : null,
    }));
    const repository = createTenantRepository({
      workspaces,
      workspaceMemberships: workspaces.map((workspace) => ({
        workspaceId: workspace.id,
        userId: 'usr_owner',
        role: 'owner',
        createdAt: NOW,
      })),
    });
    const workspaceId = 'wk_quota_new';
    await expect(
      repository.createIdentityWorkspace({
        userId: 'usr_owner',
        workspace: {
          id: workspaceId,
          name: 'Allowed fifth active',
          createdAt: NOW,
          updatedAt: NOW,
        },
        membership: { workspaceId, userId: 'usr_owner', role: 'owner', createdAt: NOW },
        environments: createDefaultControlPlaneEnvironments(workspaceId),
      }),
    ).resolves.toBe(true);
    await expect(
      repository.createIdentityWorkspace({
        userId: 'usr_owner',
        workspace: {
          id: 'wk_quota_blocked',
          name: 'Blocked sixth',
          createdAt: NOW,
          updatedAt: NOW,
        },
        membership: {
          workspaceId: 'wk_quota_blocked',
          userId: 'usr_owner',
          role: 'owner',
          createdAt: NOW,
        },
        environments: createDefaultControlPlaneEnvironments('wk_quota_blocked'),
      }),
    ).resolves.toBe(false);
  });
});

function createTenantRepository(overrides: InMemoryControlPlaneSeed = {}): ControlPlaneRepository {
  const users = [
    user('usr_owner', 'owner@example.com'),
    user('usr_admin', 'admin@example.com'),
    user('usr_member', 'member@example.com'),
    user('usr_viewer', 'viewer@example.com'),
    user('usr_removed', 'removed@example.com'),
    user('usr_cross', 'cross@example.com'),
    user('usr_invitee', 'invitee@example.com'),
  ];
  const defaultWorkspaces = [
    workspace(WORKSPACE_ID, 'Tenant workspace'),
    workspace(SECOND_WORKSPACE_ID, 'Other workspace'),
  ];
  return createInMemoryControlPlaneRepository({
    users,
    userEmails: users.map((record, index) => ({
      id: `email_tenant_${index}_${'x'.repeat(20)}`,
      userId: record.id,
      normalizedEmail: record.email,
      isPrimary: true,
      verifiedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })),
    workspaces: overrides.workspaces ?? defaultWorkspaces,
    workspaceMemberships: overrides.workspaceMemberships ?? [
      membership('usr_owner', 'owner'),
      membership('usr_admin', 'admin'),
      membership('usr_member', 'member'),
      membership('usr_viewer', 'viewer'),
      {
        workspaceId: SECOND_WORKSPACE_ID,
        userId: 'usr_cross',
        role: 'owner',
        createdAt: NOW,
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
    emailVerifiedAt: NOW,
    createdAt: NOW,
  };
}

function workspace(id: string, name: string) {
  return { id, name, createdAt: NOW, updatedAt: NOW };
}

function membership(userId: string, role: 'owner' | 'admin' | 'member' | 'viewer') {
  return { workspaceId: WORKSPACE_ID, userId, role, createdAt: NOW };
}

function invitationInput(
  suffix: string,
  actorUserId: string,
  email: string,
  role: 'admin' | 'member' | 'viewer',
  tokenHash = sha256(`invitation-${suffix}`),
) {
  return {
    invitation: {
      id: `invite_${safeSuffix(suffix)}_${'i'.repeat(20)}`,
      workspaceId: WORKSPACE_ID,
      emailNormalized: email,
      emailLookupHash: sha256(email),
      tokenHash,
      role,
      invitedByUserId: actorUserId,
      expiresAt: EXPIRES,
      acceptedAt: null,
      revokedAt: null,
      createdAt: NOW,
    },
    outbox: {
      id: `outbox_${safeSuffix(suffix)}_${'o'.repeat(20)}`,
      keyId: 'test',
      acceptancePath: '/accept-invitation',
    },
    eventId: tenantEventId(`created-${suffix}`),
  } as const;
}

function tenantEventId(suffix: string): string {
  return `tenevt_${safeSuffix(suffix)}_${'e'.repeat(20)}`;
}

function safeSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, '_');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function authSession(userId: string, tokenHash: string, workspaceId: string): AuthSessionRecord {
  return {
    id: `authsess_${safeSuffix(userId)}_${'s'.repeat(20)}`,
    userId,
    tokenHash,
    activeWorkspaceId: workspaceId,
    identityId: null,
    authenticationMethod: 'password',
    assuranceLevel: 'aal1',
    authenticatedAt: NOW,
    durationPolicy: 'standard',
    createdAt: NOW,
    lastSeenAt: NOW,
    idleExpiresAt: '2026-09-01T00:00:00.000Z',
    absoluteExpiresAt: '2026-10-01T00:00:00.000Z',
    revokedAt: null,
  };
}
