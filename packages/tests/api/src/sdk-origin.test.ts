import { describe, expect, it } from 'vitest';
import {
  bootstrapClaimsMatchOrigin,
  parseExactBrowserOrigin,
} from '../../../../apps/api/src/sdk-origin';

describe('public SDK exact-origin boundary', () => {
  it.each([
    ['https://staging.example.com', 'https://staging.example.com'],
    ['https://staging.example.com:8443', 'https://staging.example.com:8443'],
    ['http://127.0.0.1:5175', 'http://127.0.0.1:5175'],
    ['https://example.com:443', 'https://example.com'],
  ])('normalizes an origin-only HTTP URL', (input, expected) => {
    expect(parseExactBrowserOrigin(input)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    ' https://example.com',
    'https://example.com/path',
    'https://example.com?mode=authoring',
    'https://user@example.com',
    'javascript:alert(1)',
    'null',
  ])('rejects missing or non-origin input: %s', (input) => {
    expect(parseExactBrowserOrigin(input)).toBeNull();
  });

  it('requires optional body claims to remain inside the header origin', () => {
    expect(
      bootstrapClaimsMatchOrigin('https://staging.example.com', {
        origin: 'https://staging.example.com',
        href: 'https://staging.example.com/products?tab=active#top',
      }),
    ).toBe(true);

    expect(
      bootstrapClaimsMatchOrigin('https://staging.example.com', {
        origin: 'https://production.example.com',
      }),
    ).toBe(false);
    expect(
      bootstrapClaimsMatchOrigin('https://staging.example.com', {
        href: 'https://production.example.com/products',
      }),
    ).toBe(false);
    expect(
      bootstrapClaimsMatchOrigin('https://staging.example.com', {
        href: 'https://user@staging.example.com/products',
      }),
    ).toBe(false);
  });
});
