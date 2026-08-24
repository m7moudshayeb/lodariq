import type { ReactNode } from 'react';
import type { LodariqBlock, TooltipLayoutProps } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { Plus, X } from '../design-system';
import { EDITABLE_ACTION_OPTIONS, EDITABLE_BUTTON_VARIANT_OPTIONS } from '../types';
import {
  ACTION_LAYOUT_OPTIONS,
  BLOCK_ALIGNMENT_OPTIONS,
  BLOCK_SPACING_OPTIONS,
} from '../properties/options';
import { PropertyChoiceField } from '../properties/property-controls';
import { defaultActionVariant } from '../properties/button-properties';

/**
 * The inspector's Actions section (§4.3).
 *
 * The three layout rows were all this section had, which meant a creator could
 * say how the buttons were arranged without ever seeing *which* buttons they
 * were arranging. The prototype lists them — numbered, in order, each with what
 * it looks like and what it does — and that list is the section's real subject;
 * layout is the refinement on top.
 *
 * The labels drop the "Action" prefix the tray needed. Inside a section headed
 * Actions, "Action alignment" says the word twice.
 */
export function StepActionsSection({
  controller,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  tooltip: LodariqBlock;
}): ReactNode {
  const actions = tooltip.children.filter(
    (child) => child.type === 'button' || child.type === 'link',
  );
  const layout = tooltip.props.tooltipLayout ?? {};

  /**
   * Appended after everything already in the card, which is where a CTA goes.
   * Structural changes go to the card rather than to the document — see
   * `requestCardCommand`, which explains why writing the block directly would
   * change nothing a creator could see.
   */
  const addButton = (): void => controller.requestCardCommand('add-button');

  if (actions.length === 0) {
    return (
      <div className="step-actions-section">
        <p className="overlay-step-inspector-note">
          {authoringText('This step has no buttons yet.')}
        </p>
        <div className="inspector-menu">
          <button type="button" data-action="step-action-add" onClick={addButton}>
            <Plus size={13} aria-hidden="true" />
            <span>{authoringText('Add a button')}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="step-actions-section">
      <PropertyChoiceField
        presentation="track"
        label={authoringText('Layout')}
        value={layout.actionLayout ?? 'stack'}
        options={ACTION_LAYOUT_OPTIONS}
        onChange={(actionLayout) =>
          controller.setTooltipLayout(tooltip.id, {
            actionLayout: actionLayout as NonNullable<TooltipLayoutProps['actionLayout']>,
          })
        }
      />
      <PropertyChoiceField
        presentation="track"
        label={authoringText('Alignment')}
        value={layout.actionAlign ?? 'start'}
        options={BLOCK_ALIGNMENT_OPTIONS}
        onChange={(actionAlign) =>
          controller.setTooltipLayout(tooltip.id, {
            actionAlign: actionAlign as NonNullable<TooltipLayoutProps['actionAlign']>,
          })
        }
      />
      <PropertyChoiceField
        presentation="track"
        label={authoringText('Gap')}
        value={layout.gap ?? 'normal'}
        options={BLOCK_SPACING_OPTIONS}
        onChange={(gap) =>
          controller.setTooltipLayout(tooltip.id, {
            gap: gap as NonNullable<TooltipLayoutProps['gap']>,
          })
        }
      />
      <p className="overlay-step-inspector-note">
        {authoringText('Drag a button onto another to put them on one row.')}
      </p>
      <div className="inspector-numbered-list">
        {actions.map((action, index) => (
          <div className="inspector-numbered-row" data-button={action.id} key={action.id}>
            <button
              type="button"
              className="inspector-numbered-open"
              onClick={() => controller.requestCardCommand('select-block', action.id)}
            >
              <span className="inspector-numbered-index" aria-hidden="true">
                {index + 1}
              </span>
              <b>{action.content?.trim() || authoringText('Untitled button')}</b>
              <span className="inspector-numbered-meta">{actionSummary(action)}</span>
            </button>
            <button
              type="button"
              className="inspector-numbered-remove"
              aria-label={authoringText('Delete {name}', {
                name: action.content?.trim() || authoringText('Untitled button'),
              })}
              onClick={() => controller.requestCardCommand('remove-block', action.id)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div className="inspector-menu">
        <button type="button" data-action="step-action-add" onClick={addButton}>
          <Plus size={13} aria-hidden="true" />
          <span>{authoringText('Add a button')}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * What the button looks like and what it does, in the creator's words. The
 * prototype prints the stored values (`primary · next`); those are our field
 * names, not theirs.
 */
function actionSummary(block: LodariqBlock): string {
  const variant = block.props.variant ?? defaultActionVariant(block);
  const variantLabel =
    EDITABLE_BUTTON_VARIANT_OPTIONS.find((option) => option.value === variant)?.label ?? variant;
  const actionType = block.props.action?.type;
  /*
   * A button with no action yet reads as "No action yet", not as the picker's
   * own "Choose next action" — this line describes the button, and an
   * instruction sitting in a description is a control that cannot be clicked.
   */
  if (!actionType) return `${variantLabel} · ${authoringText('No action yet')}`;
  const actionLabel = EDITABLE_ACTION_OPTIONS.find(
    (option) => option.value === actionType,
  )?.label;
  return actionLabel ? `${variantLabel} · ${actionLabel}` : variantLabel;
}
