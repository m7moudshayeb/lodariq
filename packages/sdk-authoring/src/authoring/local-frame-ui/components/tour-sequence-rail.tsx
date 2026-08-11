import { useEffect, useRef, useState } from 'react';
import type { LodariqBlock, TextStyleProps } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
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
  GripVertical,
  Italic,
  MoreHorizontal,
  MousePointer2,
  MousePointerClick,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from '../design-system';
import type { EditableActionType, LocalAuthoringFrameSnapshot } from '../types';
import {
  blockDisplayTitle,
  blockStatus,
  targetDiagnosticIsDrift,
  targetIdOf,
  targetLabelOf,
} from '../utils';

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

const ADVANCE_OPTIONS = [
  {
    value: 'next',
    label: 'Next button',
    description: 'Users click to go to the next step.',
    icon: ChevronRight,
  },
  {
    value: 'clickTarget',
    label: 'Click target',
    description: 'The tour button clicks the target and advances.',
    icon: MousePointerClick,
  },
] as const;

const TEXT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32] as const;

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
  const targetId = targetIdOf(step);
  const targetLabel = targetId
    ? targetLabelOf(snapshot.documentState, targetId)
    : 'Choose where this step appears';
  const targetActionLabel = targetActionLabelFor(health.repair, Boolean(targetId));
  const tooltip = stepTooltip(step);
  const button = stepPrimaryButton(step);
  const placement = tooltip?.props.placement ?? 'bottom';
  const advanceValue = buttonAdvanceValue(button);
  const placementFact = stepPlacementFact(targetId, targetLabel, health);

  return (
    <section className="tour-step-inspector" aria-label={`Step ${stepIndex + 1} details`}>
      <section className="tour-step-editor-section" aria-label="Content">
        <header className="tour-step-section-heading">
          <strong>Content</strong>
          <span>Step {stepIndex + 1}</span>
        </header>
        {tooltip ? (
          <RichStepContentEditor
            controller={controller}
            snapshot={snapshot}
            step={step}
            tooltip={tooltip}
          />
        ) : null}
      </section>

      <section className="tour-step-config-section placement-section" aria-label="Placement">
        <h3>Placement</h3>
        <button
          type="button"
          className="tour-placement-card"
          aria-label={`${targetActionLabel} for step ${stepIndex + 1}`}
          onClick={() => controller.startTargetPick(step.id)}
        >
          <MousePointer2 size={17} strokeWidth={2} aria-hidden="true" />
          <strong>{targetId ? 'Change target' : 'Choose target'}</strong>
          <span className={health.tone}>{placementFact}</span>
          <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>

        {tooltip ? (
          <div className="tour-position-group">
            <h4>Position</h4>
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
                    <Icon size={25} strokeWidth={1.55} aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {button ? (
        <section className="tour-step-config-section advance-section" aria-label="Advance behavior">
          <h3>Advance behavior</h3>
          <div className="tour-advance-options" role="group" aria-label="Advance behavior">
            {ADVANCE_OPTIONS.map((option) => {
              const selected = advanceValue === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={selected ? 'selected' : undefined}
                  aria-pressed={selected}
                  onClick={() => controller.setButtonAction(button.id, option.value)}
                >
                  <span className="tour-advance-radio" aria-hidden="true" />
                  <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="tour-advanced-settings-row"
        onClick={() => controller.openAdvancedEditor(step.id)}
      >
        <SlidersHorizontal size={20} strokeWidth={1.8} aria-hidden="true" />
        <span>
          <strong>Advanced settings</strong>
          <small>Delay, skippable, scheduling, and more</small>
        </span>
        <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </section>
  );
}

function RichStepContentEditor({
  controller,
  snapshot,
  step,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  tooltip: LodariqBlock;
}) {
  const textBlocks = tooltip.children.filter(
    (child) => child.type === 'heading' || child.type === 'paragraph',
  );
  const [activeBlockId, setActiveBlockId] = useState(textBlocks[0]?.id ?? null);
  const activeBlock =
    textBlocks.find((block) => block.id === activeBlockId) ?? textBlocks[0] ?? null;
  const activeStyle = activeBlock?.props.textStyle;

  useEffect(() => {
    if (activeBlockId && textBlocks.some((block) => block.id === activeBlockId)) return;
    setActiveBlockId(textBlocks[0]?.id ?? null);
  }, [activeBlockId, step.id, textBlocks]);

  const commitBlock = (blockId: string, element: HTMLElement): void => {
    controller.commitRichTextContent(blockId, element.innerText || element.textContent || '');
  };

  const updateStyle = (patch: Partial<TextStyleProps>): void => {
    if (activeBlock) controller.setTextBlockStyle(activeBlock.id, patch);
  };

  return (
    <div className="rich-step-editor">
      <div className="rich-step-toolbar" role="toolbar" aria-label="Text formatting">
        <select
          aria-label="Text style"
          value={activeBlock?.type === 'heading' ? 'heading' : 'paragraph'}
          onChange={(event) => {
            if (!activeBlock) return;
            controller.transformEditableBlock(
              activeBlock.id,
              event.currentTarget.value === 'heading' ? 'heading' : 'paragraph',
            );
          }}
        >
          <option value="paragraph">Normal text</option>
          <option value="heading">Heading</option>
        </select>
        <select
          aria-label="Font size"
          value={activeStyle?.fontSizePx ?? (activeBlock?.type === 'heading' ? 20 : 14)}
          onChange={(event) => updateStyle({ fontSizePx: Number(event.currentTarget.value) })}
        >
          {TEXT_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
        <span className="rich-step-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={(activeStyle?.fontWeight ?? 400) >= 600}
          onClick={() =>
            updateStyle({ fontWeight: (activeStyle?.fontWeight ?? 400) >= 600 ? 400 : 700 })
          }
        >
          <Bold size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={activeStyle?.fontStyle === 'italic'}
          onClick={() =>
            updateStyle({ fontStyle: activeStyle?.fontStyle === 'italic' ? 'normal' : 'italic' })
          }
        >
          <Italic size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
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
            onChange={(event) => updateStyle({ color: event.currentTarget.value })}
          />
        </label>
      </div>
      <div className="rich-step-content" role="group" aria-label="Step content editor">
        {textBlocks.map((block) => (
          <div
            key={block.id}
            className={`rich-step-block-row ${
              activeBlockId === block.id ? 'active' : ''
            } ${snapshot.selectedBlockId === block.id ? 'selected' : ''}`.trim()}
            data-block-id={block.id}
            data-step-block-id={step.id}
            onDragOver={(event) => controller.handleStepContentDragOver(event, step.id, block.id)}
            onDrop={(event) => controller.handleStepContentDrop(event, step.id, block.id)}
          >
            <button
              type="button"
              className="rich-step-block-drag"
              draggable
              aria-label={`Drag ${block.type === 'heading' ? 'heading' : 'text'} line`}
              title="Drag to reorder"
              onDragEnd={() => controller.endDraggingStepContent()}
              onDragStart={(event) => controller.startDraggingStepContent(step.id, block.id, event)}
            >
              <GripVertical size={14} strokeWidth={2.1} aria-hidden="true" />
            </button>
            <div
              className={`rich-step-block ${block.type}`}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label={block.type === 'heading' ? 'Step heading' : 'Step paragraph'}
              aria-multiline="true"
              data-rich-block-id={block.id}
              style={richTextBlockStyle(block)}
              onBlur={(event) => commitBlock(block.id, event.currentTarget)}
              onFocus={() => {
                setActiveBlockId(block.id);
                controller.selectBlock(block.id);
              }}
              onInput={() => setActiveBlockId(block.id)}
              onPointerDown={() => {
                setActiveBlockId(block.id);
                controller.selectBlock(block.id);
              }}
            >
              {block.content}
            </div>
            <RichTextBlockActionMenu block={block} controller={controller} stepId={step.id} />
          </div>
        ))}
      </div>
    </div>
  );
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

function RichTextBlockActionMenu({
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
  const label = block.type === 'heading' ? 'Heading' : 'Text';
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
          <small>Advanced content and behavior</small>
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
