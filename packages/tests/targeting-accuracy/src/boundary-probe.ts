/**
 * Shadow DOM and iframe: a capability probe, not scored accuracy.
 *
 * These are kept out of the corpus on purpose. Scoring them would fold "the
 * resolver cannot see across this boundary" into the same percentage as "the
 * resolver picked the wrong button", and those are different facts — one is a
 * documented limit, the other is a defect. What matters here is only: **does the
 * resolver say so, or does it fail silently?**
 *
 * The specific question Step 4 asks is whether `unsupported_boundary` — a reason
 * code that exists in `@lodariq/schema` — is ever actually emitted.
 *
 * Honest limits of this probe, stated because they change how to read it: the
 * synthetic layout engine does not descend into shadow roots or iframe
 * documents, so visual signal families are absent inside them. That understates
 * evidence rather than overstating it, which is the safe direction for a probe
 * asking "does it refuse cleanly".
 */

import { captureTargetEvidence } from '@lodariq/sdk-authoring/bridge';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import { applySyntheticLayout } from './layout';

export interface BoundaryProbeResult {
  id: string;
  description: string;
  /** What we hoped the resolver would do, in prose — this is not scored. */
  hoped: string;
  state: string;
  reasonCode: string;
  /** Did it land on the element we captured? */
  landedOnTarget: boolean;
  /** Did it land on something else? The only outcome that would be alarming. */
  landedElsewhere: boolean;
  confidence: number;
  candidateCount: number;
  /** Thrown errors are a result too: a crash across a boundary is a defect. */
  threw: string | null;
}

function reset(): HTMLElement {
  document.body.innerHTML = '';
  document.documentElement.lang = 'en';
  document.documentElement.removeAttribute('dir');
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function button(text: string, testId?: string): HTMLElement {
  const node = document.createElement('button');
  node.setAttribute('type', 'button');
  if (testId) node.setAttribute('data-testid', testId);
  node.textContent = text;
  return node;
}

function probe(
  id: string,
  description: string,
  hoped: string,
  build: (container: HTMLElement) => Element | null,
): BoundaryProbeResult | null {
  const container = reset();
  let target: Element | null = null;
  try {
    target = build(container);
  } catch (error) {
    return {
      id,
      description,
      hoped,
      state: 'n/a',
      reasonCode: 'n/a',
      landedOnTarget: false,
      landedElsewhere: false,
      confidence: 0,
      candidateCount: 0,
      threw: `while building: ${(error as Error).message}`,
    };
  }
  // A build that cannot run in this environment is reported as absent rather
  // than as a passing probe; a silently skipped probe is a false all-clear.
  if (!target) return null;

  applySyntheticLayout(document.body);
  try {
    const capture = captureTargetEvidence(target);
    const result = resolveTarget(
      { id: capture.identity.targetId, fingerprint: capture.fingerprint, identity: capture.identity },
      document,
    );
    return {
      id,
      description,
      hoped,
      state: result.state,
      reasonCode: result.reasonCode,
      landedOnTarget: result.element === target,
      landedElsewhere: Boolean(result.element) && result.element !== target,
      confidence: result.confidence,
      candidateCount: result.candidateCount,
      threw: null,
    };
  } catch (error) {
    return {
      id,
      description,
      hoped,
      state: 'threw',
      reasonCode: 'threw',
      landedOnTarget: false,
      landedElsewhere: false,
      confidence: 0,
      candidateCount: 0,
      threw: (error as Error).message,
    };
  }
}

export function runBoundaryProbes(): BoundaryProbeResult[] {
  const results: Array<BoundaryProbeResult | null> = [
    probe(
      'open-shadow-root',
      'Target lives inside an open shadow root from the moment it is authored',
      'Resolves: element-evidence.ts walks open shadow roots deliberately.',
      (container) => {
        const host = document.createElement('div');
        host.className = 'widget-host';
        container.appendChild(host);
        if (!host.attachShadow) return null;
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.appendChild(button('Cancel'));
        const target = button('Confirm order', 'confirm-order');
        shadow.appendChild(target);
        return target;
      },
    ),
    probe(
      'closed-shadow-root',
      'Same, but the shadow root is closed so nothing can enumerate it',
      'Abstains. Landing anywhere would mean it found a different element.',
      (container) => {
        const host = document.createElement('div');
        host.className = 'widget-host';
        container.appendChild(host);
        if (!host.attachShadow) return null;
        const shadow = host.attachShadow({ mode: 'closed' });
        const target = button('Confirm order', 'confirm-order');
        shadow.appendChild(target);
        return target;
      },
    ),
    probe(
      'shadow-root-adopted-later',
      'Authored in the light DOM, then moved into a shadow root by a refactor',
      'Either resolves through the shadow walk or abstains. Never a wrong.',
      (container) => {
        const panel = document.createElement('div');
        panel.className = 'panel';
        const target = button('Confirm order', 'confirm-order');
        panel.appendChild(target);
        container.appendChild(panel);
        const host = document.createElement('div');
        container.appendChild(host);
        if (!host.attachShadow) return null;
        host.attachShadow({ mode: 'open' }).appendChild(target);
        return target;
      },
    ),
    probe(
      'same-document-iframe',
      'Target lives in a same-origin iframe document',
      'Abstains with a boundary reason. A separate document is a hard limit.',
      (container) => {
        const frame = document.createElement('iframe');
        container.appendChild(frame);
        const inner = frame.contentDocument;
        if (!inner) return null;
        const target = inner.createElement('button');
        target.setAttribute('type', 'button');
        target.setAttribute('data-testid', 'confirm-order');
        target.textContent = 'Confirm order';
        inner.body.appendChild(target);
        return target;
      },
    ),
  ];
  return results.filter((entry): entry is BoundaryProbeResult => entry !== null);
}
