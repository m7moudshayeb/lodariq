import {
  AUTHORING_INLINE_CONTENT_MAX_LENGTH,
  type AuthoringInlineControlOperation,
} from '@lodariq/schema';
import {
  LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_ID_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE,
} from '@lodariq/schema/dom';
import { MousePointer2, MousePointerClick, PanelBottom, Settings2, createElement } from 'lucide';
import { createAuthoringDomCombobox } from './dom-combobox';
import { createInlineEditorStyles } from './inline-preview-styles';
import { applyAuthoringLocale, authoringText } from '../i18n';

export const INLINE_PREVIEW_CONTENT_TYPES = ['heading', 'paragraph', 'button', 'link'] as const;
export type InlinePreviewContentType = (typeof INLINE_PREVIEW_CONTENT_TYPES)[number];

const INLINE_PREVIEW_CONTENT_TYPE_SET = new Set<string>(INLINE_PREVIEW_CONTENT_TYPES);
const INLINE_EDITABLE_ATTRIBUTE = 'data-lodariq-authoring-inline-editable';
const INLINE_STYLE_ATTRIBUTE = 'data-lodariq-authoring-inline-style';
const INLINE_TOOLBAR_ATTRIBUTE = 'data-lodariq-authoring-context-toolbar';
const INLINE_IDLE_COMMIT_MS = 300;
const INLINE_CONTENT_LABELS: Readonly<Record<InlinePreviewContentType, string>> = {
  heading: authoringText('Edit heading in preview'),
  paragraph: authoringText('Edit body text in preview'),
  button: authoringText('Edit button label in preview'),
  link: authoringText('Edit link label in preview'),
};
const INLINE_CONTENT_SELECTOR = INLINE_PREVIEW_CONTENT_TYPES.map(
  (type) =>
    `[${LODARIQ_RENDERED_NODE_ID_ATTRIBUTE}][${LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE}="${type}"]`,
).join(',');

export interface InlinePreviewContentCommit {
  blockId: string;
  content: string;
}

export interface InlinePreviewEditorOptions {
  document: Document;
  /** Exact TourPlayer preview owner this editor is allowed to mutate. */
  previewOwnerId: string;
  onCommit: (commit: InlinePreviewContentCommit) => Promise<void> | void;
  resolveControlContext?: (bodyBlockId: string) => InlinePreviewControlContext | null;
  onControlCommit?: (operation: AuthoringInlineControlOperation) => Promise<void> | void;
  onCommitError?: (error: unknown) => void;
}

export interface InlinePreviewControlContext {
  stepId: string;
  tooltipBlockId: string;
  placement: 'top' | 'right' | 'bottom' | 'left';
  actionBlockId?: string;
  actionType?: '' | 'next' | 'back' | 'complete' | 'dismiss' | 'clickTarget' | 'openPage';
}

export interface InlinePreviewEditor {
  refresh: () => void;
  focusPrimary: () => void;
  isEditingBlock: (blockId: string) => boolean;
  destroy: () => void;
}

interface EditableElementState {
  cleanup: () => void;
}

interface EditableRootState {
  observer: MutationObserver;
  style: HTMLStyleElement;
  toolbar: PreviewToolbarState | null;
}

interface PreviewToolbarState {
  element: HTMLElement;
  key: string;
  cleanup: () => void;
}

interface PreviewToolbarCombobox {
  element: HTMLDivElement;
  cleanup: () => void;
}

type InlineToolbarIcon = Parameters<typeof createElement>[0];

/**
 * Adds creator-only plain-text editing to neutral TourPlayer output.
 * Runtime markup stays inert; this enhancer exists only in sdk-authoring.
 */
export function createInlinePreviewEditor(
  options: InlinePreviewEditorOptions,
): InlinePreviewEditor {
  const editableElements = new Map<HTMLElement, EditableElementState>();
  const editableRoots = new Map<ShadowRoot, EditableRootState>();
  let disposed = false;
  let syncQueued = false;

  const scheduleSync = (): void => {
    if (disposed || syncQueued) return;
    syncQueued = true;
    queueMicrotask(() => {
      syncQueued = false;
      sync();
    });
  };

  const documentObserver = new MutationObserver(scheduleSync);
  documentObserver.observe(options.document.documentElement, { childList: true, subtree: true });

  const sync = (): void => {
    if (disposed) return;
    const currentRoots = renderedTourRoots(options.document, options.previewOwnerId);

    for (const [root, state] of editableRoots) {
      if (currentRoots.has(root)) continue;
      state.observer.disconnect();
      state.toolbar?.cleanup();
      state.style.remove();
      editableRoots.delete(root);
    }

    for (const root of currentRoots) {
      if (editableRoots.has(root)) continue;
      const style = createInlineEditorStyles(options.document, {
        editable: INLINE_EDITABLE_ATTRIBUTE,
        style: INLINE_STYLE_ATTRIBUTE,
        toolbar: INLINE_TOOLBAR_ATTRIBUTE,
      });
      root.appendChild(style);
      const observer = new MutationObserver(scheduleSync);
      observer.observe(root, { childList: true, subtree: true });
      editableRoots.set(root, { observer, style, toolbar: null });
    }

    const currentElements = new Set<HTMLElement>();
    for (const root of currentRoots) {
      root.querySelectorAll<HTMLElement>(INLINE_CONTENT_SELECTOR).forEach((element) => {
        currentElements.add(element);
        if (editableElements.has(element)) return;
        editableElements.set(element, {
          cleanup: enhanceEditableElement(element, options),
        });
      });
      const rootState = editableRoots.get(root);
      if (rootState) syncPreviewToolbar(root, rootState, options);
    }

    for (const [element, state] of editableElements) {
      if (currentElements.has(element)) continue;
      state.cleanup();
      editableElements.delete(element);
    }
  };

  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    documentObserver.disconnect();
    for (const state of editableElements.values()) state.cleanup();
    editableElements.clear();
    for (const state of editableRoots.values()) {
      state.observer.disconnect();
      state.toolbar?.cleanup();
      state.style.remove();
    }
    editableRoots.clear();
  };

  const focusPrimary = (): void => {
    sync();
    const primary =
      [...editableElements.keys()].find((element) => {
        const type = element.getAttribute(LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE);
        return type === 'heading';
      }) ?? editableElements.keys().next().value;
    if (!(primary instanceof HTMLElement)) return;
    primary.focus();
    selectElementContents(primary);
  };

  const isEditingBlock = (blockId: string): boolean => {
    for (const element of editableElements.keys()) {
      if (element.getAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE) !== blockId) continue;
      const root = element.getRootNode();
      const ownerWindow = element.ownerDocument.defaultView;
      if (ownerWindow && root instanceof ownerWindow.ShadowRoot && root.activeElement === element) {
        return true;
      }
    }
    return false;
  };

  sync();
  return { refresh: sync, focusPrimary, isEditingBlock, destroy };
}

export function isInlinePreviewContentType(value: unknown): value is InlinePreviewContentType {
  return typeof value === 'string' && INLINE_PREVIEW_CONTENT_TYPE_SET.has(value);
}

export function normalizeInlinePreviewContent(value: string): string {
  const plainText = value
    .split('\u0000')
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[\n\u2028\u2029]+/g, ' ');
  if (plainText.length <= AUTHORING_INLINE_CONTENT_MAX_LENGTH) return plainText;
  const truncated = plainText.slice(0, AUTHORING_INLINE_CONTENT_MAX_LENGTH);
  return /[\uD800-\uDBFF]$/.test(truncated) ? truncated.slice(0, -1) : truncated;
}

function renderedTourRoots(doc: Document, previewOwnerId: string): Set<ShadowRoot> {
  const roots = new Set<ShadowRoot>();
  doc.querySelectorAll('lodariq-tour').forEach((host) => {
    if (
      host.getAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE) === previewOwnerId &&
      host.shadowRoot
    ) {
      roots.add(host.shadowRoot);
    }
  });
  return roots;
}

function enhanceEditableElement(
  element: HTMLElement,
  options: InlinePreviewEditorOptions,
): () => void {
  const blockId = element.getAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE)?.trim() ?? '';
  const contentType = element.getAttribute(LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE);
  if (!blockId || !isInlinePreviewContentType(contentType)) return () => {};

  const previousAttributes = new Map<string, string | null>();
  const setManagedAttribute = (name: string, value: string): void => {
    previousAttributes.set(name, element.getAttribute(name));
    element.setAttribute(name, value);
  };
  setManagedAttribute(INLINE_EDITABLE_ATTRIBUTE, 'true');
  setManagedAttribute('contenteditable', 'plaintext-only');
  setManagedAttribute('role', 'textbox');
  setManagedAttribute('aria-label', INLINE_CONTENT_LABELS[contentType]);
  setManagedAttribute('aria-multiline', 'false');
  setManagedAttribute('aria-keyshortcuts', 'Enter Escape');
  setManagedAttribute('spellcheck', 'true');

  let baselineContent = normalizeInlinePreviewContent(element.textContent ?? '');
  let liveRegion: HTMLElement | null = null;
  let previousLiveSetting: string | null = null;
  let idleCommitTimer: number | null = null;

  const setContent = (content: string): void => {
    element.replaceChildren(options.document.createTextNode(content));
  };

  const clearIdleCommit = (): void => {
    if (idleCommitTimer === null) return;
    element.ownerDocument.defaultView?.clearTimeout(idleCommitTimer);
    idleCommitTimer = null;
  };

  const commit = (): void => {
    clearIdleCommit();
    const content = normalizeInlinePreviewContent(element.textContent ?? '');
    if (element.textContent !== content || element.childElementCount > 0) setContent(content);
    if (content === baselineContent) return;
    const previousContent = baselineContent;
    baselineContent = content;
    try {
      void Promise.resolve(options.onCommit({ blockId, content })).catch((error: unknown) => {
        if (element.isConnected && element.textContent === content) {
          baselineContent = previousContent;
          setContent(previousContent);
        }
        options.onCommitError?.(error);
      });
    } catch (error) {
      baselineContent = previousContent;
      setContent(previousContent);
      options.onCommitError?.(error);
    }
  };

  const scheduleIdleCommit = (): void => {
    clearIdleCommit();
    const ownerWindow = element.ownerDocument.defaultView;
    if (!ownerWindow) return;
    idleCommitTimer = ownerWindow.setTimeout(() => {
      idleCommitTimer = null;
      commit();
    }, INLINE_IDLE_COMMIT_MS);
  };

  const restoreLiveRegion = (): void => {
    if (!liveRegion) return;
    restoreAttribute(liveRegion, 'aria-live', previousLiveSetting);
    liveRegion = null;
    previousLiveSetting = null;
  };

  const onFocus = (): void => {
    baselineContent = normalizeInlinePreviewContent(element.textContent ?? '');
    liveRegion = element.closest<HTMLElement>('[role="dialog"]');
    if (liveRegion) {
      previousLiveSetting = liveRegion.getAttribute('aria-live');
      liveRegion.setAttribute('aria-live', 'off');
    }
  };
  const onBlur = (): void => {
    restoreLiveRegion();
    commit();
  };
  const onBeforeInput = (event: InputEvent): void => {
    if (event.inputType !== 'insertParagraph' && event.inputType !== 'insertLineBreak') return;
    event.preventDefault();
    commit();
    element.blur();
  };
  const onInput = (): void => {
    const content = normalizeInlinePreviewContent(element.textContent ?? '');
    if (element.textContent !== content || element.childElementCount > 0) {
      setContent(content);
      placeCaretAtEnd(element);
    }
    scheduleIdleCommit();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      clearIdleCommit();
      setContent(baselineContent);
      element.blur();
      return;
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    commit();
    element.blur();
  };
  const onPaste = (event: ClipboardEvent): void => {
    event.preventDefault();
    const text = normalizeInlinePreviewContent(event.clipboardData?.getData('text/plain') ?? '');
    insertPlainText(element, text);
    onInput();
  };
  const onActionClick = (event: MouseEvent): void => {
    if (contentType !== 'button' && contentType !== 'link') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // WebKit exposes Enter on an editable native action as activation rather
    // than a reliable contenteditable key boundary. Treat the suppressed
    // activation as the same semantic commit boundary used by Enter/blur.
    commit();
    element.focus();
    element.ownerDocument.defaultView?.setTimeout(() => {
      if (element.isConnected) element.focus();
    }, 0);
  };

  element.addEventListener('focus', onFocus);
  element.addEventListener('blur', onBlur);
  element.addEventListener('beforeinput', onBeforeInput);
  element.addEventListener('input', onInput);
  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('paste', onPaste);
  element.addEventListener('click', onActionClick, true);

  return () => {
    if (idleCommitTimer !== null) commit();
    restoreLiveRegion();
    element.removeEventListener('focus', onFocus);
    element.removeEventListener('blur', onBlur);
    element.removeEventListener('beforeinput', onBeforeInput);
    element.removeEventListener('input', onInput);
    element.removeEventListener('keydown', onKeyDown);
    element.removeEventListener('paste', onPaste);
    element.removeEventListener('click', onActionClick, true);
    for (const [name, value] of previousAttributes) restoreAttribute(element, name, value);
  };
}

const INLINE_PLACEMENT_OPTIONS = [
  { value: 'bottom', label: authoringText('Below') },
  { value: 'top', label: authoringText('Above') },
  { value: 'right', label: authoringText('Right') },
  { value: 'left', label: authoringText('Left') },
] as const;

const INLINE_ACTION_OPTIONS = [
  { value: '', label: authoringText('Choose action') },
  { value: 'next', label: authoringText('Next') },
  { value: 'back', label: authoringText('Back') },
  { value: 'complete', label: authoringText('Complete') },
  { value: 'dismiss', label: authoringText('Dismiss') },
  { value: 'clickTarget', label: authoringText('Click target') },
  { value: 'openPage', label: authoringText('Open page') },
] as const;

function syncPreviewToolbar(
  root: ShadowRoot,
  state: EditableRootState,
  options: InlinePreviewEditorOptions,
): void {
  const bodyElement = root.querySelector<HTMLElement>(INLINE_CONTENT_SELECTOR);
  const bodyBlockId = bodyElement?.getAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE)?.trim() ?? '';
  const context = bodyBlockId ? options.resolveControlContext?.(bodyBlockId) : null;
  const dialog = root.querySelector<HTMLElement>('[role="dialog"]');
  if (!context || !dialog || !options.onControlCommit) {
    state.toolbar?.cleanup();
    state.toolbar = null;
    return;
  }

  const key = [
    context.stepId,
    context.tooltipBlockId,
    context.placement,
    context.actionBlockId ?? '',
    context.actionType ?? '',
  ].join(':');
  if (state.toolbar?.key === key && state.toolbar.element.isConnected) return;
  state.toolbar?.cleanup();
  state.toolbar = createPreviewToolbar(dialog, context, options);
  root.ownerDocument.defaultView?.dispatchEvent(new Event('resize'));
}

function createPreviewToolbar(
  dialog: HTMLElement,
  context: InlinePreviewControlContext,
  options: InlinePreviewEditorOptions,
): PreviewToolbarState {
  const doc = dialog.ownerDocument;
  const toolbar = doc.createElement('div');
  applyAuthoringLocale(toolbar);
  toolbar.setAttribute(INLINE_TOOLBAR_ATTRIBUTE, 'true');
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', authoringText('Step controls'));

  const commit = (operation: AuthoringInlineControlOperation): void => {
    try {
      void Promise.resolve(options.onControlCommit?.(operation)).catch((error: unknown) => {
        options.onCommitError?.(error);
      });
    } catch (error) {
      options.onCommitError?.(error);
    }
  };
  const flushActiveInlineEdit = (): void => {
    const rootNode = dialog.getRootNode();
    const activeElement =
      rootNode instanceof ShadowRoot ? rootNode.activeElement : dialog.ownerDocument.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    if (activeElement.getAttribute(INLINE_EDITABLE_ATTRIBUTE) !== 'true') return;
    activeElement.blur();
  };

  const contextIndicator = doc.createElement('span');
  contextIndicator.className = 'lodariq-inline-toolbar-context';
  contextIndicator.setAttribute('aria-label', authoringText('Editing on page'));
  contextIndicator.setAttribute('data-tooltip', authoringText('Editing on page'));
  contextIndicator.title = authoringText('Editing on page');
  contextIndicator.appendChild(createToolbarIcon(MousePointer2, 16));
  toolbar.appendChild(contextIndicator);

  const placement = createAuthoringDomCombobox({
    document: doc,
    label: authoringText('Tooltip placement'),
    items: INLINE_PLACEMENT_OPTIONS,
    initialValue: context.placement,
    triggerIcon: PanelBottom,
    onChange: (nextPlacement) => {
      flushActiveInlineEdit();
      commit({ kind: 'setPlacement', blockId: context.tooltipBlockId, placement: nextPlacement });
    },
  });
  toolbar.appendChild(placement.element);

  let action: PreviewToolbarCombobox | null = null;
  if (context.actionBlockId && context.actionType !== undefined) {
    const actionBlockId = context.actionBlockId;
    action = createAuthoringDomCombobox({
      document: doc,
      label: authoringText('Button action'),
      items: INLINE_ACTION_OPTIONS,
      initialValue: context.actionType,
      triggerIcon: MousePointerClick,
      onChange: (nextAction) => {
        flushActiveInlineEdit();
        commit({ kind: 'setAction', blockId: actionBlockId, actionType: nextAction });
      },
    });
    toolbar.appendChild(action.element);
  }

  const more = doc.createElement('button');
  more.type = 'button';
  more.className = 'lodariq-inline-toolbar-details';
  more.setAttribute('aria-label', authoringText('Open advanced step settings'));
  more.setAttribute('data-tooltip', authoringText('Open step details'));
  more.title = authoringText('Open step details');
  more.appendChild(createToolbarIcon(Settings2, 17));
  toolbar.appendChild(more);

  const onMoreClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    flushActiveInlineEdit();
    commit({ kind: 'openAdvanced', stepId: context.stepId });
  };
  more.addEventListener('click', onMoreClick, true);
  dialog.appendChild(toolbar);

  return {
    element: toolbar,
    key: [
      context.stepId,
      context.tooltipBlockId,
      context.placement,
      context.actionBlockId ?? '',
      context.actionType ?? '',
    ].join(':'),
    cleanup: () => {
      placement.cleanup();
      action?.cleanup();
      more.removeEventListener('click', onMoreClick, true);
      toolbar.remove();
    },
  };
}

function createToolbarIcon(icon: InlineToolbarIcon, size: number): SVGElement {
  const element = createElement(icon);
  element.setAttribute('width', String(size));
  element.setAttribute('height', String(size));
  element.setAttribute('stroke-width', '2');
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('focusable', 'false');
  return element;
}

function insertPlainText(element: HTMLElement, text: string): void {
  const selection = element.ownerDocument.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const selectionIsInside = Boolean(
    range &&
    (range.commonAncestorContainer === element || element.contains(range.commonAncestorContainer)),
  );
  if (!selection || !range || !selectionIsInside) {
    element.appendChild(element.ownerDocument.createTextNode(text));
    return;
  }
  range.deleteContents();
  const textNode = element.ownerDocument.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectElementContents(element: HTMLElement): void {
  const selection = element.ownerDocument.getSelection();
  if (!selection) return;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = element.ownerDocument.getSelection();
  if (!selection) return;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}
