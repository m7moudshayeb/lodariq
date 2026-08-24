// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Target, TargetIdentityV2 } from '@lodariq/schema';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';

/**
 * The shape that made this necessary: one toolbar in the page header, and eight
 * row menus in the table below it. Every one is a `button`, every one is inside
 * `main`, every one carries `aria-haspopup="menu"`. Nothing an identity may
 * durably compare tells them apart except how deeply they sit.
 */
function renderProjectsPage(): void {
  const rows = Array.from(
    { length: 8 },
    (_, index) => `
      <tr>
        <th scope="row">Project ${index + 1}</th>
        <td><button type="button" aria-haspopup="menu">Row actions</button></td>
      </tr>`,
  ).join('');
  document.body.innerHTML = `
    <main>
      <header>
        <h1>Projects</h1>
        <div><button type="button" aria-haspopup="menu">Import</button></div>
      </header>
      <table><tbody>${rows}</tbody></table>
    </main>`;
}

const toolbarButton = (): Element => document.querySelector('header button')!;

/** No configured attribute and no `aria-label`: the case a real product hands us. */
function identity(): TargetIdentityV2 {
  return {
    schemaVersion: 2,
    targetId: 'target_import',
    intent: { elementKind: 'control', requiredAction: 'observe-click', resolutionMode: 'semantic' },
    invariants: { semanticAttributes: { 'aria-haspopup': 'menu' } },
    semantics: { tagName: 'button', role: 'button' },
    context: { ancestorRoles: ['main'] },
    localizedEvidence: [{ locale: 'en', accessibleName: 'Import' }],
    captureEvidence: {
      sampleCount: 5,
      // What the creator's failing capture reported: no `sibling-position`.
      stableSignalFamilies: ['semantic-attribute', 'element-semantics', 'ancestor-context'],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.3,
      quality: 'usable',
    },
    display: { authorLabel: 'Import' },
  };
}

const target: Target = {
  id: 'target_import',
  fingerprint: { stableAttributes: {}, tagName: 'button', accessibleName: 'Import' },
  identity: identity(),
};

describe('depth in the page separates a toolbar control from the rows below it', () => {
  beforeEach(renderProjectsPage);

  it('takes the button in the context it was captured in', () => {
    const result = resolveTarget(target, document);
    expect(result.element).toBe(toolbarButton());
  });

  it('does not count the row menus as the same place', () => {
    // Captured under `main`; the row menus are inside a table inside `main`, and
    // treating that as the same context made all nine score identically.
    const result = resolveTarget(target, document);
    expect(result.state).toBe('found');
  });

  it('still finds it when the product wraps the header in one more container', () => {
    const header = document.querySelector('header')!;
    const wrapper = document.createElement('section');
    wrapper.setAttribute('aria-label', 'Page actions');
    header.replaceWith(wrapper);
    wrapper.appendChild(header);
    expect(resolveTarget(target, document).element).toBe(toolbarButton());
  });
});
