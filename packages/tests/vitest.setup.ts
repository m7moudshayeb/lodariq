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

// jsdom does not implement pointer capture. Radix Select uses these methods
// during normal pointer interaction, so provide the browser no-op behavior its
// component tests need.
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

// Header auth is an explicit test-only mode. Application runtimes default to
// Lodariq-owned opaque sessions in every environment.
process.env.LODARIQ_AUTH_MODE ??= 'headers';
