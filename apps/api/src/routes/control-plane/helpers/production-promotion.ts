import {
  ProductionPromotionResult,
  evaluateEnvironmentReleasePolicy,
  isSupportedDeliveryContract,
  validate,
  type ProductionPromotionRequest as ProductionPromotionRequestType,
  type ProductionPromotionResult as ProductionPromotionResultType,
} from '@lodariq/schema';
import {
  ActivePublicationChangedError,
  DeploymentChangedError,
  EnvironmentReleasePolicyChangedError,
  EnvironmentPolicyMutationForbiddenError,
  IdempotencyConflictError,
  PublicationVerificationRequiredError,
  ReleaseApprovalRejectedError,
  ReleaseOperationInProgressError,
  type ControlPlaneRepository,
  type PersistedReleaseOperation,
} from '@lodariq/database';
import type { FastifyReply } from 'fastify';
import { createObservabilityEvent } from '../../../observability';
import { promoteExactVerifiedPublication } from '../../../releases/promotion';
import { authRoleFromMembership, emitObservability } from '../../control-plane-access';
import type { ControlPlaneRouteOptions } from '../../control-plane-context';
import { findEnvironment } from './authoring-membership';
import { findEnvironmentPolicyRow, sendEnvironmentPolicyDecision } from './activated-session';

export interface ProductionPromotionScope {
  workspaceId: string;
  documentId: string;
  actorUserId: string;
  request: ProductionPromotionRequestType;
}

export async function handleProductionPromotion(
  options: ControlPlaneRouteOptions,
  scope: ProductionPromotionScope,
  reply: FastifyReply,
) {
  const [document, sourcePublication, targetEnvironment] = await Promise.all([
    options.repository.getDocument(scope.workspaceId, scope.documentId),
    options.repository.getPublicationById(scope.workspaceId, scope.request.sourcePublicationId),
    findEnvironment(options.repository, scope.workspaceId, scope.request.productionEnvironmentId),
  ]);
  if (!document || !sourcePublication || sourcePublication.documentId !== scope.documentId) {
    return sendProductionPromotionFailure(
      reply,
      404,
      'source_not_active',
      'Staging publication not found',
    );
  }
  const sourceEnvironment = await findEnvironment(
    options.repository,
    scope.workspaceId,
    sourcePublication.environmentId,
  );
  if (!sourceEnvironment || sourceEnvironment.kind !== 'staging') {
    return sendProductionPromotionFailure(
      reply,
      409,
      'source_not_active',
      'Production promotion requires an active staging publication',
    );
  }
  if (!targetEnvironment || targetEnvironment.kind !== 'production') {
    return sendProductionPromotionFailure(
      reply,
      409,
      'environment_not_configured',
      'Choose a configured production environment',
    );
  }
  const [membership, verifications, existingOperation] = await Promise.all([
    options.repository.resolveWorkspaceMembership(scope.workspaceId, scope.actorUserId),
    options.repository.listPublicationVerifications(scope.workspaceId, sourcePublication.id),
    options.repository.getReleaseOperation(
      scope.workspaceId,
      targetEnvironment.id,
      scope.documentId,
      scope.request.idempotencyKey,
    ),
  ]);
  const actorRole = membership ? authRoleFromMembership(membership.role) : null;
  const targetPolicy = await findEnvironmentPolicyRow(
    options.repository,
    scope.workspaceId,
    targetEnvironment.id,
  );
  if (!actorRole || !targetPolicy) {
    return sendProductionPromotionFailure(
      reply,
      403,
      'environment_not_configured',
      'An active production policy and workspace membership are required',
    );
  }
  const passedVerification = verifications
    .filter((verification) => verification.result === 'passed')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const approvals = existingOperation
    ? await options.repository.listReleaseApprovals(scope.workspaceId, existingOperation.id)
    : [];
  const policyDecision = evaluateEnvironmentReleasePolicy({
    environment: targetPolicy,
    action: 'promote',
    sourceEnvironmentId: sourceEnvironment.id,
    actorRole,
    actorUserId: scope.actorUserId,
    sourceVerified: Boolean(passedVerification),
    ...(passedVerification ? { sourceVerifiedByUserId: passedVerification.verifiedByUserId } : {}),
    approvedByUserIds: approvals
      .filter((approval) => approval.decision === 'approved')
      .map((approval) => approval.decidedByUserId),
  });
  if (!policyDecision.allowed && policyDecision.code !== 'approval_required') {
    return sendEnvironmentPolicyDecision(policyDecision, reply);
  }
  try {
    const result = await promoteExactVerifiedPublication(options.repository, {
      workspaceId: scope.workspaceId,
      sourceEnvironmentId: sourceEnvironment.id,
      targetEnvironmentId: targetEnvironment.id,
      documentId: scope.documentId,
      expectedSourcePublicationId: sourcePublication.id,
      correlationId: scope.request.correlationId,
      actorUserId: scope.actorUserId,
      idempotencyKey: scope.request.idempotencyKey,
      expectedGeneration: scope.request.expectedGeneration,
      expectedEnvironmentPolicyUpdatedAt: targetEnvironment.updatedAt,
    });
    const response = validateProductionPromotionResult(toProductionPromotionResult(result));
    emitObservability(
      options.observability,
      createObservabilityEvent({
        name: productionPromotionEventName(result.operation, result.replayed),
        correlationId: scope.request.correlationId,
        workspaceId: scope.workspaceId,
        documentId: scope.documentId,
        environmentId: targetEnvironment.id,
        userId: scope.actorUserId,
        attributes: {
          sourcePublicationId: sourcePublication.id,
          contentHash: sourcePublication.contentHash,
        },
      }),
    );
    let statusCode = 201;
    if (response.state === 'awaiting_approval') statusCode = 202;
    else if (result.replayed) statusCode = 200;
    return reply.code(statusCode).send(response);
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
    return sendProductionPromotionError(error, reply);
  }
}

export function productionPromotionEventName(
  operation: PersistedReleaseOperation,
  replayed: boolean,
): 'promote.awaiting_approval' | 'promote.replayed' | 'promote.completed' {
  if (operation.status === 'awaiting_approval') return 'promote.awaiting_approval';
  return replayed ? 'promote.replayed' : 'promote.completed';
}

export function toProductionPromotionResult(
  result: Awaited<ReturnType<ControlPlaneRepository['promoteVerifiedPublication']>>,
): ProductionPromotionResultType {
  if (result.operation.status === 'awaiting_approval') {
    return {
      ok: true,
      state: 'awaiting_approval',
      replayed: result.replayed,
      releaseOperationId: result.operation.id,
      requiredApprovalCount: Math.max(1, Math.min(result.requiredApprovalCount, 1)),
      approvalCount: Math.min(result.approvalCount, 1),
    };
  }
  const publication = result.publication;
  if (!publication || !result.deployment) {
    throw new Error('completed promotion is missing its exact publication result');
  }
  const compiled = publication.artifact.compiled;
  if (
    !('artifactSchemaVersion' in compiled) ||
    !('rendererContractVersion' in compiled) ||
    !('theme' in compiled) ||
    !isSupportedDeliveryContract(
      compiled.artifactSchemaVersion,
      compiled.rendererContractVersion,
      compiled.theme.contractVersion,
    )
  ) {
    throw new Error('production promotion requires a supported compiled artifact');
  }
  return {
    ok: true,
    state: 'completed',
    replayed: result.replayed,
    releaseOperationId: result.operation.id,
    publicationId: publication.id,
    generation: result.deployment.generation,
    compiledArtifactId: publication.compiledArtifactId,
    contentHash: publication.contentHash,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
  };
}

export function validateProductionPromotionResult(value: unknown): ProductionPromotionResultType {
  const validation = validate(ProductionPromotionResult, value);
  if (!validation.valid) {
    throw new Error(
      `Production promotion response failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

export function sendProductionPromotionFailure(
  reply: FastifyReply,
  statusCode: number,
  code: Extract<ProductionPromotionResultType, { ok: false }>['code'],
  message: string,
  generation?: { expectedGeneration: number; actualGeneration: number },
) {
  return reply.code(statusCode).send(
    validateProductionPromotionResult({
      ok: false,
      state: 'failed',
      code,
      message,
      ...(generation ?? {}),
    }),
  );
}

export function sendProductionPromotionError(error: unknown, reply: FastifyReply) {
  const failure = productionPromotionFailureForError(error);
  if (failure) {
    return sendProductionPromotionFailure(
      reply,
      failure.statusCode,
      failure.code,
      failure.message,
      failure.generation,
    );
  }
  throw error;
}

export interface ProductionPromotionFailureDetails {
  statusCode: number;
  code: Extract<ProductionPromotionResultType, { ok: false }>['code'];
  message: string;
  generation?: { expectedGeneration: number; actualGeneration: number };
}

export function productionPromotionFailureForError(
  error: unknown,
): ProductionPromotionFailureDetails | null {
  if (error instanceof ActivePublicationChangedError) {
    return { statusCode: 409, code: 'source_not_active', message: error.message };
  }
  if (error instanceof PublicationVerificationRequiredError) {
    return { statusCode: 409, code: 'source_not_verified', message: error.message };
  }
  if (error instanceof ReleaseApprovalRejectedError) {
    return { statusCode: 409, code: 'approval_rejected', message: error.message };
  }
  if (error instanceof DeploymentChangedError) {
    return {
      statusCode: 409,
      code: 'deployment_changed',
      message: error.message,
      generation: {
        expectedGeneration: error.expectedGeneration,
        actualGeneration: error.actualGeneration,
      },
    };
  }
  if (error instanceof IdempotencyConflictError) {
    return { statusCode: 409, code: 'idempotency_conflict', message: error.message };
  }
  if (error instanceof ReleaseOperationInProgressError) {
    return {
      statusCode: 409,
      code: 'release_operation_in_progress',
      message: error.message,
    };
  }
  return null;
}
