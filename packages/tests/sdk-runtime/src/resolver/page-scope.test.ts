// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { ElementFingerprint, Target, TargetIdentityV2 } from '@lodariq/schema';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';

/**
 * The page gate, on the one case that matters: a lookalike is sitting on the
 * wrong page, fully rendered and connected, and the target must refuse it.
 *
 * Hiding the card is not enough — two paths call `.click()` on whatever
 * resolved, so a target that still matches off-page presses an unrelated
 * control in the customer's live application.
 */

const LEGACY_FINGERPRINT: ElementFingerprint = { stableAttributes: {}, tagName: 'button' };

function scopedIdentity(page?: TargetIdentityV2['context']['page']): TargetIdentityV2 {
  return {
    schemaVersion: 2,
    targetId: 'target_new_report',
    intent: { elementKind: 'control', requiredAction: 'observe-click' },
    invariants: {
      configuredAttributes: { 'data-testid': 'new-report' },
      semanticAttributes: { type: 'button' },
    },
    semantics: { tagName: 'button', role: 'button' },
    context: { ...(page ? { page } : {}), ancestorRoles: ['main'] },
    localizedEvidence: [{ locale: 'en', accessibleName: 'New report', label: 'New report' }],
    captureEvidence: {
      sampleCount: 3,
      stableSignalFamilies: [
        'configured-attribute',
        'semantic-attribute',
        'element-semantics',
        'ancestor-context',
      ],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.75,
      quality: 'strong',
    },
    display: { authorLabel: 'New report' },
  };
}

function targetFor(identity: TargetIdentityV2): Pick<Target, 'id' | 'fingerprint' | 'identity'> {
  return { id: identity.targetId, fingerprint: LEGACY_FINGERPRINT, identity };
}

function renderLookalike(): HTMLButtonElement {
  const main = document.createElement('main');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset['testid'] = 'new-report';
  button.setAttribute('aria-label', 'New report');
  main.appendChild(button);
  document.body.appendChild(main);
  return button;
}

const goTo = (url: string): void => history.pushState(null, '', url);

describe('page scope in the resolver', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    goTo('/projects');
  });

  it('resolves on the page the target was picked on', () => {
    const button = renderLookalike();
    const result = resolveTarget(targetFor(scopedIdentity({ key: '/projects' })));

    expect(result.state).toBe('found');
    expect(result.element).toBe(button);
  });

  it('refuses a lookalike that is right there on another page', () => {
    goTo('/billing');
    const lookalike = renderLookalike();

    const result = resolveTarget(targetFor(scopedIdentity({ key: '/projects' })));

    // The element the resolver would otherwise have taken is present, attached
    // and indistinguishable — this is a page decision, not an availability one.
    expect(lookalike.isConnected).toBe(true);
    expect(document.querySelector('[data-testid="new-report"]')).toBe(lookalike);
    expect(result.state).toBe('missing');
    expect(result.reasonCode).toBe('route_mismatch');
    expect(result.element).toBeNull();
    expect(result.anchor).toBeNull();
  });

  it('tells one hash route from another', () => {
    goTo('/#/projects/all');
    renderLookalike();
    const identity = scopedIdentity({ key: '/#/projects/all' });

    expect(resolveTarget(targetFor(identity)).state).toBe('found');

    goTo('/#/billing/plan');
    expect(resolveTarget(targetFor(identity)).state).toBe('missing');
  });

  it('keeps resolving through a sort, a dialog and a session id', () => {
    goTo('/#/projects/all');
    const button = renderLookalike();
    const identity = scopedIdentity({ key: '/#/projects/all' });

    for (const url of [
      '/#/projects/all?sort=name',
      '/#/projects/all?sort=name&pop=import',
      '/?session=abc123&q=invoices#/projects/all',
    ]) {
      goTo(url);
      const result = resolveTarget(targetFor(identity));
      expect(result.state, url).toBe('found');
      expect(result.element, url).toBe(button);
    }
  });

  it('covers a changing record id only when the author asked for a prefix', () => {
    goTo('/projects/8f21');
    renderLookalike();

    expect(resolveTarget(targetFor(scopedIdentity({ key: '/projects' }))).state).toBe('missing');
    expect(
      resolveTarget(targetFor(scopedIdentity({ key: '/projects', match: 'prefix' }))).state,
    ).toBe('found');

    goTo('/projects-archive');
    expect(
      resolveTarget(targetFor(scopedIdentity({ key: '/projects', match: 'prefix' }))).state,
    ).toBe('missing');
  });

  it('leaves a target with no page recorded alone', () => {
    goTo('/billing');
    const button = renderLookalike();

    const result = resolveTarget(targetFor(scopedIdentity()));

    expect(result.state).toBe('found');
    expect(result.element).toBe(button);
  });

  it('lets a host name the page instead of the address bar', () => {
    goTo('/billing');
    renderLookalike();

    expect(
      resolveTarget(targetFor(scopedIdentity({ key: '/projects' })), document, {
        pageKey: '/projects',
      }).state,
    ).toBe('found');
  });
});
