import { ControllerAssistFeature } from './controller-assist';
import { INITIAL_AI_ASSIST_STATE } from '../ai/assist-machine';
import { authoringText } from '../../i18n';
import {
  AUTHORING_BRAND_DRIFT_PREVIEW_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  type AuthoringDiagnosticAttributes,
  sanitizeStepNarration,
  type AuthoringDeliveryCapability,
  type BrandThemeSnapshot,
  type LodariqBlock,
  type LodariqDocument,
  type StepNarration,
} from '@lodariq/schema';
import { hasBlock, updateBlockProps, type BlockInsertPosition } from '../document-ops';
import { createBridgeCorrelationId } from '../../bridge/transport';
import type { LocalAuthoringFrameSnapshot } from './types';
import type { LocalAuthoringFrameMetricName } from '../local-frame-types';
import { findBlockById, isEditableContentBlock } from './utils';
import { AuthoringBrandDriftController } from '../brand-drift-controller';
import { canonicalContentLocale } from '@lodariq/schema';
import { contentLocaleLabel } from '../content-locales';
import { themeHandleOf, themeIsStale } from '../theme-staleness';
import {
  addAuthoringDocumentLocale,
  authoringLocalizedTarget,
  isDefaultDocumentLocale,
  localizedAuthoringDocument,
  setAuthoringLocalizedTarget,
} from '../document-localization';

export class ControllerSnapshotFeature extends ControllerAssistFeature {
  /**
   * The two document copies every snapshot carries, kept until their source
   * changes.
   *
   * `emit` runs far more often than the document changes — a status line, a drag
   * frame, a presence beat, a save state — and each one used to rebuild the whole
   * document twice, once localized and once deep-cloned. A mutation always
   * replaces `documentState` rather than editing it in place, so the object's own
   * identity is a sound key, and the emits that are not document changes now cost
   * nothing at all.
   *
   * Both copies are read-only to consumers, which is what they already were:
   * every reader of `canonicalDocumentState` treats it as a source to inspect.
   */
  private documentProjection: {
    source: LodariqDocument;
    locale: string;
    localized: LodariqDocument;
    canonical: LodariqDocument;
  } | null = null;

  supportsDeliveryCapability(capability: AuthoringDeliveryCapability): boolean {
    return this.deliveryCapabilities.has(capability);
  }

  private projectedDocument(): { localized: LodariqDocument; canonical: LodariqDocument } {
    const cached = this.documentProjection;
    if (cached?.source === this.documentState && cached.locale === this.contentLocale) {
      return cached;
    }
    const projection = {
      source: this.documentState,
      locale: this.contentLocale,
      localized: localizedAuthoringDocument(this.documentState, this.contentLocale),
      canonical: structuredClone(this.documentState),
    };
    this.documentProjection = projection;
    return projection;
  }

  /**
   * Any canonical language tag, not just the ones Lodariq's own chrome speaks.
   * Authored copy is opaque text; the tag routes it (§ content-locales).
   */
  setContentLocale(locale: string): void {
    const canonical = canonicalContentLocale(locale);
    if (!canonical) {
      // It used to return silently, so a rejected tag looked like a dead control.
      this.setStatus(
        authoringText('{locale} is not a language tag Lodariq understands.', { locale }),
      );
      return;
    }
    if (canonical === this.contentLocale) return;
    this.syncFocusedEditControl();
    this.contentLocale = canonical;
    this.translationState = 'idle';
    this.translationRequestVersion += 1;
    this.setStatus(
      authoringText('Editing experience copy in {locale}', {
        locale: contentLocaleLabel(canonical),
      }),
    );
  }

  /**
   * Adds a language to the experience and starts editing in it.
   *
   * The variant is written empty rather than on the first keystroke, so the new
   * language appears in the table at 0% immediately — otherwise adding one looks
   * like nothing happened.
   */
  addContentLocale(locale: string): void {
    const canonical = canonicalContentLocale(locale);
    if (!canonical) {
      this.setStatus(
        authoringText('{locale} is not a language tag Lodariq understands.', { locale }),
      );
      return;
    }
    if (!isDefaultDocumentLocale(this.documentState, canonical)) {
      this.recordChange();
      this.documentState = this.normalizeDocument(
        addAuthoringDocumentLocale(this.documentState, canonical),
      );
      this.afterDocumentMutation();
      this.services.saveDocument(this.documentState);
    }
    this.setContentLocale(canonical);
    this.emit();
  }

  /**
   * Points this step's target somewhere else for the selected locale (§7.6).
   * Targets stay shared by default; this is the escape hatch for a localized UI
   * that genuinely differs, and publish resolves it without a manual sync.
   */
  setLocalizedTarget(targetId: string, replacementTargetId: string | null): void {
    if (
      authoringLocalizedTarget(this.documentState, this.contentLocale, targetId) ===
      replacementTargetId
    ) {
      return;
    }
    this.recordChange();
    this.documentState = this.normalizeDocument(
      setAuthoringLocalizedTarget(
        this.documentState,
        this.contentLocale,
        targetId,
        replacementTargetId,
      ),
    );
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus(
      replacementTargetId
        ? authoringText('This step points somewhere else in {locale}', {
            locale: this.contentLocale,
          })
        : authoringText('This step uses the shared target again'),
    );
    this.emit();
  }

  /**
   * Writes the spoken script for one step (§7.7). Passing `null` removes it. The
   * script is never mirrored into the on-screen copy: keeping the two apart is the
   * whole point.
   */
  setStepNarration(stepId: string, narration: Partial<StepNarration> | null): void {
    if (narration !== null && !this.supportsCommercialFeature('narration')) return;
    const step = findBlockById(this.documentState.blocks, stepId);
    if (!step) return;
    const previous = step.props.narration;
    const sanitized = narration === null ? undefined : sanitizeStepNarration(narration);
    const sourceChanged = Boolean(
      sanitized &&
      previous &&
      (sanitized.script !== previous.script ||
        sanitized.voiceId !== previous.voiceId ||
        sanitized.speed !== previous.speed ||
        sanitized.localeOverride !== previous.localeOverride),
    );
    const next =
      sanitized && sourceChanged
        ? sanitizeStepNarration({ ...sanitized, audio: undefined })
        : sanitized;
    this.recordChange();
    this.documentState = this.normalizeDocument({
      ...this.documentState,
      blocks: updateBlockProps(this.documentState.blocks, stepId, {
        ...step.props,
        ...(next ? { narration: next } : { narration: undefined }),
      }),
    });
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus(next ? authoringText('Narration saved') : authoringText('Narration removed'));
    this.emit();
  }

  canGenerateNarration(): boolean {
    return Boolean(
      (this.services.generateNarration || this.services.operations?.generateNarration) &&
      this.supportsCommercialFeature('narration'),
    );
  }

  async generateStepNarration(stepId: string): Promise<boolean> {
    const generate = this.services.generateNarration ?? this.services.operations?.generateNarration;
    const step = findBlockById(this.documentState.blocks, stepId);
    if (!generate || !step?.props.narration?.script.trim() || !this.canGenerateNarration()) {
      return false;
    }
    this.setStatus(authoringText('Generating narration…'));
    this.emit();
    try {
      await this.services.persistDocument?.(this.documentState);
      const result = await generate(stepId);
      this.mediaAssets = [
        result.asset,
        ...this.mediaAssets.filter((asset) => asset.id !== result.asset.id),
      ];
      const current = findBlockById(this.documentState.blocks, stepId)?.props.narration;
      if (!current) return false;
      this.setStepNarration(stepId, { ...current, audio: result.audio });
      await this.services.persistDocument?.(this.documentState);
      this.setStatus(authoringText('Narration audio is ready'));
      this.emit();
      return true;
    } catch {
      this.setStatus(authoringText('Narration generation failed. Try again.'));
      this.emit();
      return false;
    }
  }

  /** The replacement target this locale uses, or null when the shared one applies. */
  localizedTargetFor(targetId: string): string | null {
    return authoringLocalizedTarget(this.documentState, this.contentLocale, targetId);
  }

  /**
   * The workspace theme moved while this session was open (§6.3). Recorded rather
   * than applied: a theme change mid-edit must be visible and deliberate, never a
   * surprise re-render under the creator's hands.
   */
  noteWorkspaceTheme(snapshot: BrandThemeSnapshot): void {
    this.workspaceThemeSnapshot = structuredClone(snapshot);
    this.emit();
  }

  /** Adopts the workspace theme the frame was told about, and re-renders on it. */
  reloadTheme(): void {
    if (!this.workspaceThemeSnapshot) return;
    this.previewTheme = structuredClone(this.workspaceThemeSnapshot);
    this.workspaceThemeSnapshot = null;
    this.setStatus(authoringText('Theme reloaded'));
    this.emit();
  }

  async translateMissingCopy(): Promise<void> {
    const translateDocument = this.services.translateDocument;
    if (!translateDocument) {
      this.setStatus(authoringText('Automatic translation is not configured'));
      return;
    }
    const localization = this.documentState.localization;
    if (!localization || this.contentLocale === localization.defaultLocale) {
      this.setStatus(authoringText('Select another experience language to translate'));
      return;
    }
    if (this.translationState === 'translating') return;

    const requestVersion = ++this.translationRequestVersion;
    const documentChangeSequence = this.documentChangeSequence;
    const targetLocale = this.contentLocale;
    this.translationState = 'translating';
    this.setStatus(authoringText('Translating missing copy…'));
    try {
      const result = await translateDocument({
        operationId: `aiop_${globalThis.crypto.randomUUID().replace(/-/gu, '')}`,
        document: structuredClone(this.documentState),
        targetLocale,
        mode: 'missing',
      });
      if (
        requestVersion !== this.translationRequestVersion ||
        documentChangeSequence !== this.documentChangeSequence ||
        targetLocale !== this.contentLocale
      ) {
        return;
      }
      this.translationState = 'idle';
      const translatedCount = result.translatedBlockCount + (result.translatedTitle ? 1 : 0);
      if (translatedCount === 0) {
        this.setStatus(authoringText('All copy is already translated'));
        return;
      }
      this.recordChange();
      this.documentState = this.normalizeDocument(structuredClone(result.document));
      this.afterDocumentMutation();
      this.services.saveDocument(this.documentState);
      this.sendPreviewPatch(this.documentState.id, [
        { op: 'replaceDocument', document: structuredClone(this.documentState) },
      ]);
      this.setStatus(
        authoringText('Translated {count} items to {locale}', {
          count: translatedCount,
          locale: targetLocale,
        }),
      );
    } catch {
      if (requestVersion !== this.translationRequestVersion) return;
      this.translationState = 'error';
      this.setStatus(authoringText('Translation failed. Try again.'));
    }
  }

  protected recordChange(): void {
    this.documentTransactions.flush();
    this.undoStack.push(this.snapshot());
    this.redoStack.length = 0;
  }

  protected recordMetric(
    name: LocalAuthoringFrameMetricName,
    attributes?: AuthoringDiagnosticAttributes,
  ): void {
    this.recordMetricWithoutEmit(name, attributes);
    this.emit();
  }

  /**
   * The same record, without the snapshot.
   *
   * `recordMetric` emits because most callers record one and do nothing else,
   * and the diagnostics text has to catch up. A caller that is about to emit
   * anyway — a document commit does, on the next line — would otherwise pay for
   * two snapshots to describe one edit.
   */
  protected recordMetricWithoutEmit(
    name: LocalAuthoringFrameMetricName,
    attributes?: AuthoringDiagnosticAttributes,
  ): void {
    this.services.recordMetric({
      sessionId: this.metricsSessionId,
      documentId: this.documentState.id,
      name,
      ...(attributes ? { attributes: structuredClone(attributes) } : {}),
    });
    this.renderMetrics();
  }

  protected renderMetrics(): void {
    const summary = this.services.getMetricsSummary(this.metricsSessionId);
    this.metricsText = JSON.stringify(summary ?? {}, null, 2);
  }

  protected afterDocumentMutation(options?: { skipNormalize?: boolean }): void {
    this.invalidateLocaleLayoutQa();
    if (this.translationState === 'translating') {
      this.translationState = 'idle';
      this.translationRequestVersion += 1;
    }
    if (!options?.skipNormalize) {
      this.documentState = this.normalizeDocument(this.documentState);
    }
    this.documentTransactions.adoptOptimisticDocument(this.documentState);
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
      this.panelWorkflowNotice = authoringText(
        'Draft changed. Publish and verify the new artifact again.',
      );
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
    const tooltip =
      step?.type === 'tooltip' ? step : step?.children.find((child) => child.type === 'tooltip');
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
    const document = this.projectedDocument();
    return {
      documentState: document.localized,
      canonicalDocumentState: document.canonical,
      ...this.operationsSnapshot(),
      activeStepId: this.selectedBlockId ?? null,
      canvasZoomPercent: this.canvasZoomPercent,
      recordingSteps: this.recordingSteps,
      deliveryCapabilities: new Set(this.deliveryCapabilities),
      contentLocale: this.contentLocale,
      ...(this.services.narrationVoices
        ? { narrationVoices: structuredClone(this.services.narrationVoices) }
        : {}),
      translation: {
        available: Boolean(this.services.translateDocument),
        state: this.translationState,
      },
      previewTheme: this.previewTheme ? structuredClone(this.previewTheme) : null,
      themeStale: themeIsStale(
        themeHandleOf(this.previewTheme),
        themeHandleOf(this.workspaceThemeSnapshot),
      ),
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
      selectedStepIds: new Set(this.selectedStepIds),
      stepStyleClipboardAvailable: Boolean(this.stepStyleClipboard),
      stepStyleRecipes: this.stepStyleRecipes.list(),
      stepStyleRecipeByStep: new Map(this.stepStyleRecipeByStep),
      draftCheckpoints: this.draftCheckpoints.list(),
      mediaAssets: structuredClone(this.mediaAssets),
      dragTargetBlockId: this.dragTargetBlockId,
      dragTargetPosition: this.dragTargetPosition,
      targetDiagnostics: new Map(this.targetDiagnostics),
      targetHealth: this.targetHealthLedger.snapshot(),
      advancedTargetIds: new Set(this.advancedTargetIds),
      focusRequest: this.focusRequest,
      cardCommandRequest: this.cardCommandRequest,
      targetInspectRequest: this.targetInspectRequest,
      release: {
        ...this.release,
        findings: structuredClone(this.release.findings),
      },
      panelWorkflow: {
        mode: this.panelMode,
        operationsTab: this.operationsTab,
        operationsView: {
          ...(this.operationsViews.get(this.operationsTab) ?? { focusKey: null, scrollTop: 0 }),
        },
        returnMode: this.panelReturnMode,
        focusToken: this.panelFocusToken,
        returnFocus: this.panelReturnFocus,
        focusTarget: this.panelFocusTarget,
        operation: this.panelOperation,
        brand: structuredClone(this.brandWorkflow),
        brandProposal: this.brandProposal ? structuredClone(this.brandProposal) : null,
        /*
         * The base constructor builds the first snapshot, which runs before this
         * subclass's field initialisers — so the very first read lands here with
         * `assistState` still undefined. Every later snapshot has it.
         */
        assist: this.assistState ?? INITIAL_AI_ASSIST_STATE,
        assistAvailable: Boolean(this.services.requestAiAssist),
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
    this.syncCollaborationPresence();
    this.snapshotValue = this.makeSnapshot();
    for (const subscriber of this.subscribers) {
      subscriber(this.snapshotValue);
    }
  }
}
