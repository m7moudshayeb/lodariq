import { useState } from 'react';
import {
  CONTRAST_RATIO_TARGETS,
  evaluateContrast,
  type LodariqBlock,
  type TooltipLayoutProps,
  type TooltipStyleProps,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
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
import type {
  PopupAppearanceSection,
  PopupCompositionSection,
  PopupThemeColors,
} from './contextual-property-types';

const POPUP_APPEARANCE_SECTIONS = [
  { value: 'surface', label: authoringText('Background') },
  { value: 'text', label: authoringText('Text') },
  { value: 'border', label: authoringText('Border') },
  { value: 'weight', label: authoringText('Border weight') },
  { value: 'shadow', label: authoringText('Shadow') },
] as const satisfies ReadonlyArray<{ value: PopupAppearanceSection; label: string }>;

export function PopupCompositionInspector({
  controller,
  section,
  themeColors,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  section: PopupCompositionSection;
  themeColors: PopupThemeColors;
  tooltip: LodariqBlock;
}) {
  const [appearanceSection, setAppearanceSection] = useState<PopupAppearanceSection>('surface');
  const layout = tooltip.props.tooltipLayout ?? {};
  const popupStyle = tooltip.props.tooltipStyle ?? {};
  const customized = Object.keys(popupStyle).length > 0;
  const textContrast = evaluateContrast(
    popupStyle.textColor ?? themeColors.textColor,
    popupStyle.surfaceColor ?? themeColors.surfaceColor,
    CONTRAST_RATIO_TARGETS.text,
    CONTRAST_RATIO_TARGETS.textUnusable,
  );
  const focusContrast = evaluateContrast(
    popupStyle.borderColor ?? themeColors.borderColor,
    popupStyle.surfaceColor ?? themeColors.surfaceColor,
    CONTRAST_RATIO_TARGETS.focus,
    CONTRAST_RATIO_TARGETS.focusUnusable,
  );
  return (
    <section
      className="storyboard-tab-panel popup-layout"
      aria-label={authoringText('Popup layout')}
      data-section={section}
    >
      {section === 'layout' ? (
        <>
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
        </>
      ) : (
        <div className="popup-appearance-workspace">
          <div className="popup-appearance-progressive">
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
            <div className="progressive-setting-panel">
              {appearanceSection === 'surface' ? (
                <PropertyColorField
                  contrast={textContrast}
                  customized={Boolean(popupStyle.surfaceColor)}
                  hideLegend
                  label={authoringText('Background')}
                  value={popupStyle.surfaceColor ?? themeColors.surfaceColor}
                  onChange={(surfaceColor) =>
                    controller.setTooltipStyle(tooltip.id, { surfaceColor })
                  }
                  onReset={() =>
                    controller.setTooltipStyle(tooltip.id, { surfaceColor: undefined })
                  }
                  resetLabel={authoringText('Use Brand surface')}
                />
              ) : null}
              {appearanceSection === 'text' ? (
                <PropertyColorField
                  contrast={textContrast}
                  customized={Boolean(popupStyle.textColor)}
                  hideLegend
                  label={authoringText('Text')}
                  value={popupStyle.textColor ?? themeColors.textColor}
                  onChange={(textColor) => controller.setTooltipStyle(tooltip.id, { textColor })}
                  onReset={() => controller.setTooltipStyle(tooltip.id, { textColor: undefined })}
                  resetLabel={authoringText('Use Brand text')}
                />
              ) : null}
              {appearanceSection === 'border' ? (
                <PropertyColorField
                  contrast={focusContrast}
                  customized={Boolean(popupStyle.borderColor)}
                  hideLegend
                  label={authoringText('Border')}
                  value={popupStyle.borderColor ?? themeColors.borderColor}
                  onChange={(borderColor) =>
                    controller.setTooltipStyle(tooltip.id, { borderColor })
                  }
                  onReset={() => controller.setTooltipStyle(tooltip.id, { borderColor: undefined })}
                  resetLabel={authoringText('Use Brand border')}
                />
              ) : null}
              {appearanceSection === 'weight' ? (
                <PropertyChoiceField
                  hideLegend
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
              {appearanceSection === 'shadow' ? (
                <PropertyChoiceField
                  hideLegend
                  label={authoringText('Shadow')}
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
            <button
              className="popup-style-reset"
              disabled={!customized}
              onClick={() => controller.resetTooltipStyle(tooltip.id)}
              type="button"
            >
              {authoringText('Reset all to Brand')}
            </button>
          </div>
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
        </div>
      )}
    </section>
  );
}
