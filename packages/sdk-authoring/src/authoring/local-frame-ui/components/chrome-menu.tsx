import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { authoringText } from '../../../i18n';
import { Minus, Plus } from '../design-system';
import { placeFloatingMenu } from './menu-placement';

/**
 * The one floating menu every creator-chrome control opens (§4.2a).
 *
 * Toolbar controls, gutter handles, filmstrip rows, the mode pill and inspector
 * pickers all open the same popover, so it is a component rather than a shape
 * each surface redraws. Its parts mirror the prototype exactly: a section head,
 * rows carrying an icon, a label and the shortcut that duplicates them, hairline
 * separators, quiet notes, and the two dense layouts (block grid, swatch row).
 *
 * It portals to the document body: the toolbar clips its overflow on purpose and
 * its transform traps even fixed children, so a menu rendered inline would be a
 * stub. `popover` puts it in the top layer, above every surface in the frame.
 *
 * Reference: authoring-spec.html → `menu()` · authoring-ux-model.md §4.2a
 */
export function ChromeMenu({
  align = 'left',
  children,
  label,
  onClose,
  onFrameMenuChange,
  trigger,
}: {
  /** Which edge of the trigger the menu lines up with. */
  readonly align?: 'left' | 'right';
  readonly children: ReactNode;
  readonly label?: string;
  readonly onClose: () => void;
  /**
   * The frame is sized to its content, so an open menu needs room the iframe does
   * not have. The host grows it while this is true.
   */
  readonly onFrameMenuChange?: (open: boolean) => void;
  readonly trigger: HTMLElement | null;
}) {
  const menu = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const place = useCallback((): void => {
    const next = placeFloatingMenu(trigger, menu.current, align);
    if (next) setPosition(next);
  }, [align, trigger]);

  useLayoutEffect(() => {
    const node = menu.current;
    if (node && typeof node.showPopover === 'function' && !node.matches(':popover-open')) {
      node.showPopover();
    }
    place();
  }, [place]);

  useEffect(() => {
    const view = trigger?.ownerDocument.defaultView;
    if (!view) return;
    onFrameMenuChange?.(true);
    const onAway = (event: Event): void => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger?.contains(target)) onClose();
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    view.addEventListener('resize', place);
    view.addEventListener('scroll', place, true);
    view.document.addEventListener('pointerdown', onAway, true);
    view.document.addEventListener('keydown', onEscape);
    return () => {
      view.removeEventListener('resize', place);
      view.removeEventListener('scroll', place, true);
      view.document.removeEventListener('pointerdown', onAway, true);
      view.document.removeEventListener('keydown', onEscape);
      onFrameMenuChange?.(false);
    };
  }, [onClose, onFrameMenuChange, place, trigger]);

  if (!trigger) return null;
  return createPortal(
    <div
      aria-label={label}
      className="chrome-menu"
      data-chrome-menu="true"
      popover="manual"
      ref={menu}
      role="menu"
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
    >
      {children}
    </div>,
    trigger.ownerDocument.body,
  );
}

export function ChromeMenuHeading({ children }: { readonly children: ReactNode }) {
  return <p className="chrome-menu-heading">{children}</p>;
}

export function ChromeMenuSeparator() {
  return <div aria-hidden="true" className="chrome-menu-separator" />;
}

/** Explains the rule behind the rows above it — never an instruction to memorise. */
export function ChromeMenuNote({ children }: { readonly children: ReactNode }) {
  return <p className="chrome-menu-note">{children}</p>;
}

export function ChromeMenuItem({
  disabled,
  icon,
  label,
  onSelect,
  selected,
  shortcut,
  value,
}: {
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly onSelect: () => void;
  /** Renders as a radio row when set, so the current value reads without colour. */
  readonly selected?: boolean;
  readonly shortcut?: string;
  readonly value?: string;
}) {
  return (
    <button
      type="button"
      className="chrome-menu-item"
      {...(selected === undefined
        ? { role: 'menuitem' }
        : { role: 'menuitemradio', 'aria-checked': selected })}
      data-menu-value={value}
      disabled={disabled}
      onClick={onSelect}
    >
      {icon}
      <span>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
}

/** Four-up: block types are recognised by shape faster than they are read. */
export function ChromeMenuGrid({ children }: { readonly children: ReactNode }) {
  return <div className="chrome-menu-grid">{children}</div>;
}

export function ChromeMenuSwatches({ children }: { readonly children: ReactNode }) {
  return <div className="chrome-menu-swatches">{children}</div>;
}

export function ChromeMenuSwatch({
  colour,
  label,
  onSelect,
  selected,
}: {
  readonly colour: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly selected: boolean;
}) {
  return (
    <button
      type="button"
      aria-checked={selected}
      aria-label={label}
      className="chrome-menu-swatch"
      data-selected={selected}
      onClick={onSelect}
      role="menuitemradio"
      style={{ background: colour }}
      title={label}
    />
  );
}

/**
 * A number, three ways: type it, step it, or drag it. The limits are printed
 * under the slider because they are the part a creator cannot guess.
 */
export function ChromeMenuNumber({
  max,
  min,
  onChange,
  step = 1,
  value,
}: {
  readonly max: number;
  readonly min: number;
  readonly onChange: (next: number) => void;
  readonly step?: number;
  readonly value: number;
}) {
  const bound = (next: number): number => clamp(snap(next, step), min, max);
  const commit = (next: number): void => onChange(bound(next));
  /** The slider shows every value it passes; only the released one commits. */
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? value;
  return (
    <div className="chrome-menu-number">
      <div className="chrome-menu-number-row">
        <input
          aria-label={authoringText('Value')}
          inputMode="numeric"
          onChange={(event) => {
            const next = Number.parseFloat(event.target.value);
            if (Number.isFinite(next)) commit(next);
          }}
          value={String(shown)}
        />
        <button
          type="button"
          aria-label={authoringText('Decrease')}
          className="chrome-menu-step"
          onClick={() => commit(value - step)}
        >
          <Minus size={13} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={authoringText('Increase')}
          className="chrome-menu-step"
          onClick={() => commit(value + step)}
        >
          <Plus size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <input
        aria-label={authoringText('Value')}
        className="ui-range"
        max={max}
        min={min}
        onChange={(event) => setDragging(bound(Number.parseFloat(event.target.value)))}
        onKeyUp={() => {
          if (dragging !== null) commit(dragging);
          setDragging(null);
        }}
        onPointerUp={() => {
          if (dragging !== null) commit(dragging);
          setDragging(null);
        }}
        step={step}
        type="range"
        value={shown}
      />
      <div className="chrome-menu-bounds">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/** Free text that commits as it is typed — there is no Apply button anywhere. */
export function ChromeMenuTextArea({
  onChange,
  onDone,
  placeholder,
  rows = 3,
  value,
}: {
  readonly onChange: (next: string) => void;
  readonly onDone: () => void;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly value: string;
}) {
  return (
    <div className="chrome-menu-text">
      <textarea
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
      <div className="chrome-menu-text-actions">
        <button type="button" className="chrome-menu-step" onClick={onDone}>
          {authoringText('Done')}
        </button>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function snap(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}
