import { ControllerPreviewFeature } from './controller-preview';
import { authoringText } from '../../i18n';
import {
  AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
  AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
  AUTHORING_CHROME_ACTION_REQUEST_TYPE,
  AUTHORING_PANEL_MODE_OPEN_TYPE,
  AUTHORING_SAVE_STATE_UPDATE_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  isPresentationAnchor,
  DEFAULT_EXPERIENCE_APPEARANCE,
  resolveExperienceAppearance,
  type BridgeMessage,
  type TargetLocale,
  type TargetViewportClass,
} from '@lodariq/schema';
import { attachTargetToBlocks, hasBlock } from '../document-ops';
import { createBridgeCorrelationId } from '../../bridge/transport';
import { createTargetId } from '../../editor';
import type { AuthoringPanelMode, DocumentTarget } from './types';
import { findBlockById, targetInspectionStatus } from './utils';
import {
  isInlinePreviewContentType,
  normalizeInlinePreviewContent,
} from '../inline-preview-editor';
import {
  firstBlockIdForTarget,
  firstTargetIdInBlock,
  presentationAnchorMessageMatchesPending,
} from './controller-model';
import { authoringTargetIdentityKey } from '../target-health-ledger';

export abstract class ControllerBridgeFeature extends ControllerPreviewFeature {
  protected abstract handlePageLifecycleUpdate(
    route: string,
    routePatternId: string | undefined,
    stateId: string | undefined,
    locale: TargetLocale | undefined,
    viewportClass: TargetViewportClass | undefined,
  ): void;
  protected abstract handleTargetEvidenceUpdate(
    message: Extract<BridgeMessage, { type: 'target.evidence.update' }>,
  ): void;

  protected handleBridgeMessage(message: BridgeMessage): Promise<void> | void {
    if (message.sessionId !== this.sessionId || message.documentId !== this.documentState.id) {
      return;
    }

    if (message.type === 'authoring.init') {
      this.previewTheme = message.theme ? structuredClone(message.theme) : undefined;
      this.previewPreferences = {
        prefersDark:
          message.prefersDark ??
          window.matchMedia?.('(prefers-color-scheme: dark)').matches ??
          false,
        prefersReducedMotion:
          message.prefersReducedMotion ??
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
          false,
      };
      this.emit();
      return;
    }

    if (message.type === 'authoring.save.request') {
      return this.persistRequestedDocument(message.correlationId);
    }

    if (message.type === AUTHORING_SAVE_STATE_UPDATE_TYPE) {
      this.saveState = { state: message.state, label: message.label };
      this.emit();
      return;
    }

    if (message.type === AUTHORING_PANEL_MODE_OPEN_TYPE) {
      this.openAppearanceMode();
      return;
    }

    if (message.type === AUTHORING_CHROME_ACTION_REQUEST_TYPE) {
      if (message.action === 'preview-full') this.previewFullTour();
      if (message.action === 'open-appearance') this.openAppearanceMode();
      if (message.action === 'open-release') this.openReleaseVerificationMode();
      if (message.action === 'save-and-exit') this.requestSaveAndExit();
      return;
    }

    if (message.type === AUTHORING_INLINE_CONTENT_COMMIT_TYPE) {
      const block = findBlockById(this.documentState.blocks, message.blockId);
      if (!block || !isInlinePreviewContentType(block.type)) return;
      this.commitContent(message.blockId, normalizeInlinePreviewContent(message.content));
      this.setStatus(authoringText('Content updated in preview'));
      return;
    }

    if (message.type === AUTHORING_INLINE_CONTROL_COMMIT_TYPE) {
      const operation = message.operation;
      if (operation.kind === 'setDocumentTitle') {
        this.commitDocumentTitle(operation.title);
        return;
      }
      if (operation.kind === 'setAppearance') {
        this.setDocumentAppearance(operation.appearance);
        return;
      }
      if (operation.kind === 'setPlacement') {
        this.setTooltipPlacement(operation.blockId, operation.placement);
        return;
      }
      if (operation.kind === 'setAction') {
        const block = findBlockById(this.documentState.blocks, operation.blockId);
        if (block?.type !== 'button' && block?.type !== 'link') return;
        this.setButtonAction(operation.blockId, operation.actionType);
        this.setStatus(authoringText('Button action updated in preview'));
        return;
      }
      if (operation.kind === 'openAdvanced') this.openAdvancedEditor(operation.stepId);
      return;
    }

    if (message.type === 'page.lifecycle.update') {
      this.handlePageLifecycleUpdate(
        message.route,
        message.routePatternId,
        message.stateId,
        message.locale,
        message.viewportClass,
      );
      return;
    }

    if (message.type === 'target.inspect.result') {
      const activeRequestId = this.activeTargetInspectionRequestIds.get(message.targetId);
      if (message.requestCorrelationId && activeRequestId !== message.requestCorrelationId) return;
      // A legacy uncorrelated result cannot be assigned safely while a newer
      // inspection or replacement capture owns the target generation.
      if (
        !message.requestCorrelationId &&
        (activeRequestId || this.activeTargetCaptureCorrelationId)
      ) {
        return;
      }
      if (
        !hasBlock(this.documentState.blocks, message.blockId) ||
        !this.targetById(message.targetId)
      ) {
        return;
      }
      this.activeTargetInspectionRequestIds.delete(message.targetId);
      this.targetDiagnostics.set(message.targetId, {
        action: message.action,
        diagnostic: message.diagnostic,
      });
      this.targetHealthLedger.recordObservation(message.targetId, message.diagnostic);
      if (message.diagnostic.state === 'found') {
        this.recordMetric('target.verification-passed');
      }
      this.setStatus(targetInspectionStatus(message.action, message.diagnostic));
      return;
    }

    if (message.type === 'presentation.anchor.pick.canceled') {
      const pending = this.pendingPresentationAnchorPick;
      if (!presentationAnchorMessageMatchesPending(message, pending)) return;
      this.pendingPresentationAnchorPick = null;
      this.setStatus(authoringText('Exact area selection canceled'));
      return;
    }

    if (message.type === 'presentation.anchor.pick.result') {
      const pending = this.pendingPresentationAnchorPick;
      if (!presentationAnchorMessageMatchesPending(message, pending)) return;
      this.pendingPresentationAnchorPick = null;
      if (!isPresentationAnchor(message.presentationAnchor)) {
        this.setStatus(authoringText('The exact area was invalid and was not saved'));
        return;
      }
      const block = findBlockById(this.documentState.blocks, message.blockId);
      if (block?.props.targetId !== message.targetId || !this.targetById(message.targetId)) {
        this.setStatus(authoringText('The placement changed before the exact area was saved'));
        return;
      }
      this.commitPresentationAnchor(message.blockId, message.targetId, message.presentationAnchor);
      return;
    }

    if (message.type === 'target.pick.canceled') {
      const alreadyCanceled = this.canceledTargetBlockIds.has(message.blockId);
      this.pendingTargetBlockId = null;
      this.activeTargetCaptureCorrelationId = null;
      this.canceledTargetBlockIds.add(message.blockId);
      if (!alreadyCanceled) this.recordMetric('target.pick.canceled');
      this.setStatus(authoringText('Placement selection canceled'));
      return;
    }

    if (message.type === 'target.evidence.update') {
      this.handleTargetEvidenceUpdate(message);
      return;
    }

    if (message.type !== 'target.pick.result') return;
    if (!hasBlock(this.documentState.blocks, message.blockId)) return;
    if (this.canceledTargetBlockIds.has(message.blockId)) return;
    if (
      message.captureCorrelationId &&
      message.captureCorrelationId !== this.activeTargetCaptureCorrelationId
    ) {
      return;
    }
    this.pendingTargetBlockId = null;
    this.canceledTargetBlockIds.delete(message.blockId);

    const currentBlock = findBlockById(this.documentState.blocks, message.blockId);
    const existingTargetId = currentBlock ? firstTargetIdInBlock(currentBlock) : null;
    const wasTargetlessDocument = this.documentState.targets.length === 0;
    const previousTargetBlockId =
      currentBlock && existingTargetId
        ? firstBlockIdForTarget([currentBlock], existingTargetId)
        : null;
    const targetId = existingTargetId ?? createTargetId();
    const label =
      message.identity?.display.authorLabel ??
      message.fingerprint.accessibleName ??
      message.fingerprint.stableAttributes['data-lodariq-id'] ??
      message.fingerprint.tagName;

    this.recordChange();
    const previousTarget = existingTargetId ? this.targetById(existingTargetId) : null;
    const identity = message.identity
      ? { ...structuredClone(message.identity), targetId }
      : undefined;
    const nextTarget: DocumentTarget = {
      id: targetId,
      fingerprint: message.fingerprint,
      ...(previousTarget?.lifecycle
        ? { lifecycle: structuredClone(previousTarget.lifecycle) }
        : {}),
      ...(identity ? { identity } : {}),
    };
    this.documentState = {
      ...this.documentState,
      targets: existingTargetId
        ? this.documentState.targets.map((target) =>
            target.id === existingTargetId ? nextTarget : target,
          )
        : [...this.documentState.targets, nextTarget],
      blocks: attachTargetToBlocks(this.documentState.blocks, message.blockId, targetId, label, {
        resetPresentationAnchor: Boolean(previousTargetBlockId),
      }),
    };
    if (
      previousTargetBlockId &&
      this.pendingPresentationAnchorPick?.blockId === previousTargetBlockId
    ) {
      this.pendingPresentationAnchorPick = null;
    }
    this.targetDiagnostics.delete(targetId);
    this.targetHealthLedger.registerTarget(
      targetId,
      authoringTargetIdentityKey(identity ?? message.fingerprint),
    );
    this.selectedBlockId = message.blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.recordMetric('target.pick.succeeded');
    if (previousTargetBlockId) {
      this.sendPreviewPatch(previousTargetBlockId, [{ op: 'setPresentationAnchor' }]);
    }
    const previewConfirmation = this.sendConfirmedPreviewPatch(message.blockId, [
      {
        op: 'attachTarget',
        targetId,
        fingerprint: message.fingerprint,
        ...(identity ? { identity } : {}),
      },
    ]);
    this.setStatus(`Placement set: ${label}. Verifying…`);
    this.requestTargetInspection(message.blockId, targetId, 'health');
    if (wasTargetlessDocument && !existingTargetId) {
      void this.matchFirstTargetStyle(targetId);
    }
    return previewConfirmation;
  }

  protected async matchFirstTargetStyle(targetId: string): Promise<void> {
    if (this.automaticTargetStyleMatchAttempted || this.panelOperation) return;
    const sampleBrandStyle = this.services.sampleBrandStyle;
    const applyBrandMatch = this.services.applyBrandMatch;
    if (!sampleBrandStyle || !applyBrandMatch) return;
    const appearance = resolveExperienceAppearance(
      this.documentState.appearance ?? DEFAULT_EXPERIENCE_APPEARANCE,
    );
    const defaultAppearance = resolveExperienceAppearance(DEFAULT_EXPERIENCE_APPEARANCE);
    if (JSON.stringify(appearance) !== JSON.stringify(defaultAppearance)) return;

    this.automaticTargetStyleMatchAttempted = true;
    const requestVersion = ++this.panelWorkflowRequestVersion;
    try {
      const proposal = await sampleBrandStyle({
        documentId: this.documentState.id,
        targetId,
        strategy: 'current-target',
      });
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || proposal.requiresConfirmation) {
        return;
      }
      await this.applyBrandMatchProposal(proposal, requestVersion, true);
    } catch {
      // Automatic matching is best-effort and must not interrupt target authoring.
    }
  }

  protected async persistRequestedDocument(requestCorrelationId: string): Promise<void> {
    this.saveCurrentDocument();
    const document = structuredClone(this.documentState);
    const documentSequence = this.documentChangeSequence;
    const persistInFrame = this.services.persistDocumentOnSaveRequest !== false;
    if (persistInFrame && this.services.persistDocument)
      this.setStatus(authoringText('Saving draft…'));
    try {
      if (persistInFrame) {
        await this.services.persistDocument?.(structuredClone(document));
      }
    } catch {
      this.setStatus(authoringText('Draft could not be saved'));
      throw new Error('Authoring document persistence failed');
    }
    this.setStatus(authoringText('Saved draft'));
    if (documentSequence === this.documentChangeSequence) this.refreshStagingRelease();
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: document.id,
      correlationId: createBridgeCorrelationId('authoring_save_result'),
      type: 'authoring.save.result',
      requestCorrelationId,
      document,
    });
  }

  protected openPanelMode(mode: AuthoringPanelMode, returnMode: AuthoringPanelMode): void {
    this.panelMode = mode;
    this.panelReturnMode = returnMode;
    this.panelFocusTarget = null;
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.panelFocusToken += 1;
    this.emit();
  }
}
