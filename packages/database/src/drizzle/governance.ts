import { and, eq } from 'drizzle-orm';
import {
  validateGovernanceCapabilityProfileGrant,
  type ControlPlaneRole,
  type TenantAuditEventType,
} from '@lodariq/schema';
import type {
  AssignGovernanceCapabilityProfileInput,
  AssignWorkspaceGovernanceCapabilityProfileInput,
  CreateGovernanceCapabilityProfileInput,
  DeleteGovernanceCapabilityProfileInput,
  GovernanceCapabilityProfileAssignmentRecord,
  GovernanceCapabilityProfileRecord,
  GovernanceMutationResult,
  RemoveGovernanceCapabilityProfileAssignmentInput,
  RemoveWorkspaceGovernanceCapabilityProfileAssignmentInput,
  ResolvedGovernanceCapabilityProfile,
  UpdateGovernanceCapabilityProfileInput,
  WorkspaceGovernanceCapabilityProfileAssignmentRecord,
} from '../domains/governance';
import type { TenantReadResult } from '../domains/tenant-administration';
import {
  environments,
  governanceCapabilityProfileAssignments,
  governanceCapabilityProfiles,
  governanceAuditEvents,
  workspaceMemberships,
  workspaceGovernanceCapabilityProfileAssignments,
} from '../schema';
import type { LodariqTransaction } from './types';
import { toIsoString } from './helpers';
import { isUniqueConstraintViolation } from './helpers/theme';
import { DrizzleRepositoryDeliveryOrchestration } from './delivery-orchestration';

export class DrizzleRepositoryGovernance extends DrizzleRepositoryDeliveryOrchestration {
  async listGovernanceCapabilityProfiles(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<GovernanceCapabilityProfileRecord[]>> {
    return this.actorScoped(workspaceId, actorUserId, async (tx) => {
      if (!canManageGovernance(await governanceMembershipRole(tx, workspaceId, actorUserId))) {
        return { status: 'forbidden' };
      }
      const rows = await tx
        .select()
        .from(governanceCapabilityProfiles)
        .where(eq(governanceCapabilityProfiles.workspaceId, workspaceId))
        .orderBy(governanceCapabilityProfiles.name, governanceCapabilityProfiles.id);
      return { status: 'ok', value: rows.map(profileRecord) };
    });
  }

  async createGovernanceCapabilityProfile(
    input: CreateGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<GovernanceCapabilityProfileRecord>> {
    if (
      !validateGovernanceCapabilityProfileGrant(input.profile.baseRole, input.profile.capabilities)
    ) {
      return { status: 'invalid_capabilities' };
    }
    try {
      return await this.actorScoped(input.profile.workspaceId, input.actorUserId, async (tx) => {
        if (
          !canManageGovernance(
            await governanceMembershipRole(tx, input.profile.workspaceId, input.actorUserId),
          )
        ) {
          return { status: 'forbidden' };
        }
        const [created] = await tx
          .insert(governanceCapabilityProfiles)
          .values({
            id: input.profile.id,
            workspaceId: input.profile.workspaceId,
            name: input.profile.name,
            baseRole: input.profile.baseRole,
            capabilities: [...input.profile.capabilities],
            revision: input.profile.revision,
            createdByUserId: input.profile.createdByUserId,
            createdAt: new Date(input.profile.createdAt),
            updatedAt: new Date(input.profile.updatedAt),
          })
          .returning();
        if (!created) return { status: 'conflict' };
        await appendGovernanceAudit(tx, input.auditEventId, {
          workspaceId: input.profile.workspaceId,
          actorUserId: input.actorUserId,
          eventType: 'capability_profile_created',
          resourceId: input.profile.id,
          occurredAt: input.profile.createdAt,
        });
        return { status: 'completed', value: profileRecord(created) };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async updateGovernanceCapabilityProfile(
    input: UpdateGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<GovernanceCapabilityProfileRecord>> {
    try {
      return await this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
        if (
          !canManageGovernance(
            await governanceMembershipRole(tx, input.workspaceId, input.actorUserId),
          )
        ) {
          return { status: 'forbidden' };
        }
        const [current] = await tx
          .select()
          .from(governanceCapabilityProfiles)
          .where(
            and(
              eq(governanceCapabilityProfiles.workspaceId, input.workspaceId),
              eq(governanceCapabilityProfiles.id, input.profileId),
            ),
          )
          .limit(1)
          .for('update');
        if (!current) return { status: 'not_found' };
        if (current.revision !== input.expectedRevision) return { status: 'conflict' };
        if (!validateGovernanceCapabilityProfileGrant(role(current.baseRole), input.capabilities)) {
          return { status: 'invalid_capabilities' };
        }
        const [updated] = await tx
          .update(governanceCapabilityProfiles)
          .set({
            name: input.name,
            capabilities: [...input.capabilities],
            revision: current.revision + 1,
            updatedAt: new Date(input.updatedAt),
          })
          .where(
            and(
              eq(governanceCapabilityProfiles.workspaceId, input.workspaceId),
              eq(governanceCapabilityProfiles.id, input.profileId),
              eq(governanceCapabilityProfiles.revision, input.expectedRevision),
            ),
          )
          .returning();
        if (!updated) return { status: 'conflict' };
        await appendGovernanceAudit(tx, input.auditEventId, {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          eventType: 'capability_profile_updated',
          resourceId: input.profileId,
          occurredAt: input.updatedAt,
        });
        return { status: 'completed', value: profileRecord(updated) };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async deleteGovernanceCapabilityProfile(
    input: DeleteGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult> {
    try {
      return await this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
        if (
          !canManageGovernance(
            await governanceMembershipRole(tx, input.workspaceId, input.actorUserId),
          )
        ) {
          return { status: 'forbidden' };
        }
        const [deleted] = await tx
          .delete(governanceCapabilityProfiles)
          .where(
            and(
              eq(governanceCapabilityProfiles.workspaceId, input.workspaceId),
              eq(governanceCapabilityProfiles.id, input.profileId),
            ),
          )
          .returning({ id: governanceCapabilityProfiles.id });
        if (!deleted) return { status: 'not_found' };
        await appendGovernanceAudit(tx, input.auditEventId, {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          eventType: 'capability_profile_deleted',
          resourceId: input.profileId,
          occurredAt: input.occurredAt,
        });
        return { status: 'completed', value: undefined as never };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error) || foreignKeyViolation(error)) {
        return { status: 'conflict' };
      }
      throw error;
    }
  }

  async assignGovernanceCapabilityProfile(
    input: AssignGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<GovernanceCapabilityProfileAssignmentRecord>> {
    const assignment = input.assignment;
    try {
      return await this.actorScoped(assignment.workspaceId, input.actorUserId, async (tx) => {
        if (
          !canManageGovernance(
            await governanceMembershipRole(tx, assignment.workspaceId, input.actorUserId),
          )
        ) {
          return { status: 'forbidden' };
        }
        const [profile, targetRole, environment, current] = await Promise.all([
          tx
            .select()
            .from(governanceCapabilityProfiles)
            .where(
              and(
                eq(governanceCapabilityProfiles.workspaceId, assignment.workspaceId),
                eq(governanceCapabilityProfiles.id, assignment.profileId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0]),
          governanceMembershipRole(tx, assignment.workspaceId, assignment.userId),
          tx
            .select({ id: environments.id })
            .from(environments)
            .where(
              and(
                eq(environments.workspaceId, assignment.workspaceId),
                eq(environments.id, assignment.environmentId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0]),
          tx
            .select()
            .from(governanceCapabilityProfileAssignments)
            .where(
              and(
                eq(governanceCapabilityProfileAssignments.workspaceId, assignment.workspaceId),
                eq(governanceCapabilityProfileAssignments.environmentId, assignment.environmentId),
                eq(governanceCapabilityProfileAssignments.userId, assignment.userId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0]),
        ]);
        if (!profile || !targetRole || !environment) return { status: 'not_found' };
        if (role(profile.baseRole) !== targetRole) return { status: 'base_role_mismatch' };
        if (current) {
          return current.profileId === assignment.profileId
            ? { status: 'completed', value: assignmentRecord(current) }
            : { status: 'conflict' };
        }
        const [created] = await tx
          .insert(governanceCapabilityProfileAssignments)
          .values({
            workspaceId: assignment.workspaceId,
            environmentId: assignment.environmentId,
            userId: assignment.userId,
            profileId: assignment.profileId,
            assignedByUserId: assignment.assignedByUserId,
            assignedAt: new Date(assignment.assignedAt),
          })
          .returning();
        if (!created) return { status: 'conflict' };
        await appendGovernanceAudit(tx, input.auditEventId, {
          workspaceId: assignment.workspaceId,
          actorUserId: input.actorUserId,
          eventType: 'capability_profile_assigned',
          targetUserId: assignment.userId,
          environmentId: assignment.environmentId,
          resourceId: assignment.profileId,
          occurredAt: assignment.assignedAt,
        });
        return { status: 'completed', value: assignmentRecord(created) };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async removeGovernanceCapabilityProfileAssignment(
    input: RemoveGovernanceCapabilityProfileAssignmentInput,
  ): Promise<GovernanceMutationResult> {
    return this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
      if (
        !canManageGovernance(
          await governanceMembershipRole(tx, input.workspaceId, input.actorUserId),
        )
      ) {
        return { status: 'forbidden' };
      }
      const [deleted] = await tx
        .delete(governanceCapabilityProfileAssignments)
        .where(
          and(
            eq(governanceCapabilityProfileAssignments.workspaceId, input.workspaceId),
            eq(governanceCapabilityProfileAssignments.environmentId, input.environmentId),
            eq(governanceCapabilityProfileAssignments.userId, input.userId),
          ),
        )
        .returning();
      if (!deleted) return { status: 'not_found' };
      await appendGovernanceAudit(tx, input.auditEventId, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        eventType: 'capability_profile_unassigned',
        targetUserId: input.userId,
        environmentId: input.environmentId,
        resourceId: deleted.profileId,
        occurredAt: input.occurredAt,
      });
      return { status: 'completed', value: undefined as never };
    });
  }

  async resolveGovernanceCapabilityProfile(
    workspaceId: string,
    environmentId: string,
    userId: string,
  ): Promise<ResolvedGovernanceCapabilityProfile | null> {
    return this.actorScoped(workspaceId, userId, async (tx) => {
      const resolvedRole = await governanceMembershipRole(tx, workspaceId, userId);
      if (!resolvedRole) return null;
      const [assignment] = await tx
        .select()
        .from(governanceCapabilityProfileAssignments)
        .where(
          and(
            eq(governanceCapabilityProfileAssignments.workspaceId, workspaceId),
            eq(governanceCapabilityProfileAssignments.environmentId, environmentId),
            eq(governanceCapabilityProfileAssignments.userId, userId),
          ),
        )
        .limit(1);
      if (!assignment) return { membershipRole: resolvedRole, profile: null };
      const [profile] = await tx
        .select()
        .from(governanceCapabilityProfiles)
        .where(
          and(
            eq(governanceCapabilityProfiles.workspaceId, workspaceId),
            eq(governanceCapabilityProfiles.id, assignment.profileId),
          ),
        )
        .limit(1);
      return { membershipRole: resolvedRole, profile: profile ? profileRecord(profile) : null };
    });
  }

  async assignWorkspaceGovernanceCapabilityProfile(
    input: AssignWorkspaceGovernanceCapabilityProfileInput,
  ): Promise<GovernanceMutationResult<WorkspaceGovernanceCapabilityProfileAssignmentRecord>> {
    const assignment = input.assignment;
    try {
      return await this.actorScoped(assignment.workspaceId, input.actorUserId, async (tx) => {
        if (
          !canManageGovernance(
            await governanceMembershipRole(tx, assignment.workspaceId, input.actorUserId),
          )
        ) {
          return { status: 'forbidden' };
        }
        const [profile, targetRole, current] = await Promise.all([
          tx
            .select()
            .from(governanceCapabilityProfiles)
            .where(
              and(
                eq(governanceCapabilityProfiles.workspaceId, assignment.workspaceId),
                eq(governanceCapabilityProfiles.id, assignment.profileId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0]),
          governanceMembershipRole(tx, assignment.workspaceId, assignment.userId),
          tx
            .select()
            .from(workspaceGovernanceCapabilityProfileAssignments)
            .where(
              and(
                eq(
                  workspaceGovernanceCapabilityProfileAssignments.workspaceId,
                  assignment.workspaceId,
                ),
                eq(workspaceGovernanceCapabilityProfileAssignments.userId, assignment.userId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0]),
        ]);
        if (!profile || !targetRole) return { status: 'not_found' };
        if (role(profile.baseRole) !== targetRole) return { status: 'base_role_mismatch' };
        if (current) {
          return current.profileId === assignment.profileId
            ? { status: 'completed', value: workspaceAssignmentRecord(current) }
            : { status: 'conflict' };
        }
        const [created] = await tx
          .insert(workspaceGovernanceCapabilityProfileAssignments)
          .values({
            workspaceId: assignment.workspaceId,
            userId: assignment.userId,
            profileId: assignment.profileId,
            assignedByUserId: assignment.assignedByUserId,
            assignedAt: new Date(assignment.assignedAt),
          })
          .returning();
        if (!created) return { status: 'conflict' };
        await appendGovernanceAudit(tx, input.auditEventId, {
          workspaceId: assignment.workspaceId,
          actorUserId: input.actorUserId,
          eventType: 'capability_profile_assigned',
          targetUserId: assignment.userId,
          resourceId: assignment.profileId,
          occurredAt: assignment.assignedAt,
        });
        return { status: 'completed', value: workspaceAssignmentRecord(created) };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async removeWorkspaceGovernanceCapabilityProfileAssignment(
    input: RemoveWorkspaceGovernanceCapabilityProfileAssignmentInput,
  ): Promise<GovernanceMutationResult> {
    return this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
      if (
        !canManageGovernance(
          await governanceMembershipRole(tx, input.workspaceId, input.actorUserId),
        )
      ) {
        return { status: 'forbidden' };
      }
      const [deleted] = await tx
        .delete(workspaceGovernanceCapabilityProfileAssignments)
        .where(
          and(
            eq(workspaceGovernanceCapabilityProfileAssignments.workspaceId, input.workspaceId),
            eq(workspaceGovernanceCapabilityProfileAssignments.userId, input.userId),
          ),
        )
        .returning();
      if (!deleted) return { status: 'not_found' };
      await appendGovernanceAudit(tx, input.auditEventId, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        eventType: 'capability_profile_unassigned',
        targetUserId: input.userId,
        resourceId: deleted.profileId,
        occurredAt: input.occurredAt,
      });
      return { status: 'completed', value: undefined as never };
    });
  }

  async resolveWorkspaceGovernanceCapabilityProfile(
    workspaceId: string,
    userId: string,
  ): Promise<ResolvedGovernanceCapabilityProfile | null> {
    return this.actorScoped(workspaceId, userId, async (tx) => {
      const resolvedRole = await governanceMembershipRole(tx, workspaceId, userId);
      if (!resolvedRole) return null;
      const [assignment] = await tx
        .select()
        .from(workspaceGovernanceCapabilityProfileAssignments)
        .where(
          and(
            eq(workspaceGovernanceCapabilityProfileAssignments.workspaceId, workspaceId),
            eq(workspaceGovernanceCapabilityProfileAssignments.userId, userId),
          ),
        )
        .limit(1);
      if (!assignment) return { membershipRole: resolvedRole, profile: null };
      const [profile] = await tx
        .select()
        .from(governanceCapabilityProfiles)
        .where(
          and(
            eq(governanceCapabilityProfiles.workspaceId, workspaceId),
            eq(governanceCapabilityProfiles.id, assignment.profileId),
          ),
        )
        .limit(1);
      return { membershipRole: resolvedRole, profile: profile ? profileRecord(profile) : null };
    });
  }
}

function profileRecord(
  row: typeof governanceCapabilityProfiles.$inferSelect,
): GovernanceCapabilityProfileRecord {
  return {
    schemaVersion: '1',
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    baseRole: role(row.baseRole),
    capabilities: [...row.capabilities],
    revision: row.revision,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function assignmentRecord(
  row: typeof governanceCapabilityProfileAssignments.$inferSelect,
): GovernanceCapabilityProfileAssignmentRecord {
  return {
    workspaceId: row.workspaceId,
    environmentId: row.environmentId,
    userId: row.userId,
    profileId: row.profileId,
    assignedByUserId: row.assignedByUserId,
    assignedAt: toIsoString(row.assignedAt),
  };
}

function workspaceAssignmentRecord(
  row: typeof workspaceGovernanceCapabilityProfileAssignments.$inferSelect,
): WorkspaceGovernanceCapabilityProfileAssignmentRecord {
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    profileId: row.profileId,
    assignedByUserId: row.assignedByUserId,
    assignedAt: toIsoString(row.assignedAt),
  };
}

export async function governanceMembershipRole(
  tx: LodariqTransaction,
  workspaceId: string,
  userId: string,
): Promise<ControlPlaneRole | null> {
  const [membership] = await tx
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .limit(1);
  return membership ? role(membership.role) : null;
}

function role(value: string): ControlPlaneRole {
  if (value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer') {
    return value;
  }
  throw new Error('invalid governance base role');
}

export function canManageGovernance(value: ControlPlaneRole | null): boolean {
  return value === 'owner' || value === 'admin';
}

async function appendGovernanceAudit(
  tx: LodariqTransaction,
  id: string,
  input: {
    workspaceId: string;
    actorUserId: string;
    eventType: TenantAuditEventType;
    targetUserId?: string;
    environmentId?: string;
    resourceId?: string;
    occurredAt: string;
  },
): Promise<void> {
  await tx.insert(governanceAuditEvents).values({
    id,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    targetUserId: input.targetUserId ?? null,
    environmentId: input.environmentId ?? null,
    resourceId: input.resourceId ?? null,
    occurredAt: new Date(input.occurredAt),
  });
}

function foreignKeyViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object') return false;
    if ('code' in current && current.code === '23503') return true;
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}
