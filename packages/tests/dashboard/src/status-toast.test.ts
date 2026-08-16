// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusToast } from '../../../../apps/dashboard/src/components/ui/toaster';

describe('StatusToast', () => {
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

  it('reuses the status banner chrome at 300px', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(createElement(StatusToast, { kind: 'error', title: 'Please try again.' }));
    });

    const toast = container.querySelector('[role="alert"]');
    expect(toast?.className).toContain('w-[300px]');
    expect(toast?.className).toContain('max-w-[300px]');
    expect(toast?.firstElementChild?.className).toContain('--danger-solid');
    expect(toast?.firstElementChild?.querySelector('svg')?.getAttribute('class')).toContain(
      'text-white',
    );
  });
});
