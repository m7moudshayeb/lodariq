import { authoringText } from '../../../i18n';
import type { ReactNode } from 'react';
import type {
  BlockLayoutProps,
  LodariqBlock,
  TooltipLayoutProps,
  TooltipStyleProps,
} from '@lodariq/schema';
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
  POPUP_BORDER_WEIGHT_OPTIONS,
  POPUP_ELEVATION_OPTIONS,
  POPUP_PADDING_OPTIONS,
  POPUP_RADIUS_OPTIONS,
} from '../properties/options';
import { PropertyChoiceField, PropertyColorField } from '../properties/property-controls';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle, blockTypeLabel, targetIdOf, targetLabelOf } from '../utils';
import type { StepHealthTone } from '../tour-step-model';

const TOOLTIP_PLACEMENT_LABELS = {
  top: authoringText('Above'),
  bottom: authoringText('Below'),
  left: authoringText('Left'),
  right: authoringText('Right'),
} as const;

type ContextualToolMode = 'content' | 'placement' | 'popup';

export function ContextualPropertyTray({
  activeTab,
  activeBlock,
  actionBlock,
  controller,
  health,
  placementEditor,
  popupThemeColors,
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
  popupThemeColors: PopupThemeColors;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  tooltip: LodariqBlock;
  toolMode: ContextualToolMode;
  onActiveTabChange: (tab: ActionPropertyTab) => void;
  onClose: () => void;
  open: boolean;
}) {
  const targetId = targetIdOf(step);
  const targetLabel = targetId
    ? targetLabelOf(snapshot.documentState, targetId)
    : authoringText('Choose target');
  const placement = tooltip.props.placement ?? 'bottom';
  const selectedBlock = actionBlock ?? activeBlock;
  let title = authoringText('{name} settings', {
    name: blockDisplayTitle(selectedBlock ?? step),
  });
  if (actionBlock) {
    title = authoringText('{name} {type}', {
      name: actionBlock.content?.trim() || authoringText('Untitled'),
      type: blockTypeLabel(actionBlock.type).toLowerCase(),
    });
  }
  if (toolMode === 'popup') title = authoringText('Popup layout');
  const scopeLabel =
    toolMode === 'popup' ? authoringText('· This step') : authoringText('· This block');
  let trayLabel = authoringText('Selected block settings');
  if (actionBlock) trayLabel = authoringText('Selected action style');
  if (toolMode === 'popup') trayLabel = authoringText('Popup layout settings');

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
              {authoringText('Appears')}&nbsp;
              {TOOLTIP_PLACEMENT_LABELS[placement].toLowerCase()} {targetLabel}
            </span>
            <span className={`storyboard-verification ${health.tone}`}>{health.label}</span>
          </span>
        </span>
        <button
          type="button"
          className="storyboard-tray-close"
          aria-label={authoringText('Close settings')}
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
        <PopupCompositionInspector
          controller={controller}
          themeColors={popupThemeColors}
          tooltip={tooltip}
        />
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
    <section className="rich-step-inspector compact" aria-label={authoringText('Block spacing')}>
      <header>
        <strong>{authoringText('Block spacing')}</strong>
        <span>{authoringText('Flow placement')}</span>
      </header>
      <div className="rich-step-inspector-grid two">
        <PropertyChoiceField
          label={authoringText('Before')}
          value={layout.spacingBefore ?? 'normal'}
          options={BLOCK_SPACING_OPTIONS}
          onChange={(spacingBefore) =>
            controller.setContentBlockLayout(block.id, {
              spacingBefore: spacingBefore as NonNullable<BlockLayoutProps['spacingBefore']>,
            })
          }
        />
        <PropertyChoiceField
          label={authoringText('After')}
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
  themeColors,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  themeColors: PopupThemeColors;
  tooltip: LodariqBlock;
}) {
  const layout = tooltip.props.tooltipLayout ?? {};
  const popupStyle = tooltip.props.tooltipStyle ?? {};
  const customized = Object.keys(popupStyle).length > 0;
  return (
    <section
      className="storyboard-tab-panel popup-layout"
      aria-label={authoringText('Popup layout')}
    >
      <PropertyChoiceField
        label={authoringText('Content alignment')}
        value={layout.contentAlign ?? 'left'}
        options={CONTENT_ALIGNMENT_OPTIONS}
        onChange={(contentAlign) =>
          controller.setTooltipLayout(tooltip.id, {
            contentAlign: contentAlign as NonNullable<TooltipLayoutProps['contentAlign']>,
          })
        }
      />
      <PropertyChoiceField
        label={authoringText('Action layout')}
        value={layout.actionLayout ?? 'inline'}
        options={ACTION_LAYOUT_OPTIONS}
        onChange={(actionLayout) =>
          controller.setTooltipLayout(tooltip.id, {
            actionLayout: actionLayout as NonNullable<TooltipLayoutProps['actionLayout']>,
          })
        }
      />
      <PropertyChoiceField
        label={authoringText('Action gap')}
        value={layout.gap ?? 'normal'}
        options={BLOCK_SPACING_OPTIONS}
        onChange={(gap) =>
          controller.setTooltipLayout(tooltip.id, {
            gap: gap as NonNullable<TooltipLayoutProps['gap']>,
          })
        }
      />
      <PropertyChoiceField
        label={authoringText('Padding')}
        value={layout.padding ?? 'standard'}
        options={POPUP_PADDING_OPTIONS}
        onChange={(padding) =>
          controller.setTooltipLayout(tooltip.id, {
            padding: padding as NonNullable<TooltipLayoutProps['padding']>,
          })
        }
      />
      <PropertyChoiceField
        label={authoringText('Corner radius')}
        value={layout.radius ?? 'theme'}
        options={POPUP_RADIUS_OPTIONS}
        onChange={(radius) =>
          controller.setTooltipLayout(tooltip.id, {
            radius: radius as NonNullable<TooltipLayoutProps['radius']>,
          })
        }
      />
      <PropertyChoiceField
        label={authoringText('Pointer arrow')}
        value={layout.showArrow === false ? 'hide' : 'show'}
        options={POPUP_ARROW_OPTIONS}
        onChange={(visibility) =>
          controller.setTooltipLayout(tooltip.id, { showArrow: visibility === 'show' })
        }
      />
      <PropertyColorField
        customized={Boolean(popupStyle.surfaceColor)}
        label={authoringText('Background')}
        value={popupStyle.surfaceColor ?? themeColors.surfaceColor}
        onChange={(surfaceColor) => controller.setTooltipStyle(tooltip.id, { surfaceColor })}
        onReset={() => controller.setTooltipStyle(tooltip.id, { surfaceColor: undefined })}
      />
      <PropertyColorField
        customized={Boolean(popupStyle.textColor)}
        label={authoringText('Text')}
        value={popupStyle.textColor ?? themeColors.textColor}
        onChange={(textColor) => controller.setTooltipStyle(tooltip.id, { textColor })}
        onReset={() => controller.setTooltipStyle(tooltip.id, { textColor: undefined })}
      />
      <PropertyColorField
        customized={Boolean(popupStyle.borderColor)}
        label={authoringText('Border')}
        value={popupStyle.borderColor ?? themeColors.borderColor}
        onChange={(borderColor) => controller.setTooltipStyle(tooltip.id, { borderColor })}
        onReset={() => controller.setTooltipStyle(tooltip.id, { borderColor: undefined })}
      />
      <PropertyChoiceField
        label={authoringText('Border weight')}
        value={popupStyle.borderWeight ?? 'theme'}
        options={POPUP_BORDER_WEIGHT_OPTIONS}
        onChange={(borderWeight) =>
          controller.setTooltipStyle(tooltip.id, {
            borderWeight: borderWeight as NonNullable<TooltipStyleProps['borderWeight']>,
          })
        }
      />
      <PropertyChoiceField
        label={authoringText('Shadow')}
        value={popupStyle.elevation ?? 'theme'}
        options={POPUP_ELEVATION_OPTIONS}
        onChange={(elevation) =>
          controller.setTooltipStyle(tooltip.id, {
            elevation: elevation as NonNullable<TooltipStyleProps['elevation']>,
          })
        }
      />
      <button
        className="popup-style-reset"
        disabled={!customized}
        onClick={() => controller.resetTooltipStyle(tooltip.id)}
        type="button"
      >
        {authoringText('Reset all to Brand')}
      </button>
    </section>
  );
}

export interface PopupThemeColors {
  borderColor: string;
  surfaceColor: string;
  textColor: string;
}
