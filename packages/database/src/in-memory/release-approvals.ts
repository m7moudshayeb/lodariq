import { randomUUID } from 'node:crypto';
import {
  EnvironmentPolicyMutationForbiddenError,
  assertEnvironmentPolicyMutationAllowed,
  assertEnvironmentPolicySnapshot,
} from '../domains/environments';
import {
  RELEASE_APPROVAL_REJECTED_ERROR_CODE,
  ActivePublicationChangedError,
  type CreatePublicationVerificationInput,
  type CreateReleaseApprovalInput,
  type PublicationVerificationRecord,
  type ReleaseApprovalRecord,
} from '../domains/releases';
import { requireExactHttpOrigin } from '../domains/authoring-policy';
import {
  assertBrowserVerificationReport,
  normalizeReleaseApprovalReason,
} from '../domains/theme-policy';
import {
  clone,
  compareAppendOnlyRecordsNewestFirst,
  hasAuthoringWorkspaceRole,
} from '../domains/in-memory-helpers';
import { InMemoryRepositoryPublication } from './publication';

export class InMemoryRepositoryReleaseApprovals extends InMemoryRepositoryPublication {
  async createPublicationVerification(
    input: CreatePublicationVerificationInput,
  ): Promise<PublicationVerificationRecord> {
    assertBrowserVerificationReport(input.report);
    const verifiedOrigin = requireExactHttpOrigin(input.verifiedOrigin);
    const verifierMembership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (!verifierMembership || !hasAuthoringWorkspaceRole(verifierMembership.role)) {
      throw new Error('publication verifier is not a workspace member');
    }
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment || environment.enabled === false || environment.kind !== 'staging') {
      throw new Error('publication verification requires a staging environment');
    }
    if (!environment.originAllowlist.includes(verifiedOrigin)) {
      throw new Error('publication verification origin is not allowlisted for the environment');
    }
    const deployment = this.documentDeployments.get(
      this.key(input.workspaceId, input.environmentId, input.documentId),
    );
    const actualPublicationId =
      deployment?.state === 'active' ? deployment.activePublicationId : null;
    if (actualPublicationId !== input.expectedPublicationId) {
      throw new ActivePublicationChangedError(input.expectedPublicationId, actualPublicationId);
    }
    const publication = deployment ? this.requireDeploymentPublication(deployment) : null;
    if (!publication || publication.id !== input.expectedPublicationId) {
      throw new ActivePublicationChangedError(input.expectedPublicationId, actualPublicationId);
    }

    const verification: PublicationVerificationRecord = {
      id: `pubverify_${randomUUID()}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
      publicationId: publication.id,
      result: input.report.status === 'failed' ? 'failed' : 'passed',
      report: clone(input.report),
      verifiedOrigin,
      verifiedByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendPublicationVerification(verification);
    return clone(verification);
  }

  async listPublicationVerifications(
    workspaceId: string,
    publicationId: string,
  ): Promise<PublicationVerificationRecord[]> {
    return (this.publicationVerifications.get(this.key(workspaceId, publicationId)) ?? [])
      .map((verification) => clone(verification))
      .sort(compareAppendOnlyRecordsNewestFirst);
  }

  async createReleaseApproval(input: CreateReleaseApprovalInput): Promise<ReleaseApprovalRecord> {
    if (input.decision !== 'approved' && input.decision !== 'rejected') {
      throw new Error('release approval decision must be approved or rejected');
    }
    const reason = normalizeReleaseApprovalReason(input.reason);
    const operation = [...this.releaseOperations.values()].find(
      (candidate) =>
        candidate.workspaceId === input.workspaceId && candidate.id === input.releaseOperationId,
    );
    if (!operation || operation.action !== 'promote') {
      throw new Error('promotion release operation not found in workspace');
    }
    const existing = (
      this.releaseApprovals.get(this.key(input.workspaceId, operation.id)) ?? []
    ).find((approval) => approval.decidedByUserId === input.actorUserId);
    if (
      operation.status === 'failed' &&
      operation.errorCode === RELEASE_APPROVAL_REJECTED_ERROR_CODE &&
      existing?.decision === input.decision &&
      existing.reason === reason
    ) {
      return clone(existing);
    }
    if (operation.status !== 'awaiting_approval') {
      throw new Error('release operation is not awaiting approval');
    }
    const approverMembership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (
      !approverMembership ||
      (approverMembership.role !== 'owner' && approverMembership.role !== 'admin')
    ) {
      throw new Error('release approver is not a workspace member');
    }
    const targetEnvironment = this.environments.get(
      this.key(input.workspaceId, operation.environmentId),
    );
    if (!targetEnvironment) throw new Error('promotion target environment not found');
    let targetPolicy = assertEnvironmentPolicySnapshot(
      targetEnvironment,
      input.expectedEnvironmentPolicyUpdatedAt,
    );
    if (input.decision === 'approved') {
      if (!operation.requestedByUserId || !operation.sourcePublicationId) {
        throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
      }
      const sourcePublication = this.findPublicationById(
        input.workspaceId,
        operation.sourcePublicationId,
      );
      const sourceEnvironment = sourcePublication
        ? this.environments.get(this.key(input.workspaceId, sourcePublication.environmentId))
        : null;
      if (!sourcePublication || !sourceEnvironment || sourceEnvironment.enabled === false) {
        throw new EnvironmentPolicyMutationForbiddenError('promotion_source_mismatch');
      }
      targetPolicy = assertEnvironmentPolicyMutationAllowed(targetEnvironment, {
        action: 'promote',
        sourceEnvironmentId: sourcePublication.environmentId,
        expectedUpdatedAt: input.expectedEnvironmentPolicyUpdatedAt,
      });
      const requesterMembership = operation.requestedByUserId
        ? this.workspaceMemberships.get(this.key(input.workspaceId, operation.requestedByUserId))
        : null;
      if (
        !requesterMembership ||
        !targetPolicy.releasePolicy.publisherRoles.some((role) => role === requesterMembership.role)
      ) {
        throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
      }
      if (
        targetPolicy.releasePolicy.separationOfDuties.requireSeparateApprover &&
        input.actorUserId === operation.requestedByUserId
      ) {
        throw new EnvironmentPolicyMutationForbiddenError('separation_of_duties_required');
      }
    }
    if (existing) {
      if (existing.decision === input.decision && existing.reason === reason) {
        return clone(existing);
      }
      throw new Error('release approver already recorded an immutable decision');
    }
    const approval: ReleaseApprovalRecord = {
      id: `relapproval_${randomUUID()}`,
      workspaceId: input.workspaceId,
      releaseOperationId: operation.id,
      decision: input.decision,
      reason,
      decidedByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendReleaseApproval(approval);
    if (input.decision === 'rejected') {
      this.failPromotionOperation(
        this.releaseOperationKey(operation),
        operation,
        RELEASE_APPROVAL_REJECTED_ERROR_CODE,
      );
    }
    return clone(approval);
  }

  async listReleaseApprovals(
    workspaceId: string,
    releaseOperationId: string,
  ): Promise<ReleaseApprovalRecord[]> {
    return (this.releaseApprovals.get(this.key(workspaceId, releaseOperationId)) ?? [])
      .map((approval) => clone(approval))
      .sort(compareAppendOnlyRecordsNewestFirst);
  }
}
