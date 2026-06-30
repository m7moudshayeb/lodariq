// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installCreatorToolbar,
  removeCreatorToolbar,
} from '@lodariq/sdk-authoring/creator-toolbar';
import type { LodariqBrowserApi } from '@lodariq/sdk-runtime/lodariq-loader';

describe('creator toolbar', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.Lodariq;
  });

  it('does not render without the gated Lodariq browser API', () => {
    expect(installCreatorToolbar()).toBeNull();
    expect(document.querySelector('[data-lodariq-creator-toolbar="true"]')).toBeNull();
  });

  it('removes a stale toolbar when authoring is disabled', () => {
    const stale = document.createElement('button');
    stale.dataset['lodariqCreatorToolbar'] = 'true';
    document.body.appendChild(stale);
    window.Lodariq = fakeApi({ enabled: false });

    expect(installCreatorToolbar()).toBeNull();
    expect(document.querySelector('[data-lodariq-creator-toolbar="true"]')).toBeNull();
  });

  it('renders a creator-only opener and calls openAuthoring', async () => {
    const openAuthoring = vi.fn().mockResolvedValue(undefined);
    window.Lodariq = fakeApi({
      enabled: true,
      iframeSrc: 'https://editor.lodariq.com/authoring.html',
      openAuthoring,
    });

    const button = installCreatorToolbar();

    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button?.textContent).toBe('Edit');
    expect(button?.className).toBe('lodariq-creator-toolbar');
    expect(button?.getAttribute('aria-label')).toBe('Open Lodariq authoring');
    button?.click();

    expect(openAuthoring).toHaveBeenCalledTimes(1);
    expect(button?.getAttribute('aria-busy')).toBe('true');
    await Promise.resolve();
    await Promise.resolve();
    expect(button?.hasAttribute('aria-busy')).toBe(false);
  });

  it('injects toolbar styles with the host CSP nonce', () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_toolbar">';
    window.Lodariq = fakeApi({ enabled: true });

    installCreatorToolbar();

    const style = document.getElementById('lodariq-creator-toolbar-style');
    expect(style?.nonce).toBe('nonce_toolbar');
    expect(style?.textContent).toContain('data-lodariq-creator-toolbar');
  });

  it('supports custom container, label, aria label, and class', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({
      container,
      label: 'Author',
      ariaLabel: 'Open authoring mode',
      className: 'custom-toolbar',
    });

    expect(button?.parentElement).toBe(container);
    expect(button?.textContent).toBe('Author');
    expect(button?.getAttribute('aria-label')).toBe('Open authoring mode');
    expect(button?.className).toBe('custom-toolbar');

    removeCreatorToolbar(container);
    expect(container.querySelector('[data-lodariq-creator-toolbar="true"]')).toBeNull();
  });

  it('dispatches an error event when opening authoring fails', async () => {
    const error = new Error('expired session');
    window.Lodariq = fakeApi({
      enabled: true,
      openAuthoring: vi.fn().mockRejectedValue(error),
    });
    const listener = vi.fn();
    window.addEventListener('lodariq:authoring-error', listener);

    installCreatorToolbar()?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { error },
      }),
    );
  });
});

function fakeApi({
  enabled,
  iframeSrc,
  openAuthoring = vi.fn().mockResolvedValue(undefined),
}: {
  enabled: boolean;
  iframeSrc?: string;
  openAuthoring?: LodariqBrowserApi['openAuthoring'];
}): LodariqBrowserApi {
  return {
    manifest: {
      documentId: 'doc_tour_welcome',
      currentVersion: 'sha256-live',
    },
    authoring: {
      enabled,
      ...(iframeSrc ? { iframeSrc } : {}),
    },
    identify: vi.fn(),
    track: vi.fn(),
    playTour: vi.fn().mockResolvedValue(undefined),
    openAuthoring,
    stopTour: vi.fn(),
  };
}
