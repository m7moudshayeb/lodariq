import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  BLOCK_SPACING_PX_LIMITS,
  BUTTON_WIDTH_PX_LIMITS,
  TEXT_FONT_SIZE_VALUES,
  TOOLTIP_HEIGHT_PX_LIMITS,
  TOOLTIP_WIDTH_PX_LIMITS,
} from '@lodariq/schema';
import type {
  BlockLayoutProps,
  ButtonStyleProps,
  InlineTextRun,
  LodariqBlock,
  TextStyleProps,
  TooltipLayoutProps,
} from '@lodariq/schema';
import { resolveTourThemeStyle } from '@lodariq/sdk-runtime/renderers/tour';
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
  Circle,
  CircleX,
  Copy,
  ExternalLink,
  GripHorizontal,
  GripVertical,
  Highlighter,
  Italic,
  Link,
  LogOut,
  Minus,
  MoreHorizontal,
  MoveDiagonal2,
  MoveHorizontal,
  MousePointer2,
  MousePointerClick,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Shapes,
  SquareMousePointer,
  Trash2,
  Type,
  Underline,
  X,
} from '../design-system';
import {
  EDITABLE_ACTION_OPTIONS,
  EDITABLE_BUTTON_VARIANT_OPTIONS,
  type EditableActionType,
  type LocalAuthoringFrameSnapshot,
} from '../types';
import {
  blockDisplayTitle,
  blockStatus,
  blockTypeLabel,
  editableActionValue,
  editableBlockTypeValue,
  isEditableContentBlock,
  stepContentCommandFromQuery,
  targetDiagnosticIsDrift,
  targetIdOf,
  targetLabelOf,
} from '../utils';
import { InlineStepInsert } from './insert-menu';
import { TargetControls } from './target-controls';

const TOOLTIP_PLACEMENT_LABELS = {
  top: 'Above',
  bottom: 'Below',
  left: 'Left',
  right: 'Right',
} as const;

const ADVANCE_OPTION_LABELS = {
  next: 'Next button',
  clickTarget: 'Clicks target',
} as const satisfies Record<Extract<EditableActionType, 'next' | 'clickTarget'>, string>;

const TOOLTIP_POSITION_OPTIONS = [
  { value: 'top', label: 'Top', icon: PanelTop },
  { value: 'right', label: 'Right', icon: PanelRight },
  { value: 'bottom', label: 'Bottom', icon: PanelBottom },
  { value: 'left', label: 'Left', icon: PanelLeft },
] as const;

const TEXT_SIZE_OPTIONS = TEXT_FONT_SIZE_VALUES;

type StoryboardToolMode = 'content' | 'placement' | 'popup';
type ActionPropertyTab =
  'appearance' | 'behavior' | 'size' | 'alignment' | 'shape' | 'colors' | 'spacing';

type ActionToolbarPosition = { left: number; top: number };
type CanvasPopupOffset = { x: number; y: number };
type CanvasPopupSize = { widthPx: number | null; heightPx: number | null };
type PopupResizeCorner = 'north-east' | 'north-west' | 'south-east' | 'south-west';
type CanvasPopupDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffset: CanvasPopupOffset;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};
type CanvasPopupResizeState = {
  pointerId: number;
  corner: PopupResizeCorner;
  startClientX: number;
  startClientY: number;
  startOffset: CanvasPopupOffset;
  startSize: { widthPx: number; heightPx: number };
  latestOffset: CanvasPopupOffset;
  latestSize: { widthPx: number; heightPx: number };
};

const CANVAS_ZOOM_LEVELS = [60, 70, 80, 90, 100, 110, 120] as const;
const DEFAULT_CANVAS_ZOOM = 80;
const POPUP_RESIZE_CORNERS = [
  { value: 'north-west', label: 'top left' },
  { value: 'north-east', label: 'top right' },
  { value: 'south-west', label: 'bottom left' },
  { value: 'south-east', label: 'bottom right' },
] as const satisfies ReadonlyArray<{ value: PopupResizeCorner; label: string }>;

const STORYBOARD_TOOL_OPTIONS = [
  { value: 'content', label: 'Content', icon: Type },
  { value: 'placement', label: 'Placement', icon: MousePointer2 },
  { value: 'popup', label: 'Popup', icon: PanelTop },
] as const satisfies ReadonlyArray<{
  value: StoryboardToolMode;
  label: string;
  icon: typeof Type;
}>;

export function TourStoryboard({
  activeStepId,
  controller,
  snapshot,
  steps,
}: {
  activeStepId: string | null;
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: LodariqBlock[];
}) {
  const health = steps.map((step) => stepHealth(step, snapshot));

  return (
    <nav className="tour-storyboard" aria-label="Tour steps">
      <ol className="tour-storyboard-list">
        {steps.map((step, index) => {
          const active = step.id === activeStepId;
          const itemHealth = health[index]!;
          const preview = storyboardStepPreview(step);
          return (
            <li
              className={`tour-storyboard-step ${active ? 'active' : ''} ${itemHealth.tone}`.trim()}
              data-block-id={step.id}
              key={step.id}
              onDragOver={(event) => controller.handleBlockDragOver(event)}
              onDrop={(event) => controller.handleBlockDrop(event, step.id)}
            >
              <button
                type="button"
                className="tour-storyboard-drag"
                draggable
                aria-label={`Drag step ${index + 1}`}
                title="Drag to reorder step"
                onDragEnd={() => controller.endDraggingBlock()}
                onDragStart={(event) => controller.startDraggingBlock(step.id, event)}
              >
                <GripVertical size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="tour-storyboard-select"
                aria-current={active ? 'step' : undefined}
                aria-label={`Edit step ${index + 1}: ${blockDisplayTitle(step)}`}
                onClick={() => controller.activateTourStep(step.id)}
              >
                <span className="tour-storyboard-heading">
                  <span className="tour-storyboard-number">{index + 1}</span>
                  <strong>{blockDisplayTitle(step)}</strong>
                  <span className={`tour-storyboard-health ${itemHealth.tone}`}>
                    {itemHealth.tone === 'ready' ? (
                      <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <span className="tour-step-health-dot" aria-hidden="true" />
                    )}
                    <span className="visually-hidden">{itemHealth.label}</span>
                  </span>
                </span>
                <span className="tour-storyboard-preview" aria-hidden="true">
                  <span>{preview.body}</span>
                  {preview.action ? <strong>{preview.action}</strong> : null}
                </span>
              </button>
              <TourStepActionMenu controller={controller} step={step} stepIndex={index} />
            </li>
          );
        })}
        <li className="tour-storyboard-add-item">
          <button
            type="button"
            className="tour-storyboard-add"
            aria-label="Add step"
            onClick={() => controller.appendStepAndChooseTarget()}
          >
            <Plus size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </li>
      </ol>
    </nav>
  );
}

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
  const health = stepHealth(step, snapshot);
  const tooltip = stepTooltip(step);
  const [toolMode, setToolMode] = useState<StoryboardToolMode>('content');

  useEffect(() => setToolMode('content'), [step.id]);

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
  const [popupDragging, setPopupDragging] = useState(false);
  const [popupResizing, setPopupResizing] = useState(false);
  const [popupSelected, setPopupSelected] = useState(false);
  const [popupOffset, setPopupOffset] = useState<CanvasPopupOffset>({ x: 0, y: 0 });
  const [livePopupSize, setLivePopupSize] = useState<CanvasPopupSize>({
    widthPx: tooltip.props.tooltipLayout?.widthPx ?? null,
    heightPx: tooltip.props.tooltipLayout?.heightPx ?? null,
  });
  const [contextToolbarPosition, setContextToolbarPosition] =
    useState<ActionToolbarPosition | null>(null);
  const suppressedBlurCommitBlockIds = useRef(new Set<string>());
  const popupDragStateRef = useRef<CanvasPopupDragState | null>(null);
  const popupResizeStateRef = useRef<CanvasPopupResizeState | null>(null);
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

  useEffect(() => {
    if (activeBlockId === null) return;
    if (activeBlockId && contentBlocks.some((block) => block.id === activeBlockId)) return;
    setActiveBlockId(contentBlocks[0]?.id ?? null);
  }, [activeBlockId, contentBlocks, step.id]);

  useEffect(() => setPropertyTrayOpen(false), [activeBlockId]);

  useEffect(() => {
    popupDragStateRef.current = null;
    popupResizeStateRef.current = null;
    setPopupDragging(false);
    setPopupResizing(false);
    setPopupSelected(false);
    setPopupOffset({ x: 0, y: 0 });
  }, [step.id]);

  useEffect(() => {
    setLivePopupSize({
      widthPx: tooltip.props.tooltipLayout?.widthPx ?? null,
      heightPx: tooltip.props.tooltipLayout?.heightPx ?? null,
    });
  }, [tooltip.id, tooltip.props.tooltipLayout?.heightPx, tooltip.props.tooltipLayout?.widthPx]);

  useEffect(() => {
    if (toolMode !== 'content') setPropertyTrayOpen(false);
  }, [toolMode]);

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

  const beginPopupDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const stage = editorStageRef.current;
    const popup = popupRef.current;
    if (!stage || !popup) return;
    const stageRect = stage.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const horizontalInset = 12;
    const toolDockClearance = 96;
    const verticalInset = 12;
    const handleVisibility = 48;
    const inverseZoom = 100 / canvasZoom;
    const minX = popupOffset.x + (stageRect.left + horizontalInset - popupRect.left) * inverseZoom;
    const maxX =
      popupOffset.x + (stageRect.right - toolDockClearance - popupRect.right) * inverseZoom;
    const minY = popupOffset.y + (stageRect.top + verticalInset - popupRect.top) * inverseZoom;
    const maxY =
      popupOffset.y + (stageRect.bottom - handleVisibility - popupRect.top) * inverseZoom;
    popupDragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: popupOffset,
      bounds: {
        minX: Math.min(minX, maxX),
        maxX: Math.max(minX, maxX),
        minY: Math.min(minY, maxY),
        maxY: Math.max(minY, maxY),
      },
    };
    selectPopup();
    setPopupDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const continuePopupDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const dragState = popupDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    setPopupOffset({
      x: clamp(
        snapToGrid(
          dragState.startOffset.x + (event.clientX - dragState.startClientX) * (100 / canvasZoom),
          4,
        ),
        dragState.bounds.minX,
        dragState.bounds.maxX,
      ),
      y: clamp(
        snapToGrid(
          dragState.startOffset.y + (event.clientY - dragState.startClientY) * (100 / canvasZoom),
          4,
        ),
        dragState.bounds.minY,
        dragState.bounds.maxY,
      ),
    });
  };

  const endPopupDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const dragState = popupDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    popupDragStateRef.current = null;
    setPopupDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const movePopupWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const movementByKey: Readonly<Record<string, CanvasPopupOffset>> = {
      ArrowDown: { x: 0, y: 8 },
      ArrowLeft: { x: -8, y: 0 },
      ArrowRight: { x: 8, y: 0 },
      ArrowUp: { x: 0, y: -8 },
    };
    if (event.key === 'Home') {
      setPopupOffset({ x: 0, y: 0 });
      event.preventDefault();
      return;
    }
    const movement = movementByKey[event.key];
    if (!movement) return;
    setPopupOffset((current) => ({
      x: current.x + movement.x,
      y: current.y + movement.y,
    }));
    event.preventDefault();
  };

  const measuredPopupSize = (): { widthPx: number; heightPx: number } => {
    const popupRect = popupRef.current?.getBoundingClientRect();
    const inverseZoom = 100 / canvasZoom;
    return {
      widthPx: clamp(
        livePopupSize.widthPx ??
          snapToGrid((popupRect?.width ?? TOOLTIP_WIDTH_PX_LIMITS.min) * inverseZoom, 4),
        TOOLTIP_WIDTH_PX_LIMITS.min,
        TOOLTIP_WIDTH_PX_LIMITS.max,
      ),
      heightPx: clamp(
        livePopupSize.heightPx ??
          snapToGrid((popupRect?.height ?? TOOLTIP_HEIGHT_PX_LIMITS.min) * inverseZoom, 4),
        TOOLTIP_HEIGHT_PX_LIMITS.min,
        TOOLTIP_HEIGHT_PX_LIMITS.max,
      ),
    };
  };

  const persistPopupSize = (size: CanvasPopupSize): void => {
    controller.setTooltipLayout(tooltip.id, {
      widthPx: size.widthPx ?? undefined,
      heightPx: size.heightPx ?? undefined,
    });
  };

  const resetPopupSize = (): void => {
    popupResizeStateRef.current = null;
    setPopupResizing(false);
    setLivePopupSize({ widthPx: null, heightPx: null });
    persistPopupSize({ widthPx: null, heightPx: null });
  };

  const beginPopupResize = (
    corner: PopupResizeCorner,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const startSize = measuredPopupSize();
    popupResizeStateRef.current = {
      pointerId: event.pointerId,
      corner,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: popupOffset,
      startSize,
      latestOffset: popupOffset,
      latestSize: startSize,
    };
    selectPopup();
    setPopupResizing(true);
    setLivePopupSize(startSize);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const continuePopupResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const resizeState = popupResizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    const inverseZoom = 100 / canvasZoom;
    const horizontalDirection = resizeState.corner.endsWith('east') ? 1 : -1;
    const verticalDirection = resizeState.corner.startsWith('south') ? 1 : -1;
    const widthPx = clamp(
      snapToGrid(
        resizeState.startSize.widthPx +
          (event.clientX - resizeState.startClientX) * inverseZoom * horizontalDirection,
        4,
      ),
      TOOLTIP_WIDTH_PX_LIMITS.min,
      TOOLTIP_WIDTH_PX_LIMITS.max,
    );
    const heightPx = clamp(
      snapToGrid(
        resizeState.startSize.heightPx +
          (event.clientY - resizeState.startClientY) * inverseZoom * verticalDirection,
        4,
      ),
      TOOLTIP_HEIGHT_PX_LIMITS.min,
      TOOLTIP_HEIGHT_PX_LIMITS.max,
    );
    const nextOffset = {
      x: resizeState.corner.endsWith('west')
        ? resizeState.startOffset.x + resizeState.startSize.widthPx - widthPx
        : resizeState.startOffset.x,
      y: resizeState.corner.startsWith('north')
        ? resizeState.startOffset.y + resizeState.startSize.heightPx - heightPx
        : resizeState.startOffset.y,
    };
    resizeState.latestSize = { widthPx, heightPx };
    resizeState.latestOffset = nextOffset;
    setLivePopupSize({ widthPx, heightPx });
    setPopupOffset(nextOffset);
  };

  const endPopupResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const resizeState = popupResizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    popupResizeStateRef.current = null;
    setPopupResizing(false);
    setLivePopupSize(resizeState.latestSize);
    setPopupOffset(resizeState.latestOffset);
    persistPopupSize(resizeState.latestSize);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const resizePopupWithKeyboard = (
    corner: PopupResizeCorner,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void => {
    dismissActiveBlock();
    setPopupSelected(true);
    if (event.key === 'Home') {
      resetPopupSize();
      event.preventDefault();
      return;
    }
    const sizeDelta = 8;
    const current = measuredPopupSize();
    let widthPx = current.widthPx;
    let heightPx = current.heightPx;
    if (event.key === 'ArrowLeft') widthPx -= sizeDelta;
    else if (event.key === 'ArrowRight') widthPx += sizeDelta;
    else if (event.key === 'ArrowUp') heightPx -= sizeDelta;
    else if (event.key === 'ArrowDown') heightPx += sizeDelta;
    else return;
    widthPx = clamp(widthPx, TOOLTIP_WIDTH_PX_LIMITS.min, TOOLTIP_WIDTH_PX_LIMITS.max);
    heightPx = clamp(heightPx, TOOLTIP_HEIGHT_PX_LIMITS.min, TOOLTIP_HEIGHT_PX_LIMITS.max);
    setPopupOffset((currentOffset) => ({
      x: corner.endsWith('west') ? currentOffset.x + current.widthPx - widthPx : currentOffset.x,
      y: corner.startsWith('north')
        ? currentOffset.y + current.heightPx - heightPx
        : currentOffset.y,
    }));
    const size = { widthPx, heightPx };
    setLivePopupSize(size);
    persistPopupSize(size);
    event.preventDefault();
    event.stopPropagation();
  };

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
            style={contextToolbarStyle(contextToolbarPosition)}
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
          style={popupCanvasStyle}
        >
          {POPUP_RESIZE_CORNERS.map((corner) => (
            <button
              key={corner.value}
              type="button"
              className="storyboard-popup-resize-handle"
              aria-label={`Resize popup from ${corner.label}`}
              data-corner={corner.value}
              title="Drag to resize. Arrow keys adjust by 8px; Home or double-click resets."
              onDoubleClick={resetPopupSize}
              onFocus={selectPopup}
              onKeyDown={(event) => resizePopupWithKeyboard(corner.value, event)}
              onPointerCancel={endPopupResize}
              onPointerDown={(event) => beginPopupResize(corner.value, event)}
              onPointerMove={continuePopupResize}
              onPointerUp={endPopupResize}
            >
              <MoveDiagonal2 size={11} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ))}
          {popupSelected && livePopupSize.widthPx && livePopupSize.heightPx ? (
            <output className="storyboard-popup-size" aria-live="polite">
              {livePopupSize.widthPx} × {livePopupSize.heightPx}px
            </output>
          ) : null}
          <button
            type="button"
            className="storyboard-popup-drag-handle"
            aria-label="Move popup in canvas"
            data-dragging={popupDragging ? 'true' : 'false'}
            title="Drag to move. Use arrow keys for precise movement; Home resets."
            onDoubleClick={() => setPopupOffset({ x: 0, y: 0 })}
            onFocus={selectPopup}
            onKeyDown={movePopupWithKeyboard}
            onPointerCancel={endPopupDrag}
            onPointerDown={beginPopupDrag}
            onPointerMove={continuePopupDrag}
            onPointerUp={endPopupDrag}
          >
            <GripHorizontal size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          <div
            className="rich-step-content"
            data-lodariq-action-align={tooltip.props.tooltipLayout?.actionAlign ?? 'start'}
            data-lodariq-action-layout={tooltip.props.tooltipLayout?.actionLayout ?? 'inline'}
            data-lodariq-color-mode={resolvedPopupTheme.colorMode}
            data-lodariq-composition-gap={tooltip.props.tooltipLayout?.gap ?? 'normal'}
            data-lodariq-composition-padding={tooltip.props.tooltipLayout?.padding ?? 'standard'}
            data-lodariq-content-align={tooltip.props.tooltipLayout?.contentAlign ?? 'left'}
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
        snapshot={snapshot}
        step={step}
        stepIndex={stepIndex}
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
        onInput={onActivate}
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
        aria-label={label}
        defaultValue={block.content ?? ''}
        onFocus={onActivate}
        onBlur={(event) => controller.commitRichTextContent(block.id, event.currentTarget.value)}
      />
    </div>
  );
}

type ActionResizeEdge = 'start' | 'end';
type ActionResizeState = {
  edge: ActionResizeEdge;
  maximumWidth: number;
  pointerId: number;
  startClientX: number;
  startWidth: number;
};

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
  const icon = actionStyle.icon ?? 'none';
  const iconPlacement = actionStyle.iconPlacement ?? 'end';
  const [liveWidth, setLiveWidth] = useState<number | null>(actionStyle.widthPx ?? null);
  const [resizing, setResizing] = useState(false);
  const liveWidthRef = useRef<number | null>(actionStyle.widthPx ?? null);
  const previewRef = useRef<HTMLSpanElement | null>(null);
  const resizeStateRef = useRef<ActionResizeState | null>(null);

  useEffect(() => {
    if (resizeStateRef.current) return;
    const nextWidth = actionStyle.widthPx ?? null;
    liveWidthRef.current = nextWidth;
    setLiveWidth(nextWidth);
  }, [actionStyle.widthPx, block.id]);

  const updateLiveWidth = (width: number): void => {
    liveWidthRef.current = width;
    setLiveWidth(width);
  };

  const commitLiveWidth = (): void => {
    const widthPx = liveWidthRef.current;
    if (!widthPx) return;
    controller.setButtonStyle(block.id, { width: 'hug', widthPx });
  };

  const beginResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    edge: ActionResizeEdge,
  ): void => {
    const preview = previewRef.current;
    const stage = preview?.parentElement;
    if (!preview || !stage) return;
    const inverseZoom = 100 / canvasZoom;
    const startWidth = preview.getBoundingClientRect().width * inverseZoom;
    const availableWidth = stage.getBoundingClientRect().width * inverseZoom;
    resizeStateRef.current = {
      edge,
      maximumWidth: clamp(
        snapToGrid(availableWidth, BUTTON_WIDTH_PX_LIMITS.step),
        BUTTON_WIDTH_PX_LIMITS.min,
        BUTTON_WIDTH_PX_LIMITS.max,
      ),
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth,
    };
    updateLiveWidth(
      clamp(
        snapToGrid(startWidth, BUTTON_WIDTH_PX_LIMITS.step),
        BUTTON_WIDTH_PX_LIMITS.min,
        BUTTON_WIDTH_PX_LIMITS.max,
      ),
    );
    setResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const continueResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    const direction = resizeState.edge === 'end' ? 1 : -1;
    const centeredMultiplier = actionAlign === 'center' ? 2 : 1;
    const delta =
      (event.clientX - resizeState.startClientX) *
      (100 / canvasZoom) *
      direction *
      centeredMultiplier;
    updateLiveWidth(
      clamp(
        snapToGrid(resizeState.startWidth + delta, BUTTON_WIDTH_PX_LIMITS.step),
        BUTTON_WIDTH_PX_LIMITS.min,
        resizeState.maximumWidth,
      ),
    );
    event.preventDefault();
    event.stopPropagation();
  };

  const endResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    resizeStateRef.current = null;
    setResizing(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    commitLiveWidth();
    event.preventDefault();
    event.stopPropagation();
  };

  const resizeWithKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    edge: ActionResizeEdge,
  ): void => {
    if (event.key === 'Home') {
      liveWidthRef.current = null;
      setLiveWidth(null);
      controller.setButtonStyle(block.id, { width: 'hug', widthPx: undefined });
      event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const currentWidth =
      liveWidthRef.current ??
      (previewRef.current?.getBoundingClientRect().width ?? BUTTON_WIDTH_PX_LIMITS.min) *
        (100 / canvasZoom);
    const visualDirection = event.key === 'ArrowRight' ? 1 : -1;
    const edgeDirection = edge === 'end' ? 1 : -1;
    const widthPx = clamp(
      snapToGrid(currentWidth + visualDirection * edgeDirection * 8, BUTTON_WIDTH_PX_LIMITS.step),
      BUTTON_WIDTH_PX_LIMITS.min,
      BUTTON_WIDTH_PX_LIMITS.max,
    );
    updateLiveWidth(widthPx);
    controller.setButtonStyle(block.id, { width: 'hug', widthPx });
    event.preventDefault();
  };

  const resetWidth = (): void => {
    liveWidthRef.current = null;
    setLiveWidth(null);
    controller.setButtonStyle(block.id, { width: 'hug', widthPx: undefined });
  };

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
          data-lodariq-action-radius={actionStyle.radius ?? 'theme'}
          data-lodariq-action-size={actionStyle.size ?? 'regular'}
          data-lodariq-action-variant={block.props.variant ?? defaultActionVariant(block)}
          data-lodariq-action-width={liveWidth ? 'custom' : (actionStyle.width ?? 'hug')}
          data-lodariq-block-align={actionAlign}
          data-lodariq-node-type={block.type}
          ref={previewRef}
          style={previewStyle}
        >
          {icon !== 'none' && iconPlacement === 'start' ? <ActionPreviewIcon icon={icon} /> : null}
          <input
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
              onPointerCancel={endResize}
              onPointerDown={(event) => beginResize(event, 'start')}
              onPointerMove={continueResize}
              onPointerUp={endResize}
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
              onPointerCancel={endResize}
              onPointerDown={(event) => beginResize(event, 'end')}
              onPointerMove={continueResize}
              onPointerUp={endResize}
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

function contextToolbarStyle(position: ActionToolbarPosition | null): CSSProperties | undefined {
  if (!position) return undefined;
  return {
    '--storyboard-toolbar-left': `${position.left}px`,
    '--storyboard-toolbar-top': `${position.top}px`,
  } as CSSProperties;
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
  const toolbarStyle = contextToolbarStyle(position);
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
      <button type="button" aria-label="More button settings" title="More" onClick={onMore}>
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
        <ActionPropertyPanel
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

const QUICK_FILL_COLORS = ['#006b58', '#ffffff', '#162033', '#6b7b74', '#c96047'] as const;
const ACTION_PROPERTY_TABS = [
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'behavior', label: 'Behavior', icon: MousePointerClick },
  { value: 'size', label: 'Size', icon: MoveHorizontal },
  { value: 'alignment', label: 'Alignment', icon: AlignCenter },
  { value: 'shape', label: 'Shape & icon', icon: Shapes },
  { value: 'colors', label: 'Colors', icon: Circle },
  { value: 'spacing', label: 'Spacing', icon: SlidersHorizontal },
] as const satisfies ReadonlyArray<{
  value: ActionPropertyTab;
  label: string;
  icon: typeof Type;
}>;
const BLOCK_SPACING_PX_BY_PRESET: Readonly<
  Record<NonNullable<BlockLayoutProps['spacingAfter']>, number>
> = {
  none: 0,
  tight: 8,
  normal: 16,
  relaxed: 24,
};

function ContextualPropertyTray({
  activeTab,
  activeBlock,
  actionBlock,
  controller,
  health,
  snapshot,
  step,
  stepIndex,
  tooltip,
  toolMode,
  onActiveTabChange,
  onClose,
  open,
}: {
  activeTab: ActionPropertyTab;
  activeBlock: LodariqBlock | null;
  actionBlock: LodariqBlock | null;
  controller: LocalAuthoringFrameController;
  health: { label: string; repair: boolean; tone: StepHealthTone };
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  stepIndex: number;
  tooltip: LodariqBlock;
  toolMode: StoryboardToolMode;
  onActiveTabChange: (tab: ActionPropertyTab) => void;
  onClose: () => void;
  open: boolean;
}) {
  const targetId = targetIdOf(step);
  const targetLabel = targetId ? targetLabelOf(snapshot.documentState, targetId) : 'Choose target';
  const placement = tooltip.props.placement ?? 'bottom';
  const selectedBlock = actionBlock ?? activeBlock;
  let title = `${blockDisplayTitle(selectedBlock ?? step)} settings`;
  if (actionBlock) {
    title = `${actionBlock.content?.trim() || 'Untitled'} ${blockTypeLabel(actionBlock.type).toLowerCase()}`;
  }
  if (toolMode === 'popup') title = 'Popup layout';
  const scopeLabel = toolMode === 'popup' ? '· This step' : '· This block';
  let trayLabel = 'Selected block settings';
  if (actionBlock) trayLabel = 'Selected action style';
  if (toolMode === 'popup') trayLabel = 'Popup layout settings';

  if (!open) return null;

  return (
    <section className="storyboard-property-tray" aria-label={trayLabel}>
      <span className="storyboard-tray-handle" aria-hidden="true" />
      <header className="storyboard-tray-header">
        <span className="storyboard-tray-title">
          <span className="storyboard-tray-identity">
            <strong>{title}</strong>
            <small>{scopeLabel}</small>
          </span>
          <span className="storyboard-tray-context">
            <span className="storyboard-placement-summary">
              Appears {TOOLTIP_PLACEMENT_LABELS[placement].toLowerCase()} {targetLabel}
            </span>
            <span className={`storyboard-verification ${health.tone}`}>{health.label}</span>
          </span>
        </span>
        <button
          type="button"
          className="storyboard-tray-close"
          aria-label="Close settings"
          onClick={onClose}
        >
          <X size={17} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      {toolMode === 'content' && actionBlock ? (
        <>
          <nav className="storyboard-property-tabs" aria-label="Button settings">
            {ACTION_PROPERTY_TABS.map((option) => {
              const Icon = option.icon;
              const selected = activeTab === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={selected ? 'active' : undefined}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => onActiveTabChange(option.value)}
                >
                  <Icon size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              );
            })}
            <ChevronRight className="storyboard-property-tabs-more" size={17} strokeWidth={2} />
          </nav>
          <ActionPropertyPanel
            activeTab={activeTab}
            block={actionBlock}
            controller={controller}
            tooltip={tooltip}
          />
        </>
      ) : null}

      {toolMode === 'content' && !actionBlock && activeBlock ? (
        <BlockFlowInspector block={activeBlock} controller={controller} />
      ) : null}

      {toolMode === 'placement' ? (
        <StepPlacementEditor
          controller={controller}
          snapshot={snapshot}
          step={step}
          stepIndex={stepIndex}
        />
      ) : null}

      {toolMode === 'popup' ? (
        <PopupCompositionInspector controller={controller} tooltip={tooltip} />
      ) : null}
    </section>
  );
}

function ActionPropertyPanel({
  activeTab,
  block,
  controller,
  tooltip,
}: {
  activeTab: ActionPropertyTab;
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  tooltip: LodariqBlock;
}) {
  const style = block.props.buttonStyle ?? {};
  const layout = block.props.blockLayout ?? {};
  const actionValue = editableActionValue(block.props.action?.type ?? '') ?? '';

  if (activeTab === 'appearance') {
    return (
      <section className="storyboard-tab-panel" aria-label="Appearance settings">
        <InspectorSelect
          label="Appearance"
          value={block.props.variant ?? defaultActionVariant(block)}
          options={EDITABLE_BUTTON_VARIANT_OPTIONS}
          onChange={(value) =>
            controller.setButtonVariant(
              block.id,
              value as (typeof EDITABLE_BUTTON_VARIANT_OPTIONS)[number]['value'],
            )
          }
        />
      </section>
    );
  }

  if (activeTab === 'behavior') {
    return (
      <section className="storyboard-tab-panel behavior" aria-label="Behavior settings">
        {actionValue === 'openPage' ? (
          <label className="rich-step-url-field prominent">
            <span>Destination</span>
            <input
              key={block.props.action?.url ?? ''}
              aria-label="Destination"
              defaultValue={block.props.action?.url ?? ''}
              placeholder="https://example.com or /path"
              onBlur={(event) => controller.setActionUrl(block.id, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <small>Where this link opens</small>
          </label>
        ) : null}
        <InspectorSelect
          label="Action"
          value={actionValue}
          options={EDITABLE_ACTION_OPTIONS}
          showIcons
          onChange={(value) => controller.setButtonAction(block.id, value as EditableActionType)}
        />
      </section>
    );
  }

  if (activeTab === 'size') {
    const widthOptions = style.widthPx
      ? [{ value: 'custom', label: `${style.widthPx}px` }, ...BUTTON_WIDTH_OPTIONS]
      : BUTTON_WIDTH_OPTIONS;
    return (
      <section className="storyboard-tab-panel" aria-label="Size settings">
        <InspectorSelect
          label="Width"
          value={style.widthPx ? 'custom' : (style.width ?? 'hug')}
          options={widthOptions}
          onChange={(width) => {
            if (width === 'custom') return;
            controller.setButtonStyle(block.id, {
              width: width as NonNullable<ButtonStyleProps['width']>,
              widthPx: undefined,
            });
          }}
        />
        <InspectorSelect
          label="Size"
          value={style.size ?? 'regular'}
          options={BUTTON_SIZE_OPTIONS}
          onChange={(size) =>
            controller.setButtonStyle(block.id, {
              size: size as NonNullable<ButtonStyleProps['size']>,
            })
          }
        />
      </section>
    );
  }

  if (activeTab === 'alignment') {
    const actionAlign = tooltip.props.tooltipLayout?.actionAlign ?? layout.align ?? 'start';
    return (
      <section className="storyboard-tab-panel" aria-label="Alignment settings">
        <InspectorSelect
          label="Alignment"
          value={actionAlign}
          options={BLOCK_ALIGNMENT_OPTIONS}
          onChange={(align) =>
            controller.setActionAlignment(
              block.id,
              tooltip.id,
              align as NonNullable<TooltipLayoutProps['actionAlign']>,
            )
          }
        />
      </section>
    );
  }

  if (activeTab === 'shape') {
    return (
      <section className="storyboard-tab-panel" aria-label="Shape and icon settings">
        <InspectorSelect
          label="Shape"
          value={style.radius ?? 'theme'}
          options={BUTTON_RADIUS_OPTIONS}
          onChange={(radius) =>
            controller.setButtonStyle(block.id, {
              radius: radius as NonNullable<ButtonStyleProps['radius']>,
            })
          }
        />
        <InspectorSelect
          label="Icon"
          value={style.icon ?? 'none'}
          options={BUTTON_ICON_OPTIONS}
          onChange={(icon) =>
            controller.setButtonStyle(block.id, {
              icon: icon as NonNullable<ButtonStyleProps['icon']>,
            })
          }
        />
        <InspectorSelect
          label="Icon position"
          value={style.iconPlacement ?? 'end'}
          options={BUTTON_ICON_PLACEMENT_OPTIONS}
          onChange={(iconPlacement) =>
            controller.setButtonStyle(block.id, {
              iconPlacement: iconPlacement as NonNullable<ButtonStyleProps['iconPlacement']>,
            })
          }
        />
      </section>
    );
  }

  if (activeTab === 'colors') {
    return (
      <section className="storyboard-tab-panel colors" aria-label="Color settings">
        <InspectorColor
          customized={Boolean(style.fillColor)}
          label="Fill"
          value={style.fillColor ?? '#006b58'}
          onChange={(fillColor) => controller.setButtonStyle(block.id, { fillColor })}
          onReset={() => controller.resetButtonStyleFields(block.id, ['fillColor'])}
        />
        <InspectorColor
          customized={Boolean(style.textColor)}
          label="Label"
          value={style.textColor ?? '#ffffff'}
          onChange={(textColor) => controller.setButtonStyle(block.id, { textColor })}
          onReset={() => controller.resetButtonStyleFields(block.id, ['textColor'])}
        />
        <InspectorColor
          customized={Boolean(style.borderColor)}
          label="Border"
          value={style.borderColor ?? '#006b58'}
          onChange={(borderColor) => controller.setButtonStyle(block.id, { borderColor })}
          onReset={() => controller.resetButtonStyleFields(block.id, ['borderColor'])}
        />
      </section>
    );
  }

  return (
    <section className="storyboard-tab-panel spacing" aria-label="Spacing settings">
      <fieldset className="storyboard-spacing-slider">
        <legend>After this button</legend>
        <div>
          <PanelLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          <input
            type="range"
            min={BLOCK_SPACING_PX_LIMITS.min}
            max={BLOCK_SPACING_PX_LIMITS.max}
            step={BLOCK_SPACING_PX_LIMITS.step}
            aria-label="Spacing after button"
            value={blockSpacingAfterPx(layout)}
            onChange={(event) =>
              controller.setContentBlockLayout(block.id, {
                spacingAfterPx: Number(event.currentTarget.value),
              })
            }
          />
          <PanelRight size={16} strokeWidth={1.8} aria-hidden="true" />
          <output>{blockSpacingAfterPx(layout)}px</output>
        </div>
      </fieldset>
    </section>
  );
}

function BlockFlowInspector({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  const layout = block.props.blockLayout ?? {};
  return (
    <section className="rich-step-inspector compact" aria-label="Block spacing">
      <header>
        <strong>Block spacing</strong>
        <span>Flow placement</span>
      </header>
      <div className="rich-step-inspector-grid two">
        <InspectorSelect
          label="Before"
          value={layout.spacingBefore ?? 'normal'}
          options={BLOCK_SPACING_OPTIONS}
          onChange={(spacingBefore) =>
            controller.setContentBlockLayout(block.id, {
              spacingBefore: spacingBefore as NonNullable<BlockLayoutProps['spacingBefore']>,
            })
          }
        />
        <InspectorSelect
          label="After"
          value={layout.spacingAfter ?? 'normal'}
          options={BLOCK_SPACING_OPTIONS}
          onChange={(spacingAfter) =>
            controller.setContentBlockLayout(block.id, {
              spacingAfter: spacingAfter as NonNullable<BlockLayoutProps['spacingAfter']>,
              spacingAfterPx: undefined,
            })
          }
        />
      </div>
    </section>
  );
}

function blockSpacingAfterPx(layout: BlockLayoutProps): number {
  return layout.spacingAfterPx ?? BLOCK_SPACING_PX_BY_PRESET[layout.spacingAfter ?? 'normal'];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function blockSpacingAfterStyle(layout: BlockLayoutProps | undefined): CSSProperties | undefined {
  if (layout?.spacingAfterPx === undefined) return undefined;
  return {
    '--lq-block-spacing-after': `${layout.spacingAfterPx}px`,
  } as CSSProperties;
}

function PopupCompositionInspector({
  controller,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  tooltip: LodariqBlock;
}) {
  const layout = tooltip.props.tooltipLayout ?? {};
  return (
    <section className="storyboard-tab-panel popup-layout" aria-label="Popup layout">
      <InspectorSelect
        label="Content alignment"
        value={layout.contentAlign ?? 'left'}
        options={CONTENT_ALIGNMENT_OPTIONS}
        onChange={(contentAlign) =>
          controller.setTooltipLayout(tooltip.id, {
            contentAlign: contentAlign as NonNullable<TooltipLayoutProps['contentAlign']>,
          })
        }
      />
      <InspectorSelect
        label="Action layout"
        value={layout.actionLayout ?? 'inline'}
        options={ACTION_LAYOUT_OPTIONS}
        onChange={(actionLayout) =>
          controller.setTooltipLayout(tooltip.id, {
            actionLayout: actionLayout as NonNullable<TooltipLayoutProps['actionLayout']>,
          })
        }
      />
      <InspectorSelect
        label="Action gap"
        value={layout.gap ?? 'normal'}
        options={BLOCK_SPACING_OPTIONS}
        onChange={(gap) =>
          controller.setTooltipLayout(tooltip.id, {
            gap: gap as NonNullable<TooltipLayoutProps['gap']>,
          })
        }
      />
      <InspectorSelect
        label="Padding"
        value={layout.padding ?? 'standard'}
        options={POPUP_PADDING_OPTIONS}
        onChange={(padding) =>
          controller.setTooltipLayout(tooltip.id, {
            padding: padding as NonNullable<TooltipLayoutProps['padding']>,
          })
        }
      />
    </section>
  );
}

const BLOCK_ALIGNMENT_OPTIONS = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
] as const;

const EDITOR_BLOCK_TYPE_OPTIONS = [
  { value: 'paragraph', label: 'Normal text' },
  { value: 'heading', label: 'Heading' },
  { value: 'list', label: 'List' },
  { value: 'button', label: 'Button' },
  { value: 'link', label: 'Link' },
  { value: 'media', label: 'Media' },
  { value: 'divider', label: 'Divider' },
] as const;

const BUTTON_WIDTH_OPTIONS = [
  { value: 'hug', label: 'Hug content' },
  { value: 'fill', label: 'Fill width' },
] as const;

const BUTTON_SIZE_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'regular', label: 'Regular' },
] as const;

const BUTTON_RADIUS_OPTIONS = [
  { value: 'theme', label: 'Brand theme' },
  { value: 'square', label: 'Square' },
  { value: 'soft', label: 'Soft' },
  { value: 'round', label: 'Pill' },
] as const;

const BUTTON_ICON_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'arrow-right', label: 'Arrow' },
  { value: 'external-link', label: 'External link' },
  { value: 'check', label: 'Check' },
] as const;

const BUTTON_ICON_PLACEMENT_OPTIONS = [
  { value: 'start', label: 'Before label' },
  { value: 'end', label: 'After label' },
] as const;

const CONTENT_ALIGNMENT_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
] as const;

const ACTION_LAYOUT_OPTIONS = [
  { value: 'inline', label: 'Inline' },
  { value: 'stack', label: 'Stacked' },
] as const;

const POPUP_PADDING_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'relaxed', label: 'Relaxed' },
] as const;

const BLOCK_SPACING_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'tight', label: 'Tight' },
  { value: 'normal', label: 'Normal' },
  { value: 'relaxed', label: 'Relaxed' },
] as const;

const INSPECTOR_CHOICE_ICON_BY_VALUE: Readonly<Record<string, typeof Type>> = {
  '': SlidersHorizontal,
  primary: Check,
  secondary: SlidersHorizontal,
  subtle: Palette,
  outline: PanelLeft,
  link: Link,
  next: ChevronRight,
  back: ArrowUp,
  complete: Check,
  clickTarget: MousePointerClick,
  openPage: ExternalLink,
  dismiss: LogOut,
  hug: SlidersHorizontal,
  fill: PanelRight,
  compact: SlidersHorizontal,
  regular: SlidersHorizontal,
  start: AlignLeft,
  left: AlignLeft,
  center: AlignCenter,
  end: AlignRight,
  right: AlignRight,
  stretch: PanelRight,
  theme: Palette,
  square: PanelLeft,
  soft: SlidersHorizontal,
  round: Circle,
  none: CircleX,
  'arrow-right': ChevronRight,
  'external-link': ExternalLink,
  check: Check,
  inline: PanelRight,
  stack: PanelBottom,
  tight: SlidersHorizontal,
  normal: SlidersHorizontal,
  relaxed: SlidersHorizontal,
  standard: SlidersHorizontal,
};

function InspectorSelect({
  label,
  onChange,
  options,
  showIcons = false,
  value,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  showIcons?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="rich-step-choice-field">
      <legend>{label}</legend>
      <div className="rich-step-choice-list" role="group" aria-label={label}>
        {options.map((option) => (
          <InspectorChoiceButton
            key={option.value}
            label={option.label}
            selected={option.value === value}
            showIcon={showIcons}
            value={option.value}
            onSelect={() => onChange(option.value)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function InspectorChoiceButton({
  label,
  onSelect,
  selected,
  showIcon,
  value,
}: {
  label: string;
  value: string;
  selected: boolean;
  showIcon: boolean;
  onSelect: () => void;
}) {
  const Icon = INSPECTOR_CHOICE_ICON_BY_VALUE[value] ?? SlidersHorizontal;
  return (
    <button
      type="button"
      className={selected ? 'selected' : undefined}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {showIcon ? <Icon size={16} strokeWidth={2} aria-hidden="true" /> : null}
      <span>{label}</span>
    </button>
  );
}

function InspectorColor({
  customized,
  label,
  onChange,
  onReset,
  value,
}: {
  customized: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <fieldset className="rich-step-color-field">
      <legend>{label}</legend>
      <div className="rich-step-color-swatches" role="group" aria-label={`${label} color`}>
        {QUICK_FILL_COLORS.map((color) => {
          const selected = value.toLowerCase() === color;
          return (
            <button
              key={color}
              type="button"
              className={selected ? 'selected' : undefined}
              aria-label={`Use ${color} for ${label.toLowerCase()}`}
              aria-pressed={selected}
              style={{ '--storyboard-swatch': color } as CSSProperties}
              onClick={() => onChange(color)}
            >
              {selected ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : null}
            </button>
          );
        })}
        <label className="rich-step-custom-color">
          <Palette size={14} strokeWidth={2} aria-hidden="true" />
          <span>Custom</span>
          <input
            type="color"
            aria-label={`Custom ${label.toLowerCase()} color`}
            value={value}
            onInput={(event) => onChange(event.currentTarget.value)}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="rich-step-theme-color"
          disabled={!customized}
          onClick={onReset}
        >
          Theme
        </button>
      </div>
    </fieldset>
  );
}

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

function defaultActionVariant(block: LodariqBlock): 'primary' | 'link' {
  return block.type === 'link' ? 'link' : 'primary';
}

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

function TourStepActionMenu({
  controller,
  step,
  stepIndex,
}: {
  controller: LocalAuthoringFrameController;
  step: LodariqBlock;
  stepIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };
  return (
    <AuthoringPopover
      align="end"
      open={open}
      onOpenChange={setOpen}
      contentClassName="tour-step-action-popover"
      trigger={
        <AuthoringButton
          aria-label={`Step ${stepIndex + 1} actions`}
          className="tour-step-action-trigger"
          icon={<MoreHorizontal size={15} strokeWidth={2.2} />}
          title={`Step ${stepIndex + 1} actions`}
          tone="ghost"
        />
      }
      content={
        <div
          className="tour-step-action-menu"
          role="menu"
          aria-label={`Step ${stepIndex + 1} actions`}
        >
          <AuthoringButton
            icon={<ArrowUp size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.moveTopLevelBlock(step.id, 'up'))}
            role="menuitem"
          >
            Move up
          </AuthoringButton>
          <AuthoringButton
            icon={<ArrowDown size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.moveTopLevelBlock(step.id, 'down'))}
            role="menuitem"
          >
            Move down
          </AuthoringButton>
          <AuthoringButton
            icon={<Copy size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.duplicateTopLevelBlock(step.id))}
            role="menuitem"
          >
            Duplicate
          </AuthoringButton>
          <AuthoringButton
            className="danger"
            icon={<Trash2 size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.deleteTopLevelBlock(step.id))}
            role="menuitem"
          >
            Delete
          </AuthoringButton>
        </div>
      }
    />
  );
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

type StepHealthTone = 'ready' | 'repair' | 'review';

function elementActionLabelFor(needsRepair: boolean, hasTarget: boolean): string {
  if (!hasTarget) return 'Choose element';
  if (needsRepair) return 'Fix element';
  return 'Change element';
}

function targetActionLabelFor(needsRepair: boolean, hasTarget: boolean): string {
  if (needsRepair) return 'Fix placement';
  if (hasTarget) return 'Change target';
  return 'Choose target';
}

function storyboardStepPreview(step: LodariqBlock): { body: string; action: string | null } {
  const tooltip = stepTooltip(step);
  if (!tooltip) return { body: 'Add popup content', action: null };
  const bodyBlock = tooltip.children.find(
    (child) => child.type === 'paragraph' || child.type === 'heading',
  );
  const actionBlock = tooltip.children.find(
    (child) => child.type === 'button' || child.type === 'link',
  );
  return {
    body: bodyBlock?.content?.trim() || 'Add popup content',
    action: actionBlock?.content?.trim() || null,
  };
}

function stepPlacementFact(
  targetId: string | null,
  targetLabel: string,
  health: { label: string },
): string {
  if (!targetId) return 'Not placed yet';
  const status = health.label === 'Verified' ? 'Placed' : health.label;
  return `${targetLabel} · ${status}`;
}

function stepHealth(
  step: LodariqBlock,
  snapshot: LocalAuthoringFrameSnapshot,
): { label: string; repair: boolean; tone: StepHealthTone } {
  const targetId = targetIdOf(step);
  if (!targetId) return { label: 'Not placed', repair: true, tone: 'repair' };

  const diagnostic = snapshot.targetDiagnostics.get(targetId)?.diagnostic;
  if (!diagnostic) {
    return { label: 'Unverified', repair: false, tone: 'review' };
  }
  if (diagnostic.state === 'missing') {
    return { label: 'Missing', repair: true, tone: 'repair' };
  }
  if (diagnostic.state === 'ambiguous') {
    return { label: 'Ambiguous', repair: true, tone: 'repair' };
  }
  if (diagnostic.state === 'needs_review') {
    return targetDiagnosticIsDrift(diagnostic)
      ? { label: 'Drift detected', repair: true, tone: 'repair' }
      : { label: 'Needs verification', repair: true, tone: 'review' };
  }

  const status = blockStatus(step);
  if (status === 'invalid') return { label: 'Needs fix', repair: false, tone: 'repair' };
  if (status === 'incomplete') return { label: 'Needs review', repair: false, tone: 'review' };
  return { label: 'Verified', repair: false, tone: 'ready' };
}

function stepTooltip(step: LodariqBlock): LodariqBlock | null {
  return step.children.find((child) => child.type === 'tooltip') ?? null;
}

function stepPrimaryButton(step: LodariqBlock): LodariqBlock | null {
  const tooltip = stepTooltip(step);
  if (!tooltip) return null;
  return tooltip.children.find((child) => child.type === 'button') ?? null;
}

function buttonAdvanceValue(
  button: LodariqBlock | null,
): Extract<EditableActionType, 'next' | 'clickTarget'> {
  if (button?.props.action?.type === 'clickTarget') return 'clickTarget';
  return 'next';
}
