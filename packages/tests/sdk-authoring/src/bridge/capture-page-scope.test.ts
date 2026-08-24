// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { captureTargetEvidence } from '@lodariq/sdk-authoring/bridge';
import { hasTargetIdentityV2Envelope } from '@lodariq/schema/target-runtime';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';

/**
 * Authoring never wrote down which page a target was picked on, so the resolver
 * had nothing to check. These are the two halves of that: capture records it,
 * and what it records survives the delivery envelope.
 */

function renderButton(): HTMLButtonElement {
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

describe('capture records the page a target was picked on', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    goTo('/projects/all');
  });

  it('writes the page key, and the delivery envelope accepts it', () => {
    const capture = captureTargetEvidence(renderButton());

    expect(capture.identity.context.page).toEqual({ key: '/projects/all' });
    expect(hasTargetIdentityV2Envelope(capture.identity)).toBe(true);
  });

  it('leaves the query string out, so a sorted column is the same page', () => {
    goTo('/projects/all?sort=name&q=atlas');
    const capture = captureTargetEvidence(renderButton());

    expect(capture.identity.context.page).toEqual({ key: '/projects/all' });
  });

  it('records the hash route for a hash-routed application', () => {
    goTo('/#/projects/all?pop=import');
    const capture = captureTargetEvidence(renderButton());

    expect(capture.identity.context.page).toEqual({ key: '/#/projects/all' });
  });

  it('omits the page when the author says it belongs everywhere', () => {
    const capture = captureTargetEvidence(renderButton(), undefined, { page: null });

    expect(capture.identity.context.page).toBeUndefined();
  });

  it('scopes what it captured, end to end', () => {
    const button = renderButton();
    const capture = captureTargetEvidence(button);
    const target = { id: capture.identity.targetId, ...capture };

    expect(resolveTarget(target).element).toBe(button);

    // Same DOM, same element, different page.
    goTo('/billing');
    const elsewhere = resolveTarget(target);
    expect(button.isConnected).toBe(true);
    expect(elsewhere.element).toBeNull();
    expect(elsewhere.reasonCode).toBe('route_mismatch');
  });
});
