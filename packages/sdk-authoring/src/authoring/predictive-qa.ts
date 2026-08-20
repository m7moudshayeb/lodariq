/**
 * Predictive layout QA (§7.3) — the empty lane.
 *
 * Nobody in the category ships "this tooltip will overflow at 375px". Webflow's
 * Audit panel is the closest analogue anywhere and explicitly does not check
 * contrast; Supademo's audit is engagement scoring, not layout simulation.
 * Lodariq already owns the placement math, so the marginal cost is low.
 *
 * Pure simulation over captured geometry: no DOM, no rendering, no compile step
 * (ADR-0003 — this is preview-only analysis and must never become one). Each
 * finding carries the step it belongs to and the inspector section that fixes it,
 * which is the Webflow affordance that turns a report into a workflow.
 */
import { authoringText } from '../i18n';

/** The viewports every step is simulated against (§7.3). */
export const QA_VIEWPORTS = [375, 768, 1280, 1920] as const;
export type QaViewportWidth = (typeof QA_VIEWPORTS)[number];

/** WCAG minimum touch target, already an existing requirement. */
export const QA_MIN_TAP_TARGET_PX = 44;

export type QaFindingKind =
  | 'card-overflows-viewport'
  | 'card-occludes-target'
  | 'placement-flipped'
  | 'text-overflows-longest-locale'
  | 'target-below-fold'
  | 'tap-target-too-small';

export type QaSeverity = 'blocker' | 'warning';

export interface QaFinding {
  readonly kind: QaFindingKind;
  readonly stepId: string;
  /** Which simulated viewport surfaced it, when that matters. */
  readonly viewportWidth?: QaViewportWidth;
  readonly locale?: string;
  readonly message: string;
  readonly severity: QaSeverity;
  /**
   * Where the fix lives. `jump-to-element` selects the step and opens this
   * section — a passive list of problems gets ignored; one with "take me there"
   * gets fixed.
   */
  readonly fixSection: 'placement' | 'style' | 'target' | 'actions';
}

export interface QaRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface QaTapTarget {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export type QaPlacement = 'top' | 'right' | 'bottom' | 'left';

export interface QaStepInput {
  readonly stepId: string;
  /** Card size as authored. Simulation moves it, never resizes it. */
  readonly card: { readonly width: number; readonly height: number };
  /** Captured target geometry, in page coordinates. */
  readonly target: QaRect;
  readonly placement: QaPlacement;
  /** Longest translated string for this step, per locale. */
  readonly longestText?: { readonly locale: string; readonly characters: number };
  readonly tapTargets?: readonly QaTapTarget[];
  /** True when the runtime will scroll the target into view before showing. */
  readonly scrollsIntoView?: boolean;
  readonly rtl?: boolean;
}

export interface QaOptions {
  /** Viewport height used for fold and overflow checks. */
  readonly viewportHeight?: number;
  /** Characters a card of this width fits per line, at body size. */
  readonly charactersPerLine?: number;
  readonly gapPx?: number;
}

const DEFAULT_VIEWPORT_HEIGHT = 800;
/** Roughly 8px per character at the body size the recipes use. */
const DEFAULT_CHARACTERS_PER_LINE_PER_PX = 1 / 8;
const DEFAULT_GAP_PX = 12;

/** Simulates one step across every viewport and returns what would go wrong. */
export function simulateStep(step: QaStepInput, options: QaOptions = {}): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  const viewportHeight = options.viewportHeight ?? DEFAULT_VIEWPORT_HEIGHT;
  const gap = options.gapPx ?? DEFAULT_GAP_PX;

  for (const viewportWidth of QA_VIEWPORTS) {
    const placed = placeCard(step, viewportWidth, viewportHeight, gap);
    // Only report overflow the runtime genuinely cannot shift away, so the report
    // does not cry wolf on every narrow viewport (§13).
    if (
      placed.rect.width > viewportWidth ||
      placed.rect.height > viewportHeight ||
      placed.rect.top < 0 ||
      placed.rect.top + placed.rect.height > viewportHeight
    ) {
      findings.push({
        kind: 'card-overflows-viewport',
        stepId: step.stepId,
        viewportWidth,
        severity: 'blocker',
        message: authoringText('The card runs off the screen at {width}px wide.', {
          width: viewportWidth,
        }),
        fixSection: 'placement',
      });
    }
    if (rectsOverlap(placed.rect, clampTarget(step.target, viewportWidth))) {
      findings.push({
        kind: 'card-occludes-target',
        stepId: step.stepId,
        viewportWidth,
        severity: 'blocker',
        message: authoringText('The card covers the thing it points at, at {width}px wide.', {
          width: viewportWidth,
        }),
        fixSection: 'placement',
      });
    }
    if (placed.placement !== placed.preferred) {
      findings.push({
        kind: 'placement-flipped',
        stepId: step.stepId,
        viewportWidth,
        severity: 'warning',
        message: authoringText('At {width}px the card appears {placement} instead.', {
          width: viewportWidth,
          placement: placed.placement,
        }),
        fixSection: 'placement',
      });
    }
  }

  if (step.target.top > viewportHeight && !step.scrollsIntoView) {
    findings.push({
      kind: 'target-below-fold',
      stepId: step.stepId,
      severity: 'blocker',
      message: authoringText('The target starts below the fold and nothing scrolls to it.'),
      fixSection: 'target',
    });
  }

  const perLine = options.charactersPerLine ?? step.card.width * DEFAULT_CHARACTERS_PER_LINE_PER_PX;
  if (step.longestText && perLine > 0) {
    const lines = Math.ceil(step.longestText.characters / perLine);
    // Body line-height at the recipes' size, plus the card's own padding.
    const requiredHeight = lines * 20 + 48;
    if (requiredHeight > step.card.height) {
      findings.push({
        kind: 'text-overflows-longest-locale',
        stepId: step.stepId,
        locale: step.longestText.locale,
        severity: 'warning',
        message: authoringText('The {locale} text needs more room than the card has.', {
          locale: step.longestText.locale,
        }),
        fixSection: 'style',
      });
    }
  }

  for (const tapTarget of step.tapTargets ?? []) {
    if (tapTarget.width >= QA_MIN_TAP_TARGET_PX && tapTarget.height >= QA_MIN_TAP_TARGET_PX) {
      continue;
    }
    findings.push({
      kind: 'tap-target-too-small',
      stepId: step.stepId,
      severity: 'blocker',
      message: authoringText('“{label}” is smaller than {size}×{size} and hard to tap.', {
        label: tapTarget.label,
        size: QA_MIN_TAP_TARGET_PX,
      }),
      fixSection: 'actions',
    });
  }

  return findings;
}

export function simulateDocument(
  steps: readonly QaStepInput[],
  options: QaOptions = {},
): readonly QaFinding[] {
  return steps.flatMap((step) => simulateStep(step, options));
}

interface PlacedCard {
  readonly rect: QaRect;
  readonly placement: QaPlacement;
  /**
   * The side the creator asked for, after RTL mirroring. A flip is measured
   * against this and not the raw preference, or every RTL step would report a
   * flip for landing exactly where it was meant to.
   */
  readonly preferred: QaPlacement;
}

/**
 * Where the runtime would actually put the card: preferred side, then the
 * opposite, then whichever fits — shifting horizontally into view the way the
 * real placement does. RTL mirrors left and right, the only thing direction
 * changes about placement.
 *
 * The captured target geometry comes from one viewport, so the target is first
 * clamped into the simulated one: a responsive app moves its own elements, and a
 * simulation that assumed otherwise would flag every right-hand target at 375px.
 */
function placeCard(
  step: QaStepInput,
  viewportWidth: number,
  viewportHeight: number,
  gap: number,
): PlacedCard {
  const target = clampTarget(step.target, viewportWidth);
  const simulated: QaStepInput = { ...step, target };
  const order = placementOrder(step.placement, step.rtl ?? false);
  const preferred = order[0] ?? step.placement;
  for (const placement of order) {
    const rect = shiftIntoView(rectFor(simulated, placement, gap), viewportWidth);
    const fitsVertically = rect.top >= 0 && rect.top + rect.height <= viewportHeight;
    const clearsTarget = !rectsOverlap(rect, target);
    if (fitsVertically && clearsTarget) return { rect, placement, preferred };
  }
  return {
    rect: shiftIntoView(rectFor(simulated, preferred, gap), viewportWidth),
    placement: preferred,
    preferred,
  };
}

function clampTarget(target: QaRect, viewportWidth: number): QaRect {
  const width = Math.min(target.width, viewportWidth);
  const left = Math.max(0, Math.min(target.left, viewportWidth - width));
  return { ...target, left, width };
}

function shiftIntoView(rect: QaRect, viewportWidth: number): QaRect {
  if (rect.width > viewportWidth) return { ...rect, left: 0 };
  const left = Math.max(0, Math.min(rect.left, viewportWidth - rect.width));
  return { ...rect, left };
}

const OPPOSITE: Readonly<Record<QaPlacement, QaPlacement>> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

function placementOrder(preferred: QaPlacement, rtl: boolean): readonly QaPlacement[] {
  const start = rtl && (preferred === 'left' || preferred === 'right') ? OPPOSITE[preferred] : preferred;
  const rest: QaPlacement[] = ['bottom', 'top', 'right', 'left'];
  return [start, OPPOSITE[start], ...rest.filter((item) => item !== start && item !== OPPOSITE[start])];
}

function rectFor(step: QaStepInput, placement: QaPlacement, gap: number): QaRect {
  const { card, target } = step;
  const centreX = target.left + target.width / 2 - card.width / 2;
  const centreY = target.top + target.height / 2 - card.height / 2;
  if (placement === 'top') {
    return { left: centreX, top: target.top - gap - card.height, ...card };
  }
  if (placement === 'bottom') {
    return { left: centreX, top: target.top + target.height + gap, ...card };
  }
  if (placement === 'left') {
    return { left: target.left - gap - card.width, top: centreY, ...card };
  }
  return { left: target.left + target.width + gap, top: centreY, ...card };
}

function rectsOverlap(a: QaRect, b: QaRect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/**
 * Warning-only for one release (§13). A report with fifteen items that are mostly
 * fine trains creators to ignore it, which is worse than no report — so nothing
 * here blocks publish until its accept rate has been measured.
 */
export const QA_BLOCKS_PUBLISH = false;

export function qaBlockers(findings: readonly QaFinding[]): readonly QaFinding[] {
  return QA_BLOCKS_PUBLISH ? findings.filter((finding) => finding.severity === 'blocker') : [];
}
