import { ControllerBase } from './controller-base';
import { authoringText } from '../../i18n';
import {
  AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  type AuthoringPanelLayoutMode,
  type AuthoringAccessibilityPreviewMode,
  type AuthoringFlowSimulationContext,
  type AuthoringDiagnosticAttributes,
} from '@lodariq/schema';
import { hasBlock } from '../document-ops';
import { createBridgeCorrelationId } from '../../bridge/transport';
import type { CardCommandRequest, LocalAuthoringFrameSnapshot } from './types';
import type { LocalAuthoringFrameMetricName } from '../local-frame-types';
import { blockDisplayTitle } from './utils';
import { isDefaultDocumentLocale } from '../document-localization';

export abstract class ControllerLifecycleFeature extends ControllerBase {
  protected abstract emit(): void;
  protected abstract flushPreviewPatches(): void;
  /** Implemented alongside the other frame→host announcements. */
  protected abstract sendShellCapabilities(): void;
  protected abstract readonly handlePageHide: () => void;
  protected abstract readonly handleWindowKeyDown: (event: globalThis.KeyboardEvent) => void;
  protected abstract recordMetric(
    name: LocalAuthoringFrameMetricName,
    attributes?: AuthoringDiagnosticAttributes,
  ): void;
  protected abstract recordMetricWithoutEmit(
    name: LocalAuthoringFrameMetricName,
    attributes?: AuthoringDiagnosticAttributes,
  ): void;
  abstract refreshPanelWorkflowState(): void;
  abstract refreshStagingRelease(): void;
  protected abstract sendPreviewRequest(
    mode: 'approach' | 'full' | 'step',
    stepId?: string,
    accessibilityMode?: AuthoringAccessibilityPreviewMode,
    simulationContext?: AuthoringFlowSimulationContext,
  ): Promise<void>;
  /** Declared here so the escape handler, which sits above the chrome feature,
   *  can end a recording run without reaching down the chain. */
  protected abstract stopStepRecording(): void;
  protected abstract setStatus(message: string): void;

  protected allowDocumentStructureMutation(): boolean {
    if (isDefaultDocumentLocale(this.documentState, this.contentLocale)) return true;
    this.setStatus(
      authoringText('Switch to the default language to change the experience structure.'),
    );
    return false;
  }

  getSnapshot(): LocalAuthoringFrameSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: (snapshot: LocalAuthoringFrameSnapshot) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.bridge.start();
    // Announced as soon as the frame can talk, not only in reply to `init`: the
    // host sends that the moment its own bridge is up, which can be before this
    // one is listening, and a reply to a message never received never happens.
    this.sendShellCapabilities();
    window.addEventListener('pagehide', this.handlePageHide, { once: true });
    window.addEventListener('keydown', this.handleWindowKeyDown);
    this.recordMetric('authoring.opened');
    this.refreshStagingRelease();
    this.refreshPanelWorkflowState();
    this.brandDriftController?.initialize();
    this.syncStepLockForSelection(this.selectedBlockId);
    this.startCollaborationTransport();
  }

  destroy(): void {
    this.documentTransactions.flush();
    this.stopCollaborationTransport();
    this.releaseStepLockLease();
    this.releaseMediaAssetPreviews();
    if (!this.started) {
      this.interactionActor.stop();
      return;
    }
    this.started = false;
    this.releaseRequestVersion += 1;
    this.releaseRecoveryRequestVersion += 1;
    this.panelWorkflowRequestVersion += 1;
    this.brandDriftController?.dispose();
    window.removeEventListener('pagehide', this.handlePageHide);
    window.removeEventListener('keydown', this.handleWindowKeyDown);
    this.flushPreviewPatches();
    this.bridge.stop();
    this.interactionActor.stop();
  }

  setSlashText(value: string): void {
    this.slashText = value;
    this.slashOpen = value.trim().length > 0;
    if (this.slashOpen) this.interactionActor.send({ type: 'OPEN_INSERT' });
    this.emit();
  }

  closeSlashComposer(): void {
    if (!this.slashOpen) return;
    this.slashOpen = false;
    this.interactionActor.send({ type: 'CLOSE_OVERLAY' });
    this.emit();
  }

  selectBlock(blockId: string): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    if (this.selectedBlockId === blockId) return;
    this.documentTransactions.flush();
    this.selectedBlockId = blockId;
    this.syncStepLockForSelection(blockId);
    this.emit();
  }

  /**
   * Ask the card to change its own structure (§4.3).
   *
   * The inspector can set any *property* of a block by writing to the document,
   * because properties round-trip through the editor's own export. Adding or
   * removing a block cannot: on the overlay the card is a Lexical editor holding
   * the only live copy of its content, so a block written straight to the
   * document would never appear and would be dropped on the editor's next save.
   * The command goes to the editor and the document follows from there.
   */
  requestCardCommand(kind: CardCommandRequest['kind'], blockId?: string): void {
    this.cardCommandRequest = { kind, blockId, token: ++this.cardCommandToken };
    this.emit();
  }

  activateTourStep(stepId: string): void {
    const step = this.documentState.blocks.find(
      (block) => block.id === stepId && block.type === 'tourStep',
    );
    if (!step) return;
    this.documentTransactions.flush();
    this.selectedBlockId = stepId;
    this.syncStepLockForSelection(stepId);
    this.advancedEditorStepId = null;
    void this.sendPreviewRequest('step', stepId).catch(() => {
      this.setStatus(authoringText('Step preview could not start'));
    });
    this.setStatus(`Showing ${blockDisplayTitle(step)}`);
    // Without this the inspector's tag reads "Needs context" for a target the
    // ring is drawn around: the ledger only hears about explicit inspections.
    this.verifyActiveTarget();
  }

  openAdvancedEditor(stepId: string): void {
    const step = this.documentState.blocks.find(
      (block) => block.id === stepId && block.type === 'tourStep',
    );
    if (!step) return;
    this.documentTransactions.flush();
    if (this.panelMode !== 'edit') {
      this.brandDriftController?.restorePreview();
      this.panelWorkflowRequestVersion += 1;
      this.panelMode = 'edit';
      this.panelReturnMode = 'edit';
      this.panelOperation = null;
      this.panelWorkflowError = null;
      this.panelWorkflowNotice = null;
      this.panelFocusTarget = null;
      this.panelFocusToken += 1;
    }
    this.selectedBlockId = stepId;
    this.syncStepLockForSelection(stepId);
    this.advancedEditorStepId = stepId;
    this.interactionActor.send({ type: 'OPEN_DETAILS' });
    this.setStatus(`Advanced settings for ${blockDisplayTitle(step)}`);
  }

  closeAdvancedEditor(): void {
    if (!this.advancedEditorStepId) return;
    this.advancedEditorStepId = null;
    this.interactionActor.send({ type: 'CLOSE_OVERLAY' });
    this.setStatus(authoringText('Back to live authoring'));
  }

  togglePanelWorkspace(): void {
    const mode: AuthoringPanelLayoutMode = window.innerWidth >= 520 ? 'compact' : 'standard';
    this.requestPanelLayout(mode);
  }

  requestPanelLayout(mode: AuthoringPanelLayoutMode): void {
    if (!this.isHostedInParent) return;
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: createBridgeCorrelationId('authoring_panel_layout'),
          type: AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
          mode,
        },
        { timeoutMs: 2_000 },
      )
      .catch(() => this.setStatus(authoringText('Workspace size could not be changed')));
  }

  clearSelection(): void {
    if (!this.selectedBlockId) return;
    this.selectedBlockId = null;
    this.emit();
  }

  setJsonText(value: string): void {
    this.jsonText = value;
    this.emit();
  }
}
