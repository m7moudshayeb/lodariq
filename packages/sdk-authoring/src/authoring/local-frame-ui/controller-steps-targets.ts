import { ControllerContentFeature } from './controller-content';
import { authoringText } from '../../i18n';
import {
  BRIDGE_PROTOCOL_VERSION,
  type PreviewPatchOperation,
  type PresentationAnchor,
  type RuntimeLifecycleHints,
  type TargetInspectAction,
  type TargetIdentityV2,
  type TargetLocalizedEvidence,
  type TargetApproach,
  sanitizeTargetApproach,
} from '@lodariq/schema';
import { TARGET_MAX_LOCALE_VARIANTS } from '@lodariq/schema/target-runtime';
import {
  blocksReferenceTarget,
  documentWithBlocks,
  createTourStep,
  duplicateTopLevelBlock,
  hasBlock,
  moveTopLevelBlock as moveTopLevelBlocks,
  renumberTourSteps,
  removeTopLevelBlock,
  removeTargetFromBlocks,
  reorderTopLevelBlock as reorderTopLevelBlocks,
  type BlockDirection,
  type BlockInsertPosition,
} from '../document-ops';
import { createBridgeCorrelationId } from '../../bridge/transport';
import type { DocumentTarget } from './types';
import { type TargetLifecycleControl } from './types';
import { findBlockById } from './utils';
import {
  firstBlockIdForTarget,
  firstTargetIdInBlock,
  isTargetLifecycleScrollStrategy,
  requiredTargetActionForBlock,
  targetInspectionPendingStatus,
} from './controller-model';

export abstract class ControllerStepsTargetsFeature extends ControllerContentFeature {
  protected abstract commitPresentationAnchor(
    blockId: string,
    targetId: string,
    presentationAnchor?: PresentationAnchor,
  ): void;
  protected abstract sendConfirmedPreviewPatch(
    blockId: string,
    ops: PreviewPatchOperation[],
  ): Promise<void>;
  protected abstract targetById(targetId: string): DocumentTarget | undefined;
  protected abstract updateTargetLifecycle(
    targetId: string,
    updater: (current: RuntimeLifecycleHints) => RuntimeLifecycleHints,
  ): void;

  appendStep(title?: string): string {
    if (!this.allowDocumentStructureMutation()) return '';
    const block = createTourStep(this.nextStepIndex(), title?.trim() || undefined);
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: renumberTourSteps([...this.documentState.blocks, block]),
    };
    this.afterDocumentMutation();
    this.clearSlash();
    this.selectedBlockId = block.id;
    this.focusEditableField(block.id);
    this.services.saveDocument(this.documentState);
    this.setStatus(authoringText('Added step'));
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(block.id, [{ op: 'insertBlock', block }]);
    return block.id;
  }

  appendStepAndChooseTarget(): void {
    const blockId = this.appendStep();
    if (blockId) this.startTargetPick(blockId);
  }

  /**
   * A step inserted where the creator pointed, not at the end (§4.5), then the
   * picker — creating a step and choosing what it points at is one gesture.
   */
  insertStepBeforeAndChooseTarget(neighbourStepId: string): void {
    if (!this.allowDocumentStructureMutation()) return;
    const index = this.documentState.blocks.findIndex((block) => block.id === neighbourStepId);
    if (index < 0) {
      this.appendStepAndChooseTarget();
      return;
    }
    const block = createTourStep(index);
    this.recordChange();
    const blocks = [...this.documentState.blocks];
    blocks.splice(index, 0, block);
    this.documentState = { ...this.documentState, blocks: renumberTourSteps(blocks) };
    this.afterDocumentMutation();
    this.clearSlash();
    this.selectedBlockId = block.id;
    this.services.saveDocument(this.documentState);
    this.setStatus(authoringText('Added step'));
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(block.id, [{ op: 'insertBlock', block }]);
    this.startTargetPick(block.id);
  }

  moveTopLevelBlock(blockId: string, direction: BlockDirection): void {
    if (!this.allowDocumentStructureMutation()) return;
    const blocks = moveTopLevelBlocks(this.documentState.blocks, blockId, direction);
    if (!blocks) return;
    this.commitCoordinatedMutation({
      blockId,
      operations: [{ op: 'moveBlock', direction }],
      reduce: (document) => {
        const moved = moveTopLevelBlocks(document.blocks, blockId, direction);
        return moved ? { ...document, blocks: renumberTourSteps(moved) } : document;
      },
      scope: 'structure',
      status: authoringText('Moved step'),
    });
    this.focusBlock(blockId);
  }

  duplicateTopLevelBlock(blockId: string): void {
    if (!this.allowDocumentStructureMutation()) return;
    const blockIndex = this.documentState.blocks.findIndex((block) => block.id === blockId);
    const blocks = duplicateTopLevelBlock(this.documentState.blocks, blockId);
    if (!blocks) return;
    const duplicatedBlockId = blocks[blockIndex + 1]?.id ?? blockId;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks: renumberTourSteps(blocks) };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = duplicatedBlockId;
    this.focusBlock(duplicatedBlockId);
    this.setStatus(authoringText('Duplicated step'));
    const duplicatedBlock = blocks[blockIndex + 1];
    if (duplicatedBlock) {
      this.sendPreviewPatch(duplicatedBlock.id, [
        { op: 'insertBlock', block: duplicatedBlock, anchorBlockId: blockId, position: 'after' },
      ]);
    }
  }

  deleteTopLevelBlock(blockId: string): void {
    if (!this.allowDocumentStructureMutation()) return;
    const blockIndex = this.documentState.blocks.findIndex((block) => block.id === blockId);
    const blocks = removeTopLevelBlock(this.documentState.blocks, blockId);
    if (!blocks) return;
    const nextSelection = blocks[Math.min(blockIndex, blocks.length - 1)]?.id ?? null;
    this.recordChange();
    this.documentState = documentWithBlocks(this.documentState, renumberTourSteps(blocks));
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = nextSelection;
    if (this.advancedEditorStepId === blockId) this.advancedEditorStepId = null;
    if (nextSelection) this.focusBlock(nextSelection);
    this.setStatus(authoringText('Deleted step'));
    this.sendPreviewPatch(blockId, [{ op: 'removeBlock' }]);
  }

  reorderTopLevelBlock(
    blockId: string,
    targetBlockId: string,
    position: BlockInsertPosition = 'before',
  ): void {
    if (!this.allowDocumentStructureMutation()) return;
    const blocks = reorderTopLevelBlocks(
      this.documentState.blocks,
      blockId,
      targetBlockId,
      position,
    );
    if (!blocks) return;
    this.commitCoordinatedMutation({
      blockId,
      operations: [{ op: 'reorderBlock', beforeBlockId: targetBlockId, position }],
      reduce: (document) => {
        const reordered = reorderTopLevelBlocks(document.blocks, blockId, targetBlockId, position);
        return reordered ? { ...document, blocks: renumberTourSteps(reordered) } : document;
      },
      scope: 'structure',
      status: authoringText('Moved step'),
    });
    this.focusBlock(blockId);
  }

  removeTargetFromBlock(blockId: string, targetId: string): void {
    if (!hasBlock(this.documentState.blocks, blockId) || !this.targetById(targetId)) return;
    this.recordChange();
    const blocks = removeTargetFromBlocks(this.documentState.blocks, blockId, targetId);
    this.documentState = {
      ...this.documentState,
      targets: blocksReferenceTarget(blocks, targetId)
        ? this.documentState.targets
        : this.documentState.targets.filter((target) => target.id !== targetId),
      blocks,
    };
    this.targetDiagnostics.delete(targetId);
    this.targetHealthLedger.removeTarget(targetId);
    this.activeTargetInspectionRequestIds.delete(targetId);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = blockId;
    this.setStatus(authoringText('Removing placement…'));
    void this.sendConfirmedPreviewPatch(blockId, [{ op: 'removeTarget', targetId }]).then(
      () => this.setStatus(authoringText('Removed placement; choose a new one')),
      () =>
        this.setStatus(
          authoringText('Placement removed, but the live preview did not confirm the change'),
        ),
    );
  }

  /**
   * Record what a target's control says in a language it was never captured in.
   * Silent and additive: never overwrites a known locale, never asks the author.
   */
  protected learnTargetLanguage(targetId: string, learned?: TargetLocalizedEvidence): void {
    if (!learned) return;
    const target = this.targetById(targetId);
    const identity = target?.identity;
    if (!identity || identity.localizedEvidence.length >= TARGET_MAX_LOCALE_VARIANTS) return;
    if (identity.localizedEvidence.some((entry) => entry.locale === learned.locale)) return;
    this.documentState = {
      ...this.documentState,
      targets: this.documentState.targets.map((entry) =>
        entry.id === targetId
          ? {
              ...entry,
              identity: {
                ...identity,
                localizedEvidence: [...identity.localizedEvidence, learned],
              },
            }
          : entry,
      ),
    };
    this.services.saveDocument(this.documentState);
  }

  toggleTargetAdvanced(targetId: string): void {
    if (this.advancedTargetIds.has(targetId)) {
      this.advancedTargetIds.delete(targetId);
    } else {
      this.advancedTargetIds.add(targetId);
    }
    this.setStatus(authoringText('Placement details updated'));
  }

  setTargetWaitForText(targetId: string, waitForText: string): void {
    this.updateTargetLifecycle(targetId, (current) => {
      const next = { ...current };
      const trimmed = waitForText.trim();
      if (trimmed) {
        next.waitForText = trimmed;
        if (this.hostPageLocale) next.waitForTextLocale = this.hostPageLocale;
      } else {
        delete next.waitForText;
        delete next.waitForTextLocale;
      }
      return next;
    });
  }

  setTargetScrollStrategy(targetId: string, scrollStrategy: string): void {
    this.updateTargetLifecycle(targetId, (current) => {
      const next = { ...current };
      if (isTargetLifecycleScrollStrategy(scrollStrategy)) {
        next.scrollStrategy = scrollStrategy;
      } else {
        delete next.scrollStrategy;
      }
      return next;
    });
  }

  setTargetLifecycleControl(
    targetId: string,
    control: TargetLifecycleControl,
    enabled: boolean,
  ): void {
    const target = this.targetById(targetId);
    if (!target) return;
    this.updateTargetLifecycle(targetId, (current) => {
      const next = { ...current };
      if (enabled) {
        next[control] = structuredClone(target.fingerprint);
      } else {
        delete next[control];
      }
      return next;
    });
  }

  setTargetApproach(targetId: string, approach: TargetApproach | undefined): void {
    const target = this.targetById(targetId);
    if (!target) return;
    const nextApproach = approach ? sanitizeTargetApproach(approach) : undefined;
    if (approach && !nextApproach) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      targets: this.documentState.targets.map((item) => {
        if (item.id !== targetId) return item;
        if (nextApproach) return { ...item, approach: nextApproach };
        return { ...item, approach: undefined };
      }),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    const blockId =
      firstBlockIdForTarget(this.documentState.blocks, targetId) ?? this.documentState.id;
    this.sendPreviewPatch(blockId, [
      nextApproach
        ? { op: 'setTargetApproach', targetId, approach: nextApproach }
        : { op: 'setTargetApproach', targetId },
    ]);
  }

  setTargetApproachLabel(targetId: string, legIndex: number, label: string): void {
    const approach = this.targetById(targetId)?.approach;
    const trimmed = label.trim();
    if (!approach || !trimmed || legIndex < 0 || legIndex >= approach.legs.length) return;
    const legs = approach.legs.map((leg, index) =>
      index === legIndex ? { ...leg, label: trimmed.slice(0, 120) } : structuredClone(leg),
    );
    this.setTargetApproach(targetId, { legs });
    this.setStatus(authoringText('Approach updated'));
  }

  moveTargetApproachLeg(targetId: string, legIndex: number, direction: 'up' | 'down'): void {
    const approach = this.targetById(targetId)?.approach;
    if (!approach) return;
    const destination = legIndex + (direction === 'up' ? -1 : 1);
    if (legIndex < 0 || destination < 0 || destination >= approach.legs.length) return;
    const legs = structuredClone(approach.legs);
    const [leg] = legs.splice(legIndex, 1);
    if (!leg) return;
    legs.splice(destination, 0, leg);
    this.setTargetApproach(targetId, { legs });
    this.setStatus(authoringText('Approach updated'));
  }

  removeTargetApproachLeg(targetId: string, legIndex: number): void {
    const approach = this.targetById(targetId)?.approach;
    if (!approach || legIndex < 0 || legIndex >= approach.legs.length) return;
    const legs = approach.legs
      .filter((_, index) => index !== legIndex)
      .map((leg) => structuredClone(leg));
    this.setTargetApproach(targetId, legs.length ? { legs } : undefined);
    this.setStatus(authoringText(legs.length ? 'Approach updated' : 'Approach removed'));
  }

  replayTargetApproach(stepId: string, targetId: string): void {
    const target = this.targetById(targetId);
    if (!target?.approach) return;
    this.setStatus(authoringText('Replaying approach…'));
    void this.sendPreviewRequest('approach', stepId).then(
      () => {
        const current = this.targetById(targetId)?.approach;
        if (current) this.setTargetApproach(targetId, { ...current, lastOutcome: 'pass' });
        this.setStatus(authoringText('Approach passed'));
      },
      () => {
        const current = this.targetById(targetId)?.approach;
        if (current) this.setTargetApproach(targetId, { ...current, lastOutcome: 'fail' });
        this.setStatus(authoringText('Approach needs repair'));
      },
    );
  }

  /** §4.3's target kind, asked for by the on-page ring (§4.4). */
  inspectTarget(stepId: string, section?: string): void {
    this.selectBlock(stepId);
    this.targetInspectRequest = {
      stepId,
      ...(section ? { section } : {}),
      token: ++this.targetInspectToken,
    };
    // The ledger only hears about explicit inspections, so a target the ring is
    // drawn around still read as "not looked at yet" until this ran.
    this.verifyActiveTarget();
    this.emit();
  }

  /** Asks the host to resolve the selected step's target and file the result. */
  protected verifyActiveTarget(): void {
    const step = this.selectedTourStep();
    const targetId = step ? firstTargetIdInBlock(step) : null;
    if (step && targetId) this.requestTargetInspection(step.id, targetId, 'health');
  }

  startTargetPick(blockId: string): void {
    if (!this.isHostedInParent) {
      this.setStatus(authoringText('Open the editor on a preview page to choose placements'));
      return;
    }
    this.setStatus(authoringText('Select where this step appears'));
    this.selectBlock(blockId);
    this.recordMetric('target.pick.started');
    this.pendingTargetBlockId = blockId;
    this.canceledTargetBlockIds.delete(blockId);
    const block = findBlockById(this.documentState.blocks, blockId);
    const targetId = block ? firstTargetIdInBlock(block) : null;
    const target = targetId ? this.targetById(targetId) : null;
    if (targetId) this.activeTargetInspectionRequestIds.delete(targetId);
    const captureCorrelationId = createBridgeCorrelationId('target_pick_start');
    this.activeTargetCaptureCorrelationId = captureCorrelationId;
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: captureCorrelationId,
          type: 'target.pick.start',
          blockId,
          requiredAction: requiredTargetActionForBlock(block),
          ...(target ? { fingerprint: structuredClone(target.fingerprint) } : {}),
          ...(target?.identity ? { identity: structuredClone(target.identity) } : {}),
        },
        { timeoutMs: 2000 },
      )
      .catch(() => {
        if (this.activeTargetCaptureCorrelationId === captureCorrelationId) {
          this.activeTargetCaptureCorrelationId = null;
        }
        this.pendingTargetBlockId = null;
        this.recordMetric('target.pick.failed');
        this.setStatus(authoringText('Placement picker did not respond'));
      });
  }

  startPresentationAnchorPick(blockId: string, targetId: string): void {
    if (!this.isHostedInParent) {
      this.setStatus(authoringText('Open the editor on a preview page to choose an exact area'));
      return;
    }
    const contextBlock = findBlockById(this.documentState.blocks, blockId);
    const targetBlockId = contextBlock ? firstBlockIdForTarget([contextBlock], targetId) : null;
    const targetBlock = targetBlockId
      ? findBlockById(this.documentState.blocks, targetBlockId)
      : null;
    if (
      !targetBlockId ||
      !targetBlock ||
      targetBlock.props.targetId !== targetId ||
      !this.targetById(targetId)
    ) {
      this.setStatus(authoringText('Choose a placement before setting an exact area'));
      return;
    }

    const requestCorrelationId = createBridgeCorrelationId('presentation_anchor_pick_start');
    this.pendingPresentationAnchorPick = { blockId: targetBlockId, targetId, requestCorrelationId };
    this.selectBlock(blockId);
    this.setStatus(authoringText('Drag an exact area, click for a point, or use the arrow keys'));
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: requestCorrelationId,
          type: 'presentation.anchor.pick.start',
          blockId: targetBlockId,
          targetId,
          ...(targetBlock.props.presentationAnchor
            ? { current: structuredClone(targetBlock.props.presentationAnchor) }
            : {}),
        },
        { timeoutMs: 2_000 },
      )
      .catch(() => {
        if (this.pendingPresentationAnchorPick?.requestCorrelationId !== requestCorrelationId) {
          return;
        }
        this.pendingPresentationAnchorPick = null;
        this.setStatus(authoringText('Exact area picker did not respond'));
      });
  }

  useWholeElement(blockId: string, targetId: string): void {
    const contextBlock = findBlockById(this.documentState.blocks, blockId);
    const targetBlockId = contextBlock ? firstBlockIdForTarget([contextBlock], targetId) : null;
    if (!targetBlockId) return;
    const targetBlock = findBlockById(this.documentState.blocks, targetBlockId);
    if (targetBlock?.props.targetId !== targetId || !targetBlock.props.presentationAnchor) return;
    this.commitPresentationAnchor(targetBlockId, targetId);
  }

  requestTargetInspection(blockId: string, targetId: string, action: TargetInspectAction): void {
    const target = this.targetById(targetId);
    const contextBlock = findBlockById(this.documentState.blocks, blockId);
    if (!target || !contextBlock) return;
    if (!this.isHostedInParent) {
      this.setStatus(authoringText('Open the editor on a preview page to check placements'));
      return;
    }
    this.setStatus(targetInspectionPendingStatus(action));
    this.targetHealthLedger.beginInspection(targetId);
    const requestCorrelationId = createBridgeCorrelationId('target_inspect_request');
    this.activeTargetInspectionRequestIds.set(targetId, requestCorrelationId);
    const requiredAction = requiredTargetActionForBlock(contextBlock);
    const inspectionIdentity: TargetIdentityV2 | undefined = target.identity
      ? {
          ...structuredClone(target.identity),
          intent:
            requiredAction === 'anchor'
              ? { ...target.identity.intent, requiredAction }
              : {
                  elementKind: target.identity.intent.elementKind,
                  requiredAction,
                  resolutionMode: 'semantic',
                },
        }
      : undefined;
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: requestCorrelationId,
          type: 'target.inspect.request',
          blockId,
          targetId,
          action,
          fingerprint: target.fingerprint,
          ...(inspectionIdentity ? { identity: inspectionIdentity } : {}),
        },
        { timeoutMs: 2000 },
      )
      .catch(() => {
        if (this.activeTargetInspectionRequestIds.get(targetId) !== requestCorrelationId) return;
        this.activeTargetInspectionRequestIds.delete(targetId);
        this.targetDiagnostics.set(targetId, {
          action,
          diagnostic: {
            state: 'missing',
            confidence: 0,
            candidateCount: 0,
            resolutionMethod: 'none',
            message: authoringText('Placement check did not respond'),
          },
        });
        this.targetHealthLedger.inspectionFailed(targetId, {
          state: 'missing',
          confidence: 0,
          candidateCount: 0,
          resolutionMethod: 'none',
          message: authoringText('Placement check did not respond'),
        });
        this.setStatus(authoringText('Placement check did not respond'));
      });
  }
}
