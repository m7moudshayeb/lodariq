// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { ElementFingerprint } from '@talmeh/schema';
import {
  accessibleNameOf,
  ancestorLandmarksOf,
  attributeEntry,
  nearbyTextOf,
  roleOf,
  stableAttributesOf,
} from '@talmeh/schema/dom';
import { resolve } from '@talmeh/sdk-runtime/resolver';

function fingerprintFrom(element: Element): ElementFingerprint {
  const role = roleOf(element);
  const accessibleName = accessibleNameOf(element);
  return {
    stableAttributes: stableAttributesOf(element),
    tagName: element.tagName.toLowerCase(),
    ...(role ? { role } : {}),
    ...(accessibleName ? { accessibleName, label: accessibleName } : {}),
  };
}

describe('@talmeh/schema/dom', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collects only non-empty stable attributes', () => {
    const button = document.createElement('button');
    button.dataset['talmehId'] = 'save';
    button.id = '   ';
    button.setAttribute('data-testid', 'save-btn');

    expect(stableAttributesOf(button)).toEqual({
      'data-talmeh-id': 'save',
      'data-testid': 'save-btn',
    });
  });

  it('derives implicit and explicit roles', () => {
    const button = document.createElement('button');
    const summary = document.createElement('summary');
    summary.textContent = 'Details';
    const link = document.createElement('a');
    link.href = '/projects';
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const multi = document.createElement('select');
    multi.multiple = true;
    const main = document.createElement('main');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';

    expect(roleOf(button)).toBe('button');
    expect(roleOf(summary)).toBe('button');
    expect(roleOf(link)).toBe('link');
    expect(roleOf(textarea)).toBe('textbox');
    expect(roleOf(select)).toBe('combobox');
    expect(roleOf(multi)).toBe('listbox');
    expect(roleOf(main)).toBe('main');
    expect(roleOf(checkbox)).toBe('checkbox');
    const tabRole = document.createElement('div');
    tabRole.setAttribute('role', 'tab');
    expect(roleOf(tabRole)).toBe('tab');
  });

  it('maps text-like input types to textbox', () => {
    const email = document.createElement('input');
    email.type = 'email';
    expect(roleOf(email)).toBe('textbox');
  });

  it('derives accessible names only from naming elements and roles', () => {
    const labelled = document.createElement('button');
    labelled.setAttribute('aria-label', 'Save draft');

    const referenced = document.createElement('button');
    const label = document.createElement('span');
    label.id = 'save-label';
    label.textContent = 'Save';
    referenced.setAttribute('aria-labelledby', 'save-label');
    document.body.append(label, referenced);

    const summary = document.createElement('summary');
    summary.textContent = 'Show more';

    const tab = document.createElement('div');
    tab.setAttribute('role', 'tab');
    tab.textContent = 'Billing';

    const menuitem = document.createElement('div');
    menuitem.setAttribute('role', 'menuitem');
    menuitem.textContent = 'Archive';

    const generic = document.createElement('div');
    generic.textContent = 'Not a name';

    expect(accessibleNameOf(labelled)).toBe('Save draft');
    expect(accessibleNameOf(referenced)).toBe('Save');
    expect(accessibleNameOf(summary)).toBe('Show more');
    expect(accessibleNameOf(tab)).toBe('Billing');
    expect(accessibleNameOf(menuitem)).toBe('Archive');
    expect(accessibleNameOf(generic)).toBeUndefined();
  });

  it('returns optional attribute entries and nearby text snippets', () => {
    const input = document.createElement('input');
    input.placeholder = 'Email address';
    const wrapper = document.createElement('section');
    wrapper.textContent = 'Account settings for your workspace profile information';
    const child = document.createElement('span');
    child.textContent = 'Email';
    wrapper.appendChild(child);

    expect(attributeEntry(input, 'placeholder')).toEqual({ placeholder: 'Email address' });
    expect(attributeEntry(input, 'title')).toEqual({});
    expect(nearbyTextOf(child)).toEqual([
      'Account settings for your workspace profile informationEmail'.slice(0, 120),
    ]);
  });

  it('walks ancestor landmarks up to three named containers', () => {
    document.body.innerHTML = `
      <nav aria-label="Primary">
        <form aria-label="Create project">
          <main aria-label="Workspace">
            <button data-talmeh-id="new-project">New project</button>
          </main>
        </form>
      </nav>`;
    const button = document.querySelector('button')!;

    expect(ancestorLandmarksOf(button)).toEqual([
      { role: 'main', accessibleName: 'Workspace' },
      { role: 'form', accessibleName: 'Create project' },
      { role: 'nav', accessibleName: 'Primary' },
    ]);
  });

  it('keeps capture semantics aligned with runtime resolution for named controls', () => {
    const cases = [
      {
        html: `<button data-talmeh-id="new-project">New project</button>`,
        selector: 'button',
      },
      {
        html: `<details><summary>Toggle section</summary></details>`,
        selector: 'summary',
      },
      {
        html: `<div role="tablist"><div role="tab">Settings</div></div>`,
        selector: '[role="tab"]',
      },
      {
        html: `<div role="menu"><div role="menuitem">Delete</div></div>`,
        selector: '[role="menuitem"]',
      },
    ];

    for (const testCase of cases) {
      document.body.innerHTML = testCase.html;
      const element = document.querySelector(testCase.selector)!;
      expect(resolve(fingerprintFrom(element)).state).toBe('found');
    }
  });
});
