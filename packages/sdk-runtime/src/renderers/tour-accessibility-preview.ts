import type { AuthoringAccessibilityPreviewMode, CompiledStep } from '@lodariq/schema';
import { tourRuntimeText } from '../tour-i18n';

/** Authoring-only evidence. It never changes the visitor-facing accessibility tree. */
export function appendAuthoringAccessibilityEvidence(
  content: HTMLElement,
  step: CompiledStep,
  mode: AuthoringAccessibilityPreviewMode | undefined,
  announcements: readonly string[] = [],
): void {
  if (mode !== 'keyboard' && mode !== 'screenReader') return;
  const region = content.ownerDocument.createElement('aside');
  region.className = 'tour-accessibility-evidence';
  region.setAttribute('aria-live', 'off');
  const heading = content.ownerDocument.createElement('strong');
  heading.textContent =
    mode === 'keyboard'
      ? tourRuntimeText('Keyboard focus order')
      : tourRuntimeText('Screen-reader announcement log');
  region.appendChild(heading);
  if (mode === 'screenReader') {
    const log = content.ownerDocument.createElement('ol');
    log.dataset['lodariqAnnouncementLog'] = 'true';
    renderAnnouncementLog(log, announcements.length ? announcements : [stepLabel(step)]);
    region.appendChild(log);
    content.appendChild(region);
    return;
  }

  const list = content.ownerDocument.createElement('ol');
  for (const [index, control] of [
    ...content.querySelectorAll<HTMLElement>('button, a[href]'),
  ].entries()) {
    const item = content.ownerDocument.createElement('li');
    item.textContent = tourRuntimeText('{number}. {label}', {
      number: index + 1,
      label:
        control.getAttribute('aria-label')?.trim() ||
        control.textContent?.trim() ||
        tourRuntimeText('Unlabeled control'),
    });
    list.appendChild(item);
  }
  region.appendChild(list);
  content.appendChild(region);
}

export function updateAuthoringScreenReaderLog(
  content: HTMLElement,
  announcements: readonly string[],
): void {
  const log = content.querySelector<HTMLOListElement>('[data-lodariq-announcement-log]');
  if (log) renderAnnouncementLog(log, announcements);
}

function renderAnnouncementLog(log: HTMLOListElement, announcements: readonly string[]): void {
  log.replaceChildren(
    ...announcements.map((label) => {
      const item = log.ownerDocument.createElement('li');
      item.textContent = tourRuntimeText('Announcement: {label}', { label });
      return item;
    }),
  );
}

function stepLabel(step: CompiledStep): string {
  return step.accessibilityName ?? tourRuntimeText('Lodariq tour');
}
