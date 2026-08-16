// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusBanner } from '../../../../apps/dashboard/src/components/ui/status-banner';

describe('StatusBanner', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('uses a deep icon and title with lighter body copy', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        createElement(
          StatusBanner,
          { kind: 'error', title: 'Account security is unavailable.' },
          'Sign in again, then return here.',
        ),
      );
    });

    const banner = container.querySelector('[role="alert"]');
    expect(banner).toBeTruthy();
    expect(banner?.querySelector('svg')).toBeTruthy();
    expect(banner?.textContent).toContain('Account security is unavailable.');
    expect(banner?.textContent).toContain('Sign in again, then return here.');
    expect(banner?.className).toContain('--danger-bg');
    expect(container.querySelector('p')?.className).toContain('--danger-fg');
  });
});
