// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Target, TargetIdentityV2 } from '@lodariq/schema';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';

/**
 * A design-system migration reimplements a `<button>` as an `<a role="button">`.
 *
 * Which control it is has not changed, and the product says so in the markup.
 * Requiring the tag demoted the target by one whole family below every
 * look-alike that kept its own tag, which is how a retag turned into a wrong
 * element rather than a near miss.
 */
function identity(): TargetIdentityV2 {
  return {
    schemaVersion: 2,
    targetId: 'target_publish',
    intent: { elementKind: 'control', requiredAction: 'observe-click', resolutionMode: 'semantic' },
    invariants: { configuredAttributes: { 'data-testid': 'publish' } },
    semantics: { tagName: 'button', role: 'button' },
    context: { ancestorRoles: ['main'] },
    localizedEvidence: [{ locale: 'en', accessibleName: 'Publish' }],
    captureEvidence: {
      sampleCount: 3,
      stableSignalFamilies: ['configured-attribute', 'element-semantics', 'ancestor-context'],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.9,
      quality: 'strong',
    },
    display: { authorLabel: 'Publish' },
  };
}

const target: Target = {
  id: 'target_publish',
  fingerprint: { stableAttributes: { 'data-testid': 'publish' }, tagName: 'button' },
  identity: identity(),
};

function render(markup: string): void {
  document.documentElement.lang = 'en';
  document.body.innerHTML = `<main>${markup}</main>`;
}

describe('an explicit role stands in for the tag it was built from', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the family when the button ships as an anchor that declares itself', () => {
    render('<a href="#" role="button" data-testid="publish">Publish</a>');
    const result = resolveTarget(target, document);
    expect(result.state).toBe('found');
    expect(result.evidenceFamilies).toContain('element-semantics');
  });

  it('refuses the substitution when nothing declares the role', () => {
    // An anchor is a link until the product says otherwise. Reading a bare
    // retag as the same kind of control would be us guessing, not the page
    // telling us — and the tag is the only statement of kind it made.
    render('<a href="#" data-testid="publish">Publish</a>');
    expect(resolveTarget(target, document).evidenceFamilies).not.toContain('element-semantics');
  });

  it('refuses a declared role that is not the captured one', () => {
    render('<a href="#" role="link" data-testid="publish">Publish</a>');
    expect(resolveTarget(target, document).evidenceFamilies).not.toContain('element-semantics');
  });

  it('still requires the rest of the family, so this is a substitution not a discount', () => {
    // Same declared role, different input type. One check yielding must not
    // carry a candidate the other checks reject.
    const typed: Target = {
      ...target,
      identity: { ...identity(), semantics: { tagName: 'input', role: 'button', inputType: 'submit' } },
    };
    render('<a href="#" role="button" data-testid="publish">Publish</a>');
    expect(resolveTarget(typed, document).evidenceFamilies).not.toContain('element-semantics');
  });
});
