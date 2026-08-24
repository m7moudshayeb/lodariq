import {
  isDeliverableExperienceType,
  type AuthoringDocumentIntent,
  type AuthoringEnvironment,
} from '@lodariq/schema';
import { normalizeExactOrigin, type WorkspaceEnvironment } from '../domains/environments';
import {
  type AuthoringActivationGrantRecord,
  type PublicSdkInstallationRecord,
} from '../domains/sdk-authoring';
import {
  DEPLOYMENT_CHANGED_ERROR_CODE,
  DeploymentChangedError,
  IdempotencyConflictError,
  ReleaseOperationInProgressError,
  type PersistedDocumentDeployment,
  type PersistedPublication,
  type PersistedReleaseOperation,
} from '../domains/releases';
import {
  type ActivateCompiledArtifactInput,
  type ConsumeAuthoringActivationGrantInput,
  type ReleaseActivationResult,
} from '../domains/documents';
import { isSha256Hash } from '../domains/authoring-policy';
import { clone, hasAuthoringWorkspaceRole } from '../domains/in-memory-helpers';
import { InMemoryRepositoryState } from './state';

export class InMemoryRepositoryUtility extends InMemoryRepositoryState {
  protected findPublicationById(
    workspaceId: string,
    publicationId: string,
  ): PersistedPublication | null {
    const publication = [...this.publications.values()]
      .flat()
      .find((candidate) => candidate.workspaceId === workspaceId && candidate.id === publicationId);
    return publication ? clone(publication) : null;
  }

  protected resolveExistingReleaseOperation(
    input: ActivateCompiledArtifactInput,
    operation: PersistedReleaseOperation,
  ): ReleaseActivationResult {
    const requestChanged =
      operation.requestHash !== input.requestHash ||
      operation.action !== (input.action ?? 'publish') ||
      operation.requestedArtifactId !== input.artifact.id ||
      operation.sourcePublicationId !== (input.sourcePublicationId ?? null) ||
      operation.expectedGeneration !== input.expectedGeneration;
    if (requestChanged) {
      throw new IdempotencyConflictError(input.idempotencyKey);
    }
    if (operation.status === 'activating' || operation.status === 'awaiting_approval') {
      throw new ReleaseOperationInProgressError(input.idempotencyKey);
    }
    if (operation.status === 'failed') {
      const currentDeployment = this.documentDeployments.get(
        this.key(operation.workspaceId, operation.environmentId, operation.documentId),
      );
      if (operation.errorCode === DEPLOYMENT_CHANGED_ERROR_CODE) {
        throw new DeploymentChangedError(
          operation.expectedGeneration,
          operation.resultGeneration ?? currentDeployment?.generation ?? 0,
        );
      }
      throw new Error(operation.errorCode ?? 'release operation failed');
    }
    if (!operation.resultPublicationId) {
      throw new Error('completed release operation has no result publication');
    }
    const publication = (
      this.publications.get(this.key(operation.workspaceId, operation.environmentId)) ?? []
    ).find((candidate) => candidate.id === operation.resultPublicationId);
    if (!publication) {
      throw new Error('release operation result publication not found');
    }
    const deployment: PersistedDocumentDeployment = {
      workspaceId: operation.workspaceId,
      environmentId: operation.environmentId,
      documentId: operation.documentId,
      state: 'active',
      activePublicationId: publication.id,
      pendingReleaseOperationId: null,
      generation: operation.resultGeneration ?? operation.expectedGeneration + 1,
      updatedAt: operation.completedAt ?? publication.publishedAt,
    };
    return {
      operation: clone(operation),
      publication: clone(publication),
      deployment: clone(deployment),
      replayed: true,
    };
  }

  protected releaseOperationKey(operation: PersistedReleaseOperation): string {
    return this.key(
      operation.workspaceId,
      operation.environmentId,
      operation.documentId,
      operation.idempotencyKey,
    );
  }

  protected artifactIdentityKey(
    workspaceId: string,
    documentId: string,
    contentHash: string,
  ): string {
    return this.key(workspaceId, documentId, contentHash);
  }

  protected productStyleApplicationKey(
    workspaceId: string,
    themeId: string,
    proposalId: string,
  ): string {
    return this.key(workspaceId, themeId, proposalId);
  }

  protected key(...parts: string[]): string {
    return parts.join('\u0000');
  }

  protected resolveActiveAuthoringScope(
    installationId: string,
    exactOrigin: string,
  ): {
    installation: PublicSdkInstallationRecord;
    environment: WorkspaceEnvironment & { kind: AuthoringEnvironment };
  } | null {
    const installation = this.publicSdkInstallations.get(installationId);
    if (!installation || installation.revokedAt) return null;
    const mappings = this.publicSdkInstallationOrigins.filter(
      (candidate) =>
        candidate.installationId === installationId &&
        candidate.workspaceId === installation.workspaceId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.authoringEnabled,
    );
    if (mappings.length !== 1) return null;
    const [mapping] = mappings;
    if (!mapping) return null;
    const environment = this.environments.get(this.key(mapping.workspaceId, mapping.environmentId));
    if (
      !environment ||
      environment.kind === 'production' ||
      environment.enabled === false ||
      environment.authoringEnabled === false ||
      !environment.originAllowlist.includes(exactOrigin)
    ) {
      return null;
    }
    return {
      installation,
      environment: environment as WorkspaceEnvironment & { kind: AuthoringEnvironment },
    };
  }

  protected isResolvedDocumentIntent(
    workspaceId: string,
    documentIntent?: AuthoringDocumentIntent,
  ): boolean {
    if (!documentIntent || documentIntent.kind === 'new-draft') return true;
    const document = this.documents.get(this.key(workspaceId, documentIntent.documentId));
    return Boolean(document && isDeliverableExperienceType(document.document.type));
  }

  protected mutateAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
    operation: 'consume' | 'revoke',
  ): AuthoringActivationGrantRecord | null {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (!exactOrigin || !isSha256Hash(input.grantHash)) return null;
    const candidates = [...this.authoringActivationGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.grantHash &&
        !candidate.usedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (candidates.length !== 1) return null;
    const [grant] = candidates;
    if (!grant) return null;
    const scope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== grant.workspaceId ||
      scope.environment.id !== grant.environmentId ||
      !this.hasAuthoringMembership(grant.workspaceId, grant.creatorId)
    ) {
      return null;
    }
    const now = new Date().toISOString();
    const mutated: AuthoringActivationGrantRecord = {
      ...grant,
      ...(operation === 'consume' ? { usedAt: now } : { revokedAt: now }),
    };
    this.authoringActivationGrants.set(mutated.grantId, mutated);
    return clone(mutated);
  }

  protected hasAuthoringMembership(workspaceId: string, userId: string): boolean {
    const membership = this.workspaceMemberships.get(this.key(workspaceId, userId));
    return Boolean(membership && hasAuthoringWorkspaceRole(membership.role));
  }

  protected invalidateAuthoringSessionsForInstallationOrigin(
    workspaceId: string,
    installationId: string,
    exactOrigin: string,
  ): void {
    const revokedAt = new Date().toISOString();
    for (const [key, session] of this.authoringSessions) {
      if (
        session.workspaceId !== workspaceId ||
        session.installationId !== installationId ||
        session.customerOrigin !== exactOrigin ||
        session.revokedAt
      ) {
        continue;
      }
      this.authoringSessions.set(key, { ...session, revokedAt });
    }
  }
}
