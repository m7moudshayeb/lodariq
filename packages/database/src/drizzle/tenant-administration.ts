import { and, asc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import {
  isTenantRoleDowngrade,
  tenantRoleHasCapability,
  type ControlPlaneRole,
  type TenantAuditEventType,
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
import {
  authSessions,
  authoringActivationGrants,
  authoringSessions,
  tenantAuditEvents,
  userEmails,
  users,
  workspaceInvitations,
  workspaceInvitationOutbox,
  workspaceMemberships,
  workspaces,
} from '../schema';
import {
  LODARIQ_AUTH_USER_ID_SETTING,
  LODARIQ_WORKSPACE_ID_SETTING,
  runWithTenantActorScope,
  runWithWorkspaceInvitationScope,
} from '../scoped-transaction';
import { identityWorkspaceRole, isUniqueConstraintViolation, toIsoString } from './helpers';
import { DrizzleRepositoryIdentitySessions } from './identity-sessions';
import type { LodariqTransaction } from './types';

interface WorkspaceActorContext {
  role: ControlPlaneRole;
  deletedAt: Date | null;
  retentionExpiresAt: Date | null;
}

interface LockedMembership {
  userId: string;
  role: ControlPlaneRole;
}

class InvitationAcceptanceConflict extends Error {}

export class DrizzleRepositoryTenantAdministration extends DrizzleRepositoryIdentitySessions {
  async listWorkspaceMembers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<WorkspaceMemberRecord[]>> {
    return runWithTenantActorScope(this.database, workspaceId, actorUserId, async (tx) => {
      const context = await this.resolveWorkspaceActor(tx, workspaceId, actorUserId);
      if (!context) return this.workspaceExists(tx, workspaceId, false);
      if (context.deletedAt || !tenantRoleHasCapability(context.role, 'members:read')) {
        return { status: context.deletedAt ? 'not_found' : 'forbidden' };
      }
      const rows = await tx
        .select({
          workspaceId: workspaceMemberships.workspaceId,
          userId: workspaceMemberships.userId,
          name: users.name,
          email: userEmails.normalizedEmail,
          role: workspaceMemberships.role,
          joinedAt: workspaceMemberships.createdAt,
        })
        .from(workspaceMemberships)
        .innerJoin(users, eq(users.id, workspaceMemberships.userId))
        .innerJoin(userEmails, and(eq(userEmails.userId, users.id), eq(userEmails.isPrimary, true)))
        .where(eq(workspaceMemberships.workspaceId, workspaceId))
        .orderBy(asc(workspaceMemberships.createdAt), asc(workspaceMemberships.userId));
      const members = rows.flatMap((row) => {
        const role = identityWorkspaceRole(row.role);
        return role
          ? [
              {
                workspaceId: row.workspaceId,
                userId: row.userId,
                name: row.name,
                email: row.email,
                role,
                joinedAt: toIsoString(row.joinedAt),
              },
            ]
          : [];
      });
      return { status: 'ok', value: members };
    });
  }

  async listWorkspaceInvitations(
    workspaceId: string,
    actorUserId: string,
    now: string,
  ): Promise<TenantReadResult<WorkspaceInvitationSummaryRecord[]>> {
    return runWithTenantActorScope(this.database, workspaceId, actorUserId, async (tx) => {
      const context = await this.resolveWorkspaceActor(tx, workspaceId, actorUserId);
      if (!context) return this.workspaceExists(tx, workspaceId, false);
      if (context.deletedAt) return { status: 'not_found' };
      if (!tenantRoleHasCapability(context.role, 'invitations:manage')) {
        return { status: 'forbidden' };
      }
      const rows = await tx
        .select({
          id: workspaceInvitations.id,
          workspaceId: workspaceInvitations.workspaceId,
          email: workspaceInvitations.emailNormalized,
          role: workspaceInvitations.role,
          expiresAt: workspaceInvitations.expiresAt,
          createdAt: workspaceInvitations.createdAt,
        })
        .from(workspaceInvitations)
        .where(
          and(
            eq(workspaceInvitations.workspaceId, workspaceId),
            isNull(workspaceInvitations.acceptedAt),
            isNull(workspaceInvitations.revokedAt),
            sql`${workspaceInvitations.expiresAt} > ${new Date(now)}`,
          ),
        )
        .orderBy(asc(workspaceInvitations.createdAt), asc(workspaceInvitations.id));
      return {
        status: 'ok',
        value: rows.flatMap((row) => {
          const role = invitationRole(row.role);
          return role
            ? [
                {
                  ...row,
                  role,
                  expiresAt: toIsoString(row.expiresAt),
                  createdAt: toIsoString(row.createdAt),
                },
              ]
            : [];
        }),
      };
    });
  }

  async createWorkspaceInvitation(
    input: CreateWorkspaceInvitationInput,
  ): Promise<CreateWorkspaceInvitationResult> {
    if (!isValidInvitationInput(input)) return { status: 'invalid_input' };
    try {
      return await runWithTenantActorScope(
        this.database,
        input.invitation.workspaceId,
        input.invitation.invitedByUserId,
        async (tx) => {
          const { workspaceId, invitedByUserId, role } = input.invitation;
          const context = await this.resolveWorkspaceActor(tx, workspaceId, invitedByUserId, true);
          if (!context) {
            return (await this.workspaceExists(
              tx,
              workspaceId,
              false,
            )) as CreateWorkspaceInvitationResult;
          }
          if (context.deletedAt) return { status: 'not_found' };
          if (!tenantRoleHasCapability(context.role, 'invitations:manage')) {
            return { status: 'forbidden' };
          }
          if (context.role === 'admin' && role === 'admin') return { status: 'forbidden' };

          const [existingMember] = await tx
            .select({ userId: workspaceMemberships.userId })
            .from(workspaceMemberships)
            .innerJoin(
              userEmails,
              and(
                eq(userEmails.userId, workspaceMemberships.userId),
                eq(userEmails.isPrimary, true),
              ),
            )
            .where(
              and(
                eq(workspaceMemberships.workspaceId, workspaceId),
                eq(userEmails.normalizedEmail, input.invitation.emailNormalized),
              ),
            )
            .limit(1);
          if (existingMember) return { status: 'conflict' };

          const createdAt = new Date(input.invitation.createdAt);
          await tx
            .update(workspaceInvitations)
            .set({ revokedAt: createdAt })
            .where(
              and(
                eq(workspaceInvitations.workspaceId, workspaceId),
                eq(workspaceInvitations.emailLookupHash, input.invitation.emailLookupHash),
                isNull(workspaceInvitations.acceptedAt),
                isNull(workspaceInvitations.revokedAt),
                lte(workspaceInvitations.expiresAt, createdAt),
              ),
            );
          await tx.insert(workspaceInvitations).values({
            id: input.invitation.id,
            workspaceId,
            emailNormalized: input.invitation.emailNormalized,
            emailLookupHash: input.invitation.emailLookupHash,
            tokenHash: input.invitation.tokenHash,
            role,
            invitedByUserId,
            expiresAt: new Date(input.invitation.expiresAt),
            acceptedAt: null,
            revokedAt: null,
            createdAt,
          });
          await tx.insert(workspaceInvitationOutbox).values({
            id: input.outbox.id,
            type: 'workspace_invitation',
            workspaceId,
            invitationId: input.invitation.id,
            recipientEmail: input.invitation.emailNormalized,
            payload: {
              purpose: 'workspace_invitation',
              invitationId: input.invitation.id,
              acceptancePath: input.outbox.acceptancePath,
              keyId: input.outbox.keyId,
            },
            availableAt: createdAt,
            processedAt: null,
            attempts: 0,
            leaseVersion: 0,
            lastError: null,
            terminalAt: null,
            createdAt,
          });
          await this.insertTenantAuditEvent(tx, {
            id: input.eventId,
            workspaceId,
            actorUserId: invitedByUserId,
            eventType: 'invitation_created',
            targetUserId: null,
            invitationId: input.invitation.id,
            previousRole: null,
            nextRole: role,
            occurredAt: input.invitation.createdAt,
          });
          return { status: 'created', invitationId: input.invitation.id };
        },
      );
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async acceptWorkspaceInvitation(
    input: AcceptWorkspaceInvitationInput,
  ): Promise<AcceptWorkspaceInvitationResult> {
    if (!isValidAcceptInvitationInput(input)) return { status: 'invalid_or_expired' };
    try {
      return await runWithWorkspaceInvitationScope(
        this.database,
        input.userId,
        input.tokenHash,
        async (tx) => {
          const acceptedAt = new Date(input.acceptedAt);
          const [invitation] = await tx
            .select()
            .from(workspaceInvitations)
            .where(
              and(
                eq(workspaceInvitations.id, input.invitationId),
                eq(workspaceInvitations.tokenHash, input.tokenHash),
                isNull(workspaceInvitations.acceptedAt),
                isNull(workspaceInvitations.revokedAt),
                sql`${workspaceInvitations.expiresAt} > ${acceptedAt}`,
              ),
            )
            .limit(1);
          if (!invitation) return { status: 'invalid_or_expired' };
          const role = invitationRole(invitation.role);
          if (!role) return { status: 'invalid_or_expired' };

          await tx.execute(
            sql`select set_config(${LODARIQ_WORKSPACE_ID_SETTING}, ${invitation.workspaceId}, true)`,
          );
          const [workspace] = await tx
            .select({ id: workspaces.id, deletedAt: workspaces.deletedAt })
            .from(workspaces)
            .where(eq(workspaces.id, invitation.workspaceId))
            .limit(1);
          if (!workspace || workspace.deletedAt) return { status: 'invalid_or_expired' };
          const [existing] = await tx
            .select({ userId: workspaceMemberships.userId })
            .from(workspaceMemberships)
            .where(
              and(
                eq(workspaceMemberships.workspaceId, invitation.workspaceId),
                eq(workspaceMemberships.userId, input.userId),
              ),
            )
            .limit(1);
          if (existing) return { status: 'membership_conflict' };

          await tx.insert(workspaceMemberships).values({
            workspaceId: invitation.workspaceId,
            userId: input.userId,
            role,
            createdAt: acceptedAt,
            updatedAt: acceptedAt,
          });
          const acceptance = await tx.execute<{ accepted: boolean }>(
            sql`select public.lodariq_accept_workspace_invitation(
              ${invitation.id},
              ${input.tokenHash},
              ${input.userId},
              ${acceptedAt}
            ) as accepted`,
          );
          if (acceptance.rows[0]?.accepted !== true) {
            throw new InvitationAcceptanceConflict();
          }
          await this.insertTenantAuditEvent(tx, {
            id: input.eventId,
            workspaceId: invitation.workspaceId,
            actorUserId: input.userId,
            eventType: 'invitation_accepted',
            targetUserId: input.userId,
            invitationId: invitation.id,
            previousRole: null,
            nextRole: role,
            occurredAt: input.acceptedAt,
          });
          return { status: 'accepted', workspaceId: invitation.workspaceId, role };
        },
      );
    } catch (error) {
      if (error instanceof InvitationAcceptanceConflict) {
        return { status: 'invalid_or_expired' };
      }
      if (isUniqueConstraintViolation(error)) {
        return { status: 'membership_conflict' };
      }
      throw error;
    }
  }

  async revokeWorkspaceInvitation(
    input: RevokeWorkspaceInvitationInput,
  ): Promise<TenantMutationResult> {
    return runWithTenantActorScope(
      this.database,
      input.workspaceId,
      input.actorUserId,
      async (tx) => {
        const context = await this.resolveWorkspaceActor(
          tx,
          input.workspaceId,
          input.actorUserId,
          true,
        );
        if (!context) return this.workspaceMutationFailure(tx, input.workspaceId);
        if (context.deletedAt) return 'not_found';
        if (!tenantRoleHasCapability(context.role, 'invitations:manage')) return 'forbidden';
        const revokedAt = new Date(input.revokedAt);
        const revoked = await tx
          .update(workspaceInvitations)
          .set({ revokedAt })
          .where(
            and(
              eq(workspaceInvitations.workspaceId, input.workspaceId),
              eq(workspaceInvitations.id, input.invitationId),
              isNull(workspaceInvitations.acceptedAt),
              isNull(workspaceInvitations.revokedAt),
              sql`${workspaceInvitations.expiresAt} > ${revokedAt}`,
            ),
          )
          .returning({ id: workspaceInvitations.id });
        if (revoked.length !== 1) return 'not_found';
        await tx
          .update(workspaceInvitationOutbox)
          .set({ lastError: 'invitation_revoked', terminalAt: revokedAt })
          .where(
            and(
              eq(workspaceInvitationOutbox.invitationId, input.invitationId),
              isNull(workspaceInvitationOutbox.processedAt),
              isNull(workspaceInvitationOutbox.terminalAt),
            ),
          );
        await this.insertTenantAuditEvent(tx, {
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
      },
    );
  }

  async updateWorkspaceMemberRole(
    input: UpdateWorkspaceMemberRoleInput,
  ): Promise<TenantMutationResult> {
    return runWithTenantActorScope(
      this.database,
      input.workspaceId,
      input.actorUserId,
      async (tx) => {
        const context = await this.resolveWorkspaceActor(
          tx,
          input.workspaceId,
          input.actorUserId,
          true,
        );
        if (!context) return this.workspaceMutationFailure(tx, input.workspaceId);
        if (context.deletedAt) return 'not_found';
        if (!tenantRoleHasCapability(context.role, 'members:manage')) return 'forbidden';
        const memberships = await this.lockWorkspaceMemberships(tx, input.workspaceId);
        const target = memberships.find(({ userId }) => userId === input.targetUserId);
        if (!target) return 'not_found';
        if (target.role === input.nextRole) return 'completed';
        if (!canManageTargetRole(context.role, target.role, input.nextRole)) return 'forbidden';
        if (target.role === 'owner' && ownerCount(memberships) <= 1) return 'final_owner';
        if (target.userId === input.actorUserId) return 'forbidden';

        const changedAt = new Date(input.changedAt);
        const updated = await tx
          .update(workspaceMemberships)
          .set({ role: input.nextRole, updatedAt: changedAt })
          .where(
            and(
              eq(workspaceMemberships.workspaceId, input.workspaceId),
              eq(workspaceMemberships.userId, input.targetUserId),
              eq(workspaceMemberships.role, target.role),
            ),
          )
          .returning({ userId: workspaceMemberships.userId });
        if (updated.length !== 1) return 'conflict';
        if (isTenantRoleDowngrade(target.role, input.nextRole)) {
          await this.revokePrincipalAccess(tx, input.workspaceId, input.targetUserId, changedAt);
          await this.restoreActorScope(tx, input.actorUserId);
        }
        await this.insertTenantAuditEvent(tx, {
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
      },
    );
  }

  async removeWorkspaceMember(input: RemoveWorkspaceMemberInput): Promise<TenantMutationResult> {
    return runWithTenantActorScope(
      this.database,
      input.workspaceId,
      input.actorUserId,
      async (tx) => {
        const context = await this.resolveWorkspaceActor(
          tx,
          input.workspaceId,
          input.actorUserId,
          true,
        );
        if (!context) return this.workspaceMutationFailure(tx, input.workspaceId);
        if (context.deletedAt) return 'not_found';
        if (!tenantRoleHasCapability(context.role, 'members:manage')) return 'forbidden';
        const memberships = await this.lockWorkspaceMemberships(tx, input.workspaceId);
        const target = memberships.find(({ userId }) => userId === input.targetUserId);
        if (!target) return 'not_found';
        if (!canManageTargetRole(context.role, target.role, null)) return 'forbidden';
        if (target.role === 'owner' && ownerCount(memberships) <= 1) return 'final_owner';

        await this.insertTenantAuditEvent(tx, {
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
        const removedAt = new Date(input.removedAt);
        await this.revokePrincipalAccess(tx, input.workspaceId, input.targetUserId, removedAt);
        await this.restoreActorScope(tx, input.actorUserId);
        const removed = await tx
          .delete(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.workspaceId, input.workspaceId),
              eq(workspaceMemberships.userId, input.targetUserId),
              eq(workspaceMemberships.role, target.role),
            ),
          )
          .returning({ userId: workspaceMemberships.userId });
        return removed.length === 1 ? 'completed' : 'conflict';
      },
    );
  }

  async transferWorkspaceOwnership(
    input: TransferWorkspaceOwnershipInput,
  ): Promise<TenantMutationResult> {
    if (input.actorUserId === input.targetUserId) return 'conflict';
    return runWithTenantActorScope(
      this.database,
      input.workspaceId,
      input.actorUserId,
      async (tx) => {
        const context = await this.resolveWorkspaceActor(
          tx,
          input.workspaceId,
          input.actorUserId,
          true,
        );
        if (!context) return this.workspaceMutationFailure(tx, input.workspaceId);
        if (context.deletedAt) return 'not_found';
        if (!tenantRoleHasCapability(context.role, 'ownership:transfer')) return 'forbidden';
        const memberships = await this.lockWorkspaceMemberships(tx, input.workspaceId);
        const actor = memberships.find(({ userId }) => userId === input.actorUserId);
        const target = memberships.find(({ userId }) => userId === input.targetUserId);
        if (!actor || actor.role !== 'owner') return 'forbidden';
        if (!target) return 'not_found';
        if (target.role === 'owner') return 'conflict';

        const transferredAt = new Date(input.transferredAt);
        const promoted = await tx
          .update(workspaceMemberships)
          .set({ role: 'owner', updatedAt: transferredAt })
          .where(
            and(
              eq(workspaceMemberships.workspaceId, input.workspaceId),
              eq(workspaceMemberships.userId, input.targetUserId),
              eq(workspaceMemberships.role, target.role),
            ),
          )
          .returning({ userId: workspaceMemberships.userId });
        const demoted = await tx
          .update(workspaceMemberships)
          .set({ role: 'admin', updatedAt: transferredAt })
          .where(
            and(
              eq(workspaceMemberships.workspaceId, input.workspaceId),
              eq(workspaceMemberships.userId, input.actorUserId),
              eq(workspaceMemberships.role, 'owner'),
            ),
          )
          .returning({ userId: workspaceMemberships.userId });
        if (promoted.length !== 1 || demoted.length !== 1) return 'conflict';
        await this.revokePrincipalAccess(tx, input.workspaceId, input.actorUserId, transferredAt);
        await this.restoreActorScope(tx, input.actorUserId);
        await this.insertTenantAuditEvent(tx, {
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
      },
    );
  }

  async scheduleWorkspaceDeletion(
    input: WorkspaceDeletionInput,
  ): Promise<ScheduleWorkspaceDeletionResult> {
    return runWithTenantActorScope(
      this.database,
      input.workspaceId,
      input.actorUserId,
      async (tx) => {
        const context = await this.resolveWorkspaceActor(
          tx,
          input.workspaceId,
          input.actorUserId,
          true,
        );
        if (!context) {
          const exists = await this.workspaceExists(tx, input.workspaceId, false);
          return exists.status === 'not_found' ? { status: 'not_found' } : { status: 'forbidden' };
        }
        if (!tenantRoleHasCapability(context.role, 'workspace:delete')) {
          return { status: 'forbidden' };
        }
        if (context.deletedAt) return { status: 'conflict' };
        const deletedAt = new Date(input.changedAt);
        const retentionExpiresAt = new Date(input.retentionExpiresAt);
        if (retentionExpiresAt.getTime() <= deletedAt.getTime()) return { status: 'conflict' };

        const memberships = await this.lockWorkspaceMemberships(tx, input.workspaceId);
        const updated = await tx
          .update(workspaces)
          .set({ deletedAt, retentionExpiresAt, updatedAt: deletedAt })
          .where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.deletedAt)))
          .returning({ id: workspaces.id });
        if (updated.length !== 1) return { status: 'conflict' };
        for (const membership of memberships) {
          await this.revokePrincipalAccess(tx, input.workspaceId, membership.userId, deletedAt);
        }
        await this.restoreActorScope(tx, input.actorUserId);
        await this.insertTenantAuditEvent(tx, {
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
            deletedAt: deletedAt.toISOString(),
            retentionExpiresAt: retentionExpiresAt.toISOString(),
          },
        };
      },
    );
  }

  async cancelWorkspaceDeletion(
    input: CancelWorkspaceDeletionInput,
  ): Promise<TenantMutationResult> {
    return runWithTenantActorScope(
      this.database,
      input.workspaceId,
      input.actorUserId,
      async (tx) => {
        const context = await this.resolveWorkspaceActor(
          tx,
          input.workspaceId,
          input.actorUserId,
          true,
        );
        if (!context) return this.workspaceMutationFailure(tx, input.workspaceId);
        if (!tenantRoleHasCapability(context.role, 'workspace:delete')) return 'forbidden';
        if (!context.deletedAt || !context.retentionExpiresAt) return 'conflict';
        const changedAt = new Date(input.changedAt);
        if (context.retentionExpiresAt.getTime() <= changedAt.getTime()) return 'conflict';
        const restored = await tx
          .update(workspaces)
          .set({ deletedAt: null, retentionExpiresAt: null, updatedAt: changedAt })
          .where(
            and(
              eq(workspaces.id, input.workspaceId),
              isNotNull(workspaces.deletedAt),
              sql`${workspaces.retentionExpiresAt} > ${changedAt}`,
            ),
          )
          .returning({ id: workspaces.id });
        if (restored.length !== 1) return 'conflict';
        await this.insertTenantAuditEvent(tx, {
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
      },
    );
  }

  async listTenantAuditEvents(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<TenantAuditEventRecord[]>> {
    return runWithTenantActorScope(this.database, workspaceId, actorUserId, async (tx) => {
      const context = await this.resolveWorkspaceActor(tx, workspaceId, actorUserId);
      if (!context) return this.workspaceExists(tx, workspaceId, false);
      if (!tenantRoleHasCapability(context.role, 'members:read')) return { status: 'forbidden' };
      const rows = await tx
        .select()
        .from(tenantAuditEvents)
        .where(eq(tenantAuditEvents.workspaceId, workspaceId))
        .orderBy(asc(tenantAuditEvents.occurredAt), asc(tenantAuditEvents.id));
      return {
        status: 'ok',
        value: rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          actorUserId: row.actorUserId,
          eventType: row.eventType as TenantAuditEventType,
          targetUserId: row.targetUserId,
          invitationId: row.invitationId,
          previousRole: row.previousRole ? identityWorkspaceRole(row.previousRole) : null,
          nextRole: row.nextRole ? identityWorkspaceRole(row.nextRole) : null,
          occurredAt: toIsoString(row.occurredAt),
        })),
      };
    });
  }

  private async resolveWorkspaceActor(
    tx: LodariqTransaction,
    workspaceId: string,
    actorUserId: string,
    lock = false,
  ): Promise<WorkspaceActorContext | null> {
    const query = tx
      .select({
        role: workspaceMemberships.role,
        deletedAt: workspaces.deletedAt,
        retentionExpiresAt: workspaces.retentionExpiresAt,
      })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, actorUserId),
        ),
      )
      .limit(1);
    const [row] = lock ? await query.for('update') : await query;
    const role = row?.role ? identityWorkspaceRole(row.role) : null;
    return row && role
      ? {
          role,
          deletedAt: row.deletedAt,
          retentionExpiresAt: row.retentionExpiresAt,
        }
      : null;
  }

  private async workspaceExists(
    tx: LodariqTransaction,
    workspaceId: string,
    revealExists: boolean,
  ): Promise<{ status: 'not_found' | 'forbidden' }> {
    if (!revealExists) return { status: 'forbidden' };
    const [workspace] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return { status: workspace ? 'forbidden' : 'not_found' };
  }

  private async workspaceMutationFailure(
    tx: LodariqTransaction,
    workspaceId: string,
  ): Promise<TenantMutationResult> {
    const result = await this.workspaceExists(tx, workspaceId, false);
    return result.status;
  }

  private async lockWorkspaceMemberships(
    tx: LodariqTransaction,
    workspaceId: string,
  ): Promise<LockedMembership[]> {
    const rows = await tx
      .select({ userId: workspaceMemberships.userId, role: workspaceMemberships.role })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.workspaceId, workspaceId))
      .orderBy(asc(workspaceMemberships.userId))
      .for('update');
    return rows.flatMap((row) => {
      const role = identityWorkspaceRole(row.role);
      return role ? [{ userId: row.userId, role }] : [];
    });
  }

  private async revokePrincipalAccess(
    tx: LodariqTransaction,
    workspaceId: string,
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    await tx.execute(sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${userId}, true)`);
    await tx
      .update(authSessions)
      .set({ revokedAt, activeWorkspaceId: null })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
    await tx
      .update(authoringActivationGrants)
      .set({ revokedAt })
      .where(
        and(
          eq(authoringActivationGrants.workspaceId, workspaceId),
          eq(authoringActivationGrants.creatorId, userId),
          isNull(authoringActivationGrants.revokedAt),
        ),
      );
    await tx
      .update(authoringSessions)
      .set({ revokedAt })
      .where(
        and(
          eq(authoringSessions.workspaceId, workspaceId),
          eq(authoringSessions.createdByUserId, userId),
          isNull(authoringSessions.revokedAt),
        ),
      );
  }

  private async restoreActorScope(tx: LodariqTransaction, actorUserId: string): Promise<void> {
    await tx.execute(sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${actorUserId}, true)`);
  }

  private async insertTenantAuditEvent(
    tx: LodariqTransaction,
    event: TenantAuditEventRecord,
  ): Promise<void> {
    await tx.insert(tenantAuditEvents).values({
      id: event.id,
      workspaceId: event.workspaceId,
      actorUserId: event.actorUserId,
      eventType: event.eventType,
      targetUserId: event.targetUserId,
      invitationId: event.invitationId,
      previousRole: event.previousRole,
      nextRole: event.nextRole,
      occurredAt: new Date(event.occurredAt),
    });
  }
}

function invitationRole(value: string): WorkspaceInvitationRole | null {
  return value === 'admin' || value === 'member' || value === 'viewer' ? value : null;
}

function ownerCount(memberships: readonly LockedMembership[]): number {
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
  const createdAt = Date.parse(invitation.createdAt);
  const expiresAt = Date.parse(invitation.expiresAt);
  return (
    /^invite_[A-Za-z0-9_-]{20,}$/u.test(invitation.id) &&
    /^tenevt_[A-Za-z0-9_-]{20,}$/u.test(input.eventId) &&
    /^[0-9a-f]{64}$/u.test(invitation.emailLookupHash) &&
    /^[0-9a-f]{64}$/u.test(invitation.tokenHash) &&
    invitation.emailNormalized === invitation.emailNormalized.trim().toLowerCase() &&
    Number.isFinite(createdAt) &&
    Number.isFinite(expiresAt) &&
    createdAt < expiresAt
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
