import { ControllerReleaseRecoveryFeature } from './controller-release-recovery';
import { authoringText } from '../../i18n';
import {
  BRIDGE_PROTOCOL_VERSION,
  type BlockActionProps,
  type BridgeMessage,
  type PreviewPatchOperation,
  type LodariqBlock,
  type LodariqDocument,
  type InlineTextRun,
  type PresentationAnchor,
  type RuntimeLifecycleHints,
  type TargetLocale,
  type TargetViewportClass,
} from '@lodariq/schema';
import {
  hasBlock,
  normalizeTourRootBlocks,
  reconcileInlineTextRuns,
  renumberTourSteps,
  setBlockAction,
  setBlockActionUrl,
  setBlockPresentationAnchor,
  transformBlocks,
  type EditableBlockType,
} from '../document-ops';
import { createBridgeCorrelationId } from '../../bridge/transport';
import { fromBlockJson, toBlockJson, type SerializedEditorState } from '../../editor';
import type { DocumentTarget, EditableActionType } from './types';
import {
  localizedAuthoringDocument,
  normalizeAuthoringDocumentLocalization,
  setAuthoringLocalizedBlockContent,
} from '../document-localization';
import { findBlockById } from './utils';
import {
  blockContainsId,
  createNextAction,
  firstBlockIdForTarget,
  firstTargetIdInBlock,
  normalizeTargetLifecycle,
  previewPatchForAction,
} from './controller-model';

export abstract class ControllerTargetDocumentFeature extends ControllerReleaseRecoveryFeature {
  protected handleTargetEvidenceUpdate(
    message: Extract<BridgeMessage, { type: 'target.evidence.update' }>,
  ): void {
    if (message.captureCorrelationId !== this.activeTargetCaptureCorrelationId) return;
    if (!hasBlock(this.documentState.blocks, message.blockId)) return;
    if (this.canceledTargetBlockIds.has(message.blockId)) return;

    const block = findBlockById(this.documentState.blocks, message.blockId);
    const targetId = block ? firstTargetIdInBlock(block) : null;
    const previousTarget = targetId ? this.targetById(targetId) : null;
    if (!targetId || !previousTarget) return;

    const identity = { ...structuredClone(message.identity), targetId };
    this.documentState = {
      ...this.documentState,
      targets: this.documentState.targets.map((target) =>
        target.id === targetId
          ? {
              id: targetId,
              fingerprint: structuredClone(message.fingerprint),
              identity,
              ...(target.lifecycle ? { lifecycle: structuredClone(target.lifecycle) } : {}),
            }
          : target,
      ),
    };
    this.targetDiagnostics.delete(targetId);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(message.blockId, [
      {
        op: 'updateTargetEvidence',
        targetId,
        fingerprint: message.fingerprint,
        identity,
      },
    ]);
    this.setStatus(authoringText('Placement evidence stabilized. Verifying…'));
    this.requestTargetInspection(message.blockId, targetId, 'health');
  }

  protected handlePageLifecycleUpdate(
    route: string,
    locale: TargetLocale | undefined,
    viewportClass: TargetViewportClass | undefined,
  ): void {
    const previousRoute = this.hostPageRoute;
    const previousLocale = this.hostPageLocale;
    const previousViewportClass = this.hostViewportClass;
    this.hostPageRoute = route;
    if (locale !== undefined) this.hostPageLocale = locale;
    if (viewportClass !== undefined) this.hostViewportClass = viewportClass;

    const routeChanged = previousRoute !== undefined && previousRoute !== route;
    const localeChanged =
      previousLocale !== undefined && locale !== undefined && previousLocale !== locale;
    const viewportChanged =
      previousViewportClass !== undefined &&
      viewportClass !== undefined &&
      previousViewportClass !== viewportClass;
    const contextBecameKnown =
      previousRoute === undefined ||
      (previousLocale === undefined && locale !== undefined) ||
      (previousViewportClass === undefined && viewportClass !== undefined);
    const diagnosticsPredateKnownContext = contextBecameKnown && this.targetDiagnostics.size > 0;
    const contextChanged = routeChanged || localeChanged || viewportChanged;
    if ((!contextChanged && !diagnosticsPredateKnownContext) || this.targetDiagnostics.size === 0) {
      return;
    }

    this.targetDiagnostics.clear();
    this.setStatus(authoringText('Page context changed; placements are unverified'));
    const activeStep = this.selectedTourStep();
    const activeTargetId = activeStep ? firstTargetIdInBlock(activeStep) : null;
    if (activeStep && activeTargetId) {
      this.requestTargetInspection(activeStep.id, activeTargetId, 'health');
    }
  }

  protected appendPastedBlocks(blocksToAdd: LodariqBlock[]): void {
    if (!this.allowDocumentStructureMutation()) return;
    if (!blocksToAdd.length) return;
    const blocks = normalizeTourRootBlocks(blocksToAdd);
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: renumberTourSteps([...this.documentState.blocks, ...blocks]),
    };
    this.selectedBlockId = blocks[0]?.id ?? null;
    this.afterDocumentMutation();
    if (this.selectedBlockId) this.focusEditableField(this.selectedBlockId);
    this.services.saveDocument(this.documentState);
    this.setStatus(authoringText('Pasted as steps'));
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(blocks[0]!.id, [{ op: 'insertBlocks', blocks }]);
  }

  protected setAction(blockId: string, actionType: EditableActionType): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    const currentAction = findBlockById(this.documentState.blocks, blockId)?.props.action;
    const nextAction = createNextAction(actionType, currentAction);
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockAction(this.documentState.blocks, blockId, nextAction),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, previewPatchForAction(actionType, nextAction));
    const targetContext = this.documentState.blocks.find((block) =>
      blockContainsId(block, blockId),
    );
    const targetId = targetContext ? firstTargetIdInBlock(targetContext) : null;
    if (targetContext && targetId) {
      this.targetDiagnostics.delete(targetId);
      this.requestTargetInspection(targetContext.id, targetId, 'health');
    }
  }

  protected commitActionUrl(blockId: string, value: string): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    const normalizedValue = value.trim();
    const currentAction = findBlockById(this.documentState.blocks, blockId)?.props.action;
    const currentValue = currentAction?.type === 'openPage' ? (currentAction.url ?? '') : '';
    if (currentValue === normalizedValue) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockActionUrl(this.documentState.blocks, blockId, normalizedValue),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    const navigationBehavior =
      currentAction?.type === 'openPage' ? currentAction.navigationBehavior : undefined;
    const action: BlockActionProps = {
      type: 'openPage',
      ...(normalizedValue ? { url: normalizedValue } : {}),
      ...(navigationBehavior ? { navigationBehavior } : {}),
    };
    this.sendPreviewPatch(blockId, [{ op: 'setAction', action }]);
  }

  protected transformBlock(blockId: string, type: EditableBlockType): void {
    if (!this.allowDocumentStructureMutation()) return;
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: transformBlocks(this.documentState.blocks, blockId, type),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'transformBlock', type }]);
  }

  protected commitContent(blockId: string, value: string): void {
    const localizedDocument = localizedAuthoringDocument(this.documentState, this.contentLocale);
    const block = findBlockById(localizedDocument.blocks, blockId);
    if (!block) return;
    const previousContent = block.content ?? '';
    if (previousContent === value) return;
    const contentRuns = reconcileInlineTextRuns(previousContent, block.contentRuns, value);
    this.recordChange();
    this.documentState = setAuthoringLocalizedBlockContent(
      this.documentState,
      this.contentLocale,
      blockId,
      value,
      block.contentRuns ? contentRuns : undefined,
    );
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(
      blockId,
      block.contentRuns
        ? [{ op: 'updateContentRuns', content: value, contentRuns }]
        : [{ op: 'updateContent', content: value }],
      this.contentLocale,
    );
  }

  protected commitContentRuns(blockId: string, value: string, contentRuns?: InlineTextRun[]): void {
    const block = findBlockById(
      localizedAuthoringDocument(this.documentState, this.contentLocale).blocks,
      blockId,
    );
    if (!block) return;
    const comparableRuns = JSON.stringify(contentRuns ?? []);
    if (
      (block.content ?? '') === value &&
      JSON.stringify(block.contentRuns ?? []) === comparableRuns
    ) {
      return;
    }
    this.recordChange();
    this.documentState = setAuthoringLocalizedBlockContent(
      this.documentState,
      this.contentLocale,
      blockId,
      value,
      contentRuns,
    );
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(
      blockId,
      [{ op: 'updateContentRuns', content: value, contentRuns }],
      this.contentLocale,
    );
  }

  protected syncFocusedEditControl(): void {
    const active = this.options.root.ownerDocument.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
      return;
    }
    if (active instanceof HTMLInputElement && active.dataset['action'] === 'edit-title') {
      this.commitDocumentTitle(active.value);
      return;
    }
    const blockId = active.dataset['blockId'];
    if (!blockId || !hasBlock(this.documentState.blocks, blockId)) return;
    if (active.dataset['action'] === 'edit-content') {
      this.commitContent(blockId, active.value);
      return;
    }
    if (active.dataset['action'] === 'edit-action-url') {
      this.commitActionUrl(blockId, active.value);
    }
  }

  protected syncJsonTextControl(): void {
    const textarea = this.options.root.querySelector<HTMLTextAreaElement>(
      'textarea[data-action="edit-draft-backup"]',
    );
    if (!textarea) return;
    this.jsonText = textarea.value;
  }

  protected importScopedDocument(json: string): LodariqDocument | null {
    let imported: LodariqDocument;
    try {
      imported = this.normalizeDocument(this.services.importDocument(json));
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : authoringText('This backup is not valid.'),
      );
      return null;
    }
    if (imported.id !== this.baseDocument.id) {
      this.setStatus(authoringText('This backup belongs to a different experience.'));
      return null;
    }
    if (imported.workspaceId !== this.baseDocument.workspaceId) {
      this.setStatus(authoringText('This backup belongs to a different workspace.'));
      return null;
    }
    return imported;
  }

  protected sendPreviewPatch(blockId: string, ops: PreviewPatchOperation[], locale?: string): void {
    const last = this.pendingPreviewPatches[this.pendingPreviewPatches.length - 1];
    if (last?.blockId === blockId && last.locale === locale) {
      last.ops.push(...structuredClone(ops));
    } else {
      this.pendingPreviewPatches.push({
        blockId,
        ops: structuredClone(ops),
        ...(locale ? { locale } : {}),
      });
    }
    if (this.previewPatchFlushQueued) return;
    this.previewPatchFlushQueued = true;
    globalThis.setTimeout(() => this.flushPreviewPatches(), 0);
  }

  protected sendConfirmedPreviewPatch(
    blockId: string,
    ops: PreviewPatchOperation[],
  ): Promise<void> {
    this.flushPreviewPatches();
    return this.bridge.sendWithAck(this.previewPatchMessage(blockId, ops), { timeoutMs: 2_000 });
  }

  protected flushPreviewPatches(): void {
    if (!this.previewPatchFlushQueued && this.pendingPreviewPatches.length === 0) return;
    this.previewPatchFlushQueued = false;
    const batches = this.pendingPreviewPatches.splice(0, this.pendingPreviewPatches.length);
    for (const batch of batches) {
      this.bridge.send(this.previewPatchMessage(batch.blockId, batch.ops, batch.locale));
    }
  }

  protected previewPatchMessage(
    blockId: string,
    ops: PreviewPatchOperation[],
    locale?: string,
  ): Extract<BridgeMessage, { type: 'preview.patch' }> {
    return {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('preview_patch'),
      type: 'preview.patch',
      blockId,
      ...(locale ? { locale } : {}),
      patch: { ops },
    };
  }

  protected targetById(targetId: string): DocumentTarget | undefined {
    return this.documentState.targets.find((item) => item.id === targetId);
  }

  protected updateTargetLifecycle(
    targetId: string,
    updater: (current: RuntimeLifecycleHints) => RuntimeLifecycleHints,
  ): void {
    const target = this.targetById(targetId);
    if (!target) return;
    const nextLifecycle = normalizeTargetLifecycle(updater(target.lifecycle ?? {}));
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      targets: this.documentState.targets.map((item) => {
        if (item.id !== targetId) return item;
        return nextLifecycle
          ? { ...item, lifecycle: nextLifecycle }
          : { ...item, lifecycle: undefined };
      }),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus(authoringText('Placement behavior updated'));
    const blockId =
      firstBlockIdForTarget(this.documentState.blocks, targetId) ?? this.documentState.id;
    const op: PreviewPatchOperation = nextLifecycle
      ? { op: 'setTargetLifecycle', targetId, lifecycle: nextLifecycle }
      : { op: 'setTargetLifecycle', targetId };
    this.sendPreviewPatch(blockId, [op]);
  }

  protected commitPresentationAnchor(
    blockId: string,
    targetId: string,
    presentationAnchor?: PresentationAnchor,
  ): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.props.targetId !== targetId) return;
    const exactAnchor =
      presentationAnchor?.kind === 'point' || presentationAnchor?.kind === 'region'
        ? structuredClone(presentationAnchor)
        : undefined;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockPresentationAnchor(this.documentState.blocks, blockId, exactAnchor),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [
      exactAnchor
        ? { op: 'setPresentationAnchor', presentationAnchor: exactAnchor }
        : { op: 'setPresentationAnchor' },
    ]);
    this.setStatus(
      exactAnchor ? authoringText('Exact area set') : authoringText('Using the whole element'),
    );
  }

  protected nextStepIndex(): number {
    return this.documentState.blocks.filter((block) => block.type === 'tourStep').length;
  }

  protected normalizeDocument(doc: LodariqDocument): LodariqDocument {
    const lexicalState = fromBlockJson(doc.blocks);
    const parsed = this.lexicalEditor.parseEditorState(JSON.stringify(lexicalState)).toJSON();
    const blocks = toBlockJson(parsed as SerializedEditorState);
    return normalizeAuthoringDocumentLocalization({
      ...doc,
      blocks: doc.type === 'tour' ? normalizeTourRootBlocks(blocks) : blocks,
    });
  }

  protected createBaseDocument(): LodariqDocument {
    return this.normalizeDocument(structuredClone(this.baseDocument));
  }

  protected snapshot(): LodariqDocument {
    return structuredClone(this.documentState);
  }
}
