import { describe, expect, it } from 'vitest';
import { ACCOUNT_SECURITY_TABS } from '../../../../apps/dashboard/src/components/account-security-settings';

describe('account security tabs', () => {
  it('keeps a unique sidebar tab for each account section', () => {
    const ids = ACCOUNT_SECURITY_TABS.map((tab) => tab.id);
    expect(ids).toEqual(['identifier', 'password', 'email', 'methods', 'sessions', 'data']);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
