import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LodariqBlock } from '@lodariq/schema';
import { ChevronDown, ClipboardPaste, Copy, Layers, Palette, Plus } from 'lucide-react';

/*
 * WIRE_DASHBOARD: printed beside the rows they duplicate (§3.1a), not taught
 * separately. The bindings themselves belong to the keyboard map the workspace
 * owns; these are the prototype's, shown so the row and its accelerator are
 * learned in one place.
 */
const COPY_STYLE_SHORTCUT = '⌘⌥C';
const PASTE_STYLE_SHORTCUT = '⌘⌥V';
import { authoringText } from '../../../i18n';
import { extractTourStepStyle, styleSnapshotHash } from '../../step-style-recipes';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { placeFloatingMenu } from './menu-placement';

/**
 * The step's named style, on the toolbar (§4.2a, §6.2).
 *
 * The toolbar's middle belongs to what the creator is editing, and for a whole
 * step that is which named style it wears — not a row of links into the
 * inspector, which already has its own way in. Naming the current style on the
 * bar is also the only place a creator learns that named styles exist.
 *
 * Which style is current is derived, not stored: a step wears a named style when
 * its own style hashes to that recipe. Anything else is genuinely custom, and
 * saying so is more honest than showing a name the step has since drifted from.
 */
export function ToolbarStylePicker({
  controller,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);

  const current = styleSnapshotHash(extractTourStepStyle(step));
  const applied = snapshot.stepStyleRecipes.find((recipe) => recipe.contentHash === current);
  const selectedCount = snapshot.selectedStepIds.size;

  /**
   * The toolbar clips its overflow on purpose, and its transform makes even a
   * fixed child clip with it — so the menu is portalled out and positioned from
   * the trigger, the same way the insert menu escapes the same bar.
   */
  useEffect(() => {
    if (!open) return;
    const view = trigger.current?.ownerDocument.defaultView;
    if (!view) return;
    const place = (): void => {
      const next = placeFloatingMenu(trigger.current, menu.current);
      if (next) setAnchor(next);
    };
    const node = menu.current;
    if (node && typeof node.showPopover === 'function' && !node.matches(':popover-open')) {
      node.showPopover();
    }
    place();
    /*
     * Asking the host for room changes the viewport this menu is solved inside,
     * and the `resize` listener below only fires once that has happened — so the
     * first placement is against the old, smaller frame. Placing again after the
     * frame grows is what keeps the last rows on screen.
     */
    controller.setFrameMenuOpen(true);
    const onAway = (event: Event): void => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
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
      controller.setFrameMenuOpen(false);
    };
  }, [controller, open]);

  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };

  return (
    <div className="toolbar-style-picker" ref={root}>
      <button
        type="button"
        className="toolbar-style-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        ref={trigger}
      >
        <Palette size={14} strokeWidth={2} aria-hidden="true" />
        <span>{applied ? applied.name : authoringText('Custom style')}</span>
        <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <div
              className="toolbar-style-menu"
              popover="manual"
              ref={menu}
              role="menu"
              style={anchor ? { left: anchor.left, top: anchor.top } : { visibility: 'hidden' }}
            >
          {snapshot.stepStyleRecipes.length ? (
            <>
              <p className="toolbar-style-group" aria-hidden="true">
                {authoringText('Named step style')}
              </p>
              {snapshot.stepStyleRecipes.map((recipe) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={recipe.id === applied?.id}
                  key={recipe.id}
                  data-style-recipe={recipe.id}
                  onClick={() => run(() => controller.applyStepStyleRecipe(recipe.id, step.id))}
                >
                  <span
                    aria-hidden="true"
                    className="toolbar-style-swatch"
                    style={{
                      background: recipe.thumbnail.surfaceColor,
                      borderColor: recipe.thumbnail.actionColor,
                    }}
                  />
                  {recipe.name}
                </button>
              ))}
            </>
          ) : null}
          {/* The named styles above are what a step *is*; these are what you do
              to it, so the prototype rules a line between the two groups. */}
          {snapshot.stepStyleRecipes.length ? (
            <div aria-hidden="true" className="chrome-menu-separator" />
          ) : null}
          <button
            type="button"
            role="menuitem"
            data-style-action="copy"
            onClick={() => run(() => controller.copyStepStyle(step.id))}
          >
            <Copy size={14} strokeWidth={2} aria-hidden="true" />
            <span>{authoringText('Copy style')}</span>
            <kbd>{COPY_STYLE_SHORTCUT}</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            data-style-action="paste"
            disabled={!snapshot.stepStyleClipboardAvailable}
            onClick={() => run(() => controller.pasteStepStyle(step.id))}
          >
            <ClipboardPaste size={14} strokeWidth={2} aria-hidden="true" />
            <span>{authoringText('Paste style')}</span>
            <kbd>{PASTE_STYLE_SHORTCUT}</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            data-style-action="apply-to"
            disabled={!snapshot.stepStyleClipboardAvailable}
            onClick={() => run(() => controller.applyCopiedStyleToSelected(step.id))}
          >
            <Layers size={14} strokeWidth={2} aria-hidden="true" />
            {/* A batch action states its blast radius before it runs (§6.2). */}
            <span>
              {selectedCount > 0
                ? authoringText('Apply to {count} steps', { count: selectedCount })
                : authoringText('Apply to this step')}
            </span>
          </button>
              <button
                type="button"
                role="menuitem"
                data-style-action="create"
                onClick={() => run(() => controller.saveStepStyleRecipe(step.id))}
              >
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
                <span>{authoringText('Create style from this step')}</span>
              </button>
            </div>,
            (trigger.current?.ownerDocument ?? document).body,
          )
        : null}
    </div>
  );
}
