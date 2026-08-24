import { useState } from 'react';
import {
  ANCHOR_OFFSET_PX_LIMITS,
  type LodariqBlock,
  type TourMotionPresentation,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { TooltipPlacement } from '../../document-ops';
import type { LocalAuthoringFrameController } from '../controller';
import { ChevronDown, Compass, Sparkles, Zap } from '../design-system';
import {
  ANCHOR_ALIGN_OPTIONS,
  MOTION_EASING_OPTIONS,
  MOTION_RECIPE_OPTIONS,
  PLACEMENT_SIDE_OPTIONS,
  motionRecipeLabel,
  placementSideLabel,
} from '../properties/options';
import {
  ChromeMenu,
  ChromeMenuHeading,
  ChromeMenuItem,
  ChromeMenuNote,
  ChromeMenuNumber,
  ChromeMenuSeparator,
} from './chrome-menu';

/**
 * The toolbar's middle when nothing inside the card is selected (§4.2a).
 *
 * A whole step has four things a creator changes without opening anything: the
 * named style it wears, which side of its target it sits on, what its buttons
 * do, and how it arrives. The style picker is its own control; these are the
 * other three, in the prototype's order.
 *
 * Placement and motion are direct — they open a menu and commit. Actions is not:
 * a button row is a list, and a list belongs in the inspector, so this control
 * opens that section rather than growing a second editor on the bar.
 *
 * Reference: authoring-spec.html → `toolbarMiddle()` step branch
 */
export function OverlayToolbarStepControls({
  controller,
  onOpenInspectorSection,
  step,
  tooltip,
}: {
  readonly controller: LocalAuthoringFrameController;
  readonly onOpenInspectorSection: (section: string) => void;
  readonly step: LodariqBlock;
  readonly tooltip: LodariqBlock;
}) {
  const [placementTrigger, setPlacementTrigger] = useState<HTMLElement | null>(null);
  const [motionTrigger, setMotionTrigger] = useState<HTMLElement | null>(null);
  const [openMenu, setOpenMenu] = useState<'placement' | 'motion' | null>(null);
  const placement = tooltip.props.placement ?? 'bottom';
  const align = tooltip.props.anchorAlign ?? 'center';
  const offsetPx = tooltip.props.anchorOffsetPx ?? DEFAULT_ANCHOR_OFFSET_PX;
  const motion = step.props.motion;
  const closeMenu = (): void => setOpenMenu(null);
  const frameMenu = (open: boolean): void => controller.setFrameMenuOpen(open);

  return (
    <>
      <button
        type="button"
        aria-expanded={openMenu === 'placement'}
        aria-haspopup="menu"
        className="overlay-toolbar-control"
        data-toolbar-control="placement"
        onClick={() => setOpenMenu((open) => (open === 'placement' ? null : 'placement'))}
        ref={setPlacementTrigger}
        title={authoringText('Placement')}
      >
        <Compass size={14} strokeWidth={2} aria-hidden="true" />
        <span>{placementSideLabel(placement)}</span>
        <ChevronDown size={11} strokeWidth={2} aria-hidden="true" />
      </button>
      {openMenu === 'placement' ? (
        <ChromeMenu
          label={authoringText('Placement')}
          onClose={closeMenu}
          onFrameMenuChange={frameMenu}
          trigger={placementTrigger}
        >
          <ChromeMenuHeading>{authoringText('Placement — or drag the compass')}</ChromeMenuHeading>
          {PLACEMENT_SIDE_OPTIONS.map((option) => (
            <ChromeMenuItem
              key={option.value}
              label={option.label}
              onSelect={() => {
                controller.setTooltipPlacement(tooltip.id, option.value as TooltipPlacement, {
                  align,
                  offsetPx,
                });
                closeMenu();
              }}
              selected={placement === option.value}
              value={option.value}
            />
          ))}
          <ChromeMenuSeparator />
          {ANCHOR_ALIGN_OPTIONS.map((option) => (
            <ChromeMenuItem
              key={option.value}
              label={option.label}
              onSelect={() => {
                controller.setTooltipPlacement(tooltip.id, placement as TooltipPlacement, {
                  align: option.value,
                  offsetPx,
                });
                closeMenu();
              }}
              selected={align === option.value}
              value={`align:${option.value}`}
            />
          ))}
          <ChromeMenuSeparator />
          {/*
            The gap to the target. It is the third thing the compass sets by
            drag, so it belongs with the two the menu already mirrors — and this
            is the only way to reach an exact number from the keyboard.
          */}
          <ChromeMenuHeading>{authoringText('Offset')}</ChromeMenuHeading>
          <ChromeMenuNumber
            max={ANCHOR_OFFSET_PX_LIMITS.max}
            min={ANCHOR_OFFSET_PX_LIMITS.min}
            onChange={(next) =>
              controller.setTooltipPlacement(tooltip.id, placement as TooltipPlacement, {
                align,
                offsetPx: next,
              })
            }
            step={ANCHOR_OFFSET_PX_LIMITS.step}
            value={offsetPx}
          />
          <ChromeMenuSeparator />
          <ChromeMenuNote>
            {authoringText('If it will not fit on that side, it flips to the opposite one.')}
          </ChromeMenuNote>
        </ChromeMenu>
      ) : null}

      <button
        type="button"
        className="overlay-toolbar-control"
        data-toolbar-control="actions"
        onClick={() => onOpenInspectorSection('actions')}
        title={authoringText('Actions')}
      >
        <Zap size={14} strokeWidth={2} aria-hidden="true" />
        <span>{authoringText('Actions')}</span>
      </button>

      <button
        type="button"
        aria-expanded={openMenu === 'motion'}
        aria-haspopup="menu"
        className="overlay-toolbar-control"
        data-toolbar-control="motion"
        onClick={() => setOpenMenu((open) => (open === 'motion' ? null : 'motion'))}
        ref={setMotionTrigger}
        title={authoringText('Entry motion')}
      >
        <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
        {/* The bar prints the recipe, as the prototype does; the longer phrasing
            belongs in the menu, where there is room to say what it means. */}
        <span>{motion ? motionRecipeLabel(motion.recipe) : authoringText('None')}</span>
        <ChevronDown size={11} strokeWidth={2} aria-hidden="true" />
      </button>
      {openMenu === 'motion' ? (
        <ChromeMenu
          label={authoringText('Entry motion')}
          onClose={closeMenu}
          onFrameMenuChange={frameMenu}
          trigger={motionTrigger}
        >
          <ChromeMenuHeading>{authoringText('Entry motion')}</ChromeMenuHeading>
          <ChromeMenuItem
            label={authoringText('No step motion')}
            onSelect={() => {
              controller.setBlockPresentation(step.id, { motion: undefined });
              closeMenu();
            }}
            selected={!motion}
            value="none"
          />
          {MOTION_RECIPE_OPTIONS.map((option) => (
            <ChromeMenuItem
              key={option.value}
              label={option.label}
              onSelect={() => {
                controller.setBlockPresentation(step.id, {
                  motion: withRecipe(motion, option.value),
                });
                closeMenu();
              }}
              selected={motion?.recipe === option.value}
              value={option.value}
            />
          ))}
          <ChromeMenuSeparator />
          <ChromeMenuHeading>{authoringText('Easing')}</ChromeMenuHeading>
          {MOTION_EASING_OPTIONS.map((option) => (
            <ChromeMenuItem
              disabled={!motion}
              key={option.value}
              label={option.label}
              onSelect={() => {
                if (!motion) return;
                controller.setBlockPresentation(step.id, {
                  motion: { ...motion, easing: option.value },
                });
                closeMenu();
              }}
              selected={motion?.easing === option.value}
              value={`easing:${option.value}`}
            />
          ))}
          {motion ? (
            <>
              <ChromeMenuSeparator />
              <ChromeMenuHeading>{authoringText('Duration')}</ChromeMenuHeading>
              <ChromeMenuNumber
                max={MOTION_DURATION_MS_LIMITS.max}
                min={MOTION_DURATION_MS_LIMITS.min}
                onChange={(durationMs) =>
                  controller.setBlockPresentation(step.id, { motion: { ...motion, durationMs } })
                }
                step={MOTION_DURATION_MS_LIMITS.step}
                value={motion.durationMs}
              />
            </>
          ) : null}
          <ChromeMenuSeparator />
          <ChromeMenuNote>
            {authoringText(
              'Reduced motion is honoured automatically — the recipe falls back to none.',
            )}
          </ChromeMenuNote>
        </ChromeMenu>
      ) : null}
    </>
  );
}

/** Keeps duration and easing when only the recipe changes. */
function withRecipe(
  motion: TourMotionPresentation | undefined,
  recipe: TourMotionPresentation['recipe'],
): TourMotionPresentation {
  return {
    recipe,
    durationMs: motion?.durationMs ?? DEFAULT_MOTION_DURATION_MS,
    easing: motion?.easing ?? 'standard',
    reducedMotion: 'none',
  };
}

/** The prototype's own default, and the midpoint of the schema's range. */
const DEFAULT_MOTION_DURATION_MS = 280;

/** The gap the overlay itself assumes when a step has never set one. */
const DEFAULT_ANCHOR_OFFSET_PX = 12;

/** TourMotionPresentation.durationMs, which the schema bounds at 100-1200. */
const MOTION_DURATION_MS_LIMITS = { min: 100, max: 1_200, step: 20 } as const;
