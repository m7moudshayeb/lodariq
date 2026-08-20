import { describe, expect, it } from 'vitest';
import {
  patternMatchesPage,
  readPageEligibilityContext,
  triggerMatchesPage,
} from '@lodariq/schema/page-eligibility';

/**
 * One matcher, two callers (ADR-0027). The API scopes a bootstrap response with
 * it and the browser rules a page out with it, so any disagreement between the
 * two would show up as an experience that silently never fires.
 */

const PAGE = { exactOrigin: 'https://app.customer.example', pathname: '/settings/billing' };

describe('page eligibility context', () => {
  it('reduces an href to origin and pathname', () => {
    expect(
      readPageEligibilityContext(
        'https://app.customer.example/settings/billing?q=secret#frag',
        'https://app.customer.example',
      ),
    ).toEqual(PAGE);
  });

  it('drops the query and fragment rather than matching against them', () => {
    // Search params carry session tokens and search terms; admitting them would
    // let an authored pattern read visitor data back out.
    const context = readPageEligibilityContext(
      'https://app.customer.example/x?token=abc',
      'https://app.customer.example',
    );
    expect(context?.pathname).toBe('/x');
  });

  it('rejects an href claiming a different origin than the browser proved', () => {
    expect(
      readPageEligibilityContext('https://evil.example/settings', 'https://app.customer.example'),
    ).toBeNull();
  });

  it('rejects an unparseable or absent href', () => {
    expect(readPageEligibilityContext('not a url', 'https://app.customer.example')).toBeNull();
    expect(readPageEligibilityContext(undefined, 'https://app.customer.example')).toBeNull();
  });
});

describe('trigger matching', () => {
  it('keeps a page eligible for every trigger that can fire anywhere', () => {
    expect(triggerMatchesPage({ type: 'manual' }, PAGE)).toBe(true);
    expect(triggerMatchesPage({ type: 'pageLoad' }, PAGE)).toBe(true);
    expect(triggerMatchesPage({ type: 'event', config: { eventName: 'signup' } }, PAGE)).toBe(true);
  });

  it('narrows only on urlMatch', () => {
    expect(
      triggerMatchesPage({ type: 'urlMatch', config: { pattern: '/settings', mode: 'prefix' } }, PAGE),
    ).toBe(true);
    expect(
      triggerMatchesPage({ type: 'urlMatch', config: { pattern: '/billing', mode: 'prefix' } }, PAGE),
    ).toBe(false);
  });
});

describe('pattern modes', () => {
  it('matches an exact pathname or an origin-qualified one', () => {
    expect(patternMatchesPage('/settings/billing', 'exact', PAGE)).toBe(true);
    expect(patternMatchesPage('https://app.customer.example/settings/billing', 'exact', PAGE)).toBe(
      true,
    );
    expect(patternMatchesPage('/settings', 'exact', PAGE)).toBe(false);
  });

  it('matches a prefix', () => {
    expect(patternMatchesPage('/settings', 'prefix', PAGE)).toBe(true);
    expect(patternMatchesPage('/setting', 'prefix', PAGE)).toBe(true);
    expect(patternMatchesPage('/account', 'prefix', PAGE)).toBe(false);
  });

  it('matches a substring', () => {
    expect(patternMatchesPage('bill', 'contains', PAGE)).toBe(true);
    expect(patternMatchesPage('invoice', 'contains', PAGE)).toBe(false);
  });
});
