import { randomUUID } from 'node:crypto';
import {
  RELEASE_RECOVERY_HISTORY_MAX_ITEMS,
  ReleaseRecoveryRequest as ReleaseRecoveryRequestSchema,
  evaluateReleaseRecovery,
  documentLocaleCount,
  commercialDocumentFeatures,
  validate,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import { isReleaseArtifactCurrentlyDeployable } from '../release-artifact-compatibility';
import { assertWorkspaceScope } from '../rls';
import {
  AmbiguousCurrentPublicationError,
  ReleaseRecoveryHistoryLimitExceededError,
  type DocumentSummary,
  type PersistedCompiledArtifact,
  type PersistedDocumentDeployment,
  type PersistedDocumentVersion,
  type PersistedPublication,
  type PersistedReleaseOperation,
  type RecoverDocumentReleaseInput,
  type ReleaseRecoveryScopeInput,
} from '../domains/releases';
import {
  DocumentSaveConflictError,
  type PersistedDocument,
  type SaveDocumentInput,
} from '../domains/documents';
import type {
  CreateAuthoringMediaAssetInput,
  SaveAuthoringResourcesInput,
} from '../domains/authoring-resources';
import type {
  AuthoringDraftCheckpointResource,
  AuthoringMediaAssetResource,
  AuthoringStepStyleRecipeResource,
} from '@lodariq/schema';
import {
  createCompletedRecoveryOperation,
  createNonPersistingRecoveryFailure,
  createPersistedRecoveryFailure,
  createReleaseRecoveryRequestHash,
  releaseRecoveryOperationMatchesRequest,
  releaseRecoveryPermissions,
  releaseRecoveryPolicyFailure,
} from '../domains/release-recovery';
import { assertArtifactMatchesDocument } from '../domains/authoring-policy';
import {
  assertCommercialFeature,
  CommercialEntitlementError,
} from '../domains/commercial-entitlements';
import {
  clone,
  compareArtifactsNewestFirst,
  compareDeployments,
  comparePublicationsNewestFirst,
} from '../domains/in-memory-helpers';
import { InMemoryRepositoryThemes } from './themes';

export class InMemoryRepositoryDocuments extends InMemoryRepositoryThemes {
  async listAuthoringStyleRecipes(
    workspaceId: string,
  ): Promise<AuthoringStepStyleRecipeResource[]> {
    return clone(this.authoringStyleRecipes.get(workspaceId) ?? []);
  }

  async listAuthoringDraftCheckpoints(
    workspaceId: string,
    documentId: string,
  ): Promise<AuthoringDraftCheckpointResource[]> {
    return clone(this.authoringDraftCheckpoints.get(this.key(workspaceId, documentId)) ?? []);
  }

  async listAuthoringMediaAssets(workspaceId: string): Promise<AuthoringMediaAssetResource[]> {
    return [...this.authoringMediaAssets.values()]
      .filter((asset) => asset.workspaceId === workspaceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(
        ({
          workspaceId: _workspaceId,
          contentBase64: _contentBase64,
          publishedAt: _publishedAt,
          ...asset
        }) => clone(asset),
      );
  }

  async getAuthoringMediaAsset(workspaceId: string, assetId: string) {
    const asset = this.authoringMediaAssets.get(this.key(workspaceId, assetId));
    return asset ? clone(asset) : null;
  }

  async getPublishedMediaAsset(assetId: string) {
    const asset = [...this.authoringMediaAssets.values()].find(
      (candidate) => candidate.id === assetId && candidate.publishedAt !== null,
    );
    return asset ? clone(asset) : null;
  }

  async publishAuthoringMediaAssets(
    workspaceId: string,
    assetIds: readonly string[],
  ): Promise<void> {
    const publishedAt = new Date().toISOString();
    for (const assetId of new Set(assetIds)) {
      const key = this.key(workspaceId, assetId);
      const asset = this.authoringMediaAssets.get(key);
      if (asset) this.authoringMediaAssets.set(key, { ...asset, publishedAt });
    }
  }

  async saveAuthoringResources(input: SaveAuthoringResourcesInput): Promise<void> {
    const entitlements = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements;
    if (input.recipes.length > 0) assertCommercialFeature(entitlements, 'named-step-styles');
    if (input.checkpoints.length > 0) assertCommercialFeature(entitlements, 'recovery');
    for (const checkpoint of input.checkpoints) {
      assertWorkspaceScope(checkpoint.document.workspaceId, input.workspaceId);
      if (checkpoint.document.id !== input.documentId) {
        throw new Error('Authoring checkpoint document scope mismatch');
      }
    }
    this.authoringStyleRecipes.set(input.workspaceId, clone([...input.recipes]));
    this.authoringDraftCheckpoints.set(
      this.key(input.workspaceId, input.documentId),
      clone([...input.checkpoints]),
    );
  }

  async createAuthoringMediaAsset(
    input: CreateAuthoringMediaAssetInput,
  ): Promise<AuthoringMediaAssetResource> {
    const limit = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements.assetBytes;
    if (input.byteLength > limit) {
      throw new CommercialEntitlementError('asset-bytes', input.byteLength, limit);
    }
    const id = `asset-${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const asset = {
      id,
      workspaceId: input.workspaceId,
      kind: input.kind,
      filename: input.filename,
      contentType: input.contentType,
      byteLength: input.byteLength,
      contentHash: input.contentHash,
      savedToLibrary: input.savedToLibrary,
      contentBase64: input.contentBase64,
      publishedAt: null,
      createdAt,
      downloadPath: `/v1/authoring/media-assets/${id}`,
    } as const;
    this.authoringMediaAssets.set(this.key(input.workspaceId, id), clone(asset));
    const {
      workspaceId: _workspaceId,
      contentBase64: _contentBase64,
      publishedAt: _publishedAt,
      ...resource
    } = asset;
    return clone(resource);
  }

  async listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
    return [...this.documents.values()]
      .filter((entry) => entry.document.workspaceId === workspaceId)
      .map((entry) => ({
        id: entry.document.id,
        workspaceId: entry.document.workspaceId,
        type: entry.document.type,
        status: entry.document.status,
        title: entry.document.title,
        schemaVersion: entry.document.schemaVersion,
        createdByUserId: entry.createdByUserId,
        updatedByUserId: entry.updatedByUserId,
        updatedAt: entry.updatedAt,
        ...(entry.latestArtifact?.contentHash
          ? { latestContentHash: entry.latestArtifact.contentHash }
          : {}),
        publications: this.listDocumentPublicationSummaries(
          entry.document.workspaceId,
          entry.document.id,
        ),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getDocument(workspaceId: string, documentId: string): Promise<PersistedDocument | null> {
    const entry = this.documents.get(this.key(workspaceId, documentId));
    return entry ? clone(entry) : null;
  }

  async listDocumentVersions(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedDocumentVersion[]> {
    const retentionDays =
      this.resolveWorkspaceEntitlements(workspaceId).entitlements.versionRetentionDays;
    const cutoff =
      retentionDays === null ? null : Date.now() - retentionDays * 24 * 60 * 60 * 1_000;
    return (this.documentVersions.get(this.key(workspaceId, documentId)) ?? [])
      .filter((version) => cutoff === null || Date.parse(version.createdAt) >= cutoff)
      .map((version) => clone(version))
      .sort((a, b) => b.version - a.version);
  }

  async getDocumentVersion(
    workspaceId: string,
    documentId: string,
    documentVersionId: string,
  ): Promise<PersistedDocumentVersion | null> {
    const retentionDays =
      this.resolveWorkspaceEntitlements(workspaceId).entitlements.versionRetentionDays;
    const cutoff =
      retentionDays === null ? null : Date.now() - retentionDays * 24 * 60 * 60 * 1_000;
    const version = (this.documentVersions.get(this.key(workspaceId, documentId)) ?? []).find(
      (candidate) =>
        candidate.id === documentVersionId &&
        (cutoff === null || Date.parse(candidate.createdAt) >= cutoff),
    );
    return version ? clone(version) : null;
  }

  async saveDocument(input: SaveDocumentInput): Promise<PersistedDocument> {
    assertWorkspaceScope(input.document.workspaceId, input.workspaceId);
    assertArtifactMatchesDocument(input);
    const localeLimit = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements.locales;
    const localeCount = documentLocaleCount(input.document);
    if (localeLimit !== null && localeCount > localeLimit) {
      throw new CommercialEntitlementError('locales', localeCount, localeLimit);
    }
    const entitlements = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements;
    for (const feature of commercialDocumentFeatures(input.document)) {
      assertCommercialFeature(entitlements, feature);
    }
    const existing = this.documents.get(this.key(input.workspaceId, input.document.id));
    if (input.expectedUpdatedAt !== undefined && existing?.updatedAt !== input.expectedUpdatedAt) {
      throw new DocumentSaveConflictError(existing?.updatedAt ?? null);
    }
    const existingTimestamp = existing ? Date.parse(existing.updatedAt) : 0;
    const now = new Date(Math.max(Date.now(), existingTimestamp + 1)).toISOString();
    const documentVersion = this.createDocumentVersion(input, now);
    const latestArtifact = input.artifact
      ? this.persistCompiledArtifact(
          input.workspaceId,
          input.document.id,
          documentVersion.id,
          input.artifact,
          now,
        )
      : existing?.latestArtifact;
    const next: PersistedDocument = {
      document: clone(input.document),
      createdByUserId: existing?.createdByUserId ?? input.actorUserId,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
      ...(latestArtifact ? { latestArtifact: clone(latestArtifact) } : {}),
    };
    this.documents.set(this.key(input.workspaceId, input.document.id), next);
    return clone(next);
  }

  async getLatestCompiledArtifact(workspaceId: string): Promise<PersistedCompiledArtifact | null> {
    const artifacts = [...this.compiledArtifactsByIdentity.values()]
      .filter((artifact) => artifact.workspaceId === workspaceId)
      .sort(compareArtifactsNewestFirst);
    return artifacts[0] ? clone(artifacts[0]) : null;
  }

  async getCompiledArtifact(
    workspaceId: string,
    documentId: string,
    artifactId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const artifact = this.compiledArtifactsById.get(this.key(workspaceId, artifactId));
    return artifact?.documentId === documentId ? clone(artifact) : null;
  }

  async getCompiledArtifactForDocumentVersion(
    workspaceId: string,
    documentId: string,
    documentVersionId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const artifact = [...this.compiledArtifactsByIdentity.values()]
      .filter(
        (candidate) =>
          candidate.workspaceId === workspaceId &&
          candidate.documentId === documentId &&
          candidate.documentVersionId === documentVersionId,
      )
      .sort(compareArtifactsNewestFirst)[0];
    return artifact ? clone(artifact) : null;
  }

  async getCurrentPublication(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedPublication | null> {
    const deployments = await this.listDocumentDeployments(workspaceId, environmentId);
    if (deployments.length === 0) {
      const latestLegacyPublication = this.getLatestLegacyPublication(workspaceId, environmentId);
      return latestLegacyPublication ? clone(latestLegacyPublication) : null;
    }

    const activeDeployments = deployments.filter((deployment) => deployment.state === 'active');
    if (activeDeployments.length === 0) return null;
    if (activeDeployments.length > 1) {
      throw new AmbiguousCurrentPublicationError(
        workspaceId,
        environmentId,
        activeDeployments.map((deployment) => deployment.documentId),
      );
    }

    const [activeDeployment] = activeDeployments;
    return activeDeployment ? this.requireDeploymentPublication(activeDeployment) : null;
  }

  async getDocumentDeployment(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedDocumentDeployment | null> {
    const deployment = this.documentDeployments.get(
      this.key(workspaceId, environmentId, documentId),
    );
    return deployment ? clone(deployment) : null;
  }

  async listDocumentDeployments(
    workspaceId: string,
    environmentId?: string,
  ): Promise<PersistedDocumentDeployment[]> {
    return [...this.documentDeployments.values()]
      .filter(
        (deployment) =>
          deployment.workspaceId === workspaceId &&
          (environmentId === undefined || deployment.environmentId === environmentId),
      )
      .map((deployment) => clone(deployment))
      .sort(compareDeployments);
  }

  async listDocumentPublications(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedPublication[]> {
    return [...this.publications.values()]
      .flat()
      .filter(
        (publication) =>
          publication.workspaceId === workspaceId && publication.documentId === documentId,
      )
      .map((publication) => clone(publication))
      .sort(comparePublicationsNewestFirst);
  }

  async getPublicationById(
    workspaceId: string,
    publicationId: string,
  ): Promise<PersistedPublication | null> {
    return this.findPublicationById(workspaceId, publicationId);
  }

  async getCurrentPublicationForDocument(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedPublication | null> {
    const deployment = await this.getDocumentDeployment(workspaceId, environmentId, documentId);
    if (!deployment || deployment.state === 'inactive') return null;
    return this.requireDeploymentPublication(deployment);
  }

  async getCurrentPublishedArtifact(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const publication = await this.getCurrentPublication(workspaceId, environmentId);
    return publication ? clone(publication.artifact) : null;
  }

  async getReleaseOperation(
    workspaceId: string,
    environmentId: string,
    documentId: string,
    idempotencyKey: string,
  ): Promise<PersistedReleaseOperation | null> {
    const operation = this.releaseOperations.get(
      this.key(workspaceId, environmentId, documentId, idempotencyKey),
    );
    return operation ? clone(operation) : null;
  }

  async getReleaseOperationById(
    workspaceId: string,
    operationId: string,
  ): Promise<PersistedReleaseOperation | null> {
    const operation = [...this.releaseOperations.values()].find(
      (candidate) => candidate.workspaceId === workspaceId && candidate.id === operationId,
    );
    return operation ? clone(operation) : null;
  }

  async getReleaseRecoveryState(
    input: ReleaseRecoveryScopeInput,
  ): Promise<ReleaseRecoveryStateResponse | null> {
    const scope = this.resolveReleaseRecoveryScope(input);
    if (!scope) return null;

    const deployment = this.documentDeployments.get(
      this.key(input.workspaceId, input.environmentId, input.documentId),
    );
    const history = this.buildReleaseRecoveryHistory(input);
    if (history.length > RELEASE_RECOVERY_HISTORY_MAX_ITEMS) {
      throw new ReleaseRecoveryHistoryLimitExceededError(history.length);
    }
    const snapshots = this.buildReleaseRecoveryPublicationSnapshots(input);
    const rollbackTargetPublicationIds = snapshots
      .filter(
        ({ publication, operation }) =>
          operation.status === 'completed' &&
          operation.resultGeneration !== null &&
          deployment?.state === 'active' &&
          operation.resultGeneration < deployment.generation &&
          publication.id !== deployment.activePublicationId &&
          isReleaseArtifactCurrentlyDeployable(publication.artifact),
      )
      .map(({ publication }) => publication.id)
      .sort();

    return clone({
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
      permissions: releaseRecoveryPermissions(scope.environment, scope.membershipRole),
      deployment: deployment ?? null,
      history,
      rollbackTargetPublicationIds: [...new Set(rollbackTargetPublicationIds)],
    });
  }

  async recoverDocumentRelease(
    input: RecoverDocumentReleaseInput,
  ): Promise<ReleaseRecoveryResult | null> {
    const requestContract = validate(ReleaseRecoveryRequestSchema, input.request);
    if (!requestContract.valid) throw new Error('release recovery request is invalid');
    const request = requestContract.value;
    const scope = this.resolveReleaseRecoveryScope(input);
    if (!scope) return null;

    const operationKey = this.key(
      input.workspaceId,
      input.environmentId,
      input.documentId,
      request.idempotencyKey,
    );
    const requestHash = createReleaseRecoveryRequestHash(input, request);
    const existingOperation = this.releaseOperations.get(operationKey);
    if (existingOperation) {
      if (!releaseRecoveryOperationMatchesRequest(existingOperation, input, request, requestHash)) {
        return createNonPersistingRecoveryFailure(request, 'idempotency_conflict');
      }
      if (
        existingOperation.status === 'activating' ||
        existingOperation.status === 'awaiting_approval'
      ) {
        return createNonPersistingRecoveryFailure(
          request,
          'release_operation_in_progress',
          existingOperation.id,
        );
      }
      const replay = this.releaseRecoveryResultFromOperation(existingOperation, true);
      return replay ?? createNonPersistingRecoveryFailure(request, 'internal_error');
    }

    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
      'recovery',
    );

    const deploymentKey = this.key(input.workspaceId, input.environmentId, input.documentId);
    const deployment = this.documentDeployments.get(deploymentKey) ?? null;
    const occurredAt = new Date().toISOString();
    const newReleaseOperationId = `relop_${randomUUID()}`;
    const newPublicationId = request.action === 'rollback' ? `pub_${randomUUID()}` : undefined;
    const policyFailure = releaseRecoveryPolicyFailure(
      scope.environment,
      scope.membershipRole,
      input.actorUserId,
      request.action,
    );
    if (policyFailure) {
      const result = createPersistedRecoveryFailure(
        request,
        policyFailure,
        newReleaseOperationId,
        deployment,
      );
      this.persistFailedRecoveryOperation(
        input,
        request,
        requestHash,
        newReleaseOperationId,
        occurredAt,
        result,
      );
      return clone(result);
    }

    const publicationMaterials = this.buildReleaseRecoveryPublicationSnapshots(input);
    const publicationSnapshots = publicationMaterials.map(({ snapshot }) => snapshot);
    const operationSnapshots = this.buildReleaseRecoveryOperationSnapshots(input);
    const deployableRollbackTargetPublicationIds = new Set(
      publicationMaterials
        .filter(({ publication }) => isReleaseArtifactCurrentlyDeployable(publication.artifact))
        .map(({ publication }) => publication.id),
    );
    const decision =
      request.action === 'rollback'
        ? evaluateReleaseRecovery({
            workspaceId: input.workspaceId,
            environmentId: input.environmentId,
            documentId: input.documentId,
            actorUserId: input.actorUserId,
            deployment,
            publications: publicationSnapshots,
            operations: operationSnapshots,
            request,
            newReleaseOperationId,
            newPublicationId: newPublicationId!,
            occurredAt,
            deployableRollbackTargetPublicationIds,
          })
        : evaluateReleaseRecovery({
            workspaceId: input.workspaceId,
            environmentId: input.environmentId,
            documentId: input.documentId,
            actorUserId: input.actorUserId,
            deployment,
            publications: publicationSnapshots,
            operations: operationSnapshots,
            request,
            newReleaseOperationId,
            occurredAt,
          });

    if (decision.kind === 'replay') return clone(decision.result);
    if (decision.kind === 'reject') {
      if (decision.persistFailure) {
        this.persistFailedRecoveryOperation(
          input,
          request,
          requestHash,
          newReleaseOperationId,
          occurredAt,
          decision.result,
        );
      }
      return clone(decision.result);
    }

    const activePublicationId =
      deployment?.state === 'active' ? deployment.activePublicationId : null;
    if (!activePublicationId) {
      return createNonPersistingRecoveryFailure(request, 'internal_error');
    }
    if (decision.action === 'rollback') {
      const targetMaterial = publicationMaterials.find(
        ({ publication }) => publication.id === decision.publication.sourcePublicationId,
      );
      if (
        !targetMaterial ||
        targetMaterial.publication.compiledArtifactId !==
          decision.result.artifact.compiledArtifactId
      ) {
        return createNonPersistingRecoveryFailure(request, 'internal_error');
      }
      const publication: PersistedPublication = {
        id: decision.publication.id,
        workspaceId: input.workspaceId,
        correlationId: request.correlationId,
        environmentId: input.environmentId,
        environment: scope.environment.kind,
        documentId: input.documentId,
        documentVersionId: targetMaterial.publication.documentVersionId,
        compiledArtifactId: targetMaterial.publication.compiledArtifactId,
        contentHash: targetMaterial.publication.contentHash,
        action: 'rollback',
        sourcePublicationId: targetMaterial.publication.id,
        previousPublicationId: activePublicationId,
        releaseOperationId: newReleaseOperationId,
        publishedByUserId: input.actorUserId,
        publishedAt: occurredAt,
        artifact: clone(targetMaterial.publication.artifact),
      };
      this.appendPublication(publication);
    }
    this.documentDeployments.set(deploymentKey, clone(decision.deployment));
    this.releaseOperations.set(
      operationKey,
      createCompletedRecoveryOperation(input, request, requestHash, decision.result, occurredAt),
    );
    return clone(decision.result);
  }
}
