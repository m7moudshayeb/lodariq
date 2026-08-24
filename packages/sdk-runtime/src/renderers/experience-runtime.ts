import type { CompiledDocument, CompiledExperienceBehavior } from '@lodariq/schema';
import {
  LODARIQ_RENDERED_NODE_ID_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE,
} from '@lodariq/schema/dom';
import { experienceRuntimeText } from '../experience-i18n';
import {
  compiledExperience,
  experienceSurfaceDefinition,
  localStorageSafe,
  storageSet,
  surveyStorageKey,
} from './experience-runtime-core';
import { createExperienceRuntimeStyles } from './experience-runtime-styles';
import type { ExperienceSurfaceDefinition } from './experience-surface-registry';

const CHECKLIST_PREFIX = 'lodariq:checklist:';

export {
  compiledExperience,
  experienceCompletionLabel,
  experienceIsSuppressed,
  experienceRuntimeLabel,
  experienceSurfaceDefinition,
  markExperienceShown,
} from './experience-runtime-core';

export interface ExperienceRuntimeCallbacks {
  complete(): void;
  dismiss(): void;
  /**
   * Delivery only. A creator editing a slide-in clicks constantly, and every one
   * of those clicks is outside the surface, so an authoring preview that closed
   * on them would be unusable.
   */
  dismissOnOutsidePress: boolean;
  onChecklistItemChange?(
    blockId: string,
    completed: boolean,
    completedCount: number,
    total: number,
  ): void;
  onSurveySubmit?(): void;
}

/**
 * Applies the surface contract and the type's own behavior. Nothing here tests
 * a surface by name: the registry is the single description of what a modal,
 * banner, drawer or hotspot is, and this reads it.
 */
export function mountExperienceRuntime(
  document: CompiledDocument,
  host: HTMLElement,
  card: HTMLElement,
  content: HTMLElement,
  callbacks: ExperienceRuntimeCallbacks,
  backdrop?: HTMLElement,
): () => void {
  const experience = compiledExperience(document);
  const definition = experienceSurfaceDefinition(document);
  const styles = createExperienceRuntimeStyles(host.ownerDocument);
  host.shadowRoot?.appendChild(styles);
  host.dataset['lodariqExperience'] = experience.type;
  host.dataset['lodariqSurface'] = experience.surface;
  host.dataset['lodariqSurfaceAnchor'] = definition.anchor;
  // Only an announcement can be authored undismissable; every other type keeps
  // whatever way out its surface declares.
  const dismissible = experience.type !== 'announcement' || experience.dismissible;
  const surfaceCleanup = mountSurfaceContract(definition, card, content, backdrop, {
    dismissible,
    dismiss: callbacks.dismiss,
  });
  let behaviorCleanup = (): void => {};
  // An experience with no collapsed state of its own is closed by an outside
  // press; a hotspot owns that gesture and answers it by collapsing instead.
  let outsidePress = callbacks.dismiss;
  if (experience.type === 'hotspot') {
    const hotspot = mountHotspot(card, content, experience.marker, experience.activation);
    behaviorCleanup = hotspot.stop;
    outsidePress = hotspot.collapse;
  }
  if (experience.type === 'survey') {
    behaviorCleanup = mountSurvey(
      document.documentId,
      card,
      content,
      experience.requireAnswer,
      callbacks,
    );
  }
  if (experience.type === 'checklist') {
    behaviorCleanup = mountChecklist(document.documentId, content, experience, callbacks);
  }
  const dismissalCleanup =
    definition.dismissal.includes('outside-press') &&
    dismissible &&
    callbacks.dismissOnOutsidePress
      ? armOutsidePress(host, card, () => outsidePress())
      : () => {};
  return () => {
    dismissalCleanup();
    behaviorCleanup();
    surfaceCleanup();
    delete host.dataset['lodariqSurfaceAnchor'];
    styles.remove();
  };
}

/** Everything the surface itself decides: size, focus, backdrop, way out. */
function mountSurfaceContract(
  definition: ExperienceSurfaceDefinition,
  card: HTMLElement,
  content: HTMLElement,
  backdrop: HTMLElement | undefined,
  dismissal: { dismissible: boolean; dismiss: () => void },
): () => void {
  const cleanups: Array<() => void> = [];
  if (definition.resizable) {
    /*
     * The theme's width is the tour popup's. Every other surface has a width of
     * its own, so the surface default replaces it here; an authored size still
     * wins through the more specific custom-size rule in the tour stylesheet.
     */
    card.style.setProperty('--lq-tour-width', `${definition.defaultSize.width}px`);
    cleanups.push(() => card.style.removeProperty('--lq-tour-width'));
  } else {
    /*
     * A fixed surface has one size and it is the marker's, not the card's: an
     * authored override cannot apply to it, so it is dropped rather than
     * half-applied, and the panel the marker opens keeps the theme width.
     */
    for (const property of ['--lq-popup-width', '--lq-popup-height'] as const) {
      card.style.removeProperty(property);
    }
    delete card.dataset['lodariqPopupWidth'];
    delete card.dataset['lodariqPopupHeight'];
    card.style.setProperty('--lq-experience-marker', `${definition.defaultSize.width}px`);
    cleanups.push(() => card.style.removeProperty('--lq-experience-marker'));
  }
  if (definition.ariaRole === 'button') {
    // The visitor meets a control, not a dialog: the panel is what it opens.
    card.setAttribute('aria-haspopup', 'dialog');
    cleanups.push(() => card.removeAttribute('aria-haspopup'));
  }
  if (definition.backdrop && backdrop) {
    backdrop.hidden = false;
    backdrop.classList.add('experience-modal-backdrop');
    cleanups.push(() => {
      backdrop.classList.remove('experience-modal-backdrop');
      backdrop.hidden = true;
    });
  }
  if (definition.focus === 'trap') cleanups.push(trapSurfaceFocus(card));
  if (dismissal.dismissible && definition.dismissal.includes('close-control')) {
    cleanups.push(appendCloseControl(card, content, dismissal.dismiss));
  }
  return () => {
    for (const cleanup of cleanups.reverse()) cleanup();
  };
}

function trapSurfaceFocus(card: HTMLElement): () => void {
  card.setAttribute('aria-modal', 'true');
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const focusable = [
      ...card.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hidden);
    if (focusable.length === 0) {
      event.preventDefault();
      card.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (!event.shiftKey && card.ownerDocument.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && card.ownerDocument.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  };
  card.addEventListener('keydown', onKeyDown);
  return () => {
    card.removeEventListener('keydown', onKeyDown);
    card.removeAttribute('aria-modal');
  };
}

/**
 * A press anywhere outside the surface. The path is read through the shadow
 * boundary so a click on the card's own content is never mistaken for one
 * outside it, and the listener is passive: it closes, it never preventDefaults
 * the customer's own click.
 */
function armOutsidePress(host: HTMLElement, card: HTMLElement, close: () => void): () => void {
  const view = host.ownerDocument.defaultView;
  if (!view) return () => {};
  const onPointerDown = (event: Event): void => {
    if (!host.isConnected) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.includes(card) || event.target === host) return;
    close();
  };
  // Deferred a frame: the press that opened the surface is still in flight.
  let armed = false;
  const arm = (): void => {
    armed = true;
    host.ownerDocument.addEventListener('pointerdown', onPointerDown, true);
  };
  const timer = view.setTimeout(arm, 0);
  return () => {
    view.clearTimeout(timer);
    if (armed) host.ownerDocument.removeEventListener('pointerdown', onPointerDown, true);
  };
}

/**
 * Every surface that declares a close control gets one. A survey or checklist
 * used to have no way out at all, which is what made them read as a tour step
 * the visitor was stuck inside.
 */
function appendCloseControl(
  card: HTMLElement,
  content: HTMLElement,
  dismiss: () => void,
): () => void {
  const button = card.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'experience-close';
  button.setAttribute('aria-label', experienceRuntimeText('Close'));
  button.textContent = '×';
  button.addEventListener('click', dismiss);
  card.classList.add('has-experience-close');
  card.insertBefore(button, content);
  return () => {
    button.removeEventListener('click', dismiss);
    card.classList.remove('has-experience-close');
    button.remove();
  };
}

/** A hotspot stays on the page: closing it collapses the panel, not the experience. */
function mountHotspot(
  card: HTMLElement,
  content: HTMLElement,
  marker: 'pulse' | 'dot' | 'ring' | 'number',
  activation: 'click' | 'hover' | 'focus',
): { collapse: () => void; stop: () => void } {
  const button = card.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'hotspot-marker';
  button.dataset['marker'] = marker;
  button.setAttribute('aria-label', experienceRuntimeText('Open hotspot'));
  button.setAttribute('aria-expanded', 'false');
  button.textContent = marker === 'number' ? '1' : '';
  content.hidden = true;
  card.dataset['hotspotOpen'] = 'false';
  const open = (): void => {
    content.hidden = false;
    card.dataset['hotspotOpen'] = 'true';
    button.setAttribute('aria-expanded', 'true');
  };
  const collapse = (): void => {
    if (content.hidden) return;
    content.hidden = true;
    card.dataset['hotspotOpen'] = 'false';
    button.setAttribute('aria-expanded', 'false');
  };
  const toggle = (): void => {
    if (content.hidden) open();
    else collapse();
  };
  if (activation === 'click') button.addEventListener('click', toggle);
  if (activation === 'hover') {
    button.addEventListener('pointerenter', open);
    button.addEventListener('focus', open);
  }
  if (activation === 'focus') button.addEventListener('focus', open);
  card.insertBefore(button, content);
  return {
    collapse,
    stop: () => {
      button.removeEventListener('click', toggle);
      button.removeEventListener('pointerenter', open);
      button.removeEventListener('focus', open);
    },
  };
}

function mountSurvey(
  documentId: string,
  card: HTMLElement,
  content: HTMLElement,
  requireAnswer: boolean,
  callbacks: ExperienceRuntimeCallbacks,
): () => void {
  const button = card.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'survey-submit';
  button.textContent = experienceRuntimeText('Submit');
  const status = card.ownerDocument.createElement('p');
  status.className = 'survey-status';
  status.setAttribute('role', 'status');
  const submit = (): void => {
    const answered = surveyHasAnswer(content);
    if (requireAnswer && !answered) {
      status.textContent = experienceRuntimeText('Answer the question before submitting.');
      return;
    }
    storageSet(localStorageSafe(), surveyStorageKey(documentId), '1');
    callbacks.onSurveySubmit?.();
    callbacks.complete();
  };
  button.addEventListener('click', submit);
  content.append(button, status);
  return () => button.removeEventListener('click', submit);
}

function surveyHasAnswer(content: HTMLElement): boolean {
  const selectable = content.querySelector<HTMLInputElement>(
    'input[type="radio"]:checked, input[type="checkbox"]:checked',
  );
  if (selectable) return true;
  return [
    ...content.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
  ].some((field) => field.type !== 'radio' && field.type !== 'checkbox' && field.value.trim());
}

function mountChecklist(
  documentId: string,
  content: HTMLElement,
  experience: Extract<CompiledExperienceBehavior, { type: 'checklist' }>,
  callbacks: ExperienceRuntimeCallbacks,
): () => void {
  const stored = readChecklist(documentId);
  const cleanups: Array<() => void> = [];
  const items = [
    ...content.querySelectorAll<HTMLElement>(`[${LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE}="list"]`),
  ].filter((item) => {
    const blockId = item.getAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE);
    return Boolean(
      blockId &&
      (experience.itemBlockIds.length === 0 || experience.itemBlockIds.includes(blockId)),
    );
  });
  const progress = content.ownerDocument.createElement('p');
  progress.className = 'checklist-progress';
  progress.setAttribute('role', 'status');
  const update = (): void => {
    const completed = completedChecklistItemCount(items);
    progress.textContent = experienceRuntimeText('{completed} of {total} complete', {
      completed,
      total: items.length,
    });
  };
  for (const item of items) {
    const blockId = item.getAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE)!;
    const label = content.ownerDocument.createElement('label');
    label.className = 'checklist-item';
    const input = content.ownerDocument.createElement('input');
    input.type = 'checkbox';
    input.checked = stored.has(blockId);
    const body = content.ownerDocument.createElement('span');
    const sourceItems = [...item.querySelectorAll<HTMLElement>(':scope > li')];
    if (sourceItems.length === 0) {
      body.textContent = item.textContent;
    } else {
      sourceItems.forEach((sourceItem, index) => {
        if (index > 0) body.append(content.ownerDocument.createElement('br'));
        body.append(...sourceItem.childNodes);
      });
    }
    label.append(input, body);
    const listItem = content.ownerDocument.createElement('li');
    listItem.append(label);
    item.replaceChildren(listItem);
    const onChange = (): void => {
      if (input.checked) stored.add(blockId);
      else stored.delete(blockId);
      writeChecklist(documentId, stored);
      update();
      const completedCount = completedChecklistItemCount(items);
      callbacks.onChecklistItemChange?.(blockId, input.checked, completedCount, items.length);
      if (
        experience.completion === 'allItems' &&
        items.length > 0 &&
        completedCount === items.length
      ) {
        callbacks.complete();
      }
    };
    input.addEventListener('change', onChange);
    cleanups.push(() => input.removeEventListener('change', onChange));
  }
  if (experience.showProgress) content.prepend(progress);
  update();
  return () => cleanups.forEach((cleanup) => cleanup());
}

function completedChecklistItemCount(items: readonly HTMLElement[]): number {
  return items.filter((item) => item.querySelector<HTMLInputElement>('input')?.checked).length;
}

function readChecklist(documentId: string): Set<string> {
  try {
    const parsed = JSON.parse(
      localStorageSafe()?.getItem(`${CHECKLIST_PREFIX}${documentId}`) ?? '[]',
    );
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value) => typeof value === 'string').slice(0, 100)
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeChecklist(documentId: string, completed: ReadonlySet<string>): void {
  storageSet(
    localStorageSafe(),
    `${CHECKLIST_PREFIX}${documentId}`,
    JSON.stringify([...completed].slice(0, 100)),
  );
}
