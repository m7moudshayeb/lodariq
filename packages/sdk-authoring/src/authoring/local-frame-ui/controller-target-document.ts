import { ControllerReleaseRecoveryFeature } from './controller-release-recovery';
import { authoringText } from '../../i18n';
import {
  BRIDGE_PROTOCOL_VERSION,
  type BlockActionProps,
  type BridgeMessage,
  type PreviewPatchOperation,
  type PreviewTransactionMetadata,
  type LodariqBlock,
  type LodariqDocument,
  type InlineTextRun,
  type PresentationAnchor,
  type RuntimeLifecycleHints,
  type TargetLocale,
  type TargetViewportClass,
} from '@lodariq/schema';
import { pageKeyFrom, pageKeyMatches } from '@lodariq/schema/page-key';
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
// Imported from the module rather than the directory barrel: the barrel also
// re-exports the Rich Content editor, and pulling block serialisation through
// it dragged Lexical and the lucide icon map onto the first-paint path.
import { fromBlockJson, toBlockJson, type SerializedEditorState } from '../../editor/serialize';
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
import { authoringTargetIdentityKey } from '../target-health-ledger';
import { registeredExperienceDefinition } from '../experience-authoring-capabilities';
import { createBlockId } from '../../editor/ids';

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
              // Evidence-only message; the probe keeps sampling after the pick,
              // so the creator's decisions have to survive every later sample.
              ...(target.lifecycle ? { lifecycle: structuredClone(target.lifecycle) } : {}),
              ...(target.selection ? { selection: structuredClone(target.selection) } : {}),
              ...(target.approach ? { approach: structuredClone(target.approach) } : {}),
            }
          : target,
      ),
    };
    this.targetDiagnostics.delete(targetId);
    this.targetHealthLedger.registerTarget(targetId, authoringTargetIdentityKey(identity));
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
    routePatternId: string | undefined,
    stateId: string | undefined,
    locale: TargetLocale | undefined,
    viewportClass: TargetViewportClass | undefined,
  ): void {
    const previousRoute = this.hostPageRoute;
    const previousRoutePatternId = this.hostRoutePatternId;
    const previousStateId = this.hostStateId;
    const previousLocale = this.hostPageLocale;
    const previousViewportClass = this.hostViewportClass;
    this.hostPageRoute = route;
    this.hostRoutePatternId = routePatternId;
    this.hostStateId = stateId;
    if (locale !== undefined) this.hostPageLocale = locale;
    if (viewportClass !== undefined) this.hostViewportClass = viewportClass;

    const routeChanged = previousRoute !== undefined && previousRoute !== route;
    const routePatternChanged = previousRoutePatternId !== routePatternId;
    const stateChanged = previousStateId !== stateId;
    const localeChanged =
      previousLocale !== undefined && locale !== undefined && previousLocale !== locale;
    const viewportChanged =
      previousViewportClass !== undefined &&
      viewportClass !== undefined &&
      previousViewportClass !== viewportClass;
    const contextChanged =
      previousRoute === undefined ||
      routeChanged ||
      routePatternChanged ||
      stateChanged ||
      localeChanged ||
      viewportChanged;
    const previousTargetHealth = this.targetHealthLedger.snapshot();
    this.targetHealthLedger.updateContext({
      route,
      ...(routePatternId ? { routePatternId } : {}),
      ...(stateId ? { stateId } : {}),
      ...(this.hostPageLocale ? { locale: this.hostPageLocale } : {}),
      ...(this.hostViewportClass ? { viewportClass: this.hostViewportClass } : {}),
    });
    if (!contextChanged) return;

    for (const target of this.documentState.targets) {
      const previousPresentation = previousTargetHealth.get(target.id)?.presentation;
      const presentation = this.targetHealthLedger.get(target.id)?.presentation;
      if (
        presentation === 'unavailable_current_context' &&
        previousPresentation !== 'unavailable_current_context'
      ) {
        this.recordMetric('target.unavailable', { targetId: target.id });
      }
      if (
        previousPresentation === 'unavailable_current_context' &&
        presentation !== 'unavailable_current_context'
      ) {
        this.recordMetric('target.context-restored', { targetId: target.id });
      }
    }

    const hostPageKey = pageKeyFromRoute(route);
    for (const target of this.documentState.targets) {
      const page = target.identity?.context.page;
      const requiresAnotherContext =
        (page && hostPageKey !== null && !pageKeyMatches(page.key, page.match, hostPageKey)) ||
        (target.identity?.context.routePatternId &&
          target.identity.context.routePatternId !== routePatternId) ||
        (target.identity?.context.stateId && target.identity.context.stateId !== stateId) ||
        (target.lifecycle?.expectedRoute &&
          !routeMatchesLifecycleHint(route, target.lifecycle.expectedRoute));
      if (requiresAnotherContext) this.targetDiagnostics.delete(target.id);
    }

    this.setStatus(authoringText('Page context changed; placement availability updated'));
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
      this.targetHealthLedger.beginInspection(targetId);
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
    } catch {
      this.setStatus(authoringText('This backup is not valid.'));
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

  protected sendPreviewPatch(
    blockId: string,
    ops: PreviewPatchOperation[],
    locale?: string,
    transaction?: PreviewTransactionMetadata,
  ): void {
    const last = this.pendingPreviewPatches[this.pendingPreviewPatches.length - 1];
    const replacesSameTransaction = Boolean(
      transaction && last?.transaction?.transactionId === transaction.transactionId,
    );
    if (replacesSameTransaction && last) {
      last.ops = structuredClone(ops);
      last.transaction = structuredClone(transaction);
    } else if (last?.blockId === blockId && last.locale === locale && !transaction) {
      last.ops.push(...structuredClone(ops));
    } else {
      this.pendingPreviewPatches.push({
        blockId,
        ops: structuredClone(ops),
        ...(locale ? { locale } : {}),
        ...(transaction ? { transaction: structuredClone(transaction) } : {}),
      });
    }
    if (this.previewPatchFlushQueued) return;
    this.previewPatchFlushQueued = true;
    const token = ++this.previewPatchFlushToken;
    scheduleAnimationFrame(() => {
      if (token !== this.previewPatchFlushToken) return;
      this.flushPreviewPatches();
    });
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
    this.previewPatchFlushToken += 1;
    this.previewPatchFlushQueued = false;
    const batches = this.pendingPreviewPatches.splice(0, this.pendingPreviewPatches.length);
    for (const batch of batches) {
      this.bridge.send(
        this.previewPatchMessage(batch.blockId, batch.ops, batch.locale, batch.transaction),
      );
    }
  }

  protected previewPatchMessage(
    blockId: string,
    ops: PreviewPatchOperation[],
    locale?: string,
    transaction?: PreviewTransactionMetadata,
  ): Extract<BridgeMessage, { type: 'preview.patch' }> {
    return {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('preview_patch'),
      type: 'preview.patch',
      blockId,
      ...(locale ? { locale } : {}),
      ...(transaction ? { transaction: structuredClone(transaction) } : {}),
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
    const seededBlocks = [
      ...(doc.type !== 'tour' && doc.blocks.length === 0
        ? (registeredExperienceDefinition(doc.type)?.seed({ createBlockId }) ?? doc.blocks)
        : doc.blocks),
    ];
    const lexicalState = fromBlockJson(seededBlocks);
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

function scheduleAnimationFrame(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => callback());
    return;
  }
  globalThis.setTimeout(callback, 16);
}

function routeMatchesLifecycleHint(route: string, expectedRoute: string): boolean {
  return route === expectedRoute || route.startsWith(expectedRoute);
}

/** The lifecycle route is pathname + search + hash; only two of those count. */
function pageKeyFromRoute(route: string): string | null {
  try {
    const url = new URL(route, 'http://page-key.invalid');
    return pageKeyFrom(url.pathname || '/', url.hash);
  } catch {
    return null;
  }
}
