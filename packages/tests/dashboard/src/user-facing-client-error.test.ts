import { describe, expect, it } from 'vitest';
import {
  ClientAuthError,
  userFacingClientError,
} from '../../../../apps/dashboard/src/lib/client-auth-api';

const FALLBACK = 'Account security is unavailable.';

describe('userFacingClientError', () => {
  it('keeps API auth errors and hides runtime exceptions', () => {
    expect(
      userFacingClientError(new ClientAuthError(409, 'That username is taken.'), FALLBACK),
    ).toBe('That username is taken.');
    expect(
      userFacingClientError(
        new TypeError("Cannot read properties of null (reading 'reset')"),
        FALLBACK,
      ),
    ).toBe(FALLBACK);
    expect(userFacingClientError(new Error('fetch failed'), FALLBACK)).toBe(FALLBACK);
    expect(userFacingClientError('boom', FALLBACK)).toBe(FALLBACK);
  });
});
