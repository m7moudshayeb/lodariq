class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = TestResizeObserver;
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

// Header auth is an explicit test-only mode. Application runtimes default to
// Lodariq-owned opaque sessions in every environment.
process.env.LODARIQ_AUTH_MODE ??= 'headers';
