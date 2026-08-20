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
import { AuthoringPopover, AuthoringSegmentedControl as SegmentedControl, AuthoringSelect, ChevronDown } from '../design-system';

/**
 * Quick picks for a colour override.
 *
 * The first entry used to be the pre-adoption mint, which survived the palette
 * swap here — which is why authored buttons still filled green long after the
 * chrome had stopped being green. A test now guards the retired value.
 */
const QUICK_COLORS = ['#6d3bf5', '#ffffff', '#1a1633', '#4a4360', '#c96047'] as const;

/**
 * How a property control presents itself.
 *
 * `segmented` is the workspace form: a caption over a full-width control, right in
 * a 640px tray. `menu` is the prototype's `.fld` row — label left, one pill right
 * that opens the choices — which is what fits the 320px anchored inspector (§4.3).
 * The options, the value and the change are identical; only the presentation
 * differs, so no capability is traded for the density.
 *
 * `track` is the prototype's `.fld.col` + `.seg`: the caption over a recessed
 * track with every option visible at once. It costs more height than a pill, and
 * §4.3 spends that where the choice is small and frequently changed — which side
 * the card sits on, how its buttons stack — so the creator can see the whole
 * choice without opening anything.
 */
export type PropertyFieldPresentation = 'segmented' | 'menu' | 'track';

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
  presentation = 'segmented',
  showIcons = false,
  value,
}: {
  hideLegend?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string; description?: string }>;
  presentation?: PropertyFieldPresentation;
  showIcons?: boolean;
  value: string;
}) {
  if (presentation === 'menu') {
    return (
      <div className="rich-step-choice-field" data-presentation="menu">
        <span className={`rich-step-field-label${hideLegend ? ' visually-hidden' : ''}`}>
          {label}
        </span>
        <AuthoringSelect
          ariaLabel={label}
          onValueChange={onChange}
          options={options}
          size="compact"
          value={value}
        />
      </div>
    );
  }
  return (
    <div
      className="rich-step-choice-field"
      {...(presentation === 'track' ? { 'data-presentation': 'track' } : {})}
    >
      <span className={`rich-step-field-label${hideLegend ? ' visually-hidden' : ''}`}>
        {label}
      </span>
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
    </div>
  );
}

/**
 * A number on the same row as its label (§4.3's `.inum`).
 *
 * The card's width and height were reachable only by dragging a corner, which is
 * the right gesture for "about this big" and the wrong one for "396". A creator
 * matching a spec needs to type the number, and a creator who dragged needs to
 * read back what they landed on — the field does both.
 *
 * `placeholder` carries the inherited value, so an empty box reads as "auto"
 * rather than as zero.
 */
export function PropertyNumberField({
  label,
  max,
  min,
  onChange,
  placeholder,
  step = 1,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number | null) => void;
  placeholder?: string;
  step?: number;
  suffix?: string;
  value: number | null;
}) {
  return (
    <div className="rich-step-choice-field" data-presentation="number">
      <span className="rich-step-field-label">{label}</span>
      <span className="rich-step-number-value">
        <input
          aria-label={label}
          inputMode="numeric"
          max={max}
          min={min}
          onChange={(event) => {
            const next = Number.parseInt(event.currentTarget.value, 10);
            onChange(Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : null);
          }}
          placeholder={placeholder}
          step={step}
          type="number"
          value={value === null ? '' : String(value)}
        />
        {/* "auto px" is not a measurement — the unit belongs to a number. */}
        {suffix && value !== null ? <span aria-hidden="true">{suffix}</span> : null}
      </span>
    </div>
  );
}

export function PropertyColorField({
  apcaLc,
  contrast,
  customized,
  hideLegend = false,
  label,
  onChange,
  onReset,
  presentation = 'segmented',
  resetLabel = authoringText('Theme'),
  value,
}: {
  /** APCA Lc for the same pair. WCAG stays the gate; this rides along (§7.2). */
  apcaLc?: number;
  contrast?: ContrastEvaluation;
  customized: boolean;
  hideLegend?: boolean;
  label: string;
  onChange: (value: string) => void;
  onReset: () => void;
  presentation?: PropertyFieldPresentation;
  resetLabel?: string;
  value: string;
}) {
  if (presentation === 'menu') {
    return (
      <PropertyColorPill
        contrast={contrast}
        customized={customized}
        label={label}
        onChange={onChange}
        onReset={onReset}
        resetLabel={resetLabel}
        value={value}
      />
    );
  }
  return (
    <div className="rich-step-color-field">
      <span className={`rich-step-field-label${hideLegend ? ' visually-hidden' : ''}`}>
        {label}
      </span>
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
          {apcaLc === undefined ? null : (
            <small data-contrast-apca>
              {authoringText('APCA Lc {value}', { value: Math.round(Math.abs(apcaLc)) })}
            </small>
          )}
        </output>
      ) : null}
    </div>
  );
}

/**
 * A colour property as the prototype draws it: a swatch pill that opens the
 * palette (§4.3).
 *
 * Nothing is removed — the quick colours, the custom picker and the reset all
 * live in the menu. What changes is that they cost one row instead of nine, which
 * is what let the five appearance tabs collapse into five plain rows.
 *
 * Contrast is an inline warning on the offending control and only when it is
 * offending (§7.2). The permanent AA/AAA readout it replaces was an audit panel
 * in a 320px popover; the audit belongs to Operations → Check.
 */
function PropertyColorPill({
  contrast,
  customized,
  label,
  onChange,
  onReset,
  resetLabel,
  value,
}: {
  contrast?: ContrastEvaluation;
  customized: boolean;
  label: string;
  onChange: (value: string) => void;
  onReset: () => void;
  resetLabel: string;
  value: string;
}) {
  const failing = contrast != null && contrast.state !== 'pass';
  return (
    <div className="rich-step-color-field" data-presentation="menu">
      <span className="rich-step-field-label">{label}</span>
      <AuthoringPopover
        align="end"
        content={
          <div className="inspector-pill-menu">
            <div
              className="rich-step-color-swatches"
              role="group"
              aria-label={authoringText('{label} color', { label })}
            >
              {QUICK_COLORS.map((color) => (
                <button
                  key={color}
                  aria-label={authoringText('Use {color} for {label}', {
                    color,
                    label: label.toLocaleLowerCase(),
                  })}
                  aria-pressed={value.toLowerCase() === color}
                  className={value.toLowerCase() === color ? 'selected' : undefined}
                  onClick={() => onChange(color)}
                  style={{ '--storyboard-swatch': color } as CSSProperties}
                  type="button"
                >
                  {value.toLowerCase() === color ? (
                    <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </div>
            <label className="rich-step-custom-color">
              <Palette size={13} strokeWidth={2} aria-hidden="true" />
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
        }
        portal
        trigger={
          <button className="inspector-pill" type="button" aria-label={label}>
            <span className="inspector-pill-swatch" style={{ background: value }} aria-hidden="true" />
            <span className="inspector-pill-value">
              {customized ? authoringText('Custom') : authoringText('Brand')}
            </span>
            {/* The prototype marks an override with a dot rather than a word. */}
            {customized ? <span className="inspector-pill-override" aria-hidden="true" /> : null}
            <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>
        }
      />
      {/* One quiet line. The Lc figure is the audit's, in Operations → Check (§7.2). */}
      {failing && contrast ? (
        <output
          className={`inspector-warning ${contrast.state}`}
          data-contrast-state={contrast.state}
        >
          {contrastMessage(contrast)}
        </output>
      ) : null}
    </div>
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
