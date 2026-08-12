import { ControllerBrandFeature } from './controller-brand';
import { authoringText } from '../../i18n';
import { type ReleaseRecoveryRequest, type ReleaseRecoveryResult } from '@lodariq/schema';
import { createBridgeCorrelationId } from '../../bridge/transport';
import type {
  AuthoringStagingPublicationRequest,
  AuthoringStagingReleaseState,
} from '../local-frame-types';
import { createAuthoringReleaseRecoveryViewModel } from '../release-recovery-model';
import {
  RELEASE_ERRORS_REQUIRING_NEW_GUARD,
  initialReleaseView,
  releaseEnvironmentReferencesFromRemote,
  releaseRecoveryRequestMatchesConfirmation,
  releaseRecoveryResultFeedback,
  releaseViewFromPublicationFailure,
  releaseViewFromRemote,
  releaseWorkflowAfterStagingPublication,
  requestFailedReleaseView,
} from './controller-model';

export abstract class ControllerReleaseRecoveryFeature extends ControllerBrandFeature {
  protected panelWorkflowRequestIsCurrent(requestVersion: number): boolean {
    return this.started && requestVersion === this.panelWorkflowRequestVersion;
  }

  protected async loadReleaseRecoveryState(
    environmentId: string,
    feedback?: { kind: 'error' | 'notice'; message: string },
  ): Promise<void> {
    const getReleaseRecoveryState = this.services.getReleaseRecoveryState;
    if (!getReleaseRecoveryState) return;
    const requestVersion = ++this.releaseRecoveryRequestVersion;
    this.releaseRecoveryEnvironmentId = environmentId;
    this.releaseRecoveryModel = null;
    this.releaseRecoveryIntent = null;
    this.releaseRecoveryRequestIdentity = null;
    this.panelOperation = 'loading-release-recovery';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.emit();
    try {
      const state = await getReleaseRecoveryState(environmentId);
      if (!this.releaseRecoveryRequestIsCurrent(requestVersion, environmentId)) return;
      this.releaseRecoveryModel = createAuthoringReleaseRecoveryViewModel({
        workspaceId: this.documentState.workspaceId,
        environmentId,
        documentId: this.documentState.id,
        state,
      });
      this.panelOperation = null;
      if (feedback?.kind === 'error') this.panelWorkflowError = feedback.message;
      if (feedback?.kind === 'notice') this.panelWorkflowNotice = feedback.message;
      this.emit();
    } catch {
      if (!this.releaseRecoveryRequestIsCurrent(requestVersion, environmentId)) return;
      this.releaseRecoveryModel = null;
      this.panelOperation = null;
      this.panelWorkflowError = authoringText(
        'Release history could not be loaded for this environment.',
      );
      this.emit();
    }
  }

  protected async confirmReleaseRecoveryAsync(request: ReleaseRecoveryRequest): Promise<void> {
    const recoverRelease = this.services.recoverRelease;
    const environmentId = this.releaseRecoveryEnvironmentId;
    const intent = this.releaseRecoveryIntent;
    const requestIdentity = this.releaseRecoveryRequestIdentity;
    if (
      !recoverRelease ||
      !environmentId ||
      !intent ||
      !requestIdentity ||
      !releaseRecoveryRequestMatchesConfirmation(request, intent, requestIdentity)
    ) {
      this.panelWorkflowError = authoringText(
        'This release recovery confirmation is no longer current.',
      );
      this.emit();
      return;
    }
    if (this.panelOperation === 'recovering-release') return;

    const requestVersion = ++this.releaseRecoveryRequestVersion;
    const confirmationKey = intent.confirmationKey;
    this.panelOperation = 'recovering-release';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.emit();
    let result: ReleaseRecoveryResult;
    try {
      result = await recoverRelease(environmentId, structuredClone(request));
      if (
        !this.releaseRecoveryRequestIsCurrent(requestVersion, environmentId) ||
        this.releaseRecoveryIntent?.confirmationKey !== confirmationKey
      ) {
        return;
      }
      if (result.action !== request.action) {
        throw new Error('Release recovery response action mismatch');
      }
    } catch {
      if (
        !this.releaseRecoveryRequestIsCurrent(requestVersion, environmentId) ||
        this.releaseRecoveryIntent?.confirmationKey !== confirmationKey
      ) {
        return;
      }
      this.panelOperation = null;
      this.panelWorkflowError = authoringText(
        'The recovery response was uncertain. Retry this confirmation to reuse the same request identity.',
      );
      this.emit();
      return;
    }

    this.panelMode = 'release-history';
    this.panelReturnMode = 'release-verification';
    this.panelFocusTarget = 'release-history-result';
    this.panelFocusToken += 1;
    const feedback = releaseRecoveryResultFeedback(result);
    const [, releaseTruthRefreshed] = await Promise.all([
      this.loadReleaseRecoveryState(environmentId, feedback),
      result.ok ? this.refreshReleaseTruthAfterRecovery() : Promise.resolve(true),
    ]);
    if (!releaseTruthRefreshed && this.panelMode === 'release-history') {
      this.panelWorkflowError = authoringText(
        'Recovery completed, but the surrounding release summary could not be refreshed.',
      );
      this.panelWorkflowNotice = null;
      this.emit();
    }
  }

  protected releaseRecoveryRequestIsCurrent(
    requestVersion: number,
    environmentId: string,
  ): boolean {
    return (
      this.started &&
      requestVersion === this.releaseRecoveryRequestVersion &&
      environmentId === this.releaseRecoveryEnvironmentId
    );
  }

  protected async refreshReleaseTruthAfterRecovery(): Promise<boolean> {
    await this.loadStagingReleaseState(false);
    const getReleaseWorkflowState = this.services.getReleaseWorkflowState;
    if (!getReleaseWorkflowState) return true;
    const requestVersion = ++this.panelWorkflowRequestVersion;
    try {
      const release = await getReleaseWorkflowState();
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return false;
      this.releaseWorkflow = structuredClone(release);
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  protected async publishCurrentTourToStagingAsync(): Promise<void> {
    const getReleaseState = this.services.getReleaseState;
    const publishToStaging = this.services.publishToStaging;
    const persistDocument = this.services.persistDocument;
    if (!getReleaseState || !publishToStaging || !persistDocument) {
      this.release = initialReleaseView(false, this.services.releaseUnavailableReason);
      this.emit();
      return;
    }
    if (this.release.status === 'checking' || this.release.status === 'publishing') return;

    this.saveCurrentDocument();
    const document = structuredClone(this.documentState);
    const documentSequence = this.documentChangeSequence;
    const requestVersion = ++this.releaseRequestVersion;
    this.release = {
      status: 'publishing',
      reason: 'publishing',
      expectedGeneration: this.release.expectedGeneration,
      findings: [],
    };
    this.setStatus(authoringText('Saving before staging…'));

    try {
      await persistDocument(structuredClone(document));
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;

      const remote = await getReleaseState();
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      this.syncReleaseWorkflowFromStagingRemote(remote);
      const remoteView = releaseViewFromRemote(remote);
      if (remoteView.status === 'current') {
        this.release = remoteView;
        this.pendingPublicationRequest = null;
        this.setStatus(authoringText('Staging is current'));
        return;
      }
      if (remoteView.status !== 'ready' || remote.state !== 'ready') {
        this.release =
          remote.state === 'no_saved_artifact'
            ? requestFailedReleaseView(remote.expectedGeneration)
            : remoteView;
        this.setStatus(authoringText('Staging release needs attention'));
        return;
      }

      if (!remote.draftArtifactId || !remote.draftContentHash) {
        this.release = requestFailedReleaseView(remote.expectedGeneration);
        this.setStatus(authoringText('The reviewed staging artifact is unavailable'));
        return;
      }
      const publicationRequest = this.publicationRequestFor({
        ...remote,
        draftArtifactId: remote.draftArtifactId,
        draftContentHash: remote.draftContentHash,
      });
      const result = await publishToStaging(publicationRequest);
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      if (!result.ok) {
        this.release = releaseViewFromPublicationFailure(result);
        if (RELEASE_ERRORS_REQUIRING_NEW_GUARD.has(result.code)) {
          this.pendingPublicationRequest = null;
        }
        this.setStatus(authoringText('Staging release needs attention'));
        return;
      }

      this.pendingPublicationRequest = null;
      this.release = {
        status: 'current',
        reason: 'current',
        expectedGeneration: result.generation,
        findings: structuredClone(result.findings),
      };
      this.releaseWorkflow = releaseWorkflowAfterStagingPublication(
        this.releaseWorkflow,
        publicationRequest,
        Boolean(this.services.verifyStagingRelease),
        Boolean(this.services.promoteExactArtifact),
      );
      this.setStatus(
        result.replayed
          ? authoringText('Staging publication confirmed')
          : authoringText('Published to staging'),
      );
    } catch {
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      this.release = requestFailedReleaseView(this.release.expectedGeneration);
      this.setStatus(authoringText('Staging could not be updated'));
    }
  }

  protected async loadStagingReleaseState(announce: boolean): Promise<void> {
    const getReleaseState = this.services.getReleaseState;
    if (!getReleaseState) {
      this.release = initialReleaseView(false, this.services.releaseUnavailableReason);
      this.emit();
      return;
    }

    const requestVersion = ++this.releaseRequestVersion;
    const documentSequence = this.documentChangeSequence;
    if (announce) {
      this.release = {
        status: 'checking',
        reason: 'checking',
        expectedGeneration: this.release.expectedGeneration,
        findings: [],
      };
      this.emit();
    }
    try {
      const remote = await getReleaseState();
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      this.release = releaseViewFromRemote(remote);
      this.syncReleaseWorkflowFromStagingRemote(remote);
      this.emit();
    } catch {
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      this.release = requestFailedReleaseView(this.release.expectedGeneration);
      this.emit();
    }
  }

  protected publicationRequestFor(
    remote: AuthoringStagingReleaseState & {
      draftArtifactId: string;
      draftContentHash: string;
    },
  ): AuthoringStagingPublicationRequest {
    const pending = this.pendingPublicationRequest;
    const sameReviewedArtifact =
      pending?.expectedGeneration === remote.expectedGeneration &&
      pending.expectedArtifactId === remote.draftArtifactId &&
      pending.expectedContentHash === remote.draftContentHash;
    if (pending && sameReviewedArtifact) return pending;
    const request = {
      expectedGeneration: remote.expectedGeneration,
      expectedArtifactId: remote.draftArtifactId,
      expectedContentHash: remote.draftContentHash,
      idempotencyKey: createBridgeCorrelationId('staging_publish'),
      correlationId: createBridgeCorrelationId('release'),
    };
    this.pendingPublicationRequest = request;
    return request;
  }

  protected releaseRequestIsCurrent(requestVersion: number, documentSequence: number): boolean {
    return (
      this.started &&
      requestVersion === this.releaseRequestVersion &&
      documentSequence === this.documentChangeSequence
    );
  }

  protected hasReleaseServices(): boolean {
    return Boolean(this.services.getReleaseState);
  }

  protected syncReleaseWorkflowFromStagingRemote(remote: AuthoringStagingReleaseState): void {
    const draftArtifactId = remote.draftArtifactId;
    const draftContentHash = remote.draftContentHash;
    if (!draftArtifactId || !draftContentHash) return;
    const currentWorkflow = this.releaseWorkflow;
    const environments = releaseEnvironmentReferencesFromRemote(remote, currentWorkflow);
    const stagingMatchesRemote =
      currentWorkflow?.staging?.artifactId === draftArtifactId &&
      currentWorkflow.staging.contentHash === draftContentHash;
    let staging = currentWorkflow?.staging ?? null;
    if (remote.state === 'current') {
      const verification =
        stagingMatchesRemote && currentWorkflow?.staging
          ? structuredClone(currentWorkflow.staging.verification)
          : { state: 'not-run' as const, checks: [] };
      staging = {
        ...(stagingMatchesRemote && currentWorkflow?.staging?.version
          ? { version: currentWorkflow.staging.version }
          : {}),
        artifactId: draftArtifactId,
        contentHash: draftContentHash,
        verification,
      };
    }
    this.releaseWorkflow = {
      draft: {
        ...(currentWorkflow?.draft.version ? { version: currentWorkflow.draft.version } : {}),
        contentHash: draftContentHash,
        dirty: false,
      },
      staging,
      production: currentWorkflow?.production ?? null,
      ...(currentWorkflow?.rendererVersion
        ? { rendererVersion: currentWorkflow.rendererVersion }
        : {}),
      ...(currentWorkflow?.theme ? { theme: structuredClone(currentWorkflow.theme) } : {}),
      ...(currentWorkflow?.changes ? { changes: structuredClone(currentWorkflow.changes) } : {}),
      ...(environments ? { environments } : {}),
      canVerify: Boolean(this.services.verifyStagingRelease),
      canPromote: Boolean(this.services.promoteExactArtifact),
      approval: currentWorkflow?.approval ?? 'not-required',
    };
  }
}
