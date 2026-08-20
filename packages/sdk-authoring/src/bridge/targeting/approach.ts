/**
 * Approach recipes (§4.4, audit #2).
 *
 * When a creator targets something that took navigation to reach, Lodariq
 * already knows how they got there — it observed the clicks. Capturing that as a
 * replayable, editable, plain-language recipe is what turns a `Needs context`
 * target from a warning into a plan. Nobody in the category has this.
 *
 * Two hard rules:
 *   - Every step waits on a **semantic condition** — an element appears, a route
 *     changes, text appears — never a timer. A timer is how WalkMe-class tools
 *     end up flaky.
 *   - The recipe is editable, reorderable and trimmable from the first version.
 *     Recording incidental clicks is inevitable; a black box would be worse than
 *     no recording (§13).
 */
import type { StepChoreographyWait, TargetApproach, TargetApproachLeg } from '@lodariq/schema';
import { APPROACH_MAX_LEGS } from '@lodariq/schema';
import { authoringText } from '../../i18n';
import { describeTarget } from './legibility';

export type ApproachStepKind = 'click' | 'await-element' | 'await-route' | 'await-text';

export interface ApproachStep {
  readonly id: string;
  readonly kind: ApproachStepKind;
  /** Accessible name of the thing acted on or waited for. Never a selector. */
  readonly subject: string;
  /** Route pattern for `await-route`, absent otherwise. Diagnostic only. */
  readonly route?: string;
}

export interface ApproachRecipe {
  readonly steps: readonly ApproachStep[];
}

/** One recorded observation from the picker's click trail. */
export interface ApproachObservation {
  readonly element: Element;
  /** Route after the click, if the click changed it. */
  readonly route?: string;
  /** A layer that appeared as a result — a menu, a dialog. */
  readonly revealed?: Element;
}

let sequence = 0;
function stepId(): string {
  sequence += 1;
  return `approach_${sequence}`;
}

/**
 * Builds a recipe from what the picker observed, collapsing an observation into
 * the click plus whatever the click made true.
 */
export function recordApproach(observations: readonly ApproachObservation[]): ApproachRecipe {
  const steps: ApproachStep[] = [];
  for (const observation of observations) {
    const subject = subjectOf(observation.element);
    steps.push({ id: stepId(), kind: 'click', subject });
    if (observation.route) {
      steps.push({ id: stepId(), kind: 'await-route', subject: observation.route, route: observation.route });
    }
    if (observation.revealed) {
      steps.push({
        id: stepId(),
        kind: 'await-element',
        subject: subjectOf(observation.revealed),
      });
    }
  }
  return { steps };
}

function subjectOf(element: Element): string {
  const description = describeTarget(element);
  return description.name ?? description.kind;
}

/** `Click **Import** on the Projects page` — one line, no jargon. */
export function approachStepSentence(step: ApproachStep): string {
  if (step.kind === 'click') return authoringText('Click {subject}', { subject: step.subject });
  if (step.kind === 'await-route') {
    return authoringText('Wait for the {subject} page', { subject: step.subject });
  }
  if (step.kind === 'await-text') {
    return authoringText('Wait for “{subject}” to appear', { subject: step.subject });
  }
  return authoringText('Wait for {subject}', { subject: step.subject });
}

export function approachSentences(recipe: ApproachRecipe): readonly string[] {
  return recipe.steps.map(approachStepSentence);
}

/** Reorder, so the creator can fix a recording that captured steps out of order. */
export function moveApproachStep(
  recipe: ApproachRecipe,
  stepId: string,
  direction: 'up' | 'down',
): ApproachRecipe {
  const index = recipe.steps.findIndex((step) => step.id === stepId);
  const target = index + (direction === 'up' ? -1 : 1);
  if (index < 0 || target < 0 || target >= recipe.steps.length) return recipe;
  const steps = [...recipe.steps];
  const [moved] = steps.splice(index, 1);
  if (moved) steps.splice(target, 0, moved);
  return { steps };
}

/** Trim, because recording always catches something incidental. */
export function removeApproachStep(recipe: ApproachRecipe, stepId: string): ApproachRecipe {
  return { steps: recipe.steps.filter((step) => step.id !== stepId) };
}

export type ApproachReplayOutcome =
  | { readonly state: 'pass' }
  | { readonly state: 'fail'; readonly failedStepId: string; readonly reason: string };

export interface ApproachReplayHandlers {
  /** Performs one step and resolves true when it succeeded. */
  readonly perform: (step: ApproachStep) => Promise<boolean>;
}

/**
 * Replays the recipe and reports pass or fail inline, naming the step that
 * failed. A replay that only says "failed" would send the creator back to
 * guessing, which is what the recipe exists to end.
 */
export async function replayApproach(
  recipe: ApproachRecipe,
  handlers: ApproachReplayHandlers,
): Promise<ApproachReplayOutcome> {
  for (const step of recipe.steps) {
    const ok = await handlers.perform(step);
    if (!ok) {
      return {
        state: 'fail',
        failedStepId: step.id,
        reason: approachStepSentence(step),
      };
    }
  }
  return { state: 'pass' };
}

/**
 * The recorded recipe as it is persisted on the target. Authoring keeps ids and
 * sentence rendering in memory; the document keeps only the acts, the semantic
 * waits and the line the creator reads.
 */
export function toTargetApproach(
  recipe: ApproachRecipe,
  targetIdFor?: (subject: string) => string | undefined,
): TargetApproach | undefined {
  const legs: TargetApproachLeg[] = [];
  for (const step of recipe.steps.slice(0, APPROACH_MAX_LEGS)) {
    const label = approachStepSentence(step).slice(0, 120);
    if (step.kind === 'click') {
      const targetId = targetIdFor?.(step.subject);
      legs.push({
        act: targetId ? { kind: 'activateTarget', targetId } : { kind: 'observe' },
        label,
      });
      continue;
    }
    const wait = waitFor(step);
    legs.push({ act: { kind: 'observe' }, ...(wait ? { wait } : {}), label });
  }
  return legs.length ? { legs } : undefined;
}

function waitFor(step: ApproachStep): StepChoreographyWait | undefined {
  if (step.kind === 'await-route' && step.route) {
    return { type: 'route', match: 'contains', value: step.route };
  }
  if (step.kind === 'await-text') {
    return { type: 'textVisible', value: step.subject, locale: 'en' };
  }
  return undefined;
}

/** Rehydrates a persisted approach for the inspector, ids and all. */
export function fromTargetApproach(approach: TargetApproach): ApproachRecipe {
  return {
    steps: approach.legs.map((leg) => ({
      id: stepId(),
      kind: legKind(leg),
      subject: leg.label,
      ...(leg.wait?.type === 'route' ? { route: leg.wait.value } : {}),
    })),
  };
}

function legKind(leg: TargetApproachLeg): ApproachStepKind {
  if (leg.act.kind === 'activateTarget') return 'click';
  if (leg.wait?.type === 'route') return 'await-route';
  if (leg.wait?.type === 'textVisible') return 'await-text';
  return 'await-element';
}
