// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthoringSelect } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/design-system/select';

describe('AuthoringSelect search', () => {
  let root: Root;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
  });

  it('filters localized labels and search aliases before selecting an option', async () => {
    const onValueChange = vi.fn();
    await act(async () => {
      root.render(
        createElement(AuthoringSelect, {
          ariaLabel: 'Experience language',
          dataAction: 'content-locale',
          dataBlockId: 'doc_1',
          onValueChange,
          options: [
            { value: 'en', label: 'English', searchText: 'English' },
            { value: 'de', label: 'Deutsch', searchText: 'German' },
            { value: 'fr', label: 'Français', searchText: 'French' },
          ],
          search: {
            emptyLabel: 'No languages found',
            label: 'Search languages',
            placeholder: 'Search languages',
          },
          value: 'en',
        }),
      );
    });

    const trigger = document.querySelector<HTMLButtonElement>('[aria-label="Experience language"]');
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });

    const search = document.querySelector<HTMLInputElement>('[aria-label="Search languages"]');
    expect(search).not.toBeNull();
    expect(document.activeElement).toBe(search);

    await act(async () => setInputValue(search!, 'German'));
    expect(optionLabels()).toEqual(['Deutsch']);

    await act(async () => document.querySelector<HTMLButtonElement>('[role="option"]')?.click());
    expect(onValueChange).toHaveBeenCalledWith('de');
  });
});

function optionLabels(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.textContent?.trim() ?? '',
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
