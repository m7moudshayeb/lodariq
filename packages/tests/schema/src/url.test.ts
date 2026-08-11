import { describe, expect, it } from 'vitest';
import {
  isSafeNavigationUrl,
  resolveSafeNavigationDestination,
  resolveSafeNavigationUrl,
} from '@lodariq/schema';

describe('safe navigation URL policy', () => {
  it('allows HTTPS, mailto, and same-app relative navigation by default', () => {
    expect(resolveSafeNavigationUrl('https://example.com/docs')).toBe('https://example.com/docs');
    expect(resolveSafeNavigationUrl('mailto:support@example.com')).toBe(
      'mailto:support@example.com',
    );
    expect(resolveSafeNavigationUrl('/settings')).toBe('/settings');
    expect(resolveSafeNavigationUrl('?tab=billing')).toBe('?tab=billing');
    expect(resolveSafeNavigationUrl('#step-2')).toBe('#step-2');
    expect(resolveSafeNavigationUrl('settings/profile')).toBe('settings/profile');
  });

  it('infers HTTPS for domain-like URLs without treating customer paths as domains', () => {
    expect(resolveSafeNavigationUrl('www.google.com')).toBe('https://www.google.com/');
    expect(resolveSafeNavigationUrl('google.com/search?q=lodariq')).toBe(
      'https://google.com/search?q=lodariq',
    );
    expect(resolveSafeNavigationUrl('docs.example.com/start')).toBe(
      'https://docs.example.com/start',
    );
    expect(resolveSafeNavigationUrl('/docs.example.com/start')).toBe('/docs.example.com/start');
    expect(resolveSafeNavigationUrl('settings/profile')).toBe('settings/profile');
  });

  it('blocks HTTP, protocol-relative, script, and data navigation by default', () => {
    expect(isSafeNavigationUrl('http://example.com/docs')).toBe(false);
    expect(isSafeNavigationUrl('//example.com/docs')).toBe(false);
    expect(isSafeNavigationUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeNavigationUrl('data:text/html,<h1>unsafe</h1>')).toBe(false);
    expect(isSafeNavigationUrl('slack://channel')).toBe(false);
  });

  it('allows app schemes only when explicitly approved', () => {
    expect(resolveSafeNavigationUrl('slack://channel', { approvedAppSchemes: ['slack'] })).toBe(
      'slack://channel',
    );
    expect(
      resolveSafeNavigationUrl('zoommtg://zoom.us/join', { approvedAppSchemes: ['zoommtg:'] }),
    ).toBe('zoommtg://zoom.us/join');
    expect(isSafeNavigationUrl('slack://channel', { approvedAppSchemes: ['zoommtg'] })).toBe(false);
  });

  it('classifies links against the customer page origin', () => {
    const options = { baseUrl: 'https://customer.example/products/42' };

    expect(resolveSafeNavigationDestination('/settings', options)).toEqual({
      href: '/settings',
      kind: 'internal',
    });
    expect(
      resolveSafeNavigationDestination('https://customer.example/billing', options),
    ).toEqual({
      href: 'https://customer.example/billing',
      kind: 'internal',
    });
    expect(resolveSafeNavigationDestination('https://docs.example.com/start', options)).toEqual({
      href: 'https://docs.example.com/start',
      kind: 'external',
    });
    expect(resolveSafeNavigationDestination('www.google.com', options)).toEqual({
      href: 'https://www.google.com/',
      kind: 'external',
    });
    expect(resolveSafeNavigationDestination('mailto:support@example.com', options)).toEqual({
      href: 'mailto:support@example.com',
      kind: 'handoff',
    });
  });
});
