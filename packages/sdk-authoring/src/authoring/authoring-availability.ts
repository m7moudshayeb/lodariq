/**
 * Why authoring is not available here, and what to do about it (§14).
 *
 * ADR-0015 rejects production at every layer, which is a defensible position and
 * this module does not argue with it. What it fixes is the *presentation*: today a
 * customer on production gets `{ state: 'disabled' }` and no explanation. A dead
 * end that explains itself converts; a dead end that does not, churns.
 *
 * The reason arrives as a closed enum from the control plane, so all wording — and
 * therefore all localization — lives here rather than in a server response.
 */
import type { AuthoringDisabledReason } from '@lodariq/schema';
import { authoringText } from '../i18n';

export interface AuthoringUnavailableExplanation {
  readonly reason: AuthoringDisabledReason;
  /** One line stating the rule, in the creator's terms. */
  readonly headline: string;
  /** Why the rule exists. Named honestly: clicking through production is the risk. */
  readonly because: string;
  /** The next action, always present. A dead end without a path is the failure. */
  readonly path: string;
}

const EXPLANATIONS: Record<AuthoringDisabledReason, () => AuthoringUnavailableExplanation> = {
  production_environment: () => ({
    reason: 'production_environment',
    headline: authoringText('Authoring runs on staging, not production.'),
    /**
     * §14.3's first risk, stated in those terms rather than as a generic posture:
     * authoring means clicking through your own app, and in production those clicks
     * act on real customer data.
     */
    because: authoringText(
      'Building an experience means clicking through your own product. On production those clicks would act on real customer data.',
    ),
    path: authoringText('Point Lodariq at a staging environment to start building.'),
  }),
  not_enabled: () => ({
    reason: 'not_enabled',
    headline: authoringText('Authoring is turned off for this environment.'),
    because: authoringText('A workspace admin controls which environments creators can build in.'),
    path: authoringText('Ask a workspace admin to enable authoring for this environment.'),
  }),
};

export function authoringUnavailableExplanation(
  reason: AuthoringDisabledReason | undefined,
): AuthoringUnavailableExplanation {
  // An older control plane sends no reason; the environment rule is the safe read.
  return EXPLANATIONS[reason ?? 'production_environment']();
}
