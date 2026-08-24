// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureTargetEvidence } from '@lodariq/sdk-authoring/bridge';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import type { Target } from '@lodariq/schema';

/**
 * Positional evidence (ADR-0016, "Structure as Bounded Evidence").
 *
 * The case it exists for is the fixture app's reports header: three sibling
 * buttons a person tells apart at a glance and the resolver cannot, because the
 * only difference between them is the words — and words are not durable
 * identity. Where the element sits among its siblings is.
 */
function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

/** jsdom has no layout, so every element the capture measures needs a rect. */
function layOutPage(): void {
  const main = document.querySelector('main');
  if (main) vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(domRect(80, 60, 1_100, 700));
  [...document.querySelectorAll('button')].forEach((button, index) => {
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
      domRect(120 + index * 150, 80, 140, 36),
    );
  });
}

function renderActionRow(): HTMLButtonElement[] {
  document.body.innerHTML = `
    <main>
      <h1>Reports</h1>
      <div class="head-actions">
        <button type="button" class="btn">Export CSV</button>
        <button type="button" class="btn">Schedule report</button>
        <button type="button" class="btn primary">Save report</button>
      </div>
    </main>`;
  layOutPage();
  return [...document.querySelectorAll('button')] as HTMLButtonElement[];
}

function captureOf(element: Element, targetId: string): Target {
  const capture = captureTargetEvidence(element, undefined, {
    locale: 'en',
    requiredAction: 'observe-click',
    targetId,
  });
  return {
    id: capture.identity.targetId,
    fingerprint: capture.fingerprint,
    identity: capture.identity,
  };
}

describe('sibling position as a tie-breaker', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  });

  afterEach(() => vi.restoreAllMocks());

  it('separates sibling controls that differ only in their words', () => {
    const buttons = renderActionRow();
    const target = captureOf(buttons[1]!, 'target_schedule_report');
    const evidence = target.identity!.captureEvidence;

    expect(evidence.stableSignalFamilies).toContain('sibling-position');
    expect(target.identity!.visualFingerprints?.[0]?.layoutSlot).toEqual({
      siblingIndex: 1,
      siblingCount: 3,
    });
    // No longer ambiguous, and therefore no longer a release blocker.
    expect(evidence.uniqueCandidateCount).toBe(1);
    expect(evidence.quality).not.toBe('weak');

    const result = resolveTarget(target, document);
    expect(result.state).toBe('found');
    expect(result.element?.textContent).toBe('Schedule report');
    expect(result.evidenceFamilies).toContain('sibling-position');
  });

  it('does not slide over when the row gains an action', () => {
    const buttons = renderActionRow();
    const target = captureOf(buttons[1]!, 'target_schedule_report');
    expect(resolveTarget(target, document).element?.textContent).toBe('Schedule report');

    // A "Share" button ships at the front of the row. Every index moves by one.
    // Matching on the index alone would now resolve, confidently, onto the
    // button that used to be first — the failure mode a recorded selector has.
    const shipped = document.createElement('button');
    shipped.type = 'button';
    shipped.textContent = 'Share';
    document.querySelector('.head-actions')!.prepend(shipped);
    layOutPage();

    // The slot moved, so position says nothing any more. The name is the only
    // thing left, and it still says the same button.
    const result = resolveTarget(target, document);
    expect(result.element?.textContent).toBe('Schedule report');
    expect(result.evidenceFamilies).not.toContain('sibling-position');
  });

  it('refuses position inside a collection, where the row is data', () => {
    document.body.innerHTML = `
      <main>
        <h1>Projects</h1>
        <table aria-label="Projects">
          <tbody>
            ${['Website refresh', 'Q3 pricing', 'Data migration']
              .map(
                (name) =>
                  `<tr><th scope="row">${name}</th><td><button type="button">Open</button></td></tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </main>`;
    layOutPage();

    const target = captureOf(document.querySelectorAll('tbody button')[1]!, 'target_row_open');
    const evidence = target.identity!.captureEvidence;

    // Sorting the table would keep the count and change the project — a
    // substitution the count cannot detect. The author-declared collection
    // policies exist for this instead.
    expect(evidence.stableSignalFamilies).not.toContain('sibling-position');
    expect(evidence.uniqueCandidateCount).toBeGreaterThan(1);
  });

  it('cannot become an identity on its own', () => {
    // No landmark ancestor, no heading, no attributes, no accessible name:
    // element kind and a slot are the whole of the evidence.
    document.body.innerHTML =
      '<div><button type="button"></button><button type="button"></button><button type="button"></button></div>';
    layOutPage();

    const target = captureOf(document.querySelectorAll('button')[1]!, 'target_bare');
    const evidence = target.identity!.captureEvidence;

    expect(evidence.stableSignalFamilies).toContain('sibling-position');
    expect(evidence.quality).toBe('weak');
    // And weak for a reason no author answer covers, so no selection policy
    // can clear the publish gate for it either.
    expect(evidence.ambiguityIsSoleWeakness).toBeUndefined();

    const result = resolveTarget(target, document);
    expect(result.state).toBe('needs_review');
    expect(result.reasonCode).toBe('low_confidence');
  });
});
