import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { LocalAuthoringFrameOptions } from '../../local-frame-types';
import { LocalAuthoringFrameController } from '../controller';
import type { FocusRequest } from '../types';
import { cssString } from '../utils';
import { AuthoringCanvas } from './authoring-canvas';
import { FrameHeader } from './frame-header';

export function LocalAuthoringFrameRoot({ options }: { options: LocalAuthoringFrameOptions }) {
  const controller = useMemo(() => new LocalAuthoringFrameController(options), [options]);
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const shellRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    controller.start();
    return () => {
      controller.destroy();
    };
  }, [controller]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const onInput = (event: Event): void => controller.handleNativeInput(event);
    const onKeyDown = (event: Event): void => controller.handleNativeKeyDown(event);
    const onPointerDown = (event: Event): void => controller.handleNativePointerDown(event);
    const onClick = (event: Event): void => controller.handleNativeClick(event);
    const onPaste = (event: Event): void => controller.handleNativePaste(event);
    const onDragStart = (event: Event): void => controller.handleNativeDragStart(event);
    const onDragOver = (event: Event): void => controller.handleNativeDragOver(event);
    const onDrop = (event: Event): void => controller.handleNativeDrop(event);
    const onChange = (event: Event): void => controller.handleNativeChange(event);
    shell.addEventListener('input', onInput, true);
    shell.addEventListener('keydown', onKeyDown, true);
    shell.addEventListener('pointerdown', onPointerDown, true);
    shell.addEventListener('click', onClick, true);
    shell.addEventListener('paste', onPaste, true);
    shell.addEventListener('dragstart', onDragStart, true);
    shell.addEventListener('dragover', onDragOver, true);
    shell.addEventListener('drop', onDrop, true);
    shell.addEventListener('change', onChange);
    return () => {
      shell.removeEventListener('input', onInput, true);
      shell.removeEventListener('keydown', onKeyDown, true);
      shell.removeEventListener('pointerdown', onPointerDown, true);
      shell.removeEventListener('click', onClick, true);
      shell.removeEventListener('paste', onPaste, true);
      shell.removeEventListener('dragstart', onDragStart, true);
      shell.removeEventListener('dragover', onDragOver, true);
      shell.removeEventListener('drop', onDrop, true);
      shell.removeEventListener('change', onChange);
    };
  }, [controller]);

  useLayoutEffect(() => {
    const request = snapshot.focusRequest;
    const shell = shellRef.current;
    if (!request || !shell) return;
    let canceled = false;
    let focusApplied = false;
    const applyFocusRequest = (): void => {
      if (canceled) return;
      const { element, focusScope } = resolveFocusRequestTarget(shell, request);
      if (!element?.isConnected) return;
      const ownerDocument = element.ownerDocument;
      const activeElement = ownerDocument.activeElement;
      const focusMayBeRetried =
        activeElement === null ||
        activeElement === ownerDocument.body ||
        activeElement === ownerDocument.documentElement ||
        Boolean(focusScope?.contains(activeElement));
      if (focusApplied && !focusMayBeRetried && activeElement !== element) return;
      element.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      element.focus();
      applyFocusRequestCaret(element, request);
      focusApplied = true;
    };
    applyFocusRequest();
    queueMicrotask(applyFocusRequest);
    const ownerWindow = shell.ownerDocument.defaultView;
    const focusFrame = ownerWindow?.requestAnimationFrame(applyFocusRequest);
    const focusTimers = [0, 40, 120].map((delay) =>
      ownerWindow?.setTimeout(applyFocusRequest, delay),
    );
    const focusObserver = ownerWindow?.MutationObserver
      ? new ownerWindow.MutationObserver(applyFocusRequest)
      : null;
    focusObserver?.observe(shell, { childList: true, subtree: true });
    const observerTimer = ownerWindow?.setTimeout(() => focusObserver?.disconnect(), 2_000);
    return () => {
      canceled = true;
      focusObserver?.disconnect();
      if (focusFrame !== undefined) ownerWindow?.cancelAnimationFrame(focusFrame);
      if (observerTimer !== undefined) ownerWindow?.clearTimeout(observerTimer);
      for (const timer of focusTimers) {
        if (timer !== undefined) ownerWindow?.clearTimeout(timer);
      }
    };
  }, [snapshot.focusRequest]);

  useLayoutEffect(() => {
    let target: HTMLElement | null | undefined;
    if (snapshot.panelWorkflow.mode === 'edit') {
      const returnFocus = snapshot.panelWorkflow.returnFocus;
      target = returnFocus
        ? shellRef.current?.querySelector<HTMLElement>(`[data-panel-entry="${returnFocus}"]`)
        : null;
    } else {
      const focusTarget = snapshot.panelWorkflow.focusTarget;
      target = focusTarget
        ? shellRef.current?.querySelector<HTMLElement>(`[data-panel-entry="${focusTarget}"]`)
        : shellRef.current?.querySelector<HTMLElement>('[data-panel-mode-heading]');
    }
    if (!target) return;
    const restorePanelFocus = (): void => {
      if (target.isConnected) target.focus();
    };
    restorePanelFocus();
    queueMicrotask(restorePanelFocus);
    const focusTimer = window.setTimeout(restorePanelFocus, 0);
    const focusFrame = window.requestAnimationFrame(restorePanelFocus);
    return () => {
      window.clearTimeout(focusTimer);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [snapshot.panelWorkflow.focusToken, snapshot.panelWorkflow.mode]);

  const frameMode = options.frameMode ?? 'standalone';

  return (
    <main
      ref={shellRef}
      className={`shell ${frameMode === 'panel' ? 'shell-panel' : ''}`.trim()}
      onPaste={(event) => controller.handlePaste(event)}
    >
      {frameMode === 'panel' ? (
        <p id="status" className="visually-hidden" aria-live="polite">
          {snapshot.status}
        </p>
      ) : (
        <FrameHeader status={snapshot.status} />
      )}
      <div className="workspace">
        <AuthoringCanvas
          controller={controller}
          frameMode={frameMode}
          initialWorkspace={options.initialWorkspace}
          snapshot={snapshot}
        />
      </div>
    </main>
  );
}

function resolveFocusRequestTarget(
  shell: HTMLElement,
  request: FocusRequest,
): { element: HTMLElement | null; focusScope: HTMLElement | null } {
  const blockIdSelector = `[data-block-id="${cssString(request.blockId)}"]`;
  const blockSelector = [
    `.document-block${blockIdSelector}`,
    `.step-child${blockIdSelector}`,
    `.rich-step-block-row${blockIdSelector}`,
    `.tour-step-row${blockIdSelector}`,
  ].join(', ');
  const focusScope = shell.querySelector<HTMLElement>(blockSelector);

  if (request.propertyId) {
    const propertyId = cssString(request.propertyId);
    const propertyControl = shell.querySelector<HTMLElement>(`[data-property-id="${propertyId}"]`);
    const propertyTarget = propertyControl?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select, button',
    );
    if (propertyTarget) return { element: propertyTarget, focusScope };
  }

  if (request.reveal === 'placement') {
    const placementTarget = shell.querySelector<HTMLElement>(
      '.storyboard-property-tray .tour-placement-card, .storyboard-property-tray button:not(.storyboard-tray-close)',
    );
    if (placementTarget) return { element: placementTarget, focusScope };
  }

  const editSelector = [
    `.document-block${blockIdSelector} [data-action="edit-content"]`,
    `.step-child${blockIdSelector} [data-action="edit-content"]`,
    `.rich-step-block-row${blockIdSelector} [data-rich-block-id], .rich-step-block-row${blockIdSelector} input, .rich-step-block-row${blockIdSelector} textarea`,
  ].join(', ');
  const requestedElement = shell.querySelector<HTMLElement>(
    request.target === 'edit' ? editSelector : blockSelector,
  );
  const contentFallback =
    request.reveal === 'content'
      ? shell.querySelector<HTMLElement>('.rich-step-content .inline-insert-trigger')
      : null;
  return { element: requestedElement ?? contentFallback, focusScope };
}

function applyFocusRequestCaret(element: HTMLElement, request: FocusRequest): void {
  if (
    request.caret !== undefined &&
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
  ) {
    const position =
      typeof request.caret === 'number'
        ? Math.max(0, Math.min(request.caret, element.value.length))
        : request.caret === 'start'
          ? 0
          : element.value.length;
    element.setSelectionRange(position, position);
    return;
  }
  if (request.caret !== undefined && element.isContentEditable) {
    setContentEditableCaret(element, request.caret);
  }
}

function setContentEditableCaret(
  element: HTMLElement,
  requestedPosition: 'start' | 'end' | number,
): void {
  const selection = element.ownerDocument.getSelection();
  if (!selection) return;
  const textLength = element.textContent?.length ?? 0;
  const position =
    typeof requestedPosition === 'number'
      ? Math.max(0, Math.min(requestedPosition, textLength))
      : requestedPosition === 'start'
        ? 0
        : textLength;
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = position;
  let textNode = walker.nextNode();
  while (textNode) {
    const length = textNode.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = element.ownerDocument.createRange();
      range.setStart(textNode, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    textNode = walker.nextNode();
  }
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
