import { performance } from 'node:perf_hooks';
import {
  type AuthoringAuthorizationRequestRecord,
  type ControlPlaneRepository,
} from '@lodariq/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthError,
  workspaceSessionPolicyFailure,
  type AuthContext,
  type AuthProvider,
} from '../../../auth';
import { createObservabilityEvent, type ObservabilitySink } from '../../../observability';
import {
  resolveAuthoritativeAnalyticsBatch,
  type ResolvedAnalyticsPointer,
} from '../../../analytics/authoritative-events';
import { authRoleFromMembership, emitObservability } from '../../control-plane-access';
import {
  SDK_DELIVERY_RETRY_ATTEMPT_HEADER,
  SDK_DELIVERY_MAX_OBSERVED_DURATION_MS,
} from '../support';
import { readHeader, setCredentialResponseHeaders } from './sdk-auth';
import type { SdkDeliveryScope } from './sdk-auth';

export type SdkDeliveryResource = 'artifact' | 'manifest';

export type SdkDeliveryOutcome =
  'active' | 'error' | 'found' | 'inactive' | 'inconsistent' | 'not_found';

export type SdkDeliveryCacheOutcome = 'not_applicable' | 'not_modified' | 'served';

export type SdkDeliveryRetryBucket = 'first_retry' | 'initial' | 'multiple_retries' | 'unknown';

export interface SdkDeliveryObservation {
  startedAt: number;
  retryBucket: SdkDeliveryRetryBucket;
}

export interface SdkDeliveryResolution {
  resource: SdkDeliveryResource;
  outcome: SdkDeliveryOutcome;
  statusCode: 200 | 304 | 404 | 409 | 500;
  cacheOutcome: SdkDeliveryCacheOutcome;
}

export const SDK_DELIVERY_EVENT_NAMES = {
  artifact: 'sdk.delivery.artifact.resolved',
  manifest: 'sdk.delivery.manifest.resolved',
} as const satisfies Record<SdkDeliveryResource, string>;

export function beginSdkDeliveryObservation(request: FastifyRequest): SdkDeliveryObservation {
  return {
    startedAt: performance.now(),
    retryBucket: sdkDeliveryRetryBucket(readHeader(request, SDK_DELIVERY_RETRY_ATTEMPT_HEADER)),
  };
}

export function sdkDeliveryRetryBucket(rawAttempt: string | null): SdkDeliveryRetryBucket {
  if (rawAttempt === null || rawAttempt === '0') return 'initial';
  if (rawAttempt === '1') return 'first_retry';
  if (/^[2-9]$|^10$/u.test(rawAttempt)) return 'multiple_retries';
  return 'unknown';
}

export function emitSdkDeliveryResolution(
  sink: ObservabilitySink,
  observation: SdkDeliveryObservation,
  scope: SdkDeliveryScope,
  resolution: SdkDeliveryResolution,
): void {
  emitObservability(
    sink,
    createObservabilityEvent({
      name: SDK_DELIVERY_EVENT_NAMES[resolution.resource],
      workspaceId: scope.workspaceId,
      environmentId: scope.environmentId,
      attributes: {
        outcome: resolution.outcome,
        statusCode: resolution.statusCode,
        durationMs: boundedSdkDeliveryDuration(performance.now() - observation.startedAt),
        cacheOutcome: resolution.cacheOutcome,
        retryBucket: observation.retryBucket,
      },
    }),
  );
}

export function boundedSdkDeliveryDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return SDK_DELIVERY_MAX_OBSERVED_DURATION_MS;
  return Math.min(SDK_DELIVERY_MAX_OBSERVED_DURATION_MS, Math.max(0, Math.ceil(durationMs)));
}

export async function ingestAuthoritativeSdkEvents(
  repository: ControlPlaneRepository,
  scope: { workspaceId: string; environmentId: string },
  candidates: readonly unknown[],
  reply: FastifyReply,
) {
  const pointerRequests = new Map<string, Promise<ResolvedAnalyticsPointer | null>>();
  const resolved = await resolveAuthoritativeAnalyticsBatch(scope, candidates, (documentId) => {
    let pending = pointerRequests.get(documentId);
    if (!pending) {
      pending = resolveAnalyticsPointer(repository, scope, documentId);
      pointerRequests.set(documentId, pending);
    }
    return pending;
  });

  const accepted = resolved.events.length
    ? await repository.ingestAuthoritativeEvents({
        workspaceId: scope.workspaceId,
        environmentId: scope.environmentId,
        events: resolved.events,
      })
    : 0;
  if (accepted !== resolved.events.length) {
    throw new Error('authoritative analytics persistence count mismatch');
  }
  return reply.code(202).send({ ...resolved.result, accepted });
}

export async function resolveAnalyticsPointer(
  repository: ControlPlaneRepository,
  scope: { workspaceId: string; environmentId: string },
  documentId: string,
): Promise<ResolvedAnalyticsPointer | null> {
  const deployment = await repository.getDocumentDeployment(
    scope.workspaceId,
    scope.environmentId,
    documentId,
  );
  if (!deployment) return null;
  if (deployment.state === 'inactive') {
    return {
      state: 'inactive',
      workspaceId: deployment.workspaceId,
      environmentId: deployment.environmentId,
      documentId: deployment.documentId,
      generation: deployment.generation,
    };
  }

  const publication = await repository.getPublicationById(
    scope.workspaceId,
    deployment.activePublicationId,
  );
  if (!publication) return null;
  return {
    state: 'active',
    workspaceId: publication.workspaceId,
    environmentId: publication.environmentId,
    documentId: publication.documentId,
    generation: deployment.generation,
    publicationId: publication.id,
    contentHash: publication.contentHash,
  };
}

export async function authenticateAuthoringAuthorizationRequest(
  repository: ControlPlaneRepository,
  authProvider: AuthProvider,
  request: FastifyRequest,
  reply: FastifyReply,
  requestId: string,
): Promise<{ auth: AuthContext; request: AuthoringAuthorizationRequestRecord } | null> {
  setCredentialResponseHeaders(reply);
  try {
    const identity = await authProvider.authenticateIdentity(request);
    const resolved = await repository.getAuthoringAuthorizationRequestForUser(
      identity.userId,
      requestId,
    );
    if (!resolved) {
      await reply.code(404).send({
        error: 'not_found',
        message: 'Pending authoring authorization request not found',
      });
      return null;
    }
    const policy = await repository.getWorkspaceAuthPolicy(resolved.request.workspaceId);
    if (!policy) {
      await reply.code(403).send({
        error: 'workspace_auth_policy_unavailable',
        message: 'Workspace authentication policy could not be verified',
      });
      return null;
    }
    const workspaceSsoIdentitySatisfied = policy.ssoRequired
      ? await repository.identitySatisfiesWorkspaceSso(
          resolved.request.workspaceId,
          identity.identityId ?? null,
        )
      : false;
    const policyFailure = workspaceSessionPolicyFailure(
      identity,
      policy,
      workspaceSsoIdentitySatisfied,
    );
    if (policyFailure) {
      await reply.code(403).send({
        error: policyFailure,
        message: 'This session does not satisfy the workspace authentication policy',
      });
      return null;
    }
    return {
      auth: {
        userId: resolved.membership.userId,
        workspaceId: resolved.request.workspaceId,
        role: authRoleFromMembership(resolved.membership.role),
        provider: identity.provider,
        authenticationMethod: identity.authenticationMethod,
        assuranceLevel: identity.assuranceLevel,
        authenticatedAt: identity.authenticatedAt,
        identityId: identity.identityId,
      },
      request: resolved.request,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      await reply.code(error.statusCode).send({ error: 'unauthorized', message: error.message });
      return null;
    }
    throw error;
  }
}

export class DocumentThemeResolutionError extends Error {
  readonly statusCode = 409;

  constructor(
    readonly code: 'theme_binding_unavailable' | 'theme_migration_required',
    message: string,
  ) {
    super(message);
    this.name = 'DocumentThemeResolutionError';
  }
}
