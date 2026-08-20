// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { lookAlikeQuestion } from '../../../../../packages/sdk-authoring/src/bridge/targeting/disambiguation';
import {
  fromTargetApproach,
  recordApproach,
  toTargetApproach,
} from '../../../../../packages/sdk-authoring/src/bridge/targeting/approach';

/**
 * A target pinned to "row 3" breaks the moment the data changes, which is far
 * more often than the UI changes — and it is invisible in testing because test
 * data is static. These answers survive it.
 */
function renderTable(options: { sorted?: boolean } = {}): void {
  const sortAttr = options.sorted ? ' aria-sort="descending"' : '';
  document.body.innerHTML = `
    <main>
      <section aria-label="Projects table">
        <table>
          <thead><tr><th scope="col">Project</th><th scope="col"${sortAttr}>Updated</th></tr></thead>
          <tbody>
            ${['Website refresh', 'Q3 pricing model', 'Mobile onboarding']
              .map(
                (name) => `<tr><th scope="row">${name}</th>
                  <td><button type="button" aria-label="Open">Open</button></td></tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>
    </main>`;
}

const resolutionsOf = (element: Element): string[] =>
  lookAlikeQuestion(element)?.options.map((option) => option.resolution) ?? [];

describe('data-relative answers', () => {
  it('offers a collection answer when the element sits in a list', () => {
    renderTable();
    const button = document.querySelectorAll('tbody button')[1]!;
    expect(resolutionsOf(button)).toContain('first-in-collection');
  });

  it('offers "whichever is newest" only when the list declares its own order', () => {
    renderTable();
    const unsorted = document.querySelectorAll('tbody button')[0]!;
    expect(resolutionsOf(unsorted)).not.toContain('newest-in-collection');

    renderTable({ sorted: true });
    const sorted = document.querySelectorAll('tbody button')[0]!;
    expect(resolutionsOf(sorted)).toContain('newest-in-collection');
  });

  it('names the collection it ranks within, in the product’s own words', () => {
    renderTable({ sorted: true });
    const button = document.querySelectorAll('tbody button')[0]!;
    const newest = lookAlikeQuestion(button)?.options.find(
      (option) => option.resolution === 'newest-in-collection',
    );
    expect(newest?.policy).toEqual({
      kind: 'newest-in-collection',
      collectionLabel: 'Projects table',
    });
    expect(newest?.caveat).toBeTruthy();
  });

  it('offers no collection answers outside a collection', () => {
    document.body.innerHTML = `<main>
      <button type="button" aria-label="Open">Open</button>
      <button type="button" aria-label="Open">Open</button></main>`;
    const resolutions = resolutionsOf(document.querySelector('button')!);
    expect(resolutions).toEqual(['by-name', 'nth', 'any', 'exact']);
  });

  it('carries a resolver-ready policy on every answer', () => {
    renderTable({ sorted: true });
    const question = lookAlikeQuestion(document.querySelectorAll('tbody button')[1]!);
    expect(question?.options.every((option) => typeof option.policy.kind === 'string')).toBe(true);
    const ordinal = question?.options.find((option) => option.resolution === 'nth');
    expect(ordinal?.policy).toEqual({ kind: 'ordinal', position: 2, order: 'reading-order' });
  });
});

describe('a recorded approach survives on the target', () => {
  it('persists acts and semantic waits, never a timer', () => {
    const recipe = recordApproach([
      { element: buttonNamed('Import'), revealed: menuNamed('Import from') },
      { element: buttonNamed('CSV file'), route: '/projects/import' },
    ]);
    const persisted = toTargetApproach(recipe, (subject) =>
      subject === 'Import' ? 'tgt_import' : undefined,
    );
    expect(persisted?.legs[0]?.act).toEqual({ kind: 'activateTarget', targetId: 'tgt_import' });
    const routeLeg = persisted?.legs.find((leg) => leg.wait?.type === 'route');
    expect(routeLeg?.wait).toEqual({ type: 'route', match: 'contains', value: '/projects/import' });
    expect(JSON.stringify(persisted)).not.toMatch(/delay|timeout|ms/i);
  });

  it('round-trips back into an editable recipe', () => {
    const recipe = recordApproach([{ element: buttonNamed('Import') }]);
    const persisted = toTargetApproach(recipe);
    const rehydrated = fromTargetApproach(persisted!);
    expect(rehydrated.steps).toHaveLength(persisted!.legs.length);
    expect(rehydrated.steps[0]?.subject).toBe(persisted!.legs[0]?.label);
  });
});

function buttonNamed(name: string): Element {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', name);
  document.body.appendChild(button);
  return button;
}

function menuNamed(name: string): Element {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', name);
  document.body.appendChild(menu);
  return menu;
}
