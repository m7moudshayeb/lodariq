import { ControllerStepsTargetsFeature } from './controller-steps-targets';
import { authoringText } from '../../i18n';
import {
  AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  type LodariqDocument,
  type PublishReadinessIssue,
  type ReleaseRecoveryRequest,
} from '@lodariq/schema';
import { createBridgeCorrelationId } from '../../bridge/transport';
import type { AuthoringPanelMode } from './types';
import type { AuthoringBrandMatchProposal, AuthoringBrandMatchRequest } from '../local-frame-types';
import {
  createAuthoringReleaseRecoveryIntent,
  type AuthoringReleaseRecoveryIntent,
} from '../release-recovery-model';
import { releaseHistoryEntryFocusTarget } from './controller-model';
import { publishIssueRepairIntent } from './publish-issue-repair';
import { findContainingTourStepId } from '../preview-step-state';
import { findBlockById } from './utils';

export abstract class ControllerHistoryReleaseFeature extends ControllerStepsTargetsFeature {
  protected abstract applyBrandMatchProposal(
    proposal: AuthoringBrandMatchProposal,
    activeRequestVersion?: number,
    automatic?: boolean,
  ): Promise<void>;
  protected abstract approveAndPromoteProductionAsync(): Promise<void>;
  protected abstract confirmReleaseRecoveryAsync(request: ReleaseRecoveryRequest): Promise<void>;
  protected abstract importScopedDocument(json: string): LodariqDocument | null;
  protected abstract loadReleaseRecoveryState(
    environmentId: string,
    feedback?: { kind: 'error' | 'notice'; message: string },
  ): Promise<void>;
  protected abstract loadStagingReleaseState(announce: boolean): Promise<void>;
  protected abstract matchProductBrandAsync(
    requestedStrategy: AuthoringBrandMatchRequest['strategy'],
  ): Promise<void>;
  protected abstract openPanelMode(mode: AuthoringPanelMode, returnMode: AuthoringPanelMode): void;
  protected abstract panelWorkflowRequestIsCurrent(requestVersion: number): boolean;
  protected abstract promoteCurrentStagingArtifactAsync(): Promise<void>;
  protected abstract publishCurrentTourToStagingAsync(): Promise<void>;
  protected abstract requestPromotionApprovalAsync(): Promise<void>;
  protected abstract snapshot(): LodariqDocument;
  protected abstract syncFocusedEditControl(): void;
  protected abstract syncJsonTextControl(): void;
  protected abstract verifyCurrentStagingArtifactAsync(): Promise<void>;

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.snapshot());
    this.documentState = previous;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus(authoringText('Undid change'));
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.documentState = next;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus(authoringText('Redid change'));
  }

  saveCurrentDocument(): void {
    this.syncFocusedEditControl();
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    this.flushPreviewPatches();
    this.setStatus(authoringText('Saved draft'));
  }

  requestSaveAndExit(): void {
    if (!this.isHostedInParent) {
      this.saveCurrentDocument();
      return;
    }
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('authoring_save_and_exit'),
      type: AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
    });
  }

  refreshStagingRelease(): void {
    void this.loadStagingReleaseState(true);
  }

  publishCurrentTourToStaging(): void {
    void this.publishCurrentTourToStagingAsync();
  }

  openAppearanceMode(): void {
    this.panelReturnFocus = 'appearance';
    this.openPanelMode('appearance', 'edit');
  }

  openReleaseVerificationMode(): void {
    this.panelReturnFocus = 'release';
    this.openPanelMode('release-verification', 'edit');
  }

  repairPublishIssue(issue: PublishReadinessIssue): void {
    const intent = publishIssueRepairIntent(issue);
    this.returnToEditorForPublishRepair();
    if (intent.action === 'add-step') {
      this.appendStepAndChooseTarget();
      return;
    }

    const requestedBlock = issue.blockId
      ? findBlockById(this.documentState.blocks, issue.blockId)
      : null;
    const stepId = requestedBlock
      ? findContainingTourStepId(this.documentState.blocks, requestedBlock.id)
      : undefined;
    const blockId = intent.reveal === 'placement' ? stepId : requestedBlock?.id;
    const fallbackBlockId = stepId ?? this.documentState.blocks[0]?.id;
    const repairBlockId = blockId ?? fallbackBlockId;
    if (!repairBlockId) {
      this.setStatus(issue.message);
      return;
    }

    this.selectedBlockId = repairBlockId;
    this.focusRequest = {
      blockId: repairBlockId,
      target: intent.focusTarget,
      ...(intent.propertyId ? { propertyId: intent.propertyId } : {}),
      reveal: intent.reveal,
      token: ++this.focusToken,
    };
    this.setStatus(`${intent.actionLabel}: ${issue.message}`);
  }

  openPromotionConfirmation(): void {
    this.panelReturnFocus = 'release';
    this.openPanelMode('promotion-confirmation', 'release-verification');
  }

  openReleaseHistoryMode(environmentId: string): void {
    if (!this.services.getReleaseRecoveryState || !environmentId.trim()) return;
    this.releaseRecoveryEnvironmentId = environmentId;
    this.releaseRecoveryEntryFocusTarget = releaseHistoryEntryFocusTarget(
      this.releaseWorkflow,
      environmentId,
    );
    this.releaseRecoveryIntent = null;
    this.releaseRecoveryRequestIdentity = null;
    this.openPanelMode('release-history', 'release-verification');
    void this.loadReleaseRecoveryState(environmentId);
  }

  startReleaseRecovery(intent: AuthoringReleaseRecoveryIntent): void {
    const currentIntent = this.releaseRecoveryModel
      ? createAuthoringReleaseRecoveryIntent(this.releaseRecoveryModel, intent.action)
      : null;
    if (!currentIntent || currentIntent.confirmationKey !== intent.confirmationKey) return;
    this.releaseRecoveryIntent = structuredClone(currentIntent);
    this.releaseRecoveryRequestIdentity = {
      idempotencyKey: createBridgeCorrelationId('release_recovery'),
      correlationId: createBridgeCorrelationId('release_recovery'),
    };
    this.panelMode = 'release-recovery-confirmation';
    this.panelReturnMode = 'release-history';
    this.panelFocusTarget = null;
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.panelFocusToken += 1;
    this.emit();
  }

  cancelReleaseRecoveryConfirmation(): void {
    const action = this.releaseRecoveryIntent?.action;
    this.releaseRecoveryIntent = null;
    this.releaseRecoveryRequestIdentity = null;
    this.panelMode = 'release-history';
    this.panelReturnMode = 'release-verification';
    this.panelOperation = null;
    this.panelFocusTarget = action ? `release-recovery-${action}` : 'release-history-result';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.panelFocusToken += 1;
    this.emit();
  }

  confirmReleaseRecovery(request: ReleaseRecoveryRequest): Promise<void> {
    return this.confirmReleaseRecoveryAsync(request);
  }

  closePanelMode(): void {
    if (this.panelMode === 'edit') return;
    if (this.panelMode === 'release-recovery-confirmation') {
      this.cancelReleaseRecoveryConfirmation();
      return;
    }
    if (this.panelMode === 'release-history') {
      this.releaseRecoveryIntent = null;
      this.releaseRecoveryRequestIdentity = null;
      this.panelMode = 'release-verification';
      this.panelReturnMode = 'edit';
      this.panelOperation = null;
      this.panelFocusTarget = this.releaseRecoveryEntryFocusTarget;
      this.panelWorkflowError = null;
      this.panelWorkflowNotice = null;
      this.panelFocusToken += 1;
      this.emit();
      return;
    }
    this.brandDriftController?.restorePreview();
    this.panelWorkflowRequestVersion += 1;
    this.panelOperation = null;
    const nextMode = this.panelReturnMode;
    this.panelMode = nextMode;
    this.panelReturnMode = nextMode === 'edit' ? 'edit' : 'appearance';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.panelFocusTarget = null;
    this.panelFocusToken += 1;
    this.emit();
  }

  private returnToEditorForPublishRepair(): void {
    this.brandDriftController?.restorePreview();
    this.panelWorkflowRequestVersion += 1;
    this.panelMode = 'edit';
    this.panelReturnMode = 'edit';
    this.panelReturnFocus = null;
    this.panelOperation = null;
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.panelFocusTarget = null;
    this.advancedEditorStepId = null;
    this.panelFocusToken += 1;
  }

  matchProductBrand(strategy: AuthoringBrandMatchRequest['strategy']): void {
    void this.matchProductBrandAsync(strategy);
  }

  checkBrandDrift(): void {
    this.brandDriftController?.checkExplicitly();
  }

  previewCurrentBrandDrift(): void {
    this.brandDriftController?.preview('current');
  }

  previewProposedBrandDrift(): void {
    this.brandDriftController?.preview('proposed');
  }

  reviewBrandDriftProposal(): void {
    const proposal = this.brandDriftController?.reviewProposal();
    const prepare = this.services.prepareBrandMatchProposal;
    if (!proposal || !prepare) return;
    this.brandProposal = prepare(proposal);
    this.panelMode = 'brand-match-review';
    this.panelReturnMode = 'appearance';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = authoringText(
      'Review the drift proposal. The Brand draft changes only after you explicitly use it.',
    );
    this.panelFocusToken += 1;
    this.emit();
  }

  acknowledgeBrandTheme(): void {
    this.brandDriftController?.acknowledge();
  }

  acceptBrandMatch(): void {
    const proposal = this.brandProposal;
    if (!proposal) return;
    void this.applyBrandMatchProposal(proposal);
  }

  chooseAnotherBrandSource(): void {
    this.brandProposal = null;
    this.panelMode = 'appearance';
    this.panelReturnMode = 'edit';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.panelFocusToken += 1;
    this.emit();
    this.matchProductBrand('select-element');
  }

  verifyCurrentStagingArtifact(): void {
    void this.verifyCurrentStagingArtifactAsync();
  }

  promoteCurrentStagingArtifact(): void {
    void this.promoteCurrentStagingArtifactAsync();
  }

  requestPromotionApproval(): void {
    void this.requestPromotionApprovalAsync();
  }

  approveAndPromoteProduction(): void {
    void this.approveAndPromoteProductionAsync();
  }

  refreshPanelWorkflowState(): void {
    const getBrandWorkflowState = this.services.getBrandWorkflowState;
    const getReleaseWorkflowState = this.services.getReleaseWorkflowState;
    if (!getBrandWorkflowState && !getReleaseWorkflowState) return;

    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = getReleaseWorkflowState ? 'loading-release' : 'loading-brand';
    this.panelWorkflowError = null;
    this.emit();

    const requests: Promise<void>[] = [];
    if (getBrandWorkflowState) {
      requests.push(
        getBrandWorkflowState().then((brand) => {
          if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
          this.brandWorkflow = structuredClone(brand);
        }),
      );
    }
    if (getReleaseWorkflowState) {
      requests.push(
        getReleaseWorkflowState().then((release) => {
          if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
          this.releaseWorkflow = structuredClone(release);
        }),
      );
    }
    void Promise.all(requests).then(
      () => {
        if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
        this.panelOperation = null;
        this.emit();
      },
      () => {
        if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
        this.panelOperation = null;
        this.panelWorkflowError = authoringText(
          'Brand and release details could not be refreshed.',
        );
        this.emit();
      },
    );
  }

  exportJson(): void {
    this.jsonText = this.services.exportDocument(this.documentState);
    this.recordMetric('document.exported');
    this.setStatus(authoringText('Backup is ready'));
  }

  importJson(): void {
    this.syncJsonTextControl();
    const importedDocument = this.importScopedDocument(this.jsonText);
    if (!importedDocument) return;
    this.recordChange();
    this.documentState = importedDocument;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(this.documentState.blocks[0]?.id ?? this.documentState.id, [
      { op: 'replaceDocument', document: this.documentState },
    ]);
    this.recordMetric('document.imported');
    this.setStatus(authoringText('Backup restored'));
  }

  reset(): void {
    this.recordChange();
    this.services.resetDocuments();
    this.documentState = this.createBaseDocument();
    this.compiledText = '';
    this.afterDocumentMutation();
    this.sendPreviewPatch(this.documentState.blocks[0]?.id ?? this.documentState.id, [
      { op: 'replaceDocument', document: this.documentState },
    ]);
    this.setStatus(authoringText('Reset experience'));
  }

  compilePreview(): void {
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    void this.services.compilePreview(this.documentState).then((doc) => {
      this.compiledText = JSON.stringify(doc, null, 2);
      this.recordMetric('preview.opened');
      this.setStatus(authoringText('Preview package ready'));
    });
    this.emit();
  }

  previewCurrentStep(): void {
    this.syncFocusedEditControl();
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    const step = this.selectedTourStep();
    if (!step) {
      this.setStatus(authoringText('Add a step before previewing'));
      return;
    }
    const hostPreview = this.sendPreviewRequest('step', step.id);
    void Promise.all([hostPreview, this.services.compilePreview(this.documentState)])
      .then(([, doc]) => {
        this.compiledText = JSON.stringify(doc, null, 2);
        this.recordMetric('preview.opened');
        this.setStatus(authoringText('Step preview ready'));
      })
      .catch(() => this.setStatus(authoringText('Step preview could not start')));
    this.emit();
  }

  previewFullTour(): void {
    this.syncFocusedEditControl();
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    const hostPreview = this.sendPreviewRequest('full');
    void Promise.all([hostPreview, this.services.compilePreview(this.documentState)])
      .then(([, doc]) => {
        this.compiledText = JSON.stringify(doc, null, 2);
        this.recordMetric('preview.opened');
        this.setStatus(authoringText('Tour preview ready'));
      })
      .catch(() => this.setStatus(authoringText('Tour preview could not start')));
    this.emit();
  }

  exportMetrics(): void {
    this.metricsText = this.services.exportMetricsReport(this.metricsSessionId);
    this.setStatus(authoringText('Activity report ready'));
  }

  protected readonly handlePageHide = (): void => {
    this.destroy();
  };
}
