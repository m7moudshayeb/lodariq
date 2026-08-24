import { useState } from 'react';
import {
  apcaLightnessContrast,
  CONTRAST_RATIO_TARGETS,
  evaluateContrast,
  TOOLTIP_HEIGHT_PX_LIMITS,
  TOOLTIP_PADDING_PX_LIMITS,
  TOOLTIP_WIDTH_PX_LIMITS,
  type LodariqBlock,
  type TooltipLayoutProps,
  type TooltipStyleProps,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import {
  ACTION_LAYOUT_OPTIONS,
  BLOCK_ALIGNMENT_OPTIONS,
  BLOCK_SPACING_OPTIONS,
  CONTENT_ALIGNMENT_OPTIONS,
  POPUP_ARROW_OPTIONS,
  POPUP_BORDER_WEIGHT_OPTIONS,
  POPUP_ELEVATION_OPTIONS,
  POPUP_PADDING_OPTIONS,
  POPUP_RADIUS_OPTIONS,
} from '../properties/options';
import {
  PropertyChoiceField,
  PropertyColorField,
  PropertyNumberField,
  PropertyRangeField,
} from '../properties/property-controls';
import type {
  PopupAppearanceSection,
  PopupCompositionSection,
  PopupAppearanceScope,
  PopupLayoutScope,
  PopupThemeColors,
} from './contextual-property-types';

/**
 * Where each preset leaves the sliders when neither axis is authored.
 *
 * The presets resolve through the theme's spacing scale, so these are the
 * shipped fallback theme's numbers rather than a promise. They position the
 * thumb and nothing else — an untouched slider still writes no value, so the
 * popup keeps following whatever its own theme says.
 */
const PRESET_PADDING_PX: Record<NonNullable<TooltipLayoutProps['padding']>, number> = {
  compact: 8,
  standard: 12,
  relaxed: 16,
};

const POPUP_APPEARANCE_SECTIONS = [
  { value: 'surface', label: authoringText('Surface') },
  { value: 'text', label: authoringText('Text') },
  { value: 'border', label: authoringText('Border') },
  { value: 'weight', label: authoringText('Border weight') },
  { value: 'shadow', label: authoringText('Elevation') },
] as const satisfies ReadonlyArray<{ value: PopupAppearanceSection; label: string }>;

export function PopupCompositionInspector({
  appearanceScope = 'all',
  controller,
  density = 'comfortable',
  layoutScope = 'all',
  section,
  themeColors,
  tooltip,
}: {
  /** Which half of the appearance fields to render. Defaults to all of them. */
  appearanceScope?: PopupAppearanceScope;
  controller: LocalAuthoringFrameController;
  /**
   * `compact` is the anchored inspector (§4.3): every property is one `.fld` row
   * with a pill that opens its choices. The five appearance tabs exist only
   * because each control was a full-width group — as rows they all fit, so the
   * tab strip and the review aside both go.
   */
  density?: 'comfortable' | 'compact';
  section: PopupCompositionSection;
  /** Which half of the layout fields to render. Defaults to all of them. */
  layoutScope?: PopupLayoutScope;
  themeColors: PopupThemeColors;
  tooltip: LodariqBlock;
}) {
  const [appearanceSection, setAppearanceSection] = useState<PopupAppearanceSection>('surface');
  const compact = density === 'compact';
  const presentation = compact ? ('menu' as const) : ('segmented' as const);
  const COLOUR_ITEMS = new Set<PopupAppearanceSection>(['surface', 'text']);
  /** Compact shows every appearance property as a row; the tabs are the wide form. */
  const showsAppearance = (item: PopupAppearanceSection): boolean => {
    if (appearanceScope === 'colours' && !COLOUR_ITEMS.has(item)) return false;
    if (appearanceScope === 'edges' && COLOUR_ITEMS.has(item)) return false;
    return compact || appearanceSection === item;
  };
  /** `style` is the old whole-half scope; `spacing` and `frame` split it further. */
  const showsLayout = (part: Exclude<PopupLayoutScope, 'all'>): boolean =>
    layoutScope === 'all' ||
    layoutScope === part ||
    (layoutScope === 'style' && (part === 'spacing' || part === 'frame'));
  const layout = tooltip.props.tooltipLayout ?? {};
  const popupStyle = tooltip.props.tooltipStyle ?? {};
  const customized = Object.keys(popupStyle).length > 0;
  const surfaceColor = popupStyle.surfaceColor ?? themeColors.surfaceColor;
  const textColor = popupStyle.textColor ?? themeColors.textColor;
  const borderColor = popupStyle.borderColor ?? themeColors.borderColor;
  const textContrast = evaluateContrast(
    textColor,
    surfaceColor,
    CONTRAST_RATIO_TARGETS.text,
    CONTRAST_RATIO_TARGETS.textUnusable,
  );
  const focusContrast = evaluateContrast(
    borderColor,
    surfaceColor,
    CONTRAST_RATIO_TARGETS.focus,
    CONTRAST_RATIO_TARGETS.focusUnusable,
  );
  // Secondary readouts, computed on the pairs actually in use (§7.2).
  const textLc = apcaLightnessContrast(textColor, surfaceColor);
  const borderLc = apcaLightnessContrast(borderColor, surfaceColor);
  return (
    <section
      className="storyboard-tab-panel popup-layout"
      aria-label={authoringText('Popup layout')}
      data-section={section}
    >
      {section === 'layout' ? (
        <>
          {showsLayout('frame') ? (
          <PropertyChoiceField
            presentation={presentation}
            label={authoringText('Content alignment')}
            value={layout.contentAlign ?? 'left'}
            options={CONTENT_ALIGNMENT_OPTIONS}
            onChange={(contentAlign) =>
              controller.setTooltipLayout(tooltip.id, {
                contentAlign: contentAlign as NonNullable<TooltipLayoutProps['contentAlign']>,
              })
            }
          />
          ) : null}
          {/*
            The action rows belong to the inspector's own Actions section, which
            also lists the buttons they arrange. The wide tray has no such
            section, so it keeps them here.
          */}
          {layoutScope === 'all' ? (
          <>
          <PropertyChoiceField
            presentation={presentation}
            label={authoringText('Action layout')}
            value={layout.actionLayout ?? 'stack'}
            options={ACTION_LAYOUT_OPTIONS}
            onChange={(actionLayout) =>
              controller.setTooltipLayout(tooltip.id, {
                actionLayout: actionLayout as NonNullable<TooltipLayoutProps['actionLayout']>,
              })
            }
          />
          <PropertyChoiceField
            presentation={presentation}
            label={authoringText('Action alignment')}
            value={layout.actionAlign ?? 'start'}
            options={BLOCK_ALIGNMENT_OPTIONS}
            onChange={(actionAlign) =>
              controller.setTooltipLayout(tooltip.id, {
                actionAlign: actionAlign as NonNullable<TooltipLayoutProps['actionAlign']>,
              })
            }
          />
          <PropertyChoiceField
            presentation={presentation}
            label={authoringText('Action gap')}
            value={layout.gap ?? 'normal'}
            options={BLOCK_SPACING_OPTIONS}
            onChange={(gap) =>
              controller.setTooltipLayout(tooltip.id, {
                gap: gap as NonNullable<TooltipLayoutProps['gap']>,
              })
            }
          />
          </>
          ) : null}
          {showsLayout('spacing') ? (
          <>
          <PropertyChoiceField
            presentation={presentation}
            label={authoringText('Padding')}
            value={layout.padding ?? 'standard'}
            options={POPUP_PADDING_OPTIONS}
            onChange={(padding) =>
              controller.setTooltipLayout(tooltip.id, {
                padding: padding as NonNullable<TooltipLayoutProps['padding']>,
              })
            }
          />
          {/*
            The preset above is one decision for both axes; these are for when
            the two need different answers — a wide, short card that wants room
            at the sides and none above. Left alone they follow the preset.
          */}
          <PropertyRangeField
            fallback={PRESET_PADDING_PX[layout.padding ?? 'standard']}
            label={authoringText('Vertical padding')}
            max={TOOLTIP_PADDING_PX_LIMITS.max}
            min={TOOLTIP_PADDING_PX_LIMITS.min}
            onChange={(paddingBlockPx) =>
              controller.setTooltipLayout(tooltip.id, {
                paddingBlockPx: paddingBlockPx ?? undefined,
              })
            }
            step={TOOLTIP_PADDING_PX_LIMITS.step}
            suffix={authoringText('px')}
            value={layout.paddingBlockPx ?? null}
          />
          <PropertyRangeField
            fallback={PRESET_PADDING_PX[layout.padding ?? 'standard']}
            label={authoringText('Horizontal padding')}
            max={TOOLTIP_PADDING_PX_LIMITS.max}
            min={TOOLTIP_PADDING_PX_LIMITS.min}
            onChange={(paddingInlinePx) =>
              controller.setTooltipLayout(tooltip.id, {
                paddingInlinePx: paddingInlinePx ?? undefined,
              })
            }
            step={TOOLTIP_PADDING_PX_LIMITS.step}
            suffix={authoringText('px')}
            value={layout.paddingInlinePx ?? null}
          />
          <PropertyChoiceField
            presentation={presentation}
            label={authoringText('Corner')}
            value={layout.radius ?? 'theme'}
            options={POPUP_RADIUS_OPTIONS}
            onChange={(radius) =>
              controller.setTooltipLayout(tooltip.id, {
                radius: radius as NonNullable<TooltipLayoutProps['radius']>,
              })
            }
          />
          </>
          ) : null}
          {showsLayout('frame') ? (
          <>
          <PropertyChoiceField
            presentation={presentation}
            label={authoringText('Pointer arrow')}
            value={layout.showArrow === false ? 'hide' : 'show'}
            options={POPUP_ARROW_OPTIONS}
            onChange={(visibility) =>
              controller.setTooltipLayout(tooltip.id, { showArrow: visibility === 'show' })
            }
          />
          {/*
            §4.3 puts the card's own size here. Dragging a handle answers "about
            this big"; these answer "396", which is the question a creator
            matching a spec is actually asking. Height is a minimum, so leaving
            it empty means the card grows with its content.
          */}
          <PropertyNumberField
            label={authoringText('Width')}
            max={TOOLTIP_WIDTH_PX_LIMITS.max}
            min={TOOLTIP_WIDTH_PX_LIMITS.min}
            onChange={(widthPx) =>
              controller.setTooltipLayout(tooltip.id, { widthPx: widthPx ?? undefined })
            }
            placeholder={authoringText('auto')}
            step={TOOLTIP_WIDTH_PX_LIMITS.step}
            suffix={authoringText('px')}
            value={layout.widthPx ?? null}
          />
          <PropertyNumberField
            label={authoringText('Min height')}
            max={TOOLTIP_HEIGHT_PX_LIMITS.max}
            min={TOOLTIP_HEIGHT_PX_LIMITS.min}
            onChange={(heightPx) =>
              controller.setTooltipLayout(tooltip.id, { heightPx: heightPx ?? undefined })
            }
            placeholder={authoringText('auto')}
            step={TOOLTIP_HEIGHT_PX_LIMITS.step}
            suffix={authoringText('px')}
            value={layout.heightPx ?? null}
          />
          </>
          ) : null}
        </>
      ) : (
        <div className="popup-appearance-workspace">
          <div className="popup-appearance-progressive">
            {compact ? null : (
            <nav className="progressive-setting-tabs" aria-label={authoringText('Appearance')}>
              {POPUP_APPEARANCE_SECTIONS.map((item) => (
                <button
                  aria-current={appearanceSection === item.value ? 'page' : undefined}
                  key={item.value}
                  onClick={() => setAppearanceSection(item.value)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </nav>
            )}
            <div className="progressive-setting-panel">
              {showsAppearance('surface') ? (
                <PropertyColorField
                  presentation={presentation}
                  apcaLc={textLc}
                  contrast={textContrast}
                  customized={Boolean(popupStyle.surfaceColor)}
                  hideLegend={!compact}
                  label={authoringText('Surface')}
                  value={surfaceColor}
                  onChange={(surfaceColor) =>
                    controller.setTooltipStyle(tooltip.id, { surfaceColor })
                  }
                  onReset={() =>
                    controller.setTooltipStyle(tooltip.id, { surfaceColor: undefined })
                  }
                  resetLabel={authoringText('Use Brand surface')}
                />
              ) : null}
              {showsAppearance('text') ? (
                <PropertyColorField
                  presentation={presentation}
                  apcaLc={textLc}
                  contrast={textContrast}
                  customized={Boolean(popupStyle.textColor)}
                  hideLegend={!compact}
                  label={authoringText('Text')}
                  value={textColor}
                  onChange={(textColor) => controller.setTooltipStyle(tooltip.id, { textColor })}
                  onReset={() => controller.setTooltipStyle(tooltip.id, { textColor: undefined })}
                  resetLabel={authoringText('Use Brand text')}
                />
              ) : null}
              {showsAppearance('border') ? (
                <PropertyColorField
                  presentation={presentation}
                  apcaLc={borderLc}
                  contrast={focusContrast}
                  customized={Boolean(popupStyle.borderColor)}
                  hideLegend={!compact}
                  label={authoringText('Border')}
                  value={borderColor}
                  onChange={(borderColor) =>
                    controller.setTooltipStyle(tooltip.id, { borderColor })
                  }
                  onReset={() => controller.setTooltipStyle(tooltip.id, { borderColor: undefined })}
                  resetLabel={authoringText('Use Brand border')}
                />
              ) : null}
              {showsAppearance('weight') ? (
                <PropertyChoiceField
                  presentation={presentation}
                  hideLegend={!compact}
                  label={authoringText('Border weight')}
                  value={popupStyle.borderWeight ?? 'theme'}
                  options={POPUP_BORDER_WEIGHT_OPTIONS}
                  onChange={(borderWeight) =>
                    controller.setTooltipStyle(tooltip.id, {
                      borderWeight: borderWeight as NonNullable<TooltipStyleProps['borderWeight']>,
                    })
                  }
                />
              ) : null}
              {showsAppearance('shadow') ? (
                <PropertyChoiceField
                  presentation={presentation}
                  hideLegend={!compact}
                  label={authoringText('Elevation')}
                  value={popupStyle.elevation ?? 'theme'}
                  options={POPUP_ELEVATION_OPTIONS}
                  onChange={(elevation) =>
                    controller.setTooltipStyle(tooltip.id, {
                      elevation: elevation as NonNullable<TooltipStyleProps['elevation']>,
                    })
                  }
                />
              ) : null}
            </div>
            {/* Compact says this once, in the override banner above the rows. */}
            {compact ? null : (
              <button
                className="popup-style-reset"
                disabled={!customized}
                onClick={() => controller.resetTooltipStyle(tooltip.id)}
                type="button"
              >
                {authoringText('Reset all to Brand')}
              </button>
            )}
          </div>
          {/*
            §7.2: the audit is a publish-blocking item in Operations → Check, and
            what belongs beside the control is a non-blocking inline warning. This
            aside was the audit, permanently open, inside a 320px popover.
          */}
          {compact ? null : (
          <aside className="popup-contrast-check" aria-label={authoringText('Review and preview')}>
            <small>{authoringText('Review and preview')}</small>
            <div>
              <strong>AA</strong>
              <span>{textContrast.ratio}:1</span>
              <small>{authoringText('Text')}</small>
            </div>
            <div>
              <strong>AAA</strong>
              <span>{focusContrast.ratio}:1</span>
              <small>{authoringText('Border')}</small>
            </div>
          </aside>
          )}
        </div>
      )}
    </section>
  );
}
