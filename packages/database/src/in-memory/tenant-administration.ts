import {
  isTenantRoleDowngrade,
  tenantRoleHasCapability,
  type ControlPlaneRole,
  type WorkspaceInvitationRole,
} from '@lodariq/schema';
import type {
  AcceptWorkspaceInvitationInput,
  AcceptWorkspaceInvitationResult,
  CancelWorkspaceDeletionInput,
  CreateWorkspaceInvitationInput,
  CreateWorkspaceInvitationResult,
  RemoveWorkspaceMemberInput,
  RevokeWorkspaceInvitationInput,
  ScheduleWorkspaceDeletionResult,
  TenantAuditEventRecord,
  TenantMutationResult,
  TenantReadResult,
  TransferWorkspaceOwnershipInput,
  UpdateWorkspaceMemberRoleInput,
  WorkspaceDeletionInput,
  WorkspaceMemberRecord,
  WorkspaceInvitationSummaryRecord,
} from '../domains/tenant-administration';
import { clone } from '../domains/in-memory-helpers';
import {
  assertCommercialFeature,
  CommercialEntitlementError,
} from '../domains/commercial-entitlements';
import { InMemoryRepositoryIdentitySessions } from './identity-sessions';

interface InMemoryMembership {
  userId: string;
  role: ControlPlaneRole;
}

export class InMemoryRepositoryTenantAdministration extends InMemoryRepositoryIdentitySessions {
  async listWorkspaceMembers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<WorkspaceMemberRecord[]>> {
    const context = this.resolveTenantActor(workspaceId, actorUserId);
    if (!context) return { status: 'forbidden' };
    if (context.deletedAt) return { status: 'not_found' };
    if (!tenantRoleHasCapability(context.role, 'members:read')) return { status: 'forbidden' };
    const members = [...this.workspaceMemberships.values()]
      .filter((membership) => membership.workspaceId === workspaceId)
      .flatMap((membership) => {
        const role = controlPlaneRole(membership.role);
        const user = this.users.get(membership.userId);
        const email = [...this.userEmails.values()].find(
          (candidate) => candidate.userId === membership.userId && candidate.isPrimary,
        );
        return role && user && email
          ? [
              {
                workspaceId,
                userId: membership.userId,
                name: user.name ?? null,
                email: email.normalizedEmail,
                role,
                joinedAt: membership.createdAt,
              },
            ]
          : [];
      })
      .sort(
        (left, right) =>
          left.joinedAt.localeCompare(right.joinedAt) || left.userId.localeCompare(right.userId),
      );
    return { status: 'ok', value: clone(members) };
  }

  async listWorkspaceInvitations(
    workspaceId: string,
    actorUserId: string,
    now: string,
  ): Promise<TenantReadResult<WorkspaceInvitationSummaryRecord[]>> {
    const context = this.resolveTenantActor(workspaceId, actorUserId);
    if (!context) return { status: 'forbidden' };
    if (context.deletedAt) return { status: 'not_found' };
    if (!tenantRoleHasCapability(context.role, 'invitations:manage')) {
      return { status: 'forbidden' };
    }
    const invitations = [...this.workspaceInvitations.values()]
      .filter(
        (invitation) =>
          invitation.workspaceId === workspaceId &&
          invitation.acceptedAt === null &&
          invitation.revokedAt === null &&
          invitation.expiresAt > now,
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
      )
      .map((invitation) => ({
        id: invitation.id,
        workspaceId,
        email: invitation.emailNormalized,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      }));
    return { status: 'ok', value: clone(invitations) };
  }

  async createWorkspaceInvitation(
    input: CreateWorkspaceInvitationInput,
  ): Promise<CreateWorkspaceInvitationResult> {
    if (!isValidInvitationInput(input)) return { status: 'invalid_input' };
    const invitation = input.invitation;
    const context = this.resolveTenantActor(invitation.workspaceId, invitation.invitedByUserId);
    if (!context) return { status: 'forbidden' };
    if (context.deletedAt) return { status: 'not_found' };
    if (!tenantRoleHasCapability(context.role, 'invitations:manage')) {
      return { status: 'forbidden' };
    }
    if (context.role === 'admin' && invitation.role === 'admin') {
      return { status: 'forbidden' };
    }
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(invitation.workspaceId).entitlements,
      'roles',
    );
    const existingUser = [...this.userEmails.values()].find(
      (email) => email.isPrimary && email.normalizedEmail === invitation.emailNormalized,
    );
    if (
      existingUser &&
      this.workspaceMemberships.has(this.key(invitation.workspaceId, existingUser.userId))
    ) {
      return { status: 'conflict' };
    }
    if (
      this.workspaceInvitations.has(invitation.id) ||
      this.workspaceInvitationOutbox.has(input.outbox.id) ||
      [...this.workspaceInvitations.values()].some(
        (candidate) => candidate.tokenHash === invitation.tokenHash,
      ) ||
      this.tenantAuditEvents.has(input.eventId)
    ) {
      return { status: 'conflict' };
    }
    for (const [id, current] of this.workspaceInvitations) {
      if (
        current.workspaceId === invitation.workspaceId &&
        current.emailLookupHash === invitation.emailLookupHash &&
        current.acceptedAt === null &&
        current.revokedAt === null
      ) {
        if (current.expiresAt > invitation.createdAt) return { status: 'conflict' };
        this.workspaceInvitations.set(id, { ...current, revokedAt: invitation.createdAt });
      }
    }
    this.workspaceInvitations.set(invitation.id, clone(invitation));
    this.workspaceInvitationOutbox.set(input.outbox.id, {
      id: input.outbox.id,
      type: 'workspace_invitation',
      workspaceId: invitation.workspaceId,
      invitationId: invitation.id,
      recipientEmail: invitation.emailNormalized,
      payload: {
        purpose: 'workspace_invitation',
        invitationId: invitation.id,
        acceptancePath: input.outbox.acceptancePath,
        keyId: input.outbox.keyId,
      },
      availableAt: invitation.createdAt,
      processedAt: null,
      attempts: 0,
      leaseVersion: 0,
      lastError: null,
      terminalAt: null,
      createdAt: invitation.createdAt,
    });
    this.appendTenantAuditEvent({
      id: input.eventId,
      workspaceId: invitation.workspaceId,
      actorUserId: invitation.invitedByUserId,
      eventType: 'invitation_created',
      targetUserId: null,
      invitationId: invitation.id,
      previousRole: null,
      nextRole: invitation.role,
      occurredAt: invitation.createdAt,
    });
    return { status: 'created', invitationId: invitation.id };
  }

  async acceptWorkspaceInvitation(
    input: AcceptWorkspaceInvitationInput,
  ): Promise<AcceptWorkspaceInvitationResult> {
    if (!isValidAcceptInvitationInput(input)) return { status: 'invalid_or_expired' };
    const invitation = this.workspaceInvitations.get(input.invitationId);
    if (
      !invitation ||
      invitation.tokenHash !== input.tokenHash ||
      invitation.acceptedAt !== null ||
      invitation.revokedAt !== null ||
      invitation.expiresAt <= input.acceptedAt
    ) {
      return { status: 'invalid_or_expired' };
    }
    const matchingEmail = [...this.userEmails.values()].some(
      (email) =>
        email.userId === input.userId &&
        email.isPrimary &&
        email.verifiedAt !== null &&
        email.normalizedEmail === invitation.emailNormalized,
    );
    if (!matchingEmail) return { status: 'invalid_or_expired' };
    const workspace = this.workspaces.get(invitation.workspaceId);
    if (!workspace || workspace.deletedAt) return { status: 'invalid_or_expired' };
    const membershipKey = this.key(invitation.workspaceId, input.userId);
    if (this.workspaceMemberships.has(membershipKey)) return { status: 'membership_conflict' };
    if (this.tenantAuditEvents.has(input.eventId)) return { status: 'membership_conflict' };
    if (invitation.role !== 'viewer') {
      try {
        this.assertCreatorSeatAvailable(invitation.workspaceId);
      } catch (error) {
        if (!(error instanceof CommercialEntitlementError)) throw error;
        return { status: 'seat_limit_reached' };
      }
    }

    this.workspaceMemberships.set(membershipKey, {
      workspaceId: invitation.workspaceId,
      userId: input.userId,
      role: invitation.role,
      createdAt: input.acceptedAt,
    });
    this.workspaceInvitations.set(invitation.id, {
      ...invitation,
      acceptedAt: input.acceptedAt,
    });
    this.appendTenantAuditEvent({
      id: input.eventId,
      workspaceId: invitation.workspaceId,
      actorUserId: input.userId,
      eventType: 'invitation_accepted',
      targetUserId: input.userId,
      invitationId: invitation.id,
      previousRole: null,
      nextRole: invitation.role,
      occurredAt: input.acceptedAt,
    });
    return { status: 'accepted', workspaceId: invitation.workspaceId, role: invitation.role };
  }

  async revokeWorkspaceInvitation(
    input: RevokeWorkspaceInvitationInput,
  ): Promise<TenantMutationResult> {
    const context = this.resolveTenantActor(input.workspaceId, input.actorUserId);
    if (!context) return 'forbidden';
    if (context.deletedAt) return 'not_found';
    if (!tenantRoleHasCapability(context.role, 'invitations:manage')) return 'forbidden';
    const invitation = this.workspaceInvitations.get(input.invitationId);
    if (
      !invitation ||
      invitation.workspaceId !== input.workspaceId ||
      invitation.acceptedAt !== null ||
      invitation.revokedAt !== null ||
      invitation.expiresAt <= input.revokedAt
    ) {
      return 'not_found';
    }
    if (this.tenantAuditEvents.has(input.eventId)) return 'conflict';
    this.workspaceInvitations.set(invitation.id, { ...invitation, revokedAt: input.revokedAt });
    const message = [...this.workspaceInvitationOutbox.values()].find(
      (candidate) => candidate.invitationId === invitation.id,
    );
    if (message && !message.processedAt && !message.terminalAt) {
      this.workspaceInvitationOutbox.set(message.id, {
        ...message,
        lastError: 'invitation_revoked',
        terminalAt: input.revokedAt,
      });
    }
    this.appendTenantAuditEvent({
      id: input.eventId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'invitation_revoked',
      targetUserId: null,
      invitationId: input.invitationId,
      previousRole: null,
      nextRole: null,
      occurredAt: input.revokedAt,
    });
    return 'completed';
  }

  async updateWorkspaceMemberRole(
    input: UpdateWorkspaceMemberRoleInput,
  ): Promise<TenantMutationResult> {
    const context = this.resolveTenantActor(input.workspaceId, input.actorUserId);
    if (!context) return 'forbidden';
    if (context.deletedAt) return 'not_found';
    if (!tenantRoleHasCapability(context.role, 'members:manage')) return 'forbidden';
    const memberships = this.listMemberships(input.workspaceId);
    const target = memberships.find(({ userId }) => userId === input.targetUserId);
    if (!target) return 'not_found';
    if (target.role === input.nextRole) return 'completed';
    if (!canManageTargetRole(context.role, target.role, input.nextRole)) return 'forbidden';
    if (target.role === 'owner' && ownerCount(memberships) <= 1) return 'final_owner';
    if (target.userId === input.actorUserId) return 'forbidden';
    if (this.tenantAuditEvents.has(input.eventId)) return 'conflict';
    if (target.role === 'viewer' && input.nextRole !== 'viewer') {
      try {
        this.assertCreatorSeatAvailable(input.workspaceId);
      } catch (error) {
        if (!(error instanceof CommercialEntitlementError)) throw error;
        return 'seat_limit_reached';
      }
    }

    const key = this.key(input.workspaceId, input.targetUserId);
    const current = this.workspaceMemberships.get(key);
    if (!current) return 'not_found';
    this.workspaceMemberships.set(key, { ...current, role: input.nextRole });
    if (isTenantRoleDowngrade(target.role, input.nextRole)) {
      this.revokePrincipalAccess(input.workspaceId, input.targetUserId, input.changedAt);
    }
    this.appendTenantAuditEvent({
      id: input.eventId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'membership_role_changed',
      targetUserId: input.targetUserId,
      invitationId: null,
      previousRole: target.role,
      nextRole: input.nextRole,
      occurredAt: input.changedAt,
    });
    return 'completed';
  }

  async removeWorkspaceMember(input: RemoveWorkspaceMemberInput): Promise<TenantMutationResult> {
    const context = this.resolveTenantActor(input.workspaceId, input.actorUserId);
    if (!context) return 'forbidden';
    if (context.deletedAt) return 'not_found';
    if (!tenantRoleHasCapability(context.role, 'members:manage')) return 'forbidden';
    const memberships = this.listMemberships(input.workspaceId);
    const target = memberships.find(({ userId }) => userId === input.targetUserId);
    if (!target) return 'not_found';
    if (!canManageTargetRole(context.role, target.role, null)) return 'forbidden';
    if (target.role === 'owner' && ownerCount(memberships) <= 1) return 'final_owner';
    if (this.tenantAuditEvents.has(input.eventId)) return 'conflict';

    this.appendTenantAuditEvent({
      id: input.eventId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'membership_removed',
      targetUserId: input.targetUserId,
      invitationId: null,
      previousRole: target.role,
      nextRole: null,
      occurredAt: input.removedAt,
    });
    this.revokePrincipalAccess(input.workspaceId, input.targetUserId, input.removedAt);
    this.workspaceMemberships.delete(this.key(input.workspaceId, input.targetUserId));
    return 'completed';
  }

  async transferWorkspaceOwnership(
    input: TransferWorkspaceOwnershipInput,
  ): Promise<TenantMutationResult> {
    if (input.actorUserId === input.targetUserId) return 'conflict';
    const context = this.resolveTenantActor(input.workspaceId, input.actorUserId);
    if (!context) return 'forbidden';
    if (context.deletedAt) return 'not_found';
    if (!tenantRoleHasCapability(context.role, 'ownership:transfer')) return 'forbidden';
    const memberships = this.listMemberships(input.workspaceId);
    const actor = memberships.find(({ userId }) => userId === input.actorUserId);
    const target = memberships.find(({ userId }) => userId === input.targetUserId);
    if (!actor || actor.role !== 'owner') return 'forbidden';
    if (!target) return 'not_found';
    if (target.role === 'owner' || this.tenantAuditEvents.has(input.eventId)) return 'conflict';

    const actorKey = this.key(input.workspaceId, input.actorUserId);
    const targetKey = this.key(input.workspaceId, input.targetUserId);
    const actorMembership = this.workspaceMemberships.get(actorKey);
    const targetMembership = this.workspaceMemberships.get(targetKey);
    if (!actorMembership || !targetMembership) return 'conflict';
    this.workspaceMemberships.set(actorKey, { ...actorMembership, role: 'admin' });
    this.workspaceMemberships.set(targetKey, { ...targetMembership, role: 'owner' });
    this.revokePrincipalAccess(input.workspaceId, input.actorUserId, input.transferredAt);
    this.appendTenantAuditEvent({
      id: input.eventId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'ownership_transferred',
      targetUserId: input.targetUserId,
      invitationId: null,
      previousRole: target.role,
      nextRole: 'owner',
      occurredAt: input.transferredAt,
    });
    return 'completed';
  }

  async scheduleWorkspaceDeletion(
    input: WorkspaceDeletionInput,
  ): Promise<ScheduleWorkspaceDeletionResult> {
    const context = this.resolveTenantActor(input.workspaceId, input.actorUserId);
    if (!context) return { status: 'forbidden' };
    if (!tenantRoleHasCapability(context.role, 'workspace:delete')) {
      return { status: 'forbidden' };
    }
    if (
      context.deletedAt ||
      input.retentionExpiresAt <= input.changedAt ||
      this.tenantAuditEvents.has(input.eventId)
    ) {
      return { status: 'conflict' };
    }
    const workspace = this.workspaces.get(input.workspaceId);
    if (!workspace) return { status: 'not_found' };
    this.workspaces.set(input.workspaceId, {
      ...workspace,
      deletedAt: input.changedAt,
      retentionExpiresAt: input.retentionExpiresAt,
      updatedAt: input.changedAt,
    });
    for (const membership of this.listMemberships(input.workspaceId)) {
      this.revokePrincipalAccess(input.workspaceId, membership.userId, input.changedAt);
    }
    this.appendTenantAuditEvent({
      id: input.eventId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'workspace_deletion_scheduled',
      targetUserId: null,
      invitationId: null,
      previousRole: null,
      nextRole: null,
      occurredAt: input.changedAt,
    });
    return {
      status: 'completed',
      deletion: {
        workspaceId: input.workspaceId,
        deletedAt: input.changedAt,
        retentionExpiresAt: input.retentionExpiresAt,
      },
    };
  }

  async cancelWorkspaceDeletion(
    input: CancelWorkspaceDeletionInput,
  ): Promise<TenantMutationResult> {
    const context = this.resolveTenantActor(input.workspaceId, input.actorUserId);
    if (!context) return 'forbidden';
    if (!tenantRoleHasCapability(context.role, 'workspace:delete')) return 'forbidden';
    if (
      !context.deletedAt ||
      !context.retentionExpiresAt ||
      context.retentionExpiresAt <= input.changedAt ||
      this.tenantAuditEvents.has(input.eventId)
    ) {
      return 'conflict';
    }
    const workspace = this.workspaces.get(input.workspaceId);
    if (!workspace) return 'not_found';
    this.workspaces.set(input.workspaceId, {
      ...workspace,
      deletedAt: null,
      retentionExpiresAt: null,
      updatedAt: input.changedAt,
    });
    this.appendTenantAuditEvent({
      id: input.eventId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: 'workspace_deletion_cancelled',
      targetUserId: null,
      invitationId: null,
      previousRole: null,
      nextRole: null,
      occurredAt: input.changedAt,
    });
    return 'completed';
  }

  async listTenantAuditEvents(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<TenantAuditEventRecord[]>> {
    const context = this.resolveTenantActor(workspaceId, actorUserId);
    if (!context) return { status: 'forbidden' };
    if (!tenantRoleHasCapability(context.role, 'members:read')) return { status: 'forbidden' };
    const events = [...this.tenantAuditEvents.values()]
      .filter((event) => event.workspaceId === workspaceId)
      .sort(
        (left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
      );
    return { status: 'ok', value: clone(events) };
  }

  private resolveTenantActor(workspaceId: string, actorUserId: string) {
    const workspace = this.workspaces.get(workspaceId);
    const membership = this.workspaceMemberships.get(this.key(workspaceId, actorUserId));
    const role = controlPlaneRole(membership?.role ?? null);
    return workspace && role ? { ...workspace, role } : null;
  }

  private listMemberships(workspaceId: string): InMemoryMembership[] {
    return [...this.workspaceMemberships.values()]
      .filter((membership) => membership.workspaceId === workspaceId)
      .flatMap((membership) => {
        const role = controlPlaneRole(membership.role);
        return role ? [{ userId: membership.userId, role }] : [];
      });
  }

  private revokePrincipalAccess(workspaceId: string, userId: string, revokedAt: string): void {
    for (const [key, session] of this.identitySessions) {
      if (session.userId === userId && session.revokedAt === null) {
        this.identitySessions.set(key, { ...session, activeWorkspaceId: null, revokedAt });
      }
    }
    for (const [key, grant] of this.authoringActivationGrants) {
      if (grant.workspaceId === workspaceId && grant.creatorId === userId && !grant.revokedAt) {
        this.authoringActivationGrants.set(key, { ...grant, revokedAt });
      }
    }
    for (const [key, session] of this.authoringSessions) {
      if (
        session.workspaceId === workspaceId &&
        session.createdByUserId === userId &&
        !session.revokedAt
      ) {
        this.authoringSessions.set(key, { ...session, revokedAt });
      }
    }
  }

  private appendTenantAuditEvent(event: TenantAuditEventRecord): void {
    if (this.tenantAuditEvents.has(event.id)) throw new Error('Tenant audit event is immutable');
    this.tenantAuditEvents.set(event.id, clone(event));
  }
}

function controlPlaneRole(value: string | null): ControlPlaneRole | null {
  return value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer'
    ? value
    : null;
}

function ownerCount(memberships: readonly InMemoryMembership[]): number {
  return memberships.filter(({ role }) => role === 'owner').length;
}

function canManageTargetRole(
  actorRole: ControlPlaneRole,
  targetRole: ControlPlaneRole,
  nextRole: WorkspaceInvitationRole | null,
): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole !== 'admin') return false;
  if (targetRole === 'owner' || targetRole === 'admin') return false;
  return nextRole !== 'admin';
}

function isValidInvitationInput(input: CreateWorkspaceInvitationInput): boolean {
  const { invitation } = input;
  return (
    /^invite_[A-Za-z0-9_-]{20,}$/u.test(invitation.id) &&
    /^tenevt_[A-Za-z0-9_-]{20,}$/u.test(input.eventId) &&
    /^outbox_[A-Za-z0-9_-]{20,}$/u.test(input.outbox.id) &&
    /^[a-z0-9][a-z0-9_-]{0,31}$/u.test(input.outbox.keyId) &&
    input.outbox.acceptancePath === '/accept-invitation' &&
    /^[0-9a-f]{64}$/u.test(invitation.emailLookupHash) &&
    /^[0-9a-f]{64}$/u.test(invitation.tokenHash) &&
    invitation.emailNormalized === invitation.emailNormalized.trim().toLowerCase() &&
    Number.isFinite(Date.parse(invitation.createdAt)) &&
    Number.isFinite(Date.parse(invitation.expiresAt)) &&
    invitation.createdAt < invitation.expiresAt
  );
}

function isValidAcceptInvitationInput(input: AcceptWorkspaceInvitationInput): boolean {
  return (
    /^invite_[A-Za-z0-9_-]{20,}$/u.test(input.invitationId) &&
    /^tenevt_[A-Za-z0-9_-]{20,}$/u.test(input.eventId) &&
    /^[0-9a-f]{64}$/u.test(input.tokenHash) &&
    Number.isFinite(Date.parse(input.acceptedAt))
  );
}
