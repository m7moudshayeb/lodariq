export function attachOverlayClickOutside(
  options: {
    host: HTMLElement;
    iframe: HTMLIFrameElement;
    isActive: () => boolean;
    onCollapse: () => void;
  },
): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    if (!options.isActive() || event.button !== 0) return;
    if (eventInsideOverlayChrome(event, options.host, options.iframe)) return;
    event.preventDefault();
    event.stopPropagation();
    options.onCollapse();
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  return () => document.removeEventListener('pointerdown', onPointerDown, true);
}

export function eventInsideOverlayChrome(
  event: Event,
  _host: HTMLElement,
  iframe: HTMLIFrameElement,
): boolean {
  return event.composedPath().some((node) => {
    if (!(node instanceof Element)) return false;
    if (node === iframe) return true;
    /**
     * `[data-lodariq-authoring-control]` is the general case: every surface the
     * shell draws carries it. It is listed first because the enumeration below
     * had grown one selector per surface and had silently omitted the mode pill —
     * so pressing `Browsing`, or any row of the pill's menu, read as a click
     * outside the editor and collapsed it instead of doing the thing.
     */
    if (
      node.closest(
        '[data-lodariq-authoring-control="true"], [data-lodariq-filmstrip], [data-lodariq-pulses], [data-lodariq-compass], [data-overlay-frame], .overlay-preview-exit',
      )
    ) {
      return true;
    }
    return Boolean(
      node.closest(
        '[data-lodariq-creator-launcher="true"], [data-lodariq-creator-toolbar="true"], [data-lodariq-authoring-trigger="true"]',
      ),
    );
  });
}
