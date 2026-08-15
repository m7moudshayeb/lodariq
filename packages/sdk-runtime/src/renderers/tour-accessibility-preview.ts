import type { AuthoringAccessibilityPreviewMode, CompiledStep } from '@lodariq/schema';
import { runtimeText } from '../i18n';

/** Authoring-only evidence. It never changes the visitor-facing accessibility tree. */
export function appendAuthoringAccessibilityEvidence(
  content: HTMLElement,
  step: CompiledStep,
  mode: AuthoringAccessibilityPreviewMode | undefined,
): void {
  if (mode !== 'keyboard' && mode !== 'screenReader') return;
  const region = content.ownerDocument.createElement('aside');
  region.className = 'tour-accessibility-evidence';
  region.setAttribute('aria-live', 'off');
  const heading = content.ownerDocument.createElement('strong');
  heading.textContent =
    mode === 'keyboard'
      ? runtimeText('Keyboard focus order')
      : runtimeText('Screen-reader announcement log');
  region.appendChild(heading);
  if (mode === 'screenReader') {
    const announcement = content.ownerDocument.createElement('p');
    announcement.textContent = runtimeText('Announcement: {label}', {
      label: step.accessibilityName ?? runtimeText('Lodariq tour'),
    });
    region.appendChild(announcement);
    content.appendChild(region);
    return;
  }

  const list = content.ownerDocument.createElement('ol');
  for (const [index, control] of [
    ...content.querySelectorAll<HTMLElement>('button, a[href]'),
  ].entries()) {
    const item = content.ownerDocument.createElement('li');
    item.textContent = runtimeText('{number}. {label}', {
      number: index + 1,
      label:
        control.getAttribute('aria-label')?.trim() ||
        control.textContent?.trim() ||
        runtimeText('Unlabeled control'),
    });
    list.appendChild(item);
  }
  region.appendChild(list);
  content.appendChild(region);
}
