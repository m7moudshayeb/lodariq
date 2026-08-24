import { authoringText } from '../../../i18n';
import { useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle } from '../utils';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AuthoringButton,
  AuthoringPopover,
  Check,
  Copy,
  GripVertical,
  MoreHorizontal,
  Network,
  Palette,
  Plus,
  Save,
  Trash2,
} from '../design-system';
import { stepHealth, storyboardStepPreview } from '../tour-step-model';
import { ExperienceLanguageSelect } from './experience-language-select';

export function TourStoryboard({
  activeStepId,
  controller,
  flowMapOpen,
  onFlowMapOpenChange,
  snapshot,
  steps,
}: {
  activeStepId: string | null;
  controller: LocalAuthoringFrameController;
  flowMapOpen: boolean;
  onFlowMapOpenChange: (open: boolean) => void;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: LodariqBlock[];
}) {
  const health = steps.map((step) => stepHealth(step, snapshot));
  const batchMode = snapshot.selectedStepIds.size > 0;
  const batchEnabled =
    !snapshot.commercialUsage || snapshot.commercialUsage.features.includes('batch-operations');

  return (
    <nav
      className="tour-storyboard"
      aria-label={authoringText('Tour steps')}
      data-batch-mode={batchMode ? 'true' : 'false'}
    >
      <div className="tour-storyboard-scroll">
        <ol className="tour-storyboard-list">
          {steps.map((step, index) => {
            const active = step.id === activeStepId;
            const batchSelected = snapshot.selectedStepIds.has(step.id);
            const itemHealth = health[index]!;
            const preview = storyboardStepPreview(step);
            const dropPosition =
              snapshot.dragTargetBlockId === step.id ? snapshot.dragTargetPosition : null;
            return (
              <li
                className={`tour-storyboard-step ${active ? 'active' : ''} ${itemHealth.tone} ${dropPosition ? `drop-${dropPosition}` : ''}`.trim()}
                data-block-id={step.id}
                data-batch-selected={batchSelected ? 'true' : 'false'}
                data-drop-position={dropPosition ?? undefined}
                key={step.id}
                onDragOver={(event) =>
                  controller.handleBlockDragOver(event, {
                    axis: 'x',
                    scrollSelector: '.tour-storyboard-scroll',
                    selector: '.tour-storyboard-step[data-block-id]',
                  })
                }
                onDrop={(event) =>
                  controller.handleBlockDrop(event, step.id, {
                    axis: 'x',
                    selector: '.tour-storyboard-step[data-block-id]',
                  })
                }
              >
                <button
                  type="button"
                  className="tour-storyboard-drag"
                  draggable
                  aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                  aria-label={authoringText('Drag step {number}', { number: index + 1 })}
                  title={authoringText('Drag to reorder step')}
                  onDragEnd={() => controller.endDraggingBlock()}
                  onDragStart={(event) => controller.startDraggingBlock(step.id, event)}
                  onKeyDown={(event) =>
                    controller.handleBlockReorderKeyDown(event, step.id, 'horizontal')
                  }
                >
                  <GripVertical size={14} strokeWidth={2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="tour-storyboard-select"
                  aria-current={active ? 'step' : undefined}
                  aria-label={authoringText('Edit step {number}: {title}', {
                    number: index + 1,
                    title: blockDisplayTitle(step),
                  })}
                  onClick={(event) => {
                    if (event.shiftKey || event.metaKey || event.ctrlKey) {
                      controller.selectTourStepForBatch(step.id, {
                        additive: event.metaKey || event.ctrlKey,
                        range: event.shiftKey,
                      });
                    }
                    controller.activateTourStep(step.id);
                  }}
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
                  {batchMode ? (
                    <span className="tour-storyboard-preview" aria-hidden="true">
                      <span>{preview.body}</span>
                      <small>{itemHealth.label}</small>
                    </span>
                  ) : null}
                </button>
                <label className="tour-step-multi-select">
                  <input
                    aria-label={authoringText('Select step {number} for batch changes', {
                      number: index + 1,
                    })}
                    checked={batchSelected}
                    onChange={() => controller.toggleStepStyleSelection(step.id)}
                    type="checkbox"
                  />
                  <span aria-hidden="true" />
                </label>
                <TourStepActionMenu
                  controller={controller}
                  snapshot={snapshot}
                  step={step}
                  stepIndex={index}
                />
              </li>
            );
          })}
          <li className="tour-storyboard-add-item">
            <button
              type="button"
              className="tour-storyboard-add"
              aria-label={authoringText('Add step')}
              onClick={() => controller.appendStepAndChooseTarget()}
            >
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </li>
        </ol>
      </div>
      <div className="tour-storyboard-utilities">
        <span className="visually-hidden">
          {flowMapOpen ? authoringText('Hide Flow Map') : authoringText('Show Flow Map')}
        </span>
        <ExperienceLanguageSelect controller={controller} snapshot={snapshot} />
        {snapshot.deliveryCapabilities.has('flow.v1') ? (
          <button
            aria-expanded={flowMapOpen}
            className="tour-flow-map-toggle"
            onClick={() => onFlowMapOpenChange(!flowMapOpen)}
            type="button"
          >
            <Network size={14} strokeWidth={2} aria-hidden="true" />
            {flowMapOpen ? authoringText('Return to canvas') : authoringText('Flow Map')}
          </button>
        ) : null}
      </div>
      {batchMode ? (
        <TourStepBatchToolbar
          controller={controller}
          count={snapshot.selectedStepIds.size}
          enabled={batchEnabled}
        />
      ) : null}
    </nav>
  );
}

function TourStepBatchToolbar({
  controller,
  count,
  enabled,
}: {
  controller: LocalAuthoringFrameController;
  count: number;
  enabled: boolean;
}) {
  return (
    <section className="tour-step-batch-toolbar" aria-label={authoringText('Batch step actions')}>
      <strong>{authoringText('{count} steps selected', { count })}</strong>
      <span className="tour-step-batch-actions">
        <AuthoringButton
          disabled={!enabled}
          icon={<Copy size={14} strokeWidth={2} aria-hidden="true" />}
          onClick={() => controller.duplicateSelectedSteps()}
          title={authoringText('Duplicate selected')}
        >
          {authoringText('Duplicate')}
        </AuthoringButton>
        <AuthoringPopover
          align="start"
          content={
            <div className="tour-step-batch-menu" role="menu">
              <AuthoringButton
                disabled={!enabled}
                icon={<ArrowUp size={14} strokeWidth={2} aria-hidden="true" />}
                onClick={() => controller.moveSelectedSteps('up')}
                role="menuitem"
              >
                {authoringText('Move selected up')}
              </AuthoringButton>
              <AuthoringButton
                disabled={!enabled}
                icon={<ArrowDown size={14} strokeWidth={2} aria-hidden="true" />}
                onClick={() => controller.moveSelectedSteps('down')}
                role="menuitem"
              >
                {authoringText('Move selected down')}
              </AuthoringButton>
            </div>
          }
          trigger={
            <AuthoringButton
              disabled={!enabled}
              icon={<ArrowRight size={14} strokeWidth={2} aria-hidden="true" />}
            >
              {authoringText('Reorder')}
            </AuthoringButton>
          }
        />
        <BatchPlacementMenu controller={controller} enabled={enabled} />
        <AuthoringButton
          disabled={!enabled}
          icon={<Trash2 size={14} strokeWidth={2} aria-hidden="true" />}
          tone="danger"
          onClick={() => controller.deleteSelectedSteps()}
          title={authoringText('Delete selected')}
        >
          {authoringText('Delete')}
        </AuthoringButton>
      </span>
      <AuthoringButton
        className="tour-step-batch-done"
        tone="primary"
        onClick={() => controller.clearTourStepBatchSelection()}
        title={authoringText('Clear selection')}
      >
        {authoringText('Done')}
      </AuthoringButton>
    </section>
  );
}

function BatchPlacementMenu({
  controller,
  enabled,
}: {
  controller: LocalAuthoringFrameController;
  enabled: boolean;
}) {
  const applyPlacement = (value: string): void => {
    if (value === 'top' || value === 'right' || value === 'bottom' || value === 'left') {
      controller.setSelectedStepPlacement(value);
    }
  };
  const applyRecovery = (value: string): void => {
    if (value === 'retry' || value === 'stay' || value === 'skip' || value === 'dismiss') {
      controller.setSelectedStepTimeoutPolicy(value);
    }
  };
  return (
    <AuthoringPopover
      align="start"
      content={
        <div className="tour-step-batch-menu batch-fields">
          <span className="visually-hidden">
            {authoringText('Apply placement to selected steps')}{' '}
            {authoringText('Apply timeout recovery to selected steps')}{' '}
            {authoringText('Choose recovery')}
          </span>
          <span>
            <strong>{authoringText('Placement')}</strong>
            {[
              ['top', authoringText('Above')],
              ['right', authoringText('Right')],
              ['bottom', authoringText('Below')],
              ['left', authoringText('Left')],
            ].map(([value, label]) => (
              <AuthoringButton
                disabled={!enabled}
                key={value}
                onClick={() => applyPlacement(value!)}
              >
                {label}
              </AuthoringButton>
            ))}
          </span>
          <span>
            <strong>{authoringText('Timeout recovery')}</strong>
            {[
              ['retry', authoringText('Retry once')],
              ['stay', authoringText('Offer recovery choices')],
              ['skip', authoringText('Skip this step')],
              ['dismiss', authoringText('Exit the tour')],
            ].map(([value, label]) => (
              <AuthoringButton
                disabled={!enabled}
                key={value}
                onClick={() => applyRecovery(value!)}
              >
                {label}
              </AuthoringButton>
            ))}
          </span>
        </div>
      }
      trigger={<AuthoringButton disabled={!enabled}>{authoringText('Move to…')}</AuthoringButton>}
    />
  );
}

export function TourStepActionMenu({
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
  const [open, setOpen] = useState(false);
  const namedStylesEnabled =
    !snapshot.commercialUsage || snapshot.commercialUsage.features.includes('named-step-styles');
  const namedStylesTitle = namedStylesEnabled
    ? undefined
    : authoringText('This tool is not included in the current workspace plan.');
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
          aria-label={authoringText('Step {number} actions', { number: stepIndex + 1 })}
          className="tour-step-action-trigger"
          icon={<MoreHorizontal size={15} strokeWidth={2.2} />}
          title={authoringText('Step {number} actions', { number: stepIndex + 1 })}
          tone="ghost"
        />
      }
      content={
        <div
          className="tour-step-action-menu"
          role="menu"
          aria-label={authoringText('Step {number} actions', { number: stepIndex + 1 })}
        >
          <AuthoringButton
            icon={<ArrowUp size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.moveTopLevelBlock(step.id, 'up'))}
            role="menuitem"
          >
            {authoringText('Move up')}
          </AuthoringButton>
          <AuthoringButton
            icon={<ArrowDown size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.moveTopLevelBlock(step.id, 'down'))}
            role="menuitem"
          >
            {authoringText('Move down')}
          </AuthoringButton>
          <AuthoringButton
            icon={<Copy size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.duplicateTopLevelBlock(step.id))}
            role="menuitem"
          >
            {authoringText('Duplicate')}
          </AuthoringButton>
          <AuthoringButton
            onClick={() => run(() => controller.previewFullTourFromStep(step.id))}
            role="menuitem"
          >
            {authoringText('Preview from here')}
          </AuthoringButton>
          <div className="tour-step-action-divider" role="separator" />
          <AuthoringButton
            disabled={!namedStylesEnabled}
            icon={<Palette size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.copyStepStyle(step.id))}
            role="menuitem"
            title={namedStylesTitle}
          >
            {authoringText('Copy style')}
          </AuthoringButton>
          <AuthoringButton
            disabled={!namedStylesEnabled || !snapshot.stepStyleClipboardAvailable}
            icon={<Palette size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.pasteStepStyle(step.id))}
            role="menuitem"
            title={namedStylesTitle}
          >
            {authoringText('Paste style')}
          </AuthoringButton>
          <AuthoringButton
            disabled={!namedStylesEnabled || !snapshot.stepStyleClipboardAvailable}
            icon={<Palette size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.applyCopiedStyleToSelected(step.id))}
            role="menuitem"
            title={namedStylesTitle}
          >
            {authoringText('Apply style to selected steps')}
          </AuthoringButton>
          <AuthoringButton
            disabled={!namedStylesEnabled}
            icon={<Save size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.saveStepStyleRecipe(step.id))}
            role="menuitem"
            title={namedStylesTitle}
          >
            {authoringText('Save as style recipe')}
          </AuthoringButton>
          {snapshot.stepStyleRecipes.map((recipe) => (
            <div className="style-recipe-menu-row" key={recipe.id}>
              <AuthoringButton
                disabled={!namedStylesEnabled}
                icon={
                  <span
                    aria-hidden="true"
                    className="style-recipe-thumbnail"
                    style={{
                      background: recipe.thumbnail.surfaceColor ?? '#ffffff',
                      color: recipe.thumbnail.textColor ?? '#162033',
                      borderColor: recipe.thumbnail.actionColor ?? '#006b58',
                    }}
                  />
                }
                onClick={() => run(() => controller.applyStepStyleRecipe(recipe.id, step.id))}
                role="menuitem"
                title={namedStylesTitle}
              >
                {authoringText('Apply {name}', { name: recipe.name })}
              </AuthoringButton>
              <AuthoringButton
                aria-label={authoringText('Delete recipe {name}', { name: recipe.name })}
                disabled={!namedStylesEnabled}
                icon={<Trash2 size={13} strokeWidth={2.2} />}
                onClick={() => run(() => controller.deleteStepStyleRecipe(recipe.id))}
                role="menuitem"
                tone="ghost"
                title={namedStylesTitle}
              />
            </div>
          ))}
          <AuthoringButton
            className="danger"
            icon={<Trash2 size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.deleteTopLevelBlock(step.id))}
            role="menuitem"
          >
            {authoringText('Delete')}
          </AuthoringButton>
        </div>
      }
    />
  );
}
