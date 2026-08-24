import {
  evaluateEnvironmentReleasePolicy,
  type ProductionPromotionResult as ProductionPromotionResultType,
} from '@lodariq/schema';
import {
  EnvironmentReleasePolicyChangedError,
  EnvironmentPolicyMutationForbiddenError,
  RELEASE_APPROVAL_REJECTED_ERROR_CODE,
  type ReleaseApprovalRecord,
  normalizeReleaseApprovalReason,
} from '@lodariq/database';
import type { FastifyReply } from 'fastify';
import { promoteExactVerifiedPublication } from '../../../releases/promotion';
import { enqueueReleaseWebhookEvent } from '../../../governance-events';
import { authRoleFromMembership } from '../../control-plane-access';
import type { ControlPlaneRouteOptions } from '../../control-plane-context';
import {
  toProductionPromotionResult,
  validateProductionPromotionResult,
  productionPromotionFailureForError,
} from './production-promotion';
import { findEnvironmentPolicyScope, sendEnvironmentPolicyDecision } from './activated-session';

export interface ReleaseApprovalScope {
  workspaceId: string;
  documentId?: string;
  operationId: string;
  actorUserId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}

export async function handleReleaseApproval(
  options: ControlPlaneRouteOptions,
  scope: ReleaseApprovalScope,
  reply: FastifyReply,
) {
  const operation = await options.repository.getReleaseOperationById(
    scope.workspaceId,
    scope.operationId,
  );
  if (
    !operation ||
    operation.action !== 'promote' ||
    (scope.documentId && operation.documentId !== scope.documentId)
  ) {
    return reply.code(404).send({
      error: 'not_found',
      message: 'Pending production release operation not found',
    });
  }
  if (operation.status !== 'awaiting_approval') {
    if (
      scope.decision === 'rejected' &&
      operation.status === 'failed' &&
      operation.errorCode === RELEASE_APPROVAL_REJECTED_ERROR_CODE
    ) {
      const existingApprovals = await options.repository.listReleaseApprovals(
        scope.workspaceId,
        operation.id,
      );
      const reason = normalizeReleaseApprovalReason(scope.reason);
      const existing = existingApprovals.find(
        (candidate) =>
          candidate.decidedByUserId === scope.actorUserId &&
          candidate.decision === 'rejected' &&
          candidate.reason === reason,
      );
      if (existing) {
        return reply.code(201).send({
          approval: toReleaseApproval(existing),
          promotion: validateProductionPromotionResult({
            ok: false,
            state: 'failed',
            code: 'approval_rejected',
            message: 'Production promotion was rejected',
          }),
        });
      }
    }
    return reply.code(409).send({
      error: 'release_not_awaiting_approval',
      message: 'This production release operation is no longer awaiting approval',
    });
  }
  if (!operation.sourcePublicationId) {
    throw new Error('promotion operation is missing staging publication provenance');
  }
  if (scope.decision === 'approved' && !operation.requestedByUserId) {
    return reply.code(409).send({
      error: 'environment_policy_forbidden',
      message: 'The production request is missing its original releaser identity',
    });
  }
  const requestedByUserId = operation.requestedByUserId;
  const [sourcePublication, targetPolicyScope, requesterMembership, verifications, priorApprovals] =
    await Promise.all([
      options.repository.getPublicationById(scope.workspaceId, operation.sourcePublicationId),
      findEnvironmentPolicyScope(options.repository, scope.workspaceId, operation.environmentId),
      requestedByUserId
        ? options.repository.resolveWorkspaceMembership(scope.workspaceId, requestedByUserId)
        : Promise.resolve(null),
      options.repository.listPublicationVerifications(
        scope.workspaceId,
        operation.sourcePublicationId,
      ),
      options.repository.listReleaseApprovals(scope.workspaceId, operation.id),
    ]);
  if (!sourcePublication) {
    throw new Error('promotion operation source publication is unavailable');
  }
  if (!targetPolicyScope || (scope.decision === 'approved' && !requesterMembership)) {
    return reply.code(403).send({
      error: 'environment_policy_forbidden',
      message: 'The original releaser no longer has an active production policy scope',
    });
  }
  if (scope.decision === 'approved') {
    if (!requestedByUserId || !requesterMembership) {
      throw new Error('approved release decision is missing its original requester scope');
    }
    const passedVerification = verifications
      .filter((verification) => verification.result === 'passed')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const approvedByUserIds = [
      ...new Set([
        ...priorApprovals
          .filter((approval) => approval.decision === 'approved')
          .map((approval) => approval.decidedByUserId),
        scope.actorUserId,
      ]),
    ];
    const policyDecision = evaluateEnvironmentReleasePolicy({
      environment: targetPolicyScope.policy,
      action: 'promote',
      sourceEnvironmentId: sourcePublication.environmentId,
      actorRole: authRoleFromMembership(requesterMembership.role),
      actorUserId: requestedByUserId,
      sourceVerified: Boolean(passedVerification),
      ...(passedVerification
        ? { sourceVerifiedByUserId: passedVerification.verifiedByUserId }
        : {}),
      approvedByUserIds,
    });
    if (!policyDecision.allowed) return sendEnvironmentPolicyDecision(policyDecision, reply);
  }
  let approval: ReleaseApprovalRecord;
  try {
    approval = await options.repository.createReleaseApproval({
      workspaceId: scope.workspaceId,
      releaseOperationId: operation.id,
      decision: scope.decision,
      reason: scope.reason,
      actorUserId: scope.actorUserId,
      expectedEnvironmentPolicyUpdatedAt: targetPolicyScope.environment.updatedAt,
    });
  } catch (error) {
    if (isImmutableReleaseApprovalConflict(error)) {
      return reply.code(409).send({
        error: 'release_approval_already_recorded',
        message: 'This approver already recorded an immutable decision',
      });
    }
    if (isReleaseOperationNoLongerAwaitingApproval(error)) {
      return reply.code(409).send({
        error: 'release_not_awaiting_approval',
        message: 'This production release operation is no longer awaiting approval',
      });
    }
    if (error instanceof EnvironmentReleasePolicyChangedError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof EnvironmentPolicyMutationForbiddenError) {
      return reply.code(409).send({
        error: error.code,
        code: error.decisionCode,
        message: error.message,
      });
    }
    throw error;
  }
  let promotion: ProductionPromotionResultType;
  if (scope.decision === 'rejected') {
    promotion = validateProductionPromotionResult({
      ok: false,
      state: 'failed',
      code: 'approval_rejected',
      message: 'Production promotion was rejected',
    });
    return reply.code(201).send({
      approval: toReleaseApproval(approval),
      promotion,
    });
  }
  try {
    const result = await promoteExactVerifiedPublication(options.repository, {
      workspaceId: scope.workspaceId,
      sourceEnvironmentId: sourcePublication.environmentId,
      targetEnvironmentId: operation.environmentId,
      documentId: operation.documentId,
      expectedSourcePublicationId: sourcePublication.id,
      correlationId: operation.correlationId,
      actorUserId: requestedByUserId!,
      idempotencyKey: operation.idempotencyKey,
      expectedGeneration: operation.expectedGeneration,
      expectedEnvironmentPolicyUpdatedAt: targetPolicyScope.environment.updatedAt,
    });
    promotion = validateProductionPromotionResult(toProductionPromotionResult(result));
    if (promotion.ok && promotion.state === 'completed') {
      await enqueueReleaseWebhookEvent(options.repository, {
        workspaceId: scope.workspaceId,
        environmentId: operation.environmentId,
        documentId: operation.documentId,
        operationId: promotion.releaseOperationId,
        action: 'activated',
        occurredAt: result.operation.completedAt ?? new Date().toISOString(),
        generation: promotion.generation,
        publicationId: promotion.publicationId,
        contentHash: promotion.contentHash,
      });
    }
  } catch (error) {
    if (error instanceof EnvironmentReleasePolicyChangedError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof EnvironmentPolicyMutationForbiddenError) {
      return reply.code(409).send({
        error: error.code,
        code: error.decisionCode,
        message: error.message,
      });
    }
    const failure = productionPromotionFailureForError(error);
    if (failure) {
      promotion = validateProductionPromotionResult({
        ok: false,
        state: 'failed',
        code: failure.code,
        message: failure.message,
        ...(failure.generation ?? {}),
      });
    } else {
      throw error;
    }
  }
  return reply.code(promotion.ok ? 200 : 201).send({
    approval: toReleaseApproval(approval),
    promotion,
  });
}

export function isImmutableReleaseApprovalConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'release approver already recorded an immutable decision'
  );
}

export function isReleaseOperationNoLongerAwaitingApproval(error: unknown): boolean {
  return error instanceof Error && error.message === 'release operation is not awaiting approval';
}

export function toReleaseApproval(record: ReleaseApprovalRecord) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    releaseOperationId: record.releaseOperationId,
    decision: record.decision,
    ...(record.reason ? { reason: record.reason } : {}),
    decidedByUserId: record.decidedByUserId,
    createdAt: record.createdAt,
  };
}
