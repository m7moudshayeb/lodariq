import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type {
  BlockLayoutProps,
  ButtonStyleProps,
  InlineTextRun,
  LodariqBlock,
  TextStyleProps,
} from '@lodariq/schema';
import {
  resolveTourActionRecipe,
  resolveTourCompositionRecipe,
  resolveTourThemeStyle,
} from '@lodariq/sdk-runtime/renderers/tour';
import type { LocalAuthoringFrameController } from '../controller';
import { applyInlineTextStyle, type InlineTextStylePatch } from '../../document-ops';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  AuthoringButton,
  AuthoringPopover,
  Bold,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  GripHorizontal,
  GripVertical,
  Highlighter,
  Italic,
  Link,
  Minus,
  MoreHorizontal,
  MoveDiagonal2,
  MousePointer2,
  MousePointerClick,
  Pencil,
  Plus,
  RotateCcw,
  SquareMousePointer,
  Trash2,
  Underline,
  X,
} from '../design-system';
import { EDITABLE_ACTION_OPTIONS, type LocalAuthoringFrameSnapshot } from '../types';
import {
  blockDisplayTitle,
  blockTypeLabel,
  editableActionValue,
  editableBlockTypeValue,
  isEditableContentBlock,
  stepContentCommandFromQuery,
  targetIdOf,
  targetLabelOf,
} from '../utils';
import { InlineStepInsert } from './insert-menu';
import { TargetControls } from './target-controls';
import { TourStepActionMenu } from './tour-storyboard';
import { ButtonPropertyPanel, type ActionPropertyTab } from '../properties/button-property-editor';
import { defaultActionVariant } from '../properties/button-properties';
import { useActionResize } from '../../canvas/use-action-resize';
import { blockSpacingAfterStyle, canvasToolbarStyle } from '../../canvas/canvas-style';
import { usePopupTransform } from '../../canvas/use-popup-transform';
import {
  buttonAdvanceValue,
  elementActionLabelFor,
  stepHealth,
  stepPlacementFact,
  stepPrimaryButton,
  stepTooltip,
  targetActionLabelFor,
  type StepHealthTone,
} from '../tour-step-model';
import { ContextualPropertyTray } from './contextual-property-tray';
import { PopupPointerArrow } from './popup-pointer-arrow';
import { useTourStepInspectorStyles } from '../tour-step-inspector-styles';
import {
  ADVANCE_OPTION_LABELS,
  CANVAS_ZOOM_LEVELS,
  DEFAULT_CANVAS_ZOOM,
  POPUP_RESIZE_CORNERS,
  STORYBOARD_TOOL_OPTIONS,
  TEXT_SIZE_OPTIONS,
  TOOLTIP_PLACEMENT_LABELS,
  TOOLTIP_POSITION_OPTIONS,
  type ActionToolbarPosition,
  type StoryboardToolMode,
} from './tour-sequence-options';

export function TourSequenceRail({
  activeStepId,
  compact = false,
  controller,
  snapshot,
  steps,
}: {
  activeStepId: string | null;
  compact?: boolean;
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: LodariqBlock[];
}) {
  const health = steps.map((step) => stepHealth(step, snapshot));
  const verifiedCount = health.filter((item) => item.tone === 'ready').length;
  const activeStep = steps.find((step) => step.id === activeStepId) ?? null;
  const activeHealth = activeStep
    ? health[steps.findIndex((step) => step.id === activeStep.id)]
    : null;
  const activeTargetId = activeStep ? targetIdOf(activeStep) : null;
  const activeTargetLabel = activeTargetId
    ? targetLabelOf(snapshot.documentState, activeTargetId)
    : 'Choose where this step appears';
  const activeStepIndex = activeStep ? steps.findIndex((step) => step.id === activeStep.id) : -1;
  const targetActionLabel = compact
    ? elementActionLabelFor(Boolean(activeHealth?.repair), Boolean(activeTargetId))
    : targetActionLabelFor(Boolean(activeHealth?.repair), Boolean(activeTargetId));

  return (
    <aside
      className={`tour-sequence-rail ${compact ? 'compact' : ''}`.trim()}
      aria-label="Tour steps"
    >
      {compact ? (
        <header className="tour-sequence-header compact-header">
          <strong>Steps</strong>
          <span>
            {steps.length} step{steps.length === 1 ? '' : 's'}
          </span>
        </header>
      ) : (
        <header className="tour-sequence-header document-hero">
          <div className="tour-sequence-title">
            <span className="tour-sequence-kicker document-context" aria-label="Experience type">
              Tour
            </span>
            <input
              key={snapshot.documentState.title}
              aria-label="Experience title"
              className="document-title-input"
              data-action="edit-title"
              defaultValue={snapshot.documentState.title}
              placeholder="Untitled experience"
              onBlur={(event) => controller.commitDocumentTitle(event.currentTarget.value)}
            />
          </div>
          <span
            className="tour-health-count"
            aria-label={`Experience status: ${verifiedCount} of ${steps.length} verified`}
          >
            {verifiedCount}/{steps.length} verified
          </span>
        </header>
      )}

      <ol className="tour-step-list">
        {steps.map((step, index) => {
          const itemHealth = health[index]!;
          const active = step.id === activeStepId;
          const targetId = targetIdOf(step);
          const targetLabel = targetId
            ? targetLabelOf(snapshot.documentState, targetId)
            : 'No placement yet';
          return (
            <li
              className={`tour-step-row ${active ? 'active' : ''} ${
                active && compact ? 'expanded' : ''
              } ${itemHealth.tone}`.trim()}
              data-block-id={step.id}
              key={step.id}
              onDragOver={(event) => controller.handleBlockDragOver(event)}
              onDrop={(event) => controller.handleBlockDrop(event, step.id)}
            >
              <div className="tour-step-row-main">
                <button
                  type="button"
                  className="tour-step-drag-handle"
                  draggable
                  aria-label={`Drag step ${index + 1}`}
                  title="Drag to reorder step"
                  onDragEnd={() => controller.endDraggingBlock()}
                  onDragStart={(event) => controller.startDraggingBlock(step.id, event)}
                >
                  <GripVertical className="tour-step-grip" size={15} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="tour-step-select"
                  aria-current={active ? 'step' : undefined}
                  aria-expanded={compact ? active : undefined}
                  aria-label={`Edit step ${index + 1}: ${blockDisplayTitle(step)}`}
                  onClick={() => controller.activateTourStep(step.id)}
                >
                  <span className="tour-step-number">{index + 1}</span>
                  <span className="tour-step-copy">
                    <strong>{blockDisplayTitle(step)}</strong>
                    {compact ? null : <span className="tour-step-placement">{targetLabel}</span>}
                  </span>
                  <span className={`tour-step-health ${itemHealth.tone}`}>
                    {itemHealth.tone === 'ready' ? (
                      <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <span className="tour-step-health-dot" aria-hidden="true" />
                    )}
                    {compact ? null : itemHealth.label}
                    <ChevronRight className="tour-step-chevron" size={15} strokeWidth={2.2} />
                  </span>
                </button>
                <TourStepActionMenu controller={controller} step={step} stepIndex={index} />
              </div>

              {compact && active && activeHealth ? (
                <StepAccordionDetails
                  controller={controller}
                  health={activeHealth}
                  step={step}
                  stepIndex={index}
                  targetActionLabel={targetActionLabel}
                  targetId={targetId}
                  targetLabel={targetId ? targetLabel : 'Choose where this step appears'}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {!compact && activeStep && activeHealth ? (
        <footer className={`tour-active-step-footer ${activeHealth.tone}`}>
          <div className="tour-active-target">
            <span className="tour-active-target-icon" aria-hidden="true">
              {activeHealth.tone === 'ready' ? (
                <Check size={14} strokeWidth={2.4} />
              ) : (
                <MousePointer2 size={14} strokeWidth={2.2} />
              )}
            </span>
            <span className="tour-active-target-copy">
              <small>{activeHealth.label}</small>
              <strong>{activeTargetLabel}</strong>
            </span>
          </div>
          <div className="tour-active-actions">
            <button
              type="button"
              aria-label={`${targetActionLabel} for step ${activeStepIndex + 1}`}
              onClick={() => controller.startTargetPick(activeStep.id)}
            >
              {targetActionLabel}
            </button>
          </div>
        </footer>
      ) : null}

      <div className="tour-contextual-actions">
        <button
          type="button"
          className="tour-add-step"
          onClick={() => controller.appendStepAndChooseTarget()}
        >
          <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
          Add step
        </button>
      </div>
    </aside>
  );
}

export function TourStepInspector({
  controller,
  snapshot,
  step,
  stepIndex,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  stepIndex: number;
}) {
  useTourStepInspectorStyles();
  const health = stepHealth(step, snapshot);
  const tooltip = stepTooltip(step);
  const [toolMode, setToolMode] = useState<StoryboardToolMode>('content');

  useEffect(() => setToolMode('content'), [step.id]);

  useEffect(() => {
    const request = snapshot.focusRequest;
    if (!request || request.blockId !== step.id) return;
    if (request.reveal === 'placement' || request.reveal === 'popup') {
      setToolMode(request.reveal);
      return;
    }
    setToolMode('content');
  }, [snapshot.focusRequest, step.id]);

  return (
    <section
      className="tour-step-inspector storyboard-step-inspector"
      aria-label={`Step ${stepIndex + 1} details`}
    >
      <section className="tour-step-editor-section storyboard-canvas" aria-label="Content">
        <header className="storyboard-canvas-heading">
          <span>
            <small>Step {stepIndex + 1}</small>
            <strong>{blockDisplayTitle(step)}</strong>
          </span>
          <span className={`live-step-status ${health.tone}`}>{health.label}</span>
        </header>
        {tooltip ? (
          <RichStepContentEditor
            controller={controller}
            health={health}
            onToolModeChange={setToolMode}
            snapshot={snapshot}
            step={step}
            stepIndex={stepIndex}
            tooltip={tooltip}
            toolMode={toolMode}
          />
        ) : null}
        <nav className="storyboard-tool-dock" aria-label="Authoring tools">
          {STORYBOARD_TOOL_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = toolMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={active ? 'active' : undefined}
                aria-label={option.label}
                aria-pressed={active}
                onClick={() =>
                  setToolMode((current) =>
                    current === option.value && option.value !== 'content'
                      ? 'content'
                      : option.value,
                  )
                }
              >
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </nav>
      </section>
    </section>
  );
}

function StepPlacementEditor({
  controller,
  snapshot,
  step,
  stepIndex,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  stepIndex: number;
}) {
  const health = stepHealth(step, snapshot);
  const targetId = targetIdOf(step);
  const targetLabel = targetId
    ? targetLabelOf(snapshot.documentState, targetId)
    : 'Choose where this step appears';
  const targetActionLabel = targetActionLabelFor(health.repair, Boolean(targetId));
  const tooltip = stepTooltip(step);
  const placement = tooltip?.props.placement ?? 'bottom';
  return (
    <section className="tour-step-config-section placement-section" aria-label="Placement">
      <header className="tour-config-heading">
        <span>
          <small>Placement</small>
          <strong>Where the popup appears</strong>
        </span>
        <span className={`tour-config-status ${health.tone}`}>{health.label}</span>
      </header>
      {targetId ? (
        <div className="tour-live-target">
          <TargetControls
            block={step}
            controller={controller}
            snapshot={snapshot}
            targetId={targetId}
            targetLabel={targetLabel}
          />
        </div>
      ) : (
        <button
          type="button"
          className="tour-placement-card"
          aria-label={`${targetActionLabel} for step ${stepIndex + 1}`}
          onClick={() => controller.startTargetPick(step.id)}
        >
          <MousePointer2 size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>Choose target</strong>
            <small>{stepPlacementFact(targetId, targetLabel, health)}</small>
          </span>
          <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
      {tooltip ? (
        <div className="tour-position-group">
          <h4>Popup position</h4>
          <div className="tour-position-options" role="group" aria-label="Tooltip position">
            {TOOLTIP_POSITION_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = placement === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={selected ? 'selected' : undefined}
                  aria-pressed={selected}
                  onClick={() => controller.setTooltipPlacement(tooltip.id, option.value)}
                >
                  <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RichStepContentEditor({
  controller,
  health,
  onToolModeChange,
  snapshot,
  step,
  stepIndex,
  tooltip,
  toolMode,
}: {
  controller: LocalAuthoringFrameController;
  health: { label: string; repair: boolean; tone: StepHealthTone };
  onToolModeChange: (mode: StoryboardToolMode) => void;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  stepIndex: number;
  tooltip: LodariqBlock;
  toolMode: StoryboardToolMode;
}) {
  const contentBlocks = tooltip.children.filter(isEditableContentBlock);
  const initiallySelectedBlock = contentBlocks.find(
    (block) => block.id === snapshot.selectedBlockId,
  );
  const [activeBlockId, setActiveBlockId] = useState(
    initiallySelectedBlock?.id ?? contentBlocks[0]?.id ?? null,
  );
  const [selection, setSelection] = useState<RichTextSelection | null>(null);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [activePropertyTab, setActivePropertyTab] = useState<ActionPropertyTab>('shape');
  const [propertyTrayOpen, setPropertyTrayOpen] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [popupSelected, setPopupSelected] = useState(false);
  const [contextToolbarPosition, setContextToolbarPosition] =
    useState<ActionToolbarPosition | null>(null);
  const suppressedBlurCommitBlockIds = useRef(new Set<string>());
  const handledFocusRequestToken = useRef<number | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const editorStageRef = useRef<HTMLDivElement | null>(null);
  const activeBlockRowRef = useRef<HTMLDivElement | null>(null);
  const activeBlock = activeBlockId
    ? (contentBlocks.find((block) => block.id === activeBlockId) ?? null)
    : null;
  const activeStyle = activeBlock?.props.textStyle;
  const activeIsText = activeBlock?.type === 'heading' || activeBlock?.type === 'paragraph';
  const activeIsAction = activeBlock?.type === 'button' || activeBlock?.type === 'link';
  const trayActionBlock = activeIsAction ? activeBlock : null;
  const hasActiveTextSelection =
    activeBlock !== null &&
    selection !== null &&
    selection.blockId === activeBlock.id &&
    selection.start !== selection.end;
  const activeFontSize = selectedTextFontSize(activeBlock, selection);
  const localPrefersDark = useMediaPreference('(prefers-color-scheme: dark)');
  const localPrefersReducedMotion = useMediaPreference('(prefers-reduced-motion: reduce)');
  const prefersDark = snapshot.previewPreferences?.prefersDark ?? localPrefersDark;
  const prefersReducedMotion =
    snapshot.previewPreferences?.prefersReducedMotion ?? localPrefersReducedMotion;
  const resolvedPopupTheme = resolveTourThemeStyle(
    {
      ...(snapshot.documentState.appearance
        ? { appearance: snapshot.documentState.appearance }
        : {}),
      ...(snapshot.previewTheme ? { theme: snapshot.previewTheme } : {}),
    },
    prefersDark,
    prefersReducedMotion,
  );
  const popupStyle = resolvedPopupTheme.variables as CSSProperties;
  const popupComposition = resolveTourCompositionRecipe(tooltip.props.tooltipLayout);

  useEffect(() => {
    if (activeBlockId === null) return;
    if (activeBlockId && contentBlocks.some((block) => block.id === activeBlockId)) return;
    setActiveBlockId(contentBlocks[0]?.id ?? null);
  }, [activeBlockId, contentBlocks, step.id]);

  useEffect(() => setPropertyTrayOpen(false), [activeBlockId]);

  useEffect(() => setPopupSelected(false), [step.id]);

  useEffect(() => {
    if (toolMode !== 'content') setPropertyTrayOpen(false);
  }, [toolMode]);

  useEffect(() => {
    const request = snapshot.focusRequest;
    if (!request || handledFocusRequestToken.current === request.token) return;
    const requestedBlock = contentBlocks.find((block) => block.id === request.blockId);
    if (!requestedBlock) return;
    handledFocusRequestToken.current = request.token;
    setPopupSelected(false);
    setActiveBlockId(requestedBlock.id);
    setSelection(null);
    setLinkEditorOpen(false);
    onToolModeChange('content');
    if (request.reveal === 'behavior') {
      setActivePropertyTab('behavior');
      setPropertyTrayOpen(true);
    }
  }, [contentBlocks, onToolModeChange, snapshot.focusRequest]);

  const commitBlock = (blockId: string, element: HTMLElement): void => {
    if (suppressedBlurCommitBlockIds.current.delete(blockId)) return;
    const contentRuns = extractInlineTextRuns(element);
    const content = contentRuns.map((run) => run.text).join('');
    controller.commitRichTextContent(blockId, content, contentRuns);
  };

  const suppressNextBlurCommit = (blockId: string): void => {
    suppressedBlurCommitBlockIds.current.add(blockId);
    globalThis.setTimeout(() => suppressedBlurCommitBlockIds.current.delete(blockId), 0);
  };

  const updateStyle = (patch: Partial<TextStyleProps>): void => {
    if (activeBlock) controller.setTextBlockStyle(activeBlock.id, patch);
  };

  const updateInlineStyle = (patch: InlineTextStylePatch): void => {
    if (!activeBlock || !selection || selection.blockId !== activeBlock.id) return;
    const content = activeBlock.content ?? '';
    const contentRuns = applyInlineTextStyle(
      content,
      activeBlock.contentRuns,
      selection.start,
      selection.end,
      patch,
    );
    controller.commitRichTextContent(activeBlock.id, content, contentRuns);
  };

  const activateBlock = (block: LodariqBlock): void => {
    setPopupSelected(false);
    setActiveBlockId(block.id);
    setSelection(null);
    setLinkEditorOpen(false);
    if (block.type === 'link') setActivePropertyTab('behavior');
    controller.selectBlock(block.id);
  };

  const dismissActiveBlock = (): void => {
    setActiveBlockId(null);
    setSelection(null);
    setLinkEditorOpen(false);
    setPropertyTrayOpen(false);
  };

  const selectPopup = (): void => {
    dismissActiveBlock();
    const popupContent = popupRef.current?.querySelector<HTMLElement>('.rich-step-content');
    if (popupContent) {
      popupContent.scrollTop = 0;
      popupContent.scrollLeft = 0;
    }
    setPopupSelected(true);
  };

  const {
    dragging: popupDragging,
    moveWithKeyboard: movePopupWithKeyboard,
    offset: popupOffset,
    ready: popupTransformReady,
    resetPosition: resetPopupPosition,
    resetSize: resetPopupSize,
    resizeWithKeyboard: resizePopupWithKeyboard,
    resizing: popupResizing,
    size: livePopupSize,
  } = usePopupTransform({
    experienceKey: step.id,
    initialHeight: tooltip.props.tooltipLayout?.heightPx ?? null,
    initialWidth: tooltip.props.tooltipLayout?.widthPx ?? null,
    onCommitSize: (size) =>
      controller.setTooltipLayout(tooltip.id, {
        widthPx: size.widthPx ?? undefined,
        heightPx: size.heightPx ?? undefined,
      }),
    onInteractionStart: selectPopup,
    popupRef,
    stageRef: editorStageRef,
    zoomPercent: canvasZoom,
  });
  const popupCanvasStyle = {
    ...popupStyle,
    '--storyboard-canvas-zoom': String(canvasZoom / 100),
    '--storyboard-popup-x': `${popupOffset.x}px`,
    '--storyboard-popup-y': `${popupOffset.y}px`,
    ...(livePopupSize.widthPx ? { '--storyboard-popup-width': `${livePopupSize.widthPx}px` } : {}),
    ...(livePopupSize.heightPx
      ? { '--storyboard-popup-height': `${livePopupSize.heightPx}px` }
      : {}),
  } as CSSProperties;

  useLayoutEffect(() => {
    const stage = editorStageRef.current;
    const row = activeBlockRowRef.current;
    if (!stage || !row) {
      setContextToolbarPosition(null);
      return;
    }
    const updatePosition = (): void => {
      const stageRect = stage.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      setContextToolbarPosition({
        left: rowRect.left - stageRect.left + rowRect.width / 2 + stage.scrollLeft,
        top: Math.max(12, rowRect.top - stageRect.top + stage.scrollTop - 56),
      });
    };
    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(stage);
    resizeObserver.observe(row);
    const content = row.closest<HTMLElement>('.rich-step-content');
    stage.addEventListener('scroll', updatePosition, { passive: true });
    content?.addEventListener('scroll', updatePosition, { passive: true });
    return () => {
      resizeObserver.disconnect();
      stage.removeEventListener('scroll', updatePosition);
      content?.removeEventListener('scroll', updatePosition);
    };
  }, [activeBlockId, canvasZoom, popupOffset.x, popupOffset.y]);

  return (
    <div className="rich-step-editor">
      <CanvasZoomControl value={canvasZoom} onChange={setCanvasZoom} />
      <div
        className="storyboard-editor-stage"
        ref={editorStageRef}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          dismissActiveBlock();
          setPopupSelected(false);
        }}
      >
        {!activeBlock ? null : activeIsAction ? (
          <ActionContextToolbar
            block={activeBlock}
            controller={controller}
            onDismiss={dismissActiveBlock}
            onMore={() => {
              if (activeBlock.type === 'link') setActivePropertyTab('behavior');
              setPropertyTrayOpen(true);
            }}
            position={contextToolbarPosition}
            tooltip={tooltip}
          />
        ) : (
          <div
            className="rich-step-toolbar text-context-toolbar"
            role="toolbar"
            aria-label="Text formatting"
            data-positioned={contextToolbarPosition ? 'true' : 'false'}
            style={canvasToolbarStyle(contextToolbarPosition)}
          >
            <select
              aria-label="Block type"
              value={activeBlock?.type ?? 'paragraph'}
              onChange={(event) => {
                if (!activeBlock) return;
                const type = editableBlockTypeValue(event.currentTarget.value);
                if (type) controller.transformEditableBlock(activeBlock.id, type);
              }}
            >
              {EDITOR_BLOCK_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {activeIsText ? (
              <>
                <select
                  aria-label="Font size"
                  value={activeFontSize}
                  onChange={(event) => {
                    if (hasActiveTextSelection && event.currentTarget.value === 'default') {
                      updateInlineStyle({ fontSizePx: null });
                      return;
                    }
                    const fontSizePx = TEXT_SIZE_OPTIONS.find(
                      (size) => String(size) === event.currentTarget.value,
                    );
                    if (!fontSizePx) return;
                    if (hasActiveTextSelection) updateInlineStyle({ fontSizePx });
                    else updateStyle({ fontSizePx });
                  }}
                >
                  {hasActiveTextSelection ? <option value="default">Block default</option> : null}
                  {activeFontSize === 'mixed' ? (
                    <option value="mixed" disabled>
                      Mixed sizes
                    </option>
                  ) : null}
                  {TEXT_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </select>
                <span className="rich-step-toolbar-divider" aria-hidden="true" />
                <InlineMarkButton
                  active={inlineMarkActive(activeBlock, selection, 'bold')}
                  icon={<Bold size={15} strokeWidth={2.2} aria-hidden="true" />}
                  label="Bold"
                  onApply={(enabled) => {
                    if (
                      selection?.blockId === activeBlock?.id &&
                      selection.start !== selection.end
                    ) {
                      updateInlineStyle({ mark: 'bold', markEnabled: enabled });
                    } else {
                      updateStyle({
                        fontWeight: (activeStyle?.fontWeight ?? 400) >= 600 ? 400 : 700,
                      });
                    }
                  }}
                />
                <InlineMarkButton
                  active={inlineMarkActive(activeBlock, selection, 'italic')}
                  icon={<Italic size={15} strokeWidth={2.2} aria-hidden="true" />}
                  label="Italic"
                  onApply={(enabled) => {
                    if (
                      selection?.blockId === activeBlock?.id &&
                      selection.start !== selection.end
                    ) {
                      updateInlineStyle({ mark: 'italic', markEnabled: enabled });
                    } else {
                      updateStyle({
                        fontStyle: activeStyle?.fontStyle === 'italic' ? 'normal' : 'italic',
                      });
                    }
                  }}
                />
                <InlineMarkButton
                  active={inlineMarkActive(activeBlock, selection, 'underline')}
                  disabled={!selection || selection.start === selection.end}
                  icon={<Underline size={15} strokeWidth={2.2} aria-hidden="true" />}
                  label="Underline selection"
                  onApply={(enabled) =>
                    updateInlineStyle({ mark: 'underline', markEnabled: enabled })
                  }
                />
                <span className="rich-step-toolbar-divider" aria-hidden="true" />
                {(
                  [
                    ['left', 'Align left', AlignLeft],
                    ['center', 'Align center', AlignCenter],
                    ['right', 'Align right', AlignRight],
                  ] as const
                ).map(([align, label, Icon]) => (
                  <button
                    key={align}
                    type="button"
                    aria-label={label}
                    aria-pressed={(activeStyle?.align ?? 'left') === align}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => updateStyle({ align })}
                  >
                    <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
                  </button>
                ))}
                <label className="rich-step-color" title="Text color">
                  <span aria-hidden="true">A</span>
                  <input
                    type="color"
                    aria-label="Text color"
                    value={activeStyle?.color ?? '#162033'}
                    onChange={(event) => {
                      if (
                        selection?.blockId === activeBlock?.id &&
                        selection.start !== selection.end
                      ) {
                        updateInlineStyle({ color: event.currentTarget.value });
                      } else updateStyle({ color: event.currentTarget.value });
                    }}
                  />
                </label>
                <label className="rich-step-color rich-step-highlight" title="Highlight selection">
                  <Highlighter size={14} strokeWidth={2.1} aria-hidden="true" />
                  <input
                    type="color"
                    aria-label="Highlight selected text"
                    defaultValue="#fff0a8"
                    disabled={!selection || selection.start === selection.end}
                    onChange={(event) =>
                      updateInlineStyle({ highlightColor: event.currentTarget.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label="Link selected text"
                  aria-pressed={linkEditorOpen}
                  disabled={!selection || selection.start === selection.end}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setLinkEditorOpen((value) => !value)}
                >
                  <Link size={15} strokeWidth={2.1} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={
                    selection && selection.start !== selection.end
                      ? 'Clear selected text formatting'
                      : 'Reset block typography to Brand Theme'
                  }
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (
                      selection?.blockId === activeBlock?.id &&
                      selection.start !== selection.end
                    ) {
                      updateInlineStyle({ clear: true });
                      return;
                    }
                    if (activeBlock) controller.resetTextBlockStyle(activeBlock.id);
                  }}
                >
                  <RotateCcw size={15} strokeWidth={2.1} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="More text settings"
                  title="More text settings"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setPropertyTrayOpen(true)}
                >
                  <MoreHorizontal size={16} strokeWidth={2.1} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <span className="rich-step-toolbar-context">Block settings</span>
                <button
                  type="button"
                  aria-label="More block settings"
                  title="More block settings"
                  onClick={() => setPropertyTrayOpen(true)}
                >
                  <MoreHorizontal size={16} strokeWidth={2.1} aria-hidden="true" />
                </button>
              </>
            )}
            <button
              type="button"
              className="rich-step-toolbar-close"
              aria-label="Close text controls"
              title="Close controls"
              onPointerDown={(event) => event.preventDefault()}
              onClick={dismissActiveBlock}
            >
              <X size={15} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </div>
        )}
        {linkEditorOpen ? (
          <div className="rich-step-link-editor">
            <input
              aria-label="Selected text link"
              placeholder="https://example.com or /path"
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.currentTarget.value)}
            />
            <button
              type="button"
              onClick={() => {
                updateInlineStyle({ link: linkDraft });
                setLinkEditorOpen(false);
              }}
            >
              Apply link
            </button>
            <button
              type="button"
              onClick={() => {
                updateInlineStyle({ link: null });
                setLinkDraft('');
                setLinkEditorOpen(false);
              }}
            >
              Remove
            </button>
            <button
              type="button"
              aria-label="Close link editor"
              title="Close link editor"
              onClick={() => setLinkEditorOpen(false)}
            >
              <X size={15} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div
          ref={popupRef}
          className="rich-step-popup-frame"
          role="group"
          aria-label="Step content editor"
          data-popup-height-custom={livePopupSize.heightPx ? 'true' : 'false'}
          data-popup-selected={popupSelected ? 'true' : 'false'}
          data-popup-width-custom={livePopupSize.widthPx ? 'true' : 'false'}
          data-resizing={popupResizing ? 'true' : 'false'}
          data-transform-ready={popupTransformReady ? 'true' : 'false'}
          style={popupCanvasStyle}
        >
          {POPUP_RESIZE_CORNERS.map((corner) => (
            <button
              key={corner.value}
              type="button"
              className="storyboard-popup-resize-handle"
              aria-label={`Resize popup from ${corner.label}`}
              data-corner={corner.value}
              disabled={!popupTransformReady}
              title={
                popupTransformReady
                  ? 'Drag to resize. Arrow keys adjust by 8px; Home or double-click resets.'
                  : 'Loading canvas controls'
              }
              onDoubleClick={resetPopupSize}
              onFocus={selectPopup}
              onKeyDown={(event) => resizePopupWithKeyboard(corner.value, event)}
            >
              <MoveDiagonal2 size={11} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ))}
          {popupSelected && livePopupSize.widthPx && livePopupSize.heightPx ? (
            <output className="storyboard-popup-size" aria-live="polite">
              {livePopupSize.widthPx} × {livePopupSize.heightPx}px
            </output>
          ) : null}
          <PopupPointerArrow
            placement={tooltip.props.placement ?? 'bottom'}
            visible={popupComposition.showArrow && Boolean(targetIdOf(step))}
          />
          <button
            type="button"
            className="storyboard-popup-drag-handle"
            aria-label="Move popup in canvas"
            data-dragging={popupDragging ? 'true' : 'false'}
            disabled={!popupTransformReady}
            title={
              popupTransformReady
                ? 'Drag to move. Use arrow keys for precise movement; Home resets.'
                : 'Loading canvas controls'
            }
            onDoubleClick={resetPopupPosition}
            onFocus={selectPopup}
            onKeyDown={movePopupWithKeyboard}
          >
            <GripHorizontal size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          <div
            className="rich-step-content"
            data-lodariq-action-align={popupComposition.actionAlign}
            data-lodariq-action-layout={popupComposition.actionLayout}
            data-lodariq-color-mode={resolvedPopupTheme.colorMode}
            data-lodariq-composition-gap={popupComposition.gap}
            data-lodariq-composition-padding={popupComposition.padding}
            data-lodariq-content-align={popupComposition.contentAlign}
            data-lodariq-popup-radius={popupComposition.radius}
            data-lodariq-pointer-arrow={popupComposition.showArrow ? 'show' : 'hide'}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              selectPopup();
            }}
          >
            <InlineStepInsert
              controller={controller}
              index={0}
              label="Insert content at start of popup"
              stepBlockId={step.id}
            />
            {contentBlocks.map((block, index) => (
              <div className="rich-step-block-stack" key={block.id}>
                <div
                  ref={activeBlockId === block.id ? activeBlockRowRef : undefined}
                  className={`rich-step-block-row ${activeBlockId === block.id ? 'active' : ''} ${
                    snapshot.selectedBlockId === block.id ? 'selected' : ''
                  }`.trim()}
                  data-block-id={block.id}
                  data-lodariq-spacing-after={block.props.blockLayout?.spacingAfter}
                  data-lodariq-spacing-after-px={block.props.blockLayout?.spacingAfterPx}
                  data-lodariq-spacing-before={block.props.blockLayout?.spacingBefore}
                  data-step-block-id={step.id}
                  style={blockSpacingAfterStyle(block.props.blockLayout)}
                  onDragOver={(event) =>
                    controller.handleStepContentDragOver(event, step.id, block.id)
                  }
                  onDrop={(event) => controller.handleStepContentDrop(event, step.id, block.id)}
                  onPointerDown={() => activateBlock(block)}
                >
                  <button
                    type="button"
                    className="rich-step-block-drag"
                    draggable
                    aria-label={`Drag ${blockTypeEditorLabel(block)} block`}
                    title="Drag to reorder"
                    onDragEnd={() => controller.endDraggingStepContent()}
                    onDragStart={(event) =>
                      controller.startDraggingStepContent(step.id, block.id, event)
                    }
                  >
                    <GripVertical size={14} strokeWidth={2.1} aria-hidden="true" />
                  </button>
                  <RichStepBlockEditor
                    actionAlign={tooltip.props.tooltipLayout?.actionAlign}
                    active={activeBlockId === block.id}
                    block={block}
                    canvasZoom={canvasZoom}
                    controller={controller}
                    onActivate={() => activateBlock(block)}
                    onCommitRichText={(element) => commitBlock(block.id, element)}
                    onKeyDown={(event, element) =>
                      handleRichTextEditorKeyDown({
                        block,
                        controller,
                        element,
                        event,
                        stepBlockId: step.id,
                        suppressBlurCommit: () => suppressNextBlurCommit(block.id),
                        totalBlocks: contentBlocks.length,
                      })
                    }
                    onSelectionChange={(element) => {
                      const nextSelection = richTextSelection(element, block.id);
                      if (nextSelection) setSelection(nextSelection);
                    }}
                  />
                  <ContentBlockActionMenu block={block} controller={controller} stepId={step.id} />
                </div>
                <InlineStepInsert
                  controller={controller}
                  index={index + 1}
                  label={`Insert content after ${blockTypeEditorLabel(block)}`}
                  stepBlockId={step.id}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <ContextualPropertyTray
        activeTab={activePropertyTab}
        activeBlock={activeBlock}
        actionBlock={trayActionBlock}
        controller={controller}
        health={health}
        placementEditor={
          <StepPlacementEditor
            controller={controller}
            snapshot={snapshot}
            step={step}
            stepIndex={stepIndex}
          />
        }
        snapshot={snapshot}
        step={step}
        tooltip={tooltip}
        toolMode={toolMode}
        open={propertyTrayOpen || toolMode !== 'content'}
        onActiveTabChange={setActivePropertyTab}
        onClose={() => {
          setPropertyTrayOpen(false);
          if (toolMode !== 'content') onToolModeChange('content');
        }}
      />
    </div>
  );
}

type RichTextSelection = { blockId: string; start: number; end: number };

function useMediaPreference(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const sync = (): void => setMatches(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, [query]);

  return matches;
}

function handleRichTextEditorKeyDown({
  block,
  controller,
  element,
  event,
  stepBlockId,
  suppressBlurCommit,
  totalBlocks,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  element: HTMLElement;
  event: ReactKeyboardEvent<HTMLElement>;
  stepBlockId: string;
  suppressBlurCommit: () => void;
  totalBlocks: number;
}): void {
  if (event.nativeEvent.isComposing) return;
  const selection = richTextSelection(element, block.id);
  if (!selection) return;
  const content = extractInlineTextRuns(element)
    .map((run) => run.text)
    .join('');
  const collapsed = selection.start === selection.end;
  const hasNavigationModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

  if (event.key === 'ArrowUp' && collapsed && selection.start === 0 && !hasNavigationModifier) {
    if (controller.focusPreviousStepContentBlock(stepBlockId, block.id)) event.preventDefault();
    return;
  }
  if (
    event.key === 'ArrowDown' &&
    collapsed &&
    selection.end === content.length &&
    !hasNavigationModifier
  ) {
    if (controller.focusNextStepContentBlock(stepBlockId, block.id)) event.preventDefault();
    return;
  }
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    const slashCommand = content.trimStart().startsWith('/')
      ? stepContentCommandFromQuery(content)
      : undefined;
    event.preventDefault();
    suppressBlurCommit();
    if (slashCommand) {
      controller.applyStepContentCommand(stepBlockId, block.id, slashCommand);
      return;
    }
    controller.continueStepContentBlock(
      stepBlockId,
      block.id,
      content.slice(0, selection.start),
      content.slice(selection.end),
    );
    return;
  }
  if (
    event.key !== 'Backspace' ||
    totalBlocks <= 1 ||
    !collapsed ||
    selection.start !== 0 ||
    hasNavigationModifier
  ) {
    return;
  }
  if (content.trim().length === 0) {
    event.preventDefault();
    suppressBlurCommit();
    controller.deleteEmptyStepContentBlock(stepBlockId, block.id);
    return;
  }
  if (controller.mergeStepContentBlockIntoPrevious(stepBlockId, block.id, content)) {
    event.preventDefault();
    suppressBlurCommit();
    return;
  }
  if (controller.focusPreviousStepContentBlock(stepBlockId, block.id)) event.preventDefault();
}

function InlineMarkButton({
  active,
  disabled = false,
  icon,
  label,
  onApply,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onApply: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => onApply(!active)}
    >
      {icon}
    </button>
  );
}

function RichStepBlockEditor({
  actionAlign,
  active,
  block,
  canvasZoom,
  controller,
  onActivate,
  onCommitRichText,
  onKeyDown,
  onSelectionChange,
}: {
  actionAlign?: BlockLayoutProps['align'];
  active: boolean;
  block: LodariqBlock;
  canvasZoom: number;
  controller: LocalAuthoringFrameController;
  onActivate: () => void;
  onCommitRichText: (element: HTMLElement) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>, element: HTMLElement) => void;
  onSelectionChange: (element: HTMLElement) => void;
}) {
  if (block.type === 'heading' || block.type === 'paragraph') {
    return (
      <div
        key={`${block.id}:${block.content ?? ''}`}
        className={`rich-step-block ${block.type}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={block.type === 'heading' ? 'Step heading' : 'Step paragraph'}
        aria-multiline="true"
        data-rich-block-id={block.id}
        data-lodariq-node-type={block.type}
        style={richTextBlockStyle(block)}
        onBlur={(event) => onCommitRichText(event.currentTarget)}
        onFocus={onActivate}
        onKeyDown={(event) => onKeyDown(event, event.currentTarget)}
        onKeyUp={(event) => onSelectionChange(event.currentTarget)}
        onPointerUp={(event) => onSelectionChange(event.currentTarget)}
      >
        {renderInlineTextRuns(block)}
      </div>
    );
  }
  if (block.type === 'divider') {
    return <div className="rich-step-divider-preview" role="separator" />;
  }
  if (block.type === 'list') {
    return (
      <textarea
        key={`${block.id}:${block.content ?? ''}`}
        className="rich-step-plain-field list"
        aria-label="List items"
        defaultValue={block.content ?? ''}
        onFocus={onActivate}
        onBlur={(event) => controller.commitRichTextContent(block.id, event.currentTarget.value)}
      />
    );
  }
  const label = BLOCK_EDITOR_INPUT_LABELS[block.type] ?? 'Content label';
  if (block.type === 'button' || block.type === 'link') {
    return (
      <ResizableActionBlockEditor
        actionAlign={actionAlign}
        active={active}
        block={block}
        canvasZoom={canvasZoom}
        controller={controller}
        label={label}
        onActivate={onActivate}
      />
    );
  }
  return (
    <div className={`rich-step-special-block ${block.type}`}>
      <span>{blockTypeEditorLabel(block)}</span>
      <input
        key={`${block.id}:${block.content ?? ''}`}
        aria-label={label}
        defaultValue={block.content ?? ''}
        onFocus={onActivate}
        onBlur={(event) => controller.commitRichTextContent(block.id, event.currentTarget.value)}
      />
    </div>
  );
}

function ResizableActionBlockEditor({
  actionAlign = 'start',
  active,
  block,
  canvasZoom,
  controller,
  label,
  onActivate,
}: {
  actionAlign?: BlockLayoutProps['align'];
  active: boolean;
  block: LodariqBlock;
  canvasZoom: number;
  controller: LocalAuthoringFrameController;
  label: string;
  onActivate: () => void;
}) {
  const actionStyle = block.props.buttonStyle ?? {};
  const actionRecipe = resolveTourActionRecipe(block.props, defaultActionVariant(block));
  const icon = actionStyle.icon ?? 'none';
  const iconPlacement = actionStyle.iconPlacement ?? 'end';
  const previewRef = useRef<HTMLSpanElement | null>(null);
  const {
    liveWidth,
    reset: resetWidth,
    resizeWithKeyboard,
    resizing,
  } = useActionResize({
    actionAlign,
    actionKey: block.id,
    initialWidth: actionStyle.widthPx ?? null,
    onCommit: (widthPx) =>
      controller.setButtonStyle(block.id, {
        width: 'hug',
        widthPx: widthPx ?? undefined,
      }),
    previewRef,
    zoomPercent: canvasZoom,
  });

  const previewStyle = {
    '--lq-action-fill': actionStyle.fillColor,
    '--lq-action-text': actionStyle.textColor,
    '--lq-action-border': actionStyle.borderColor,
    width: liveWidth ? `${liveWidth}px` : undefined,
  } as CSSProperties;
  const showStartHandle = actionAlign !== 'start';
  const showEndHandle = actionAlign !== 'end';

  return (
    <div className={`rich-step-special-block action ${block.type}`}>
      <span className="rich-step-block-kind">{blockTypeEditorLabel(block)}</span>
      <div className="rich-step-action-stage" data-lodariq-action-align={actionAlign}>
        <span
          className="rich-step-action-preview"
          data-lodariq-action-radius={actionRecipe.radius}
          data-lodariq-action-size={actionRecipe.size}
          data-lodariq-action-variant={actionRecipe.variant}
          data-lodariq-action-width={liveWidth ? 'custom' : actionRecipe.width}
          data-lodariq-block-align={actionAlign}
          data-lodariq-node-type={block.type}
          ref={previewRef}
          style={previewStyle}
        >
          {icon !== 'none' && iconPlacement === 'start' ? <ActionPreviewIcon icon={icon} /> : null}
          <input
            key={`${block.id}:${block.content ?? ''}`}
            aria-label={label}
            defaultValue={block.content ?? ''}
            onFocus={onActivate}
            onBlur={(event) =>
              controller.commitRichTextContent(block.id, event.currentTarget.value)
            }
          />
          {icon !== 'none' && iconPlacement === 'end' ? <ActionPreviewIcon icon={icon} /> : null}
          {active && showStartHandle ? (
            <button
              type="button"
              className="storyboard-action-resize-handle start"
              aria-label={`Resize ${blockTypeEditorLabel(block)} from start`}
              title="Drag to resize. Arrow keys resize by 8px; Home resets."
              onDoubleClick={resetWidth}
              onKeyDown={(event) => resizeWithKeyboard(event, 'start')}
            />
          ) : null}
          {active && showEndHandle ? (
            <button
              type="button"
              className="storyboard-action-resize-handle end"
              aria-label={`Resize ${blockTypeEditorLabel(block)} from end`}
              title="Drag to resize. Arrow keys resize by 8px; Home resets."
              onDoubleClick={resetWidth}
              onKeyDown={(event) => resizeWithKeyboard(event, 'end')}
            />
          ) : null}
          {active && resizing && liveWidth ? (
            <output className="storyboard-action-resize-value">{liveWidth}px</output>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function ActionPreviewIcon({ icon }: { icon: NonNullable<ButtonStyleProps['icon']> }) {
  if (icon === 'external-link') {
    return <ExternalLink aria-hidden="true" size={14} strokeWidth={2} />;
  }
  if (icon === 'check') return <Check aria-hidden="true" size={14} strokeWidth={2} />;
  return <ChevronRight aria-hidden="true" size={14} strokeWidth={2} />;
}

function CanvasZoomControl({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  const currentIndex = CANVAS_ZOOM_LEVELS.findIndex((level) => level === value);
  const minimum = 60;
  const maximum = 120;

  return (
    <div className="storyboard-canvas-zoom" role="group" aria-label="Canvas zoom">
      <button
        type="button"
        aria-label="Zoom out canvas"
        disabled={value <= minimum}
        onClick={() => onChange(CANVAS_ZOOM_LEVELS[Math.max(0, currentIndex - 1)] ?? minimum)}
      >
        <Minus size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="storyboard-canvas-zoom-value"
        aria-label={`Reset canvas zoom to ${DEFAULT_CANVAS_ZOOM}%`}
        title="Reset canvas zoom"
        onClick={() => onChange(DEFAULT_CANVAS_ZOOM)}
      >
        {value}%
      </button>
      <button
        type="button"
        aria-label="Zoom in canvas"
        disabled={value >= maximum}
        onClick={() =>
          onChange(
            CANVAS_ZOOM_LEVELS[Math.min(CANVAS_ZOOM_LEVELS.length - 1, currentIndex + 1)] ??
              maximum,
          )
        }
      >
        <Plus size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

function ActionContextToolbar({
  block,
  controller,
  onDismiss,
  onMore,
  position,
  tooltip,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  onDismiss: () => void;
  onMore: () => void;
  position: ActionToolbarPosition | null;
  tooltip: LodariqBlock;
}) {
  const toolbarStyle = canvasToolbarStyle(position);
  const itemLabel = block.content?.trim() || blockTypeEditorLabel(block);
  const actionValue = editableActionValue(block.props.action?.type ?? '') ?? '';
  const behaviorLabel = optionLabel(EDITABLE_ACTION_OPTIONS, actionValue, 'Action');
  const behaviorIsUsefulHere = block.type === 'link';

  return (
    <div
      className="rich-step-toolbar action-context-toolbar"
      role="toolbar"
      aria-label={`${blockTypeLabel(block.type)} configuration`}
      data-positioned={position ? 'true' : 'false'}
      style={toolbarStyle}
    >
      <span
        className="action-context-identity"
        title={`${blockTypeLabel(block.type)}: ${itemLabel}`}
      >
        <SquareMousePointer size={16} strokeWidth={2} aria-hidden="true" />
        <span>{blockTypeLabel(block.type)}</span>
        <small>· {itemLabel}</small>
      </span>
      {behaviorIsUsefulHere ? (
        <ActionQuickProperty
          activeTab="behavior"
          block={block}
          controller={controller}
          tooltip={tooltip}
          trigger={
            <button type="button" aria-label="Link behavior" title="Link behavior">
              <MousePointerClick size={15} strokeWidth={2} aria-hidden="true" />
              <span>{behaviorLabel}</span>
            </button>
          }
        />
      ) : null}
      <button
        type="button"
        aria-label={`More ${blockTypeLabel(block.type).toLowerCase()} settings`}
        title="More settings"
        onClick={onMore}
      >
        <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="action-context-close"
        aria-label={`Close ${blockTypeLabel(block.type).toLowerCase()} controls`}
        title="Close controls"
        onClick={onDismiss}
      >
        <X size={15} strokeWidth={2.1} aria-hidden="true" />
      </button>
    </div>
  );
}

function ActionQuickProperty({
  activeTab,
  block,
  controller,
  tooltip,
  trigger,
}: {
  activeTab: ActionPropertyTab;
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  tooltip: LodariqBlock;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AuthoringPopover
      align="center"
      contentClassName="action-quick-property-popover"
      dismissLabel="Close link behavior"
      onOpenChange={setOpen}
      open={open}
      portal
      side="top"
      trigger={trigger}
      content={
        <ButtonPropertyPanel
          activeTab={activeTab}
          block={block}
          controller={controller}
          tooltip={tooltip}
        />
      }
    />
  );
}

function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
  fallback: string,
): string {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

const EDITOR_BLOCK_TYPE_OPTIONS = [
  { value: 'paragraph', label: 'Normal text' },
  { value: 'heading', label: 'Heading' },
  { value: 'list', label: 'List' },
  { value: 'button', label: 'Button' },
  { value: 'link', label: 'Link' },
  { value: 'media', label: 'Media' },
  { value: 'divider', label: 'Divider' },
] as const;

const BLOCK_EDITOR_LABELS: Partial<Record<LodariqBlock['type'], string>> = {
  heading: 'heading',
  paragraph: 'text',
  list: 'list',
  divider: 'divider',
  button: 'button',
  link: 'link',
  media: 'media',
};

const BLOCK_EDITOR_INPUT_LABELS: Partial<Record<LodariqBlock['type'], string>> = {
  button: 'Button label',
  link: 'Link label',
  media: 'Media description',
};

function blockTypeEditorLabel(block: LodariqBlock): string {
  return BLOCK_EDITOR_LABELS[block.type] ?? 'content';
}

function renderInlineTextRuns(block: LodariqBlock): ReactNode {
  const runs = block.contentRuns;
  if (!runs?.length || runs.map((run) => run.text).join('') !== (block.content ?? ''))
    return block.content;
  return runs.map((run, index) => (
    <span
      key={`${block.id}-run-${index}`}
      data-inline-run="true"
      data-marks={(run.marks ?? []).join(' ')}
      data-font-size-px={run.fontSizePx}
      data-color={run.color}
      data-highlight-color={run.highlightColor}
      data-link={run.link}
      style={inlineRunStyle(run)}
    >
      {run.text}
    </span>
  ));
}

function inlineRunStyle(run: InlineTextRun): CSSProperties {
  const marks = new Set(run.marks ?? []);
  return {
    color: run.color,
    backgroundColor: run.highlightColor,
    fontSize: run.fontSizePx ? `${run.fontSizePx}px` : undefined,
    fontWeight: marks.has('bold') ? 700 : undefined,
    fontStyle: marks.has('italic') ? 'italic' : undefined,
    textDecoration: marks.has('underline') || run.link ? 'underline' : undefined,
  };
}

function richTextSelection(element: HTMLElement, blockId: string): RichTextSelection | null {
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return null;
  const startRange = range.cloneRange();
  startRange.selectNodeContents(element);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = range.cloneRange();
  endRange.selectNodeContents(element);
  endRange.setEnd(range.endContainer, range.endOffset);
  return { blockId, start: startRange.toString().length, end: endRange.toString().length };
}

function extractInlineTextRuns(element: HTMLElement): InlineTextRun[] {
  const runs: InlineTextRun[] = [];
  const visit = (node: Node, inherited?: InlineTextRun): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) runs.push({ ...inherited, text });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      runs.push({ ...inherited, text: '\n' });
      return;
    }
    const marks = node.dataset['marks']?.split(' ').filter(Boolean) as InlineTextRun['marks'];
    const next: InlineTextRun = { text: '' };
    const effectiveMarks = marks?.length ? marks : inherited?.marks;
    const fontSizePx = node.dataset['fontSizePx']
      ? TEXT_SIZE_OPTIONS.find((size) => String(size) === node.dataset['fontSizePx'])
      : inherited?.fontSizePx;
    const color = node.dataset['color'] ?? inherited?.color;
    const highlightColor = node.dataset['highlightColor'] ?? inherited?.highlightColor;
    const link = node.dataset['link'] ?? inherited?.link;
    if (effectiveMarks?.length) next.marks = effectiveMarks;
    if (fontSizePx) next.fontSizePx = fontSizePx;
    if (color) next.color = color;
    if (highlightColor) next.highlightColor = highlightColor;
    if (link) next.link = link;
    node.childNodes.forEach((child) => visit(child, next));
  };
  element.childNodes.forEach((child) => visit(child));
  return runs;
}

function inlineMarkActive(
  block: LodariqBlock | null,
  selection: RichTextSelection | null,
  mark: NonNullable<InlineTextRun['marks']>[number],
): boolean {
  if (!block) return false;
  if (!selection || selection.blockId !== block.id || selection.start === selection.end) {
    if (mark === 'bold') return (block.props.textStyle?.fontWeight ?? 400) >= 600;
    if (mark === 'italic') return block.props.textStyle?.fontStyle === 'italic';
    return false;
  }
  let offset = 0;
  const runs = block.contentRuns ?? [{ text: block.content ?? '' }];
  const selectedRuns = runs.filter((run) => {
    const start = offset;
    const end = offset + run.text.length;
    offset = end;
    return end > selection.start && start < selection.end;
  });
  return selectedRuns.length > 0 && selectedRuns.every((run) => run.marks?.includes(mark));
}

function selectedTextFontSize(
  block: LodariqBlock | null,
  selection: RichTextSelection | null,
): (typeof TEXT_SIZE_OPTIONS)[number] | 'default' | 'mixed' {
  const blockDefault = block?.props.textStyle?.fontSizePx ?? (block?.type === 'heading' ? 24 : 14);
  if (!block || !selection || selection.blockId !== block.id || selection.start === selection.end) {
    return blockDefault;
  }
  let offset = 0;
  const selectedRuns = (block.contentRuns ?? [{ text: block.content ?? '' }]).filter((run) => {
    const start = offset;
    const end = offset + run.text.length;
    offset = end;
    return end > selection.start && start < selection.end;
  });
  if (selectedRuns.every((run) => run.fontSizePx === undefined)) return 'default';
  const firstSize = selectedRuns[0]?.fontSizePx;
  return firstSize && selectedRuns.every((run) => run.fontSizePx === firstSize)
    ? firstSize
    : 'mixed';
}

function ContentBlockActionMenu({
  block,
  controller,
  stepId,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  stepId: string;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };
  const label = blockTypeEditorLabel(block);
  return (
    <AuthoringPopover
      align="end"
      open={open}
      onOpenChange={setOpen}
      contentClassName="rich-step-block-action-popover"
      trigger={
        <AuthoringButton
          aria-label={`${label} line actions`}
          className="rich-step-block-actions"
          icon={<MoreHorizontal size={14} strokeWidth={2.2} />}
          title={`${label} line actions`}
          tone="ghost"
        />
      }
      content={
        <div
          className="rich-step-block-action-menu"
          role="menu"
          aria-label={`${label} line actions`}
        >
          <AuthoringButton
            icon={<ArrowUp size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.moveStepContentBlock(stepId, block.id, 'up'))}
            role="menuitem"
          >
            Move up
          </AuthoringButton>
          <AuthoringButton
            icon={<ArrowDown size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.moveStepContentBlock(stepId, block.id, 'down'))}
            role="menuitem"
          >
            Move down
          </AuthoringButton>
          <AuthoringButton
            icon={<Copy size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.duplicateStepContentBlock(stepId, block.id))}
            role="menuitem"
          >
            Duplicate
          </AuthoringButton>
          <AuthoringButton
            className="danger"
            icon={<Trash2 size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.deleteStepContentBlock(stepId, block.id))}
            role="menuitem"
          >
            Delete
          </AuthoringButton>
        </div>
      }
    />
  );
}

function richTextBlockStyle(block: LodariqBlock) {
  const textStyle = block.props.textStyle;
  return {
    color: textStyle?.color,
    fontSize: textStyle?.fontSizePx ? `${textStyle.fontSizePx}px` : undefined,
    fontStyle: textStyle?.fontStyle,
    fontWeight: textStyle?.fontWeight,
    textAlign: textStyle?.align,
  } as const;
}

function StepAccordionDetails({
  controller,
  health,
  step,
  stepIndex,
  targetActionLabel,
  targetId,
  targetLabel,
}: {
  controller: LocalAuthoringFrameController;
  health: { label: string; repair: boolean; tone: StepHealthTone };
  step: LodariqBlock;
  stepIndex: number;
  targetActionLabel: string;
  targetId: string | null;
  targetLabel: string;
}) {
  const accordionRef = useRef<HTMLDivElement | null>(null);
  const tooltip = stepTooltip(step);
  const button = stepPrimaryButton(step);
  const placement = tooltip?.props.placement ?? 'bottom';
  const advanceValue = buttonAdvanceValue(button);
  const placementFact = stepPlacementFact(targetId, targetLabel, health);

  useEffect(() => {
    const node = accordionRef.current;
    if (!node || typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ block: 'nearest' });
  }, [step.id]);

  return (
    <div ref={accordionRef} className="tour-step-accordion" data-step-accordion={step.id}>
      <section className="tour-step-detail-row" aria-label="Placement">
        <span className="tour-step-detail-label">Placement</span>
        <div className="tour-step-detail-fact">
          <span className={`tour-step-detail-status ${health.tone}`}>
            <span className="tour-step-health-dot" aria-hidden="true" />
            <strong>{placementFact}</strong>
          </span>
          <button
            type="button"
            className="tour-step-detail-change"
            aria-label={`${targetActionLabel} for step ${stepIndex + 1}`}
            onClick={() => controller.startTargetPick(step.id)}
          >
            {targetId ? 'Change' : 'Choose'}
          </button>
        </div>
      </section>

      <section className="tour-step-detail-row" aria-label="Behavior">
        <span className="tour-step-detail-label">Behavior</span>
        <strong className="tour-step-behavior-summary">
          {TOOLTIP_PLACEMENT_LABELS[placement]} · {ADVANCE_OPTION_LABELS[advanceValue]}
        </strong>
      </section>

      <button
        type="button"
        className="tour-step-edit-on-page"
        onClick={() => {
          controller.closeAdvancedEditor();
          controller.requestPanelLayout('standard');
          controller.activateTourStep(step.id);
        }}
      >
        <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
        Edit content on page
      </button>

      <button
        type="button"
        className="tour-step-open-details compact-details"
        onClick={() => controller.openAdvancedEditor(step.id)}
      >
        <span>
          <strong>Edit details</strong>
          <small>Release review and recovery</small>
        </span>
        <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}
