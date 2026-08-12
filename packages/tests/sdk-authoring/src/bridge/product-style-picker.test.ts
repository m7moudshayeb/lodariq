// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startProductStylePicker } from '@lodariq/sdk-authoring/bridge';

describe('product style picker', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('ignores Lodariq chrome even when the event starts inside its shadow tree', () => {
    const chrome = document.createElement('lodariq-tour');
    const shadow = chrome.attachShadow({ mode: 'open' });
    const internalButton = document.createElement('button');
    shadow.append(internalButton);
    document.body.append(chrome);
    const onPick = vi.fn();
    const picker = startProductStylePicker({ onPick });

    internalButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }),
    );

    expect(onPick).not.toHaveBeenCalled();
    picker.cancel();
  });

  it('selects a customer-page element in one click', () => {
    const productButton = document.createElement('button');
    document.body.append(productButton);
    const onPick = vi.fn();
    startProductStylePicker({ onPick });

    productButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }),
    );

    expect(onPick).toHaveBeenCalledWith(productButton);
  });
});
