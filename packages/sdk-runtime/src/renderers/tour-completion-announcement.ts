export function announceAfterTourStops(ownerDocument: Document, message: string): void {
  const selector = '[data-lodariq-tour-completion-announcement]';
  const existing = ownerDocument.querySelector<HTMLElement>(selector);
  const region = existing ?? ownerDocument.createElement('p');
  if (!existing) {
    region.dataset['lodariqTourCompletionAnnouncement'] = 'true';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    Object.assign(region.style, {
      border: '0',
      clipPath: 'inset(50%)',
      height: '1px',
      margin: '-1px',
      overflow: 'hidden',
      padding: '0',
      position: 'absolute',
      whiteSpace: 'nowrap',
      width: '1px',
    });
    ownerDocument.body.appendChild(region);
  }
  region.textContent = '';
  const announce = (): void => {
    if (region.isConnected) region.textContent = message;
  };
  const view = ownerDocument.defaultView;
  if (view?.requestAnimationFrame) view.requestAnimationFrame(announce);
  else globalThis.setTimeout(announce, 0);
}
