import { and, eq } from 'drizzle-orm';
import {
  type UpdateEnvironmentReleasePolicyInput,
  type UpdateWorkspaceEnvironmentPolicyInput,
  EnvironmentReleasePolicyChangedError,
  assertValidWorkspaceEnvironmentPolicy,
  type WorkspaceEnvironment,
  assertRequiredApprovalCount,
  normalizeIsoTimestamp,
  normalizeWorkspaceEnvironments,
} from '../repository';
import { environments } from '../schema';
import { toWorkspaceEnvironment, toIsoString } from './helpers';
import { DrizzleRepositoryPromotion } from './promotion';

export class DrizzleRepositoryEnvironments extends DrizzleRepositoryPromotion {
  async listEnvironments(workspaceId: string): Promise<WorkspaceEnvironment[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(environments)
        .where(eq(environments.workspaceId, workspaceId))
        .orderBy(environments.pipelinePosition);

      const normalized = normalizeWorkspaceEnvironments(rows.map(toWorkspaceEnvironment));
      if (normalized.length > 0) {
        assertValidWorkspaceEnvironmentPolicy(workspaceId, normalized);
      }
      return normalized;
    });
  }

  async updateEnvironmentReleasePolicy(
    input: UpdateEnvironmentReleasePolicyInput,
  ): Promise<WorkspaceEnvironment | null> {
    assertRequiredApprovalCount(input.requiredApprovalCount);
    const expectedUpdatedAt = normalizeIsoTimestamp(
      input.expectedUpdatedAt,
      'environment release policy expectedUpdatedAt',
    );
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1)
        .for('update');
      if (!current) return null;
      const actualUpdatedAt = toIsoString(current.updatedAt);
      if (actualUpdatedAt !== expectedUpdatedAt) {
        throw new EnvironmentReleasePolicyChangedError(expectedUpdatedAt, actualUpdatedAt);
      }
      const [updated] = await tx
        .update(environments)
        .set({
          requiredApprovalCount: input.requiredApprovalCount,
          releasePolicy: {
            ...normalizeWorkspaceEnvironments([toWorkspaceEnvironment(current)])[0]!.releasePolicy,
            requiredApprovalCount: input.requiredApprovalCount,
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
            eq(environments.updatedAt, current.updatedAt),
          ),
        )
        .returning();
      if (!updated) throw new Error('environment release policy update failed');
      return toWorkspaceEnvironment(updated);
    });
  }

  async updateWorkspaceEnvironmentPolicy(
    input: UpdateWorkspaceEnvironmentPolicyInput,
  ): Promise<WorkspaceEnvironment | null> {
    const expectedUpdatedAt = normalizeIsoTimestamp(
      input.expectedUpdatedAt,
      'workspace environment policy expectedUpdatedAt',
    );
    return this.scoped(input.workspaceId, async (tx) => {
      const currentRows = await tx
        .select()
        .from(environments)
        .where(eq(environments.workspaceId, input.workspaceId))
        .orderBy(environments.kind)
        .for('update');
      const current = currentRows.find((row) => row.id === input.environmentId);
      if (!current) return null;
      const actualUpdatedAt = toIsoString(current.updatedAt);
      if (actualUpdatedAt !== expectedUpdatedAt) {
        throw new EnvironmentReleasePolicyChangedError(expectedUpdatedAt, actualUpdatedAt);
      }
      const candidate: WorkspaceEnvironment = {
        ...toWorkspaceEnvironment(current),
        name: input.name,
        originAllowlist: [...input.originAllowlist],
        requiredApprovalCount: input.releasePolicy.requiredApprovalCount,
        enabled: input.enabled,
        pipelinePosition: input.pipelinePosition,
        authoringEnabled: input.authoringEnabled,
        ...(input.promotionSourceEnvironmentId
          ? { promotionSourceEnvironmentId: input.promotionSourceEnvironmentId }
          : {}),
        releasePolicy: input.releasePolicy,
      };
      const candidateRows = currentRows.map((row) =>
        row.id === input.environmentId ? candidate : toWorkspaceEnvironment(row),
      );
      assertValidWorkspaceEnvironmentPolicy(input.workspaceId, candidateRows);
      const [updated] = await tx
        .update(environments)
        .set({
          name: input.name,
          originAllowlist: [...input.originAllowlist],
          requiredApprovalCount: input.releasePolicy.requiredApprovalCount,
          enabled: input.enabled,
          pipelinePosition: input.pipelinePosition,
          authoringEnabled: input.authoringEnabled,
          promotionSourceEnvironmentId: input.promotionSourceEnvironmentId ?? null,
          releasePolicy: input.releasePolicy,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
            eq(environments.updatedAt, current.updatedAt),
          ),
        )
        .returning();
      if (!updated) throw new Error('workspace environment policy update failed');
      return (
        normalizeWorkspaceEnvironments([
          ...candidateRows.filter((environment) => environment.id !== input.environmentId),
          toWorkspaceEnvironment(updated),
        ]).find((environment) => environment.id === input.environmentId) ?? null
      );
    });
  }
}
