// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Target, TargetIdentityV2, TargetSelectionPolicy } from '@lodariq/schema';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import { collectElements } from '../../../../../packages/sdk-runtime/src/resolver/element-evidence';
import { createTargetIdentityV2 } from '../../../fixtures/target-identity-v2';

/** Four semantically identical rows: exactly the tie a selection policy exists for. */
function renderCollection(options: { ariaSort?: 'ascending' | 'descending' } = {}): void {
  const sortAttr = options.ariaSort ? ` aria-sort="${options.ariaSort}"` : '';
  document.body.innerHTML = `
    <main>
      <h1>Projects</h1>
      <section aria-label="Projects table">
        <table>
          <thead><tr><th scope="col">Project</th><th scope="col"${sortAttr}>Updated</th></tr></thead>
          <tbody>
            ${['Website refresh', 'Q3 pricing model', 'Mobile onboarding', 'Data migration']
              .map(
                (name) => `<tr><th scope="row">${name}</th>
                  <td><button type="button" data-testid="new-project" aria-label="New project">Open</button></td></tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>
      <section aria-label="Archived projects">
        <h2>Archived projects</h2>
        <button type="button" data-testid="new-project" aria-label="New project">Open</button>
      </section>
    </main>`;
}

function identity(): TargetIdentityV2 {
  const base = createTargetIdentityV2();
  return {
    ...base,
    intent: { elementKind: 'control', requiredAction: 'observe-click' },
    context: { ...base.context, routePatternId: undefined, stateId: undefined, relationships: [] },
    visualTopologies: undefined,
    visualFingerprints: undefined,
  };
}

function targetWith(selection?: TargetSelectionPolicy): Target {
  return {
    id: 'target_new_project',
    fingerprint: { stableAttributes: {}, tagName: 'button' },
    identity: identity(),
    ...(selection ? { selection } : {}),
  };
}

function labelOfRow(element: Element | null): string | null {
  return element?.closest('tr')?.querySelector('th')?.textContent?.trim() ?? null;
}

describe('author-declared selection resolves a genuine tie', () => {
  beforeEach(() => renderCollection());

  it('stays ambiguous with no policy, rather than guessing', () => {
    const result = resolveTarget(targetWith(), document);
    expect(result.state).toBe('ambiguous');
    expect(result.element).toBeNull();
  });

  it('keeps failing closed when the policy is the explicit "only the one I clicked"', () => {
    expect(resolveTarget(targetWith({ kind: 'only' }), document).state).toBe('ambiguous');
  });

  it('takes the first in reading order', () => {
    const result = resolveTarget(targetWith({ kind: 'first' }), document);
    expect(result.state).toBe('found');
    expect(labelOfRow(result.element)).toBe('Website refresh');
    expect(result.resolutionMethod).toBe('selection_first');
  });

  it('takes the last in reading order', () => {
    const result = resolveTarget(targetWith({ kind: 'last' }), document);
    expect(result.state).toBe('found');
    // The archived section's control is last on the page.
    expect(result.element?.closest('section')?.getAttribute('aria-label')).toBe(
      'Archived projects',
    );
  });

  it('takes an ordinal position', () => {
    const result = resolveTarget(targetWith({ kind: 'ordinal', position: 3 }), document);
    expect(result.state).toBe('found');
    expect(labelOfRow(result.element)).toBe('Mobile onboarding');
    expect(result.resolutionMethod).toBe('selection_ordinal');
  });

  it('refuses an ordinal that runs past the candidates', () => {
    expect(resolveTarget(targetWith({ kind: 'ordinal', position: 40 }), document).state).toBe(
      'ambiguous',
    );
  });

  it('scopes to a named container', () => {
    const result = resolveTarget(
      targetWith({ kind: 'within-container', containerLabel: 'Archived projects' }),
      document,
    );
    expect(result.state).toBe('found');
    expect(result.element?.closest('section')?.getAttribute('aria-label')).toBe(
      'Archived projects',
    );
    expect(result.resolutionMethod).toBe('selection_within_container');
  });

  it('refuses a container that still leaves several matches', () => {
    expect(
      resolveTarget(
        targetWith({ kind: 'within-container', containerLabel: 'Projects table' }),
        document,
      ).state,
    ).toBe('ambiguous');
  });

  it('takes the first item inside the shared collection', () => {
    const result = resolveTarget(
      targetWith({ kind: 'first-in-collection', collectionLabel: 'Projects table' }),
      document,
    );
    expect(result.state).toBe('found');
    expect(labelOfRow(result.element)).toBe('Website refresh');
  });
});

describe('"newest" is only honoured where the product declares its ordering', () => {
  it('fails closed when nothing states how the collection is sorted', () => {
    renderCollection();
    const result = resolveTarget(
      targetWith({ kind: 'newest-in-collection', collectionLabel: 'Projects table' }),
      document,
    );
    expect(result.state).toBe('ambiguous');
  });

  it('takes the first row when the column declares a descending sort', () => {
    renderCollection({ ariaSort: 'descending' });
    const result = resolveTarget(
      targetWith({ kind: 'newest-in-collection', collectionLabel: 'Projects table' }),
      document,
    );
    expect(result.state).toBe('found');
    expect(labelOfRow(result.element)).toBe('Website refresh');
    expect(result.resolutionMethod).toBe('selection_newest_in_collection');
  });

  it('takes the last row when the same column is sorted ascending', () => {
    renderCollection({ ariaSort: 'ascending' });
    const result = resolveTarget(
      targetWith({ kind: 'newest-in-collection', collectionLabel: 'Projects table' }),
      document,
    );
    expect(result.state).toBe('found');
    expect(labelOfRow(result.element)).toBe('Data migration');
  });
});

/**
 * The tie the fixture app produces: three sibling controls with identical
 * durable evidence whose only difference is the words on them.
 */
function renderWordAlikes(): void {
  document.documentElement.lang = 'en';
  document.body.innerHTML = `
    <main>
      <h1>Projects</h1>
      <button type="button" data-testid="new-project">Export CSV</button>
      <button type="button" data-testid="new-project">New project</button>
      <button type="button" data-testid="new-project">Save report</button>
    </main>`;
}

describe('"any that says X" is about the words, not the position', () => {
  beforeEach(() => renderWordAlikes());

  it('stays ambiguous with no policy', () => {
    expect(resolveTarget(targetWith(), document).state).toBe('ambiguous');
  });

  it('takes the candidate whose text actually matched, not the first of the tie', () => {
    const result = resolveTarget(targetWith({ kind: 'any-matching' }), document);
    expect(result.state).toBe('found');
    expect(result.element?.textContent).toBe('New project');
    expect(result.resolutionMethod).toBe('selection_any_matching');
  });

  it('still means position when the author asked for a position', () => {
    expect(resolveTarget(targetWith({ kind: 'first' }), document).element?.textContent).toBe(
      'Export CSV',
    );
    expect(
      resolveTarget(targetWith({ kind: 'ordinal', position: 2 }), document).element?.textContent,
    ).toBe('New project');
  });

  it('fails closed when the words moved and nothing matches any more', () => {
    document.querySelectorAll('button').forEach((button, index) => {
      button.textContent = `Renamed ${index}`;
    });
    const result = resolveTarget(targetWith({ kind: 'any-matching' }), document);
    expect(result.state).toBe('ambiguous');
    expect(result.element).toBeNull();
  });
});

describe('Lodariq never resolves onto its own chrome', () => {
  it('ignores a control inside the authoring panel that shares the target’s name', () => {
    document.body.innerHTML = `
      <main><button data-lodariq-id="new-report">New report</button></main>
      <lodariq-authoring-panel>
        <button aria-label="New report">New report</button>
      </lodariq-authoring-panel>`;
    const { elements } = collectElements(document);
    expect(
      elements.some((element) => element.getAttribute('data-lodariq-id') === 'new-report'),
    ).toBe(true);
    expect(
      elements.filter((element) => element.closest('lodariq-authoring-panel') !== null),
    ).toHaveLength(0);
  });
});
