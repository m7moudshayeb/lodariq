import { describe, expect, it } from 'vitest';
import { isSafeNavigationUrl, resolveSafeNavigationUrl } from '@lodariq/schema';

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
});
