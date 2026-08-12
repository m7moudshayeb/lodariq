import type { ReactNode } from 'react';
import type { BlockLayoutProps, LodariqBlock, TooltipLayoutProps } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { X } from '../design-system';
import {
  ButtonPropertyPanel,
  ButtonPropertyTabs,
  type ActionPropertyTab,
} from '../properties/button-property-editor';
import {
  ACTION_LAYOUT_OPTIONS,
  BLOCK_SPACING_OPTIONS,
  CONTENT_ALIGNMENT_OPTIONS,
  POPUP_ARROW_OPTIONS,
  POPUP_PADDING_OPTIONS,
  POPUP_RADIUS_OPTIONS,
} from '../properties/options';
import { PropertyChoiceField } from '../properties/property-controls';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle, blockTypeLabel, targetIdOf, targetLabelOf } from '../utils';
import type { StepHealthTone } from '../tour-step-model';

const TOOLTIP_PLACEMENT_LABELS = {
  top: 'Above',
  bottom: 'Below',
  left: 'Left',
  right: 'Right',
} as const;

type ContextualToolMode = 'content' | 'placement' | 'popup';

export function ContextualPropertyTray({
  activeTab,
  activeBlock,
  actionBlock,
  controller,
  health,
  placementEditor,
  snapshot,
  step,
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
  placementEditor: ReactNode;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  tooltip: LodariqBlock;
  toolMode: ContextualToolMode;
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
          <ButtonPropertyTabs activeTab={activeTab} onActiveTabChange={onActiveTabChange} />
          <ButtonPropertyPanel
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

      {toolMode === 'placement' ? placementEditor : null}

      {toolMode === 'popup' ? (
        <PopupCompositionInspector controller={controller} tooltip={tooltip} />
      ) : null}
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
        <PropertyChoiceField
          label="Before"
          value={layout.spacingBefore ?? 'normal'}
          options={BLOCK_SPACING_OPTIONS}
          onChange={(spacingBefore) =>
            controller.setContentBlockLayout(block.id, {
              spacingBefore: spacingBefore as NonNullable<BlockLayoutProps['spacingBefore']>,
            })
          }
        />
        <PropertyChoiceField
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
      <PropertyChoiceField
        label="Content alignment"
        value={layout.contentAlign ?? 'left'}
        options={CONTENT_ALIGNMENT_OPTIONS}
        onChange={(contentAlign) =>
          controller.setTooltipLayout(tooltip.id, {
            contentAlign: contentAlign as NonNullable<TooltipLayoutProps['contentAlign']>,
          })
        }
      />
      <PropertyChoiceField
        label="Action layout"
        value={layout.actionLayout ?? 'inline'}
        options={ACTION_LAYOUT_OPTIONS}
        onChange={(actionLayout) =>
          controller.setTooltipLayout(tooltip.id, {
            actionLayout: actionLayout as NonNullable<TooltipLayoutProps['actionLayout']>,
          })
        }
      />
      <PropertyChoiceField
        label="Action gap"
        value={layout.gap ?? 'normal'}
        options={BLOCK_SPACING_OPTIONS}
        onChange={(gap) =>
          controller.setTooltipLayout(tooltip.id, {
            gap: gap as NonNullable<TooltipLayoutProps['gap']>,
          })
        }
      />
      <PropertyChoiceField
        label="Padding"
        value={layout.padding ?? 'standard'}
        options={POPUP_PADDING_OPTIONS}
        onChange={(padding) =>
          controller.setTooltipLayout(tooltip.id, {
            padding: padding as NonNullable<TooltipLayoutProps['padding']>,
          })
        }
      />
      <PropertyChoiceField
        label="Corner radius"
        value={layout.radius ?? 'theme'}
        options={POPUP_RADIUS_OPTIONS}
        onChange={(radius) =>
          controller.setTooltipLayout(tooltip.id, {
            radius: radius as NonNullable<TooltipLayoutProps['radius']>,
          })
        }
      />
      <PropertyChoiceField
        label="Pointer arrow"
        value={layout.showArrow === false ? 'hide' : 'show'}
        options={POPUP_ARROW_OPTIONS}
        onChange={(visibility) =>
          controller.setTooltipLayout(tooltip.id, { showArrow: visibility === 'show' })
        }
      />
    </section>
  );
}
