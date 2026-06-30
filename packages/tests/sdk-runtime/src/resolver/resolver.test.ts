// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import type { ElementFingerprint } from '@lodariq/schema';
import { resolve } from '@lodariq/sdk-runtime/resolver';

const fingerprint: ElementFingerprint = {
  tagName: 'button',
  role: 'button',
  accessibleName: 'New project',
  label: 'New project',
  stableAttributes: { 'data-lodariq-id': 'new-project' },
  nearbyText: ['Projects'],
};

const selectorChangeCorpus: Array<{
  name: string;
  html: string;
  fingerprint: ElementFingerprint;
  expectedText: string;
  expectedMethod: string;
}> = [
  {
    name: 'class names churn while role and accessible name remain stable',
    html: `
      <main aria-label="Dashboard">
        <section class="projects-v2">Projects
          <button class="button-new-v2" aria-label="New project">New project</button>
        </section>
      </main>`,
    fingerprint: {
      tagName: 'button',
      role: 'button',
      accessibleName: 'New project',
      stableAttributes: {},
      nearbyText: ['Projects'],
      scopedCss: '.projects-v1 .button-new-v1',
    },
    expectedText: 'New project',
    expectedMethod: 'role_and_name',
  },
  {
    name: 'wrapper markup changes while label and landmark stay stable',
    html: `
      <main aria-label="Dashboard">
        <section aria-label="Projects">
          <div class="toolbar-redesign">
            <button type="button" title="New project">
              <span>Create</span>
            </button>
          </div>
        </section>
      </main>`,
    fingerprint: {
      tagName: 'button',
      title: 'New project',
      stableAttributes: {},
      ancestorLandmarks: [{ role: 'main', accessibleName: 'Dashboard' }],
      scopedCss: 'main > section.old-projects > button.primary',
    },
    expectedText: 'Create',
    expectedMethod: 'label',
  },
  {
    name: 'input classes change while placeholder and input type remain stable',
    html: `
      <main aria-label="Settings">
        <form aria-label="Billing contact">
          <label>
            Billing email
            <input class="field-new" type="email" placeholder="Owner email" />
          </label>
        </form>
      </main>`,
    fingerprint: {
      tagName: 'input',
      inputType: 'email',
      placeholder: 'Owner email',
      stableAttributes: {},
      ancestorLandmarks: [{ role: 'main', accessibleName: 'Settings' }],
      scopedCss: '.legacy-billing .field-old',
    },
    expectedText: '',
    expectedMethod: 'label',
  },
];

describe('semantic resolver (PRD §8.4)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the element by stable attribute even when CSS classes change', () => {
    document.body.innerHTML = `
      <main aria-label="Dashboard">
        <section>Projects
          <button class="totally-different-class-now" data-lodariq-id="new-project"
            aria-label="New project">New project</button>
        </section>
      </main>`;
    const result = resolve(fingerprint);
    expect(result.state).toBe('found');
    expect(result.resolutionMethod).toBe('lodariq_id');
    expect((result.element as HTMLElement).getAttribute('data-lodariq-id')).toBe('new-project');
  });

  it('reports missing when no candidate clears the confidence threshold', () => {
    document.body.innerHTML = `<div>nothing relevant here</div>`;
    const result = resolve(fingerprint);
    expect(result.state).toBe('missing');
    expect(result.element).toBeNull();
  });

  it('ignores disabled candidates before scoring', () => {
    document.body.innerHTML = `
      <button data-lodariq-id="new-project" aria-label="New project" disabled>New project</button>`;
    const result = resolve(fingerprint);
    expect(result.state).toBe('missing');
    expect(result.element).toBeNull();
  });

  it('does not use diagnostic coordinates to resolve a production target', () => {
    document.body.innerHTML = `<button>Somewhere else</button>`;
    const result = resolve({
      ...fingerprint,
      stableAttributes: {},
      accessibleName: undefined,
      label: undefined,
      diagnosticCoordinates: { x: 10, y: 20 },
    });
    expect(result.state).toBe('missing');
    expect(result.element).toBeNull();
  });

  it('reports ambiguous when two strong candidates are too close', () => {
    document.body.innerHTML = `
      <button role="button" aria-label="New project">New project</button>
      <button role="button" aria-label="New project">New project</button>`;
    const fp: ElementFingerprint = { ...fingerprint, stableAttributes: {} };
    const result = resolve(fp);
    expect(result.state).toBe('ambiguous');
  });

  it('maps text-like input types to textbox before scoring role and name', () => {
    document.body.innerHTML = `<input type="email" aria-label="Email" />`;
    const fp: ElementFingerprint = {
      tagName: 'input',
      role: 'textbox',
      accessibleName: 'Email',
      stableAttributes: {},
    };
    const result = resolve(fp);
    expect(result.state).toBe('found');
    expect(result.resolutionMethod).toBe('role_and_name');
    expect(result.element?.tagName.toLowerCase()).toBe('input');
  });

  it('scores ancestor landmarks, input type, relative position, and scoped CSS semantically', () => {
    document.body.innerHTML = `
      <main aria-label="Dashboard">
        <form aria-label="Project form">
          <input type="email" placeholder="Owner email" />
          <button type="button">Invite</button>
        </form>
      </main>`;

    const fp: ElementFingerprint = {
      tagName: 'input',
      inputType: 'email',
      placeholder: 'Owner email',
      stableAttributes: {},
      ancestorLandmarks: [{ role: 'main', accessibleName: 'Dashboard' }],
      relativePosition: { parentRole: 'form', siblingIndex: 0 },
      scopedCss: 'main form input',
    };

    const result = resolve(fp);

    expect(result.state).toBe('found');
    expect(result.confidence).toBeGreaterThanOrEqual(120);
    expect(result.resolutionMethod).toBe('label');
    expect(result.element?.tagName.toLowerCase()).toBe('input');
  });

  it.each(selectorChangeCorpus)(
    'survives stale CSS selectors when semantic signals stay stable: $name',
    ({ html, fingerprint: corpusFingerprint, expectedText, expectedMethod }) => {
      document.body.innerHTML = html;

      const result = resolve(corpusFingerprint);

      expect(result.state).toBe('found');
      expect(result.resolutionMethod).toBe(expectedMethod);
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.element?.matches(corpusFingerprint.scopedCss ?? '')).toBe(false);
      expect(result.element?.textContent?.trim()).toBe(expectedText);
    },
  );
});
