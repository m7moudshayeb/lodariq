/**
 * Every label the inspector renders (§4.3), in one module.
 *
 * Section names are creator language, never implementation language: the archive
 * doc's rule that Advanced must not read "target lifecycle" or "compiler package"
 * applies to every row here.
 */
import { authoringText } from '../../i18n';
import type { InspectorSectionLabels } from './inspector-sections';

export const INSPECTOR_SECTION_LABELS: InspectorSectionLabels = {
  style: authoringText('Style'),
  actions: authoringText('Actions'),
  placement: authoringText('Placement'),
  target: authoringText('Target'),
  conditions: authoringText('Conditions'),
  narration: authoringText('Narration'),
  advanced: authoringText('Advanced'),
  button: authoringText('Button'),
  action: authoringText('Action'),
  field: authoringText('Field'),
  validation: authoringText('Validation'),
  media: authoringText('Media'),
  frame: authoringText('Frame'),
  altText: authoringText('Alt text'),
  ringStyle: authoringText('Ring style'),
  spotlight: authoringText('Spotlight & zoom'),
  evidence: authoringText('Evidence'),
  approach: authoringText('Approach'),
  repair: authoringText('Repair'),
};

export const INSPECTOR_COPY = {
  /** The popover's accessible name. It configures the step, not the document. */
  title: authoringText('Step settings'),
  /**
   * Its visible title names the thing being inspected. The step's own heading is
   * included when it has one — with seven steps open in a filmstrip, "Step 4" is
   * not enough to know which card the popover is configuring.
   */
  stepTitle: (position: number, heading?: string): string => {
    const numbered = authoringText('Step {position}').replace('{position}', String(position));
    return heading ? `${numbered} — ${heading}` : numbered;
  },
  /**
   * The step's own readiness, beside its name. Document-level draft divergence is
   * the mode pill's job (§8.2); this says whether *this* step can ship.
   */
  incomplete: authoringText('Incomplete'),
  invalid: authoringText('Needs a fix'),
  close: authoringText('Close settings'),
  /** Printed on the `⋯` affordance that opens it — the only entry point needed. */
  open: authoringText('Step settings'),
} as const;
