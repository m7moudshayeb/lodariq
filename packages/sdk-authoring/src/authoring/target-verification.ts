/**
 * The three verification states (§4.4, audit #2).
 *
 * The build had a binary — verified or not — which produced the false
 * `Unverified` the 2026-08-13 audit caught on a modal `Close` button: a target
 * that resolves perfectly well once you reach the dialog, reported as a failure
 * because it was not on screen at that moment.
 *
 * Three states fix that class of false alarm, and each one states what the
 * creator should do about it.
 */
import { authoringText } from '../i18n';
import type { AuthoringTargetHealthPresentation } from './target-health-ledger';

export type TargetVerificationState = 'verified' | 'needs-context' | 'cannot-find' | 'checking';

/**
 * Ledger presentation → creator-facing state.
 *
 * `unavailable_current_context` is the audit's case: resolved reliably before,
 * simply not on this screen now. `unverified` joins it rather than `cannot-find`,
 * because "we have not looked yet" is not "we looked and failed".
 */
const STATE_BY_PRESENTATION: Readonly<
  Record<AuthoringTargetHealthPresentation, TargetVerificationState>
> = {
  verified: 'verified',
  checking: 'checking',
  unavailable_current_context: 'needs-context',
  unverified: 'needs-context',
  ambiguous: 'cannot-find',
  drifted: 'cannot-find',
  missing: 'cannot-find',
};

export function targetVerificationState(
  presentation: AuthoringTargetHealthPresentation,
): TargetVerificationState {
  return STATE_BY_PRESENTATION[presentation];
}

export interface TargetVerificationPresentation {
  readonly state: TargetVerificationState;
  readonly label: string;
  /** What it means, in one sentence. */
  readonly meaning: string;
  /** What the creator should do — "none" is a legitimate answer and says so. */
  readonly action: string;
  /** Status token name, always paired with the label rather than used alone. */
  readonly tone: 'positive' | 'attention' | 'danger' | 'muted';
}

export function targetVerificationPresentation(
  presentation: AuthoringTargetHealthPresentation,
): TargetVerificationPresentation {
  const state = targetVerificationState(presentation);
  return { state, ...VERIFICATION_COPY[state] };
}

const VERIFICATION_COPY: Readonly<
  Record<TargetVerificationState, Omit<TargetVerificationPresentation, 'state'>>
> = {
  verified: {
    label: authoringText('Verified'),
    meaning: authoringText('Found here, now, with durable evidence.'),
    action: authoringText('Nothing to do.'),
    tone: 'positive',
  },
  'needs-context': {
    label: authoringText('Needs context'),
    meaning: authoringText(
      'Found reliably when reached the recorded way. It is not on this screen right now.',
    ),
    action: authoringText('Review how Lodariq gets here, or leave it as it is.'),
    tone: 'attention',
  },
  'cannot-find': {
    label: authoringText('Can’t find'),
    meaning: authoringText('The evidence checks did not pass.'),
    action: authoringText('Repair this target.'),
    tone: 'danger',
  },
  checking: {
    label: authoringText('Checking'),
    meaning: authoringText('Looking for this element now.'),
    action: authoringText('Nothing to do.'),
    tone: 'muted',
  },
};

/** Filmstrip dot state (§4.5). `draft` is a step with no target at all. */
export type FilmstripStepState = TargetVerificationState | 'draft';
