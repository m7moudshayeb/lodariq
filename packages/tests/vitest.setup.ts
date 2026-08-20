import { afterEach } from 'vitest';

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = TestResizeObserver;
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = TestIntersectionObserver;
}

/**
 * Browser APIs jsdom does not implement but Radix and Lexical call during normal
 * interaction.
 *
 * Note: this file evaluates in the runner's own realm, so these guards are a
 * no-op for suites whose jsdom environment is created afterwards. Component
 * suites that drive Radix pointer or focus paths install the same shims
 * themselves — see `installJsdomInteractionShims` in the sdk-authoring tests.
 */
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
}

if (typeof Range !== 'undefined' && typeof Range.prototype.getBoundingClientRect !== 'function') {
  Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return new DOMRect(40, 20, 80, 16);
  };
}

/**
 * Bridge suites stub an iframe's `contentWindow` with a plain `{ postMessage }`
 * object. jsdom's teardown calls `close()` on every child browsing context, so
 * one of those stubs makes the run exit non-zero with nothing failing. Detach
 * them once each test is done.
 */
afterEach(() => {
  if (typeof document === 'undefined') return;
  for (const frame of [...document.querySelectorAll('iframe')]) {
    const view = frame.contentWindow as { close?: unknown } | null;
    if (view && typeof view.close !== 'function') frame.remove();
  }
});

// Header auth is an explicit test-only mode. Application runtimes default to
// Lodariq-owned opaque sessions in every environment.
process.env.LODARIQ_AUTH_MODE ??= 'headers';
