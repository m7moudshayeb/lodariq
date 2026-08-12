import { ControllerTargetDocumentFeature } from './controller-target-document';
import {
  AUTHORING_BRAND_DRIFT_PREVIEW_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  type LodariqBlock,
} from '@lodariq/schema';
import { hasBlock, type BlockInsertPosition } from '../document-ops';
import { createBridgeCorrelationId } from '../../bridge/transport';
import type { LocalAuthoringFrameSnapshot } from './types';
import type { LocalAuthoringFrameMetricName } from '../local-frame-types';
import { findBlockById, isEditableContentBlock } from './utils';
import { AuthoringBrandDriftController } from '../brand-drift-controller';

export class ControllerSnapshotFeature extends ControllerTargetDocumentFeature {
  protected recordChange(): void {
    this.undoStack.push(this.snapshot());
    this.redoStack.length = 0;
  }

  protected recordMetric(name: LocalAuthoringFrameMetricName): void {
    this.services.recordMetric({
      sessionId: this.metricsSessionId,
      documentId: this.documentState.id,
      name,
    });
    this.renderMetrics();
    this.emit();
  }

  protected renderMetrics(): void {
    const summary = this.services.getMetricsSummary(this.metricsSessionId);
    this.metricsText = JSON.stringify(summary ?? {}, null, 2);
  }

  protected afterDocumentMutation(): void {
    this.documentState = this.normalizeDocument(this.documentState);
    this.documentChangeSequence += 1;
    this.releaseRequestVersion += 1;
    this.panelWorkflowRequestVersion += 1;
    this.pendingPublicationRequest = null;
    if (
      this.panelOperation === 'verifying-release' ||
      this.panelOperation === 'promoting-release' ||
      this.panelOperation === 'requesting-approval' ||
      this.panelOperation === 'approving-release'
    ) {
      this.panelOperation = null;
      this.panelWorkflowNotice = 'Draft changed. Publish and verify the new artifact again.';
    }
    if (this.services.publishToStaging) {
      this.release = {
        status: 'ready',
        reason: 'unsaved_changes',
        expectedGeneration: this.release.expectedGeneration,
        findings: [],
      };
    }
    if (this.releaseWorkflow) {
      const nextDraftVersion = this.releaseWorkflow.draft.version;
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        draft: {
          ...(typeof nextDraftVersion === 'number' ? { version: nextDraftVersion + 1 } : {}),
          dirty: true,
        },
      };
    }
    if (this.panelMode === 'promotion-confirmation') {
      this.panelMode = 'release-verification';
      this.panelReturnMode = 'edit';
      this.panelFocusToken += 1;
    }
    if (this.selectedBlockId && !hasBlock(this.documentState.blocks, this.selectedBlockId)) {
      this.selectedBlockId = null;
    }
    if (
      this.advancedEditorStepId &&
      !this.documentState.blocks.some(
        (block) => block.id === this.advancedEditorStepId && block.type === 'tourStep',
      )
    ) {
      this.advancedEditorStepId = null;
    }
    this.jsonText = this.services.exportDocument(this.documentState);
    this.renderMetrics();
    if (this.dragTargetBlockId && !hasBlock(this.documentState.blocks, this.dragTargetBlockId)) {
      this.dragTargetBlockId = null;
      this.dragTargetPosition = null;
    }
    this.emit();
  }

  protected clearSlash(): void {
    this.slashText = '';
    this.slashOpen = false;
  }

  protected focusBlock(blockId: string): void {
    this.selectedBlockId = blockId;
    this.focusRequest = { blockId, target: 'block', token: ++this.focusToken };
    this.emit();
  }

  protected focusEditableField(blockId: string, caret?: 'start' | 'end' | number): void {
    this.selectedBlockId = blockId;
    this.focusRequest = { blockId, target: 'edit', caret, token: ++this.focusToken };
    this.emit();
  }

  protected focusInsertedBlock(blockId: string): void {
    this.focusEditableField(blockId);
  }

  protected updateDragTarget(blockId: string | null, position: BlockInsertPosition | null): void {
    const nextBlockId =
      blockId && blockId !== this.draggingBlockId && hasBlock(this.documentState.blocks, blockId)
        ? blockId
        : null;
    const nextPosition = nextBlockId ? position : null;
    if (this.dragTargetBlockId === nextBlockId && this.dragTargetPosition === nextPosition) return;
    this.dragTargetBlockId = nextBlockId;
    this.dragTargetPosition = nextPosition;
    this.emit();
  }

  protected clearDragState(): void {
    const hadDragState =
      this.draggingBlockId !== null ||
      this.draggingStepBlockId !== null ||
      this.dragTargetBlockId !== null ||
      this.dragTargetPosition !== null;
    this.draggingBlockId = null;
    this.draggingStepBlockId = null;
    this.dragTargetBlockId = null;
    this.dragTargetPosition = null;
    if (hadDragState) this.emit();
  }

  protected stepContentBlocks(blocks: LodariqBlock[], stepBlockId: string): LodariqBlock[] {
    const step = findBlockById(blocks, stepBlockId);
    const tooltip = step?.children.find((child) => child.type === 'tooltip');
    return (tooltip?.children ?? []).filter(isEditableContentBlock);
  }

  protected setStatus(message: string): void {
    this.status = message;
    this.emit();
  }

  protected createBrandDriftController(): AuthoringBrandDriftController | null {
    const sampleProductStyle = this.services.sampleBrandStyle;
    const checkProductStyle = this.services.checkBrandDrift;
    if (!sampleProductStyle || !checkProductStyle) return null;

    const acknowledgeBrandTheme = this.services.acknowledgeBrandTheme;
    return new AuthoringBrandDriftController(
      {
        sampleProductStyle: async () => {
          const sampled = await sampleProductStyle({
            documentId: this.documentState.id,
            strategy: 'current-target',
          });
          return structuredClone(sampled.evidence);
        },
        checkProductStyle: (request) => checkProductStyle(request),
        previewRuntime: (mode) => {
          if (!this.isHostedInParent) {
            return Promise.reject(new Error('Brand drift runtime preview requires a host page'));
          }
          return this.bridge.sendWithAck(
            {
              protocol: BRIDGE_PROTOCOL_VERSION,
              sessionId: this.sessionId,
              documentId: this.documentState.id,
              correlationId: createBridgeCorrelationId('authoring_brand_drift_preview'),
              type: AUTHORING_BRAND_DRIFT_PREVIEW_TYPE,
              mode,
            },
            { timeoutMs: 4_000 },
          );
        },
        ...(acknowledgeBrandTheme
          ? {
              acknowledgeThemeVersion: async (request) => {
                const acknowledgement = await acknowledgeBrandTheme({
                  ...request,
                  document: structuredClone(this.documentState),
                });
                this.documentState = this.normalizeDocument(
                  structuredClone(acknowledgement.document),
                );
                this.services.saveDocument(this.documentState);
                this.jsonText = this.services.exportDocument(this.documentState);
                const getBrandWorkflowState = this.services.getBrandWorkflowState;
                if (getBrandWorkflowState) {
                  this.brandWorkflow = structuredClone(await getBrandWorkflowState());
                }
                return acknowledgement;
              },
            }
          : {}),
      },
      (snapshot) => {
        this.brandDrift = snapshot;
        if (this.started) this.emit();
      },
    );
  }

  protected makeSnapshot(): LocalAuthoringFrameSnapshot {
    return {
      documentState: this.documentState,
      previewTheme: this.previewTheme ? structuredClone(this.previewTheme) : null,
      previewPreferences: this.previewPreferences ? { ...this.previewPreferences } : null,
      status: this.status,
      saveState: { ...this.saveState },
      slashText: this.slashText,
      slashOpen: this.slashOpen,
      jsonText: this.jsonText,
      compiledText: this.compiledText,
      metricsText: this.metricsText,
      selectedBlockId: this.selectedBlockId,
      advancedEditorStepId: this.advancedEditorStepId,
      dragTargetBlockId: this.dragTargetBlockId,
      dragTargetPosition: this.dragTargetPosition,
      targetDiagnostics: new Map(this.targetDiagnostics),
      advancedTargetIds: new Set(this.advancedTargetIds),
      focusRequest: this.focusRequest,
      release: {
        ...this.release,
        findings: structuredClone(this.release.findings),
      },
      panelWorkflow: {
        mode: this.panelMode,
        returnMode: this.panelReturnMode,
        focusToken: this.panelFocusToken,
        returnFocus: this.panelReturnFocus,
        focusTarget: this.panelFocusTarget,
        operation: this.panelOperation,
        brand: structuredClone(this.brandWorkflow),
        brandProposal: this.brandProposal ? structuredClone(this.brandProposal) : null,
        brandDrift: structuredClone(this.brandDrift),
        release: this.releaseWorkflow ? structuredClone(this.releaseWorkflow) : null,
        releaseRecovery: {
          available: Boolean(this.services.getReleaseRecoveryState),
          environmentId: this.releaseRecoveryEnvironmentId,
          model: this.releaseRecoveryModel ? structuredClone(this.releaseRecoveryModel) : null,
          intent: this.releaseRecoveryIntent ? structuredClone(this.releaseRecoveryIntent) : null,
          requestIdentity: this.releaseRecoveryRequestIdentity
            ? { ...this.releaseRecoveryRequestIdentity }
            : null,
        },
        error: this.panelWorkflowError,
        notice: this.panelWorkflowNotice,
      },
    };
  }

  protected emit(): void {
    this.snapshotValue = this.makeSnapshot();
    for (const subscriber of this.subscribers) {
      subscriber(this.snapshotValue);
    }
  }
}
