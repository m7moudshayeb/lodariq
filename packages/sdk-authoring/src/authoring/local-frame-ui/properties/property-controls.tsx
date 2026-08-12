import type { CSSProperties } from 'react';
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
  label,
  onChange,
  options,
  showIcons = false,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  showIcons?: boolean;
  value: string;
}) {
  return (
    <fieldset className="rich-step-choice-field">
      <legend>{label}</legend>
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
  customized,
  label,
  onChange,
  onReset,
  value,
}: {
  customized: boolean;
  label: string;
  onChange: (value: string) => void;
  onReset: () => void;
  value: string;
}) {
  return (
    <fieldset className="rich-step-color-field">
      <legend>{label}</legend>
      <div className="rich-step-color-swatches" role="group" aria-label={`${label} color`}>
        {QUICK_COLORS.map((color) => {
          const selected = value.toLowerCase() === color;
          return (
            <button
              key={color}
              aria-label={`Use ${color} for ${label.toLowerCase()}`}
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
          <span>Custom</span>
          <input
            aria-label={`Custom ${label.toLowerCase()} color`}
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
          Theme
        </button>
      </div>
    </fieldset>
  );
}
