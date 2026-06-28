// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import type { ElementFingerprint } from '@talmeh/schema';
import { resolve } from '@talmeh/sdk-runtime/resolver';

const fingerprint: ElementFingerprint = {
  tagName: 'button',
  role: 'button',
  accessibleName: 'New project',
  label: 'New project',
  stableAttributes: { 'data-talmeh-id': 'new-project' },
  nearbyText: ['Projects'],
};

describe('semantic resolver (PRD §8.4)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the element by stable attribute even when CSS classes change', () => {
    document.body.innerHTML = `
      <main aria-label="Dashboard">
        <section>Projects
          <button class="totally-different-class-now" data-talmeh-id="new-project"
            aria-label="New project">New project</button>
        </section>
      </main>`;
    const result = resolve(fingerprint);
    expect(result.state).toBe('found');
    expect(result.resolutionMethod).toBe('talmeh_id');
    expect((result.element as HTMLElement).getAttribute('data-talmeh-id')).toBe('new-project');
  });

  it('reports missing when no candidate clears the confidence threshold', () => {
    document.body.innerHTML = `<div>nothing relevant here</div>`;
    const result = resolve(fingerprint);
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
});
