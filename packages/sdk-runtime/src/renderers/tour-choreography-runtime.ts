import type {
  CompiledStep,
  StepChoreography,
  StepChoreographyTrigger,
  StepChoreographyWait,
} from '@lodariq/schema';
import { subscribeToNamedRuntimeEvent } from '../runtime/named-events';
import {
  ChoreographyStageTimeoutError,
  executeStepChoreography,
  waitForObservedTargetInput,
  type ChoreographyStageUpdate,
} from './tour-choreography';
import { TourPresentationCanceledError, TourPresentationUnavailableError } from './tour-errors';
import { tourRuntimeText } from '../tour-i18n';
import { acquireNetworkActivityTracker } from './tour-lifecycle';

export { ChoreographyStageTimeoutError };

export type ChoreographyTargetAction = 'activate' | 'observe-click' | 'focus' | 'input' | 'anchor';

/** Coalesces a burst of mutations into one resolution instead of one each. */
const TARGET_WAIT_DEBOUNCE_MS = 16;
/**
 * Lowest share of the main thread Lodariq will leave to the host app while
 * waiting. A resolution costing 20 ms therefore buys the page 80 ms of quiet,
 * so a continuously mutating app cannot drive us back to full occupancy.
 */
const TARGET_WAIT_DUTY_DIVISOR = 4;
/** Safety net for reveals a MutationObserver cannot see — stylesheet swaps, transitions. */
const TARGET_WAIT_BACKOFF_MS = [50, 100, 200, 400, 800] as const;
/** Waiting forever is not a state a viewer can act on. */
const TARGET_WAIT_DEADLINE_MS = 10_000;

export interface RuntimeChoreographyEnvironment {
  resolveTarget: (targetId: string, requiredAction: ChoreographyTargetAction) => Element | null;
  runTransition: () => void;
  onStageUpdate?: (update: ChoreographyStageUpdate) => void;
}

/**
 * Delivery-only choreography adapter. It is imported on demand so tours that do
 * not use sequences do not pay for event, route, focus, or network-idle waits.
 */
export async function executeRuntimeChoreography(
  sequence: StepChoreography,
  step: CompiledStep,
  environment: RuntimeChoreographyEnvironment,
  signal: AbortSignal,
): Promise<void> {
  await executeStepChoreography(
    sequence,
    {
      runTrigger: (trigger, _timeoutMs, stageSignal) =>
        runTrigger(step, trigger, environment.resolveTarget, stageSignal),
      runWait: (wait, timeoutMs, stageSignal) =>
        runWait(wait, timeoutMs, environment.resolveTarget, stageSignal),
      runTransition: environment.runTransition,
      onStageUpdate: environment.onStageUpdate,
    },
    signal,
  );
}

async function runTrigger(
  step: CompiledStep,
  trigger: StepChoreographyTrigger,
  resolveTarget: RuntimeChoreographyEnvironment['resolveTarget'],
  signal: AbortSignal,
): Promise<void> {
  if (trigger.type === 'manual') return;
  const targetId = trigger.targetId ?? step.targetId;
  if (!targetId) throw new Error('Tour choreography target is unavailable');
  if (trigger.type === 'activateTarget') {
    const target = await waitForTarget(targetId, 'activate', resolveTarget, signal);
    if (!(target instanceof HTMLElement)) throw new Error('Tour choreography target is unsafe');
    target.click();
    return;
  }
  if (trigger.type === 'observeTargetFocus') {
    const target = await waitForTarget(targetId, 'focus', resolveTarget, signal);
    await waitForElementFocus(target, signal);
    return;
  }
  if (trigger.type === 'observeTargetInput') {
    const target = await waitForTarget(targetId, 'input', resolveTarget, signal);
    await waitForObservedTargetInput(target, signal);
    return;
  }
  const target = await waitForTarget(targetId, 'observe-click', resolveTarget, signal);
  await waitForElementClick(target, signal);
}

async function runWait(
  wait: StepChoreographyWait,
  timeoutMs: number,
  resolveTarget: RuntimeChoreographyEnvironment['resolveTarget'],
  signal: AbortSignal,
): Promise<void> {
  if (wait.type === 'targetAvailable') {
    await waitForTarget(wait.targetId, 'anchor', resolveTarget, signal, timeoutMs);
    return;
  }
  if (wait.type === 'route') {
    await waitForCondition(() => routeMatches(wait), signal);
    return;
  }
  if (wait.type === 'textVisible') {
    if (!localeMatches(wait.locale)) return;
    await waitForCondition(() => document.body.textContent?.includes(wait.value) ?? false, signal);
    return;
  }
  if (wait.type === 'event') {
    await waitForNamedEvent(wait.eventName, signal);
    return;
  }
  const tracker = acquireNetworkActivityTracker();
  try {
    await tracker.waitForIdle(timeoutMs, signal);
  } finally {
    tracker.release();
  }
}

/**
 * Wait for a step's target to appear.
 *
 * This used to be a 50 ms poll. A resolution costs more than 50 ms on a large
 * page, so the loop ran back to back and held the main thread at full occupancy
 * for as long as the target was missing — Lodariq janked the customer's app worst
 * at exactly the moment their app was busy enough to be slow.
 *
 * Now the DOM says when to look. The backoff is only a safety net for reveals a
 * MutationObserver cannot see, and the deadline turns "never appeared" into
 * something the viewer can be told about.
 */
function waitForTarget(
  targetId: string,
  requiredAction: ChoreographyTargetAction,
  resolveTarget: RuntimeChoreographyEnvironment['resolveTarget'],
  signal: AbortSignal,
  deadlineMs: number = TARGET_WAIT_DEADLINE_MS,
): Promise<Element> {
  const immediate = resolveTarget(targetId, requiredAction);
  if (immediate) return Promise.resolve(immediate);

  return new Promise<Element>((resolveWait, rejectWait) => {
    let settled = false;
    let debounceTimer = 0;
    let backoffTimer = 0;
    let backoffStep = 0;
    let lastCostMs = 0;

    const settle = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(debounceTimer);
      window.clearTimeout(backoffTimer);
      window.clearTimeout(deadlineTimer);
      signal.removeEventListener('abort', onAbort);
      complete();
    };

    const attempt = (): void => {
      if (settled) return;
      if (signal.aborted) {
        settle(() => rejectWait(new TourPresentationCanceledError()));
        return;
      }
      const startedAt = performance.now();
      const element = resolveTarget(targetId, requiredAction);
      lastCostMs = performance.now() - startedAt;
      if (element) settle(() => resolveWait(element));
      else scheduleBackoff();
    };

    // One resolution per burst: a pending attempt absorbs further mutations
    // rather than queueing a pass behind every one of them.
    const onMutation = (): void => {
      if (settled || debounceTimer) return;
      debounceTimer = window.setTimeout(
        () => {
          debounceTimer = 0;
          attempt();
        },
        Math.max(TARGET_WAIT_DEBOUNCE_MS, lastCostMs * TARGET_WAIT_DUTY_DIVISOR),
      );
    };

    const scheduleBackoff = (): void => {
      window.clearTimeout(backoffTimer);
      const index = Math.min(backoffStep, TARGET_WAIT_BACKOFF_MS.length - 1);
      backoffStep += 1;
      backoffTimer = window.setTimeout(attempt, TARGET_WAIT_BACKOFF_MS[index]);
    };

    const onAbort = (): void => settle(() => rejectWait(new TourPresentationCanceledError()));
    signal.addEventListener('abort', onAbort, { once: true });

    const deadlineTimer = window.setTimeout(() => {
      settle(() =>
        rejectWait(
          new TourPresentationUnavailableError(
            tourRuntimeText('Lodariq could not find what this step points at on this page'),
          ),
        ),
      );
    }, Math.max(0, deadlineMs) || TARGET_WAIT_DEADLINE_MS);

    const observer = new MutationObserver(onMutation);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      // A target revealed by a class or style change is the common case, so
      // attributes have to be watched; their old values are never needed.
      attributes: true,
    });

    scheduleBackoff();
  });
}

function routeMatches(wait: Extract<StepChoreographyWait, { type: 'route' }>): boolean {
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (wait.match === 'prefix') return current.startsWith(wait.value);
  if (wait.match === 'contains') return current.includes(wait.value);
  return current === wait.value;
}

function localeMatches(locale: string): boolean {
  try {
    const expected = Intl.getCanonicalLocales(locale)[0];
    const current = Intl.getCanonicalLocales(
      document.documentElement.lang || navigator.language,
    )[0];
    if (!expected || !current) return false;
    return expected === current || expected.split('-')[0] === current.split('-')[0];
  } catch {
    return false;
  }
}

function waitForCondition(predicate: () => boolean, signal: AbortSignal): Promise<void> {
  return new Promise((resolveWait, rejectWait) => {
    const check = (): void => {
      if (signal.aborted) {
        rejectWait(new TourPresentationCanceledError());
        return;
      }
      if (predicate()) {
        resolveWait();
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

function waitForElementClick(element: Element, signal: AbortSignal): Promise<void> {
  return waitForElementEvent(element, 'click', signal);
}

function waitForElementFocus(element: Element, signal: AbortSignal): Promise<void> {
  if (element === element.ownerDocument.activeElement) return Promise.resolve();
  return waitForElementEvent(element, 'focusin', signal);
}

function waitForElementEvent(
  element: Element,
  eventName: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolveEvent, rejectEvent) => {
    const cleanup = (): void => {
      element.removeEventListener(eventName, onEvent, true);
      signal.removeEventListener('abort', onAbort);
    };
    const onEvent = (): void => {
      cleanup();
      resolveEvent();
    };
    const onAbort = (): void => {
      cleanup();
      rejectEvent(new TourPresentationCanceledError());
    };
    element.addEventListener(eventName, onEvent, { capture: true, once: true });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForNamedEvent(eventName: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolveEvent, rejectEvent) => {
    let unsubscribe = (): void => {};
    const cleanup = (): void => {
      unsubscribe();
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      cleanup();
      rejectEvent(new TourPresentationCanceledError());
    };
    unsubscribe = subscribeToNamedRuntimeEvent(eventName, () => {
      cleanup();
      resolveEvent();
    });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
