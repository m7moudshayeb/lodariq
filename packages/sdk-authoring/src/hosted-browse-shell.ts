import { X, createElement as createLucideElement } from 'lucide';
import { createNonceStyleElement } from '@lodariq/schema/dom';
import { CREATOR_CHROME_FONT_STACK, CREATOR_CHROME_TOKENS } from './creator-chrome-tokens';
import { applyAuthoringLocale, authoringText } from './i18n';

const BROWSE_SHELL_WIDTH = 390;
const BROWSE_SHELL_HEIGHT = 640;
const BROWSE_SHELL_MARGIN = 16;

export interface HostedBrowseShell {
  destroy(): void;
  releaseIframe(): void;
  setClosing(closing: boolean): void;
  toggleMinimized(): boolean;
}

interface HostedBrowseShellOptions {
  iframe: HTMLIFrameElement;
  onRequestClose(): void;
}

/** A bounded, modeless shell. No backdrop or full-page pointer layer is created. */
export function mountHostedBrowseShell(options: HostedBrowseShellOptions): HostedBrowseShell {
  const host = document.createElement('lodariq-hosted-browser');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = createNonceStyleElement(document, '');
  style.textContent = `
    :host {
      color: ${CREATOR_CHROME_TOKENS.ink};
      display: block;
      font-family: ${CREATOR_CHROME_FONT_STACK};
      height: min(${BROWSE_SHELL_HEIGHT}px, calc(100vh - ${BROWSE_SHELL_MARGIN * 2}px));
      height: min(${BROWSE_SHELL_HEIGHT}px, calc(100dvh - ${BROWSE_SHELL_MARGIN * 2}px));
      left: max(${BROWSE_SHELL_MARGIN}px, env(safe-area-inset-left), calc(100vw - ${BROWSE_SHELL_WIDTH + BROWSE_SHELL_MARGIN}px));
      position: fixed;
      top: max(${BROWSE_SHELL_MARGIN}px, env(safe-area-inset-top));
      width: min(${BROWSE_SHELL_WIDTH}px, calc(100vw - ${BROWSE_SHELL_MARGIN * 2}px));
      z-index: 2147483646;
    }
    :host([data-minimized="true"]) { height: 52px; }
    .shell {
      background: ${CREATOR_CHROME_TOKENS.canvas};
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, .4), 0 4px 14px rgba(0, 0, 0, .3);
      display: grid;
      height: 100%;
      overflow: hidden;
      grid-template-rows: 52px minmax(0, 1fr);
    }
    header {
      align-items: center;
      background: ${CREATOR_CHROME_TOKENS.chrome};
      border-bottom: 1px solid ${CREATOR_CHROME_TOKENS.border};
      color: ${CREATOR_CHROME_TOKENS.ink};
      cursor: grab;
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1fr) auto;
      padding: 0 12px 0 16px;
      touch-action: none;
      user-select: none;
    }
    header:active { cursor: grabbing; }
    .copy { display: grid; gap: 4px; min-width: 0; }
    .copy strong { font-size: 12px; font-weight: 600; letter-spacing: .01em; }
    .copy span { color: ${CREATOR_CHROME_TOKENS.muted}; font-size: 10px; }
    button {
      align-items: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 8px;
      color: ${CREATOR_CHROME_TOKENS.muted};
      cursor: pointer;
      display: inline-flex;
      height: 36px;
      justify-content: center;
      padding: 0;
      width: 36px;
    }
    button:hover { background: rgba(255, 255, 255, .07); color: ${CREATOR_CHROME_TOKENS.ink}; }
    button:focus-visible { outline: 2px solid ${CREATOR_CHROME_TOKENS.focus}; outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: .55; }
    .body { min-height: 0; }
    :host([data-minimized="true"]) .body { display: none; }
    ::slotted(iframe) { display: block; height: 100%; width: 100%; }
  `;
  const shell = document.createElement('section');
  shell.className = 'shell';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-label', authoringText('Browse Lodariq experiences'));
  const header = document.createElement('header');
  header.tabIndex = 0;
  header.setAttribute(
    'aria-label',
    authoringText('Move Lodariq experience browser with arrow keys'),
  );
  const copy = document.createElement('span');
  copy.className = 'copy';
  const wordmark = document.createElement('strong');
  wordmark.textContent = 'Lodariq';
  const context = document.createElement('span');
  context.textContent = authoringText('Author on this page');
  copy.append(wordmark, context);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', authoringText('Close experience browser'));
  closeButton.title = authoringText('Close');
  const closeIcon = createLucideElement(X, {
    'aria-hidden': 'true',
    height: 18,
    width: 18,
  });
  closeButton.appendChild(closeIcon);
  header.append(copy, closeButton);
  const body = document.createElement('div');
  body.className = 'body';
  const slot = document.createElement('slot');
  slot.name = 'hosted-browser';
  body.appendChild(slot);
  shell.append(header, body);
  shadow.append(style, shell);
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragging = false;

  const clamp = (left: number, top: number): void => {
    const width = host.getBoundingClientRect().width || BROWSE_SHELL_WIDTH;
    const height = host.getBoundingClientRect().height || BROWSE_SHELL_HEIGHT;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? innerWidth;
    const viewportHeight = viewport?.height ?? innerHeight;
    const minimumLeft = viewportLeft + BROWSE_SHELL_MARGIN;
    const minimumTop = viewportTop + BROWSE_SHELL_MARGIN;
    const maximumLeft = viewportLeft + viewportWidth - width - BROWSE_SHELL_MARGIN;
    const maximumTop = viewportTop + viewportHeight - height - BROWSE_SHELL_MARGIN;
    host.style.left = `${Math.max(minimumLeft, Math.min(left, maximumLeft))}px`;
    host.style.top = `${Math.max(minimumTop, Math.min(top, maximumTop))}px`;
  };
  const pointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    clamp(event.clientX - dragOffsetX, event.clientY - dragOffsetY);
  };
  const pointerUp = (): void => {
    dragging = false;
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
  };
  const pointerDown = (event: PointerEvent): void => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    const bounds = host.getBoundingClientRect();
    dragOffsetX = event.clientX - bounds.left;
    dragOffsetY = event.clientY - bounds.top;
    dragging = true;
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
  };
  const keyDown = (event: KeyboardEvent): void => {
    const offsets: Partial<Record<string, readonly [number, number]>> = {
      ArrowDown: [0, 10],
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const bounds = host.getBoundingClientRect();
    clamp(bounds.left + offset[0], bounds.top + offset[1]);
  };
  const resize = (): void => {
    const bounds = host.getBoundingClientRect();
    clamp(bounds.left, bounds.top);
  };
  const destroy = (): void => {
    pointerUp();
    header?.removeEventListener('pointerdown', pointerDown);
    header?.removeEventListener('keydown', keyDown);
    closeButton?.removeEventListener('click', options.onRequestClose);
    window.removeEventListener('resize', resize);
    window.visualViewport?.removeEventListener('resize', resize);
    window.visualViewport?.removeEventListener('scroll', resize);
    host.remove();
  };

  header?.addEventListener('pointerdown', pointerDown);
  header?.addEventListener('keydown', keyDown);
  closeButton?.addEventListener('click', options.onRequestClose);
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  options.iframe.slot = 'hosted-browser';
  host.appendChild(options.iframe);
  applyAuthoringLocale(host);
  document.body.appendChild(host);
  resize();

  return {
    destroy,
    releaseIframe: () => {
      options.iframe.removeAttribute('slot');
      document.body.appendChild(options.iframe);
      destroy();
    },
    setClosing: (closing) => {
      if (closeButton) closeButton.disabled = closing;
    },
    toggleMinimized: () => {
      const minimized = host.getAttribute('data-minimized') !== 'true';
      host.setAttribute('data-minimized', minimized ? 'true' : 'false');
      shell.setAttribute(
        'aria-label',
        minimized
          ? authoringText('Lodariq experience browser minimized')
          : authoringText('Browse Lodariq experiences'),
      );
      if (!minimized) resize();
      return minimized;
    },
  };
}
