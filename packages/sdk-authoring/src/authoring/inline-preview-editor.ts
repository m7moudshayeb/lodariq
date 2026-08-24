import {
  AUTHORING_INLINE_CONTENT_MAX_LENGTH,
  type AuthoringInlineControlOperation,
} from '@lodariq/schema';
import { LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE } from '@lodariq/schema/dom';
import { createInlineEditorStyles } from './inline-preview-styles';

/** Rich content and actions are authored in the canvas; live preview stays output-only. */
export const INLINE_PREVIEW_CONTENT_TYPES = ['button', 'link'] as const;
export type InlinePreviewContentType = (typeof INLINE_PREVIEW_CONTENT_TYPES)[number];

const INLINE_PREVIEW_CONTENT_TYPE_SET = new Set<string>(INLINE_PREVIEW_CONTENT_TYPES);
const INLINE_EDITABLE_ATTRIBUTE = 'data-lodariq-authoring-inline-editable';
const INLINE_STYLE_ATTRIBUTE = 'data-lodariq-authoring-inline-style';
const INLINE_TOOLBAR_ATTRIBUTE = 'data-lodariq-authoring-context-toolbar';

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

interface PreviewRootState {
  observer: MutationObserver;
  style: HTMLStyleElement;
}

/**
 * Binds creator-only preview ownership styles to TourPlayer output.
 * Runtime markup stays inert; editing happens in the authoring canvas.
 */
export function createInlinePreviewEditor(
  options: InlinePreviewEditorOptions,
): InlinePreviewEditor {
  const previewRoots = new Map<ShadowRoot, PreviewRootState>();
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

  /*
   * Narrow on purpose, and NOT subtree-wide.
   *
   * This used to watch `documentElement` with `subtree: true`, which in a live
   * application is a callback on essentially every DOM mutation the customer's
   * own code makes — each one queueing a `querySelectorAll` over the whole
   * document. Measured on the fixture with authoring open, 2,000 host mutations
   * cost ~95 ms of main thread here alone; a page that streams updates pays that
   * continuously, for the entire time a creator has the panel open.
   *
   * All it is looking for is a `lodariq-tour` element, and the player appends
   * that as a direct child of <body>. A body-level `childList` watch sees it
   * without watching everything underneath. The second observer covers the one
   * case the first cannot: a host that replaces <body> wholesale on a route
   * change, which fires once rather than per mutation.
   */
  const documentObserver = new MutationObserver(scheduleSync);
  documentObserver.observe(options.document.body, { childList: true });
  const bodySwapObserver = new MutationObserver(() => {
    documentObserver.observe(options.document.body, { childList: true });
    scheduleSync();
  });
  bodySwapObserver.observe(options.document.documentElement, { childList: true });

  const sync = (): void => {
    if (disposed) return;
    const currentRoots = renderedTourRoots(options.document, options.previewOwnerId);

    for (const [root, state] of previewRoots) {
      if (currentRoots.has(root)) continue;
      state.observer.disconnect();
      state.style.remove();
      previewRoots.delete(root);
    }

    for (const root of currentRoots) {
      if (previewRoots.has(root)) continue;
      const style = createInlineEditorStyles(options.document, {
        editable: INLINE_EDITABLE_ATTRIBUTE,
        style: INLINE_STYLE_ATTRIBUTE,
        toolbar: INLINE_TOOLBAR_ATTRIBUTE,
      });
      root.appendChild(style);
      const observer = new MutationObserver(scheduleSync);
      observer.observe(root, { childList: true, subtree: true });
      previewRoots.set(root, { observer, style });
    }
  };

  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    documentObserver.disconnect();
    bodySwapObserver.disconnect();
    for (const state of previewRoots.values()) {
      state.observer.disconnect();
      state.style.remove();
    }
    previewRoots.clear();
  };

  sync();
  return {
    refresh: sync,
    focusPrimary: () => undefined,
    isEditingBlock: () => false,
    destroy,
  };
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
