import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  type CreatePublicationVerificationInput,
  type PublicationVerificationRecord,
  type CreateReleaseApprovalInput,
  type ReleaseApprovalRecord,
  ActivePublicationChangedError,
  EnvironmentPolicyMutationForbiddenError,
  assertEnvironmentPolicyMutationAllowed,
  assertEnvironmentPolicySnapshot,
  RELEASE_APPROVAL_REJECTED_ERROR_CODE,
  assertBrowserVerificationReport,
  normalizeReleaseApprovalReason,
  requireExactHttpOrigin,
} from '../repository';
import {
  environments,
  publications,
  publicationVerifications,
  releaseOperations,
  releaseApprovals,
  workspaceMemberships,
} from '../schema';
import {
  toWorkspaceEnvironment,
  toPublicationVerificationRecord,
  toReleaseApprovalRecord,
  hasAuthoringWorkspaceRole,
} from './helpers';
import { DrizzleRepositoryActivation } from './activation';

export class DrizzleRepositoryReleaseChecks extends DrizzleRepositoryActivation {
  async createPublicationVerification(
    input: CreatePublicationVerificationInput,
  ): Promise<PublicationVerificationRecord> {
    assertBrowserVerificationReport(input.report);
    const verifiedOrigin = requireExactHttpOrigin(input.verifiedOrigin);
    return this.scoped(input.workspaceId, async (tx) => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1)
        .for('share');
      if (!environment || !environment.enabled || environment.kind !== 'staging') {
        throw new Error('publication verification requires a staging environment');
      }
      const [verifierMembership] = await tx
        .select({ role: workspaceMemberships.role })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, input.workspaceId),
            eq(workspaceMemberships.userId, input.actorUserId),
          ),
        )
        .limit(1)
        .for('share');
      if (!verifierMembership || !hasAuthoringWorkspaceRole(verifierMembership.role)) {
        throw new Error('publication verifier is not a workspace member');
      }
      if (!environment.originAllowlist.includes(verifiedOrigin)) {
        throw new Error('publication verification origin is not allowlisted for the environment');
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock(
          hashtext(${`${input.workspaceId}:${input.environmentId}`}),
          hashtext(${input.documentId})
        )`,
      );
      const deployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.environmentId,
        input.documentId,
      );
      const actualPublicationId =
        deployment?.state === 'active' ? deployment.activePublicationId : null;
      if (actualPublicationId !== input.expectedPublicationId) {
        throw new ActivePublicationChangedError(input.expectedPublicationId, actualPublicationId);
      }
      const publication = deployment ? await this.loadDeploymentPublication(tx, deployment) : null;
      if (!publication || publication.id !== input.expectedPublicationId) {
        throw new ActivePublicationChangedError(input.expectedPublicationId, actualPublicationId);
      }
      const compiled = publication.artifact.compiled;
      if (
        !('rendererContractVersion' in compiled) ||
        input.report.rendererContractVersion !== compiled.rendererContractVersion
      ) {
        throw new Error('publication verification renderer contract must match the exact artifact');
      }
      const [verification] = await tx
        .insert(publicationVerifications)
        .values({
          id: `pubverify_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          publicationId: publication.id,
          result: input.report.status === 'failed' ? 'failed' : 'passed',
          report: input.report,
          verifiedOrigin,
          verifiedByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .returning();
      if (!verification) throw new Error('failed to create publication verification');
      return toPublicationVerificationRecord(verification);
    });
  }

  async listPublicationVerifications(
    workspaceId: string,
    publicationId: string,
  ): Promise<PublicationVerificationRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(publicationVerifications)
        .where(
          and(
            eq(publicationVerifications.workspaceId, workspaceId),
            eq(publicationVerifications.publicationId, publicationId),
          ),
        )
        .orderBy(desc(publicationVerifications.createdAt), desc(publicationVerifications.id));
      return rows.map(toPublicationVerificationRecord);
    });
  }

  async createReleaseApproval(input: CreateReleaseApprovalInput): Promise<ReleaseApprovalRecord> {
    if (input.decision !== 'approved' && input.decision !== 'rejected') {
      throw new Error('release approval decision must be approved or rejected');
    }
    const reason = normalizeReleaseApprovalReason(input.reason);
    return this.scoped(input.workspaceId, async (tx) => {
      const [approverMembership] = await tx
        .select({ role: workspaceMemberships.role })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, input.workspaceId),
            eq(workspaceMemberships.userId, input.actorUserId),
          ),
        )
        .limit(1)
        .for('share');
      if (
        !approverMembership ||
        (approverMembership.role !== 'owner' && approverMembership.role !== 'admin')
      ) {
        throw new Error('release approver is not a workspace member');
      }
      const [operationSnapshot] = await tx
        .select()
        .from(releaseOperations)
        .where(
          and(
            eq(releaseOperations.workspaceId, input.workspaceId),
            eq(releaseOperations.id, input.releaseOperationId),
          ),
        )
        .limit(1);
      if (!operationSnapshot || operationSnapshot.action !== 'promote') {
        throw new Error('promotion release operation not found in workspace');
      }
      const sourcePublicationRows = operationSnapshot.sourcePublicationId
        ? await tx
            .select({ environmentId: publications.environmentId })
            .from(publications)
            .where(
              and(
                eq(publications.workspaceId, input.workspaceId),
                eq(publications.id, operationSnapshot.sourcePublicationId),
              ),
            )
            .limit(1)
        : [];
      const sourcePublication = sourcePublicationRows[0];
      const environmentIds = [
        operationSnapshot.environmentId,
        ...(sourcePublication ? [sourcePublication.environmentId] : []),
      ];
      const environmentRows = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            inArray(environments.id, environmentIds),
          ),
        )
        .for('share');
      const targetEnvironment = environmentRows.find(
        (environment) => environment.id === operationSnapshot.environmentId,
      );
      const sourceEnvironment = environmentRows.find(
        (environment) => environment.id === sourcePublication?.environmentId,
      );
      if (!targetEnvironment) throw new Error('promotion target environment not found');
      await this.lockSortedReleaseDocumentEnvironments(
        tx,
        input.workspaceId,
        operationSnapshot.documentId,
        environmentIds,
      );
      const [operation] = await tx
        .select()
        .from(releaseOperations)
        .where(
          and(
            eq(releaseOperations.workspaceId, input.workspaceId),
            eq(releaseOperations.id, input.releaseOperationId),
          ),
        )
        .limit(1)
        .for('update');
      if (!operation || operation.action !== 'promote') {
        throw new Error('promotion release operation not found in workspace');
      }
      const [existingApproval] = await tx
        .select()
        .from(releaseApprovals)
        .where(
          and(
            eq(releaseApprovals.workspaceId, input.workspaceId),
            eq(releaseApprovals.releaseOperationId, operation.id),
            eq(releaseApprovals.decidedByUserId, input.actorUserId),
          ),
        )
        .limit(1);
      if (
        operation.status === 'failed' &&
        operation.errorCode === RELEASE_APPROVAL_REJECTED_ERROR_CODE &&
        existingApproval?.decision === input.decision &&
        existingApproval.reason === reason
      ) {
        return toReleaseApprovalRecord(existingApproval);
      }
      if (operation.status !== 'awaiting_approval') {
        throw new Error('release operation is not awaiting approval');
      }
      if (
        operation.environmentId !== operationSnapshot.environmentId ||
        operation.sourcePublicationId !== operationSnapshot.sourcePublicationId
      ) {
        throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
      }
      if (input.decision === 'approved' && !operation.requestedByUserId) {
        throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
      }
      let targetPolicy = assertEnvironmentPolicySnapshot(
        toWorkspaceEnvironment(targetEnvironment),
        input.expectedEnvironmentPolicyUpdatedAt,
      );
      if (input.decision === 'approved') {
        if (!sourcePublication || !sourceEnvironment?.enabled) {
          throw new EnvironmentPolicyMutationForbiddenError('promotion_source_mismatch');
        }
        targetPolicy = assertEnvironmentPolicyMutationAllowed(
          toWorkspaceEnvironment(targetEnvironment),
          {
            action: 'promote',
            sourceEnvironmentId: sourcePublication.environmentId,
            expectedUpdatedAt: input.expectedEnvironmentPolicyUpdatedAt,
          },
        );
        const [requesterMembership] = await tx
          .select({ role: workspaceMemberships.role })
          .from(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.workspaceId, input.workspaceId),
              eq(workspaceMemberships.userId, operation.requestedByUserId!),
            ),
          )
          .limit(1)
          .for('share');
        if (
          !requesterMembership ||
          !targetPolicy.releasePolicy.publisherRoles.some(
            (role) => role === requesterMembership.role,
          )
        ) {
          throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
        }
      }
      if (
        input.decision === 'approved' &&
        targetPolicy.releasePolicy.separationOfDuties.requireSeparateApprover &&
        input.actorUserId === operation.requestedByUserId
      ) {
        throw new EnvironmentPolicyMutationForbiddenError('separation_of_duties_required');
      }
      if (existingApproval) {
        if (existingApproval.decision === input.decision && existingApproval.reason === reason) {
          return toReleaseApprovalRecord(existingApproval);
        }
        throw new Error('release approver already recorded an immutable decision');
      }
      const [approval] = await tx
        .insert(releaseApprovals)
        .values({
          id: `relapproval_${randomUUID()}`,
          workspaceId: input.workspaceId,
          releaseOperationId: operation.id,
          decision: input.decision,
          reason,
          decidedByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .onConflictDoNothing({
          target: [
            releaseApprovals.workspaceId,
            releaseApprovals.releaseOperationId,
            releaseApprovals.decidedByUserId,
          ],
        })
        .returning();
      const [racedApproval] = approval
        ? [approval]
        : await tx
            .select()
            .from(releaseApprovals)
            .where(
              and(
                eq(releaseApprovals.workspaceId, input.workspaceId),
                eq(releaseApprovals.releaseOperationId, operation.id),
                eq(releaseApprovals.decidedByUserId, input.actorUserId),
              ),
            )
            .limit(1);
      if (
        !racedApproval ||
        racedApproval.decision !== input.decision ||
        racedApproval.reason !== reason
      ) {
        throw new Error('release approver already recorded an immutable decision');
      }
      if (input.decision === 'rejected') {
        await tx
          .update(releaseOperations)
          .set({
            status: 'failed',
            errorCode: RELEASE_APPROVAL_REJECTED_ERROR_CODE,
            completedAt: new Date(),
          })
          .where(
            and(
              eq(releaseOperations.id, operation.id),
              eq(releaseOperations.status, 'awaiting_approval'),
            ),
          );
        await this.clearPendingReleaseOperation(tx, operation.id);
      }
      return toReleaseApprovalRecord(racedApproval);
    });
  }

  async listReleaseApprovals(
    workspaceId: string,
    releaseOperationId: string,
  ): Promise<ReleaseApprovalRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(releaseApprovals)
        .where(
          and(
            eq(releaseApprovals.workspaceId, workspaceId),
            eq(releaseApprovals.releaseOperationId, releaseOperationId),
          ),
        )
        .orderBy(desc(releaseApprovals.createdAt), desc(releaseApprovals.id));
      return rows.map(toReleaseApprovalRecord);
    });
  }
}
