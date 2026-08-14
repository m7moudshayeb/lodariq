import { authoringText } from '../../../i18n';
import type { CSSProperties } from 'react';
import type { ContrastEvaluation } from '@lodariq/schema';
import type { LucideIcon } from 'lucide-react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUp,
  Check,
  ChevronRight,
  Circle,
  CircleX,
  ExternalLink,
  Link,
  List,
  LogOut,
  MousePointerClick,
  Palette,
  PanelBottom,
  PanelLeft,
  PanelRight,
  SlidersHorizontal,
} from '../design-system';
import { AuthoringSegmentedControl as SegmentedControl } from '../design-system';

const QUICK_COLORS = ['#006b58', '#ffffff', '#162033', '#6b7b74', '#c96047'] as const;

const CHOICE_ICON_BY_VALUE: Readonly<Record<string, LucideIcon>> = {
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
  runSequence: List,
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

export function PropertyChoiceField({
  hideLegend = false,
  label,
  onChange,
  options,
  showIcons = false,
  value,
}: {
  hideLegend?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  showIcons?: boolean;
  value: string;
}) {
  return (
    <fieldset className="rich-step-choice-field">
      <legend className={hideLegend ? 'visually-hidden' : undefined}>{label}</legend>
      <SegmentedControl
        ariaLabel={label}
        onValueChange={onChange}
        options={options.map((option) => {
          const Icon = CHOICE_ICON_BY_VALUE[option.value] ?? SlidersHorizontal;
          return {
            ...option,
            icon: showIcons ? <Icon size={15} strokeWidth={2} aria-hidden="true" /> : undefined,
          };
        })}
        value={value}
      />
    </fieldset>
  );
}

export function PropertyColorField({
  contrast,
  customized,
  hideLegend = false,
  label,
  onChange,
  onReset,
  resetLabel = authoringText('Theme'),
  value,
}: {
  contrast?: ContrastEvaluation;
  customized: boolean;
  hideLegend?: boolean;
  label: string;
  onChange: (value: string) => void;
  onReset: () => void;
  resetLabel?: string;
  value: string;
}) {
  return (
    <fieldset className="rich-step-color-field">
      <legend className={hideLegend ? 'visually-hidden' : undefined}>{label}</legend>
      <div
        className="rich-step-color-swatches"
        role="group"
        aria-label={authoringText('{label} color', { label })}
      >
        {QUICK_COLORS.map((color) => {
          const selected = value.toLowerCase() === color;
          return (
            <button
              key={color}
              aria-label={authoringText('Use {color} for {label}', {
                color,
                label: label.toLocaleLowerCase(),
              })}
              aria-pressed={selected}
              className={selected ? 'selected' : undefined}
              onClick={() => onChange(color)}
              style={{ '--storyboard-swatch': color } as CSSProperties}
              type="button"
            >
              {selected ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : null}
            </button>
          );
        })}
        <label className="rich-step-custom-color">
          <Palette size={14} strokeWidth={2} aria-hidden="true" />
          <span>{authoringText('Custom')}</span>
          <input
            aria-label={authoringText('Custom {label} color', {
              label: label.toLocaleLowerCase(),
            })}
            onChange={(event) => onChange(event.currentTarget.value)}
            type="color"
            value={value}
          />
        </label>
        <button
          className="rich-step-theme-color"
          disabled={!customized}
          onClick={onReset}
          type="button"
        >
          {resetLabel}
        </button>
      </div>
      {contrast ? (
        <output
          className={`rich-step-contrast-status ${contrast.state}`}
          data-contrast-state={contrast.state}
        >
          {contrastMessage(contrast)}
        </output>
      ) : null}
    </fieldset>
  );
}

function contrastMessage(contrast: ContrastEvaluation): string {
  if (contrast.state === 'pass') {
    return authoringText('{ratio}:1 · Meets contrast target', { ratio: contrast.ratio });
  }
  if (contrast.state === 'warning') {
    return authoringText('{ratio}:1 · Improve to at least {required}:1 before release', {
      ratio: contrast.ratio,
      required: contrast.requiredRatio,
    });
  }
  return authoringText('{ratio}:1 · Unusable contrast; choose a safer color', {
    ratio: contrast.ratio,
  });
}
