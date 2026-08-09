class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = TestResizeObserver;
}

// Header auth is an explicit test-only mode. Application runtimes default to
// Lodariq-owned opaque sessions in every environment.
process.env.LODARIQ_AUTH_MODE ??= 'headers';
