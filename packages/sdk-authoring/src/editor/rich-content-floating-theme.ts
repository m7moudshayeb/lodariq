const RICH_CONTENT_FLOATING_THEME_PROPERTIES = [
  '--lq-color-border',
  '--lq-color-border-soft',
  '--lq-color-ink',
  '--lq-color-ink-soft',
  '--lq-color-muted',
  '--lq-color-page',
  '--lq-color-panel',
  '--lq-color-primary',
  '--lq-color-primary-border',
  '--lq-color-primary-soft',
] as const;

/** Keep body-portaled authoring controls on the same token scope as their tray trigger. */
export function inheritRichContentFloatingTheme(
  reference: HTMLElement,
  floating: HTMLElement,
): void {
  const ownerWindow = reference.ownerDocument.defaultView;
  if (!ownerWindow) return;
  const referenceStyle = ownerWindow.getComputedStyle(reference);
  RICH_CONTENT_FLOATING_THEME_PROPERTIES.forEach((property) => {
    const value = referenceStyle.getPropertyValue(property);
    if (value) floating.style.setProperty(property, value);
  });
}
