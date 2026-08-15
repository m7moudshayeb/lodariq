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
import { TourPresentationCanceledError } from './tour-errors';
import { acquireNetworkActivityTracker, delay } from './tour-lifecycle';

export { ChoreographyStageTimeoutError };

export type ChoreographyTargetAction = 'activate' | 'observe-click' | 'focus' | 'input' | 'anchor';

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
    await waitForTarget(wait.targetId, 'anchor', resolveTarget, signal);
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

async function waitForTarget(
  targetId: string,
  requiredAction: ChoreographyTargetAction,
  resolveTarget: RuntimeChoreographyEnvironment['resolveTarget'],
  signal: AbortSignal,
): Promise<Element> {
  let element = resolveTarget(targetId, requiredAction);
  while (!element) {
    await delay(50, signal);
    element = resolveTarget(targetId, requiredAction);
  }
  return element;
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
