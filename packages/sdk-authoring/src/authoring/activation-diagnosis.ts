/**
 * Activation reliability (§8.4).
 *
 * ADR-0015's PKCE popup flow inherits a documented failure tail, so it is designed
 * for rather than discovered in support. Two parts, both pure:
 *
 * 1. **A named diagnosis.** One `Why didn't authoring open?` state that says which
 *    stage failed and what to do, in the launcher itself. "Something went wrong" is
 *    the failure this exists to prevent.
 * 2. **A pending intent.** The host app may navigate during activation, so the
 *    intent is persisted per origin and resumed afterwards instead of lost.
 */
import { authoringText } from '../i18n';

export const ACTIVATION_STAGES = [
  'popup-blocked',
  'popup-closed',
  'redirected-away',
  'storage-restricted',
  'grant-rejected',
  'session-expired',
  'network',
  'unknown',
] as const;
export type ActivationStage = (typeof ACTIVATION_STAGES)[number];

/** What the caller should do next. The UI never has to infer this from the words. */
export type ActivationRecovery = 'same-tab-redirect' | 'retry' | 'resume' | 'contact-support';

export interface ActivationDiagnosis {
  readonly stage: ActivationStage;
  /** Names the stage in creator language, never an error code. */
  readonly message: string;
  readonly recovery: ActivationRecovery;
}

const DIAGNOSES: Record<ActivationStage, () => ActivationDiagnosis> = {
  'popup-blocked': () => ({
    stage: 'popup-blocked',
    message: authoringText('Your browser blocked the sign-in window. Continuing in this tab.'),
    // Falling back beats an error: the click was real, only the popup was refused.
    recovery: 'same-tab-redirect',
  }),
  'popup-closed': () => ({
    stage: 'popup-closed',
    message: authoringText('The sign-in window closed before finishing.'),
    recovery: 'retry',
  }),
  'redirected-away': () => ({
    stage: 'redirected-away',
    message: authoringText('Your product navigated while signing in. Picking up where you left off.'),
    recovery: 'resume',
  }),
  'storage-restricted': () => ({
    stage: 'storage-restricted',
    message: authoringText('This browser is blocking cross-site storage. Continuing in this tab.'),
    recovery: 'same-tab-redirect',
  }),
  'grant-rejected': () => ({
    stage: 'grant-rejected',
    message: authoringText('This workspace did not accept the sign-in. Check your access and retry.'),
    recovery: 'retry',
  }),
  'session-expired': () => ({
    stage: 'session-expired',
    message: authoringText('Your authoring session expired. Sign in again to continue.'),
    recovery: 'retry',
  }),
  network: () => ({
    stage: 'network',
    message: authoringText('Lodariq could not be reached. Check your connection and retry.'),
    recovery: 'retry',
  }),
  unknown: () => ({
    stage: 'unknown',
    message: authoringText('Authoring could not open. Retry, or contact support with this page open.'),
    recovery: 'contact-support',
  }),
};

export function activationDiagnosis(stage: ActivationStage): ActivationDiagnosis {
  return DIAGNOSES[stage]();
}

/**
 * Classifies what actually happened. `window.open` returning null is the common
 * case and is *not* an exception, so it is checked before any error inspection.
 */
export function classifyActivationFailure(input: {
  readonly popup?: Window | null;
  readonly popupAttempted?: boolean;
  readonly navigatedAway?: boolean;
  readonly storageBlocked?: boolean;
  readonly error?: unknown;
}): ActivationStage {
  if (input.popupAttempted && !input.popup) return 'popup-blocked';
  if (input.storageBlocked) return 'storage-restricted';
  if (input.navigatedAway) return 'redirected-away';
  if (input.popup?.closed) return 'popup-closed';
  const reason = input.error instanceof Error ? input.error.message.toLowerCase() : '';
  if (!reason) return 'unknown';
  if (reason.includes('expired')) return 'session-expired';
  if (reason.includes('rejected') || reason.includes('forbidden')) return 'grant-rejected';
  if (reason.includes('network') || reason.includes('fetch')) return 'network';
  return 'unknown';
}

// ── pending intent ───────────────────────────────────────────────────────────

const INTENT_KEY = 'lodariq.authoring.activation-intent';
/** Long enough to survive a redirect chain, short enough not to resurrect later. */
export const ACTIVATION_INTENT_TTL_MS = 5 * 60_000;

export interface ActivationIntent {
  readonly origin: string;
  readonly documentId?: string;
  readonly startedAt: number;
}

/** Minimal storage shape, so the model never touches a global. */
export interface ActivationIntentStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function rememberActivationIntent(
  storage: ActivationIntentStorage,
  intent: ActivationIntent,
): void {
  try {
    storage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {
    // A browser refusing storage is exactly the `storage-restricted` case; the
    // caller falls back to a same-tab redirect, which needs no storage at all.
  }
}

/**
 * Reads and clears the intent. Takes rather than peeks, so a stale intent cannot
 * relaunch authoring twice, and rejects one from another origin or an expired one.
 */
export function takeActivationIntent(
  storage: ActivationIntentStorage,
  origin: string,
  now: number,
): ActivationIntent | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(INTENT_KEY);
    if (raw) storage.removeItem(INTENT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let intent: ActivationIntent;
  try {
    intent = JSON.parse(raw) as ActivationIntent;
  } catch {
    return null;
  }
  if (intent.origin !== origin) return null;
  if (!Number.isFinite(intent.startedAt)) return null;
  if (now - intent.startedAt > ACTIVATION_INTENT_TTL_MS) return null;
  return intent;
}
