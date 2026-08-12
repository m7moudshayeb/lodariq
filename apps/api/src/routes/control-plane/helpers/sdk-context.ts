import { randomUUID } from 'node:crypto';
import {
  AUTHORING_SESSION_CAPABILITIES,
  PublicSdkBootstrapContext,
  SdkInstallContext,
  validate,
  type PublicSdkBootstrapContext as PublicSdkBootstrapContextType,
  type SdkInstallContext as SdkInstallContextType,
} from '@lodariq/schema';
import {
  AMBIGUOUS_CURRENT_PUBLICATION_ERROR_CODE,
  AmbiguousCurrentPublicationError,
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
  type PersistedDocument,
  type PersistedPublication,
  type ResolvedEnvironmentToken,
} from '@lodariq/database';
import type { FastifyReply } from 'fastify';
import { DOCUMENT_SPECIFIC_DELIVERY_REQUIRED_ERROR } from '../support';
import {
  authoringSessionArtifactMatches,
  sendAuthoringSessionCompatibilityChanged,
  directSdkSessionCanReadReleaseState,
  directSdkSessionCanPublishToStaging,
  directSdkSessionHasCapability,
  directSdkSessionHasExplicitCapability,
  currentAuthoringMemberHasReleaseCapability,
} from './session-capabilities';
import { compileAndValidate } from './document-compilation';

export async function createAuthoringSdkInstallContext(
  repository: ControlPlaneRepository,
  publicApiBaseUrl: string,
  token: ResolvedEnvironmentToken,
  record: PersistedDocument,
  authoringSession: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<SdkInstallContextType | FastifyReply> {
  if (
    record.latestArtifact &&
    !authoringSessionArtifactMatches(authoringSession, record.latestArtifact.compiled)
  ) {
    return sendAuthoringSessionCompatibilityChanged(reply);
  }
  const compiled =
    record.latestArtifact?.compiled ?? (await compileAndValidate(repository, record.document));
  if (!authoringSessionArtifactMatches(authoringSession, compiled)) {
    return sendAuthoringSessionCompatibilityChanged(reply);
  }
  const artifact = record.latestArtifact;
  const canReadReleaseState = await directSdkSessionCanReadReleaseState(
    repository,
    authoringSession,
  );
  const canPublishToStaging =
    canReadReleaseState &&
    (await directSdkSessionCanPublishToStaging(repository, authoringSession));
  const canVerifyStaging =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'verify-staging',
    ));
  const canPromoteProduction =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'promote-production',
    ));
  const canApproveProduction =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'approve-production',
    ));
  const canRollbackRelease =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasExplicitCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'rollback-release',
    ));
  const canUnpublishRelease =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasExplicitCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'unpublish-release',
    ));
  const recoveryUrl = new URL(
    '/v1/sdk/authoring/environments/:environmentId/release-recovery',
    publicApiBaseUrl,
  ).toString();
  const release = canReadReleaseState
    ? {
        releaseState: {
          capability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
          url: new URL('/v1/sdk/authoring/release-state', publicApiBaseUrl).toString(),
        },
        recoveryState: {
          capability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
          url: recoveryUrl,
        },
        ...(canRollbackRelease
          ? {
              rollback: {
                capability: AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
                url: recoveryUrl,
              },
            }
          : {}),
        ...(canUnpublishRelease
          ? {
              unpublish: {
                capability: AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
                url: recoveryUrl,
              },
            }
          : {}),
        ...(canPublishToStaging
          ? {
              stagingPublication: {
                capability: AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
                url: new URL('/v1/sdk/authoring/publications', publicApiBaseUrl).toString(),
              },
            }
          : {}),
        ...(canVerifyStaging
          ? {
              stagingVerification: {
                capability: AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
                url: new URL('/v1/sdk/authoring/verifications', publicApiBaseUrl).toString(),
              },
            }
          : {}),
        ...(canPromoteProduction
          ? {
              productionPromotion: {
                capability: AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
                url: new URL('/v1/sdk/authoring/promotions', publicApiBaseUrl).toString(),
              },
            }
          : {}),
        ...(canApproveProduction
          ? {
              productionApproval: {
                capability: AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
                url: new URL(
                  '/v1/sdk/authoring/release-operations/:operationId/approvals',
                  publicApiBaseUrl,
                ).toString(),
              },
            }
          : {}),
      }
    : null;
  const context = {
    workspaceId: token.workspaceId,
    environmentId: token.environmentId,
    environment: token.environment,
    correlationId: authoringSession.correlationId,
    manifest: {
      documentId: authoringSession.documentId,
      currentVersion: compiled.contentHash,
      artifact: {
        contentHash: compiled.contentHash,
        compilerVersion: compiled.compilerVersion,
        createdAt: artifact?.createdAt ?? record.updatedAt,
        ...(artifact?.documentVersionId ? { documentVersionId: artifact.documentVersionId } : {}),
      },
    },
    currentDocumentUrl: '',
    ingestUrl: '',
    authoring: {
      enabled: true,
      iframeSrc: authoringSession.iframeSrc,
      sessionId: authoringSession.id,
      correlationId: authoringSession.correlationId,
      expiresAt: authoringSession.expiresAt,
      documentUrl: new URL('/v1/sdk/authoring/document', publicApiBaseUrl).toString(),
      saveDocumentUrl: new URL('/v1/sdk/authoring/document', publicApiBaseUrl).toString(),
      ...(release ? { release } : {}),
    },
  };
  return validateSdkInstallContext(context);
}

export function validateSdkInstallContext(context: unknown): SdkInstallContextType {
  const validation = validate(SdkInstallContext, context);
  if (!validation.valid) {
    throw new Error(
      `SDK install context failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

export function validatePublicSdkBootstrapContext(context: unknown): PublicSdkBootstrapContextType {
  const validation = validate(PublicSdkBootstrapContext, context);
  if (!validation.valid) {
    throw new Error(
      `Public SDK bootstrap context failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

export async function getLegacyCurrentPublication(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
  reply: FastifyReply,
): Promise<PersistedPublication | null> {
  try {
    return await repository.getCurrentPublication(workspaceId, environmentId);
  } catch (error) {
    if (!(error instanceof AmbiguousCurrentPublicationError)) throw error;
    await reply.code(409).send({
      error: DOCUMENT_SPECIFIC_DELIVERY_REQUIRED_ERROR,
      code: AMBIGUOUS_CURRENT_PUBLICATION_ERROR_CODE,
      message:
        'Multiple documents are active in this environment; use document-specific SDK delivery',
      documentIds: error.documentIds,
    });
    return null;
  }
}

export function createCorrelationId(scope: 'authoring' | 'bootstrap' | 'compile'): string {
  return `corr_${scope}_${randomUUID()}`;
}
