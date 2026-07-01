import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { LocalAuthoringFrameOptions } from '../../local-frame-types';
import { LocalAuthoringFrameController } from '../controller';
import { cssString } from '../utils';
import { AuthoringCanvas } from './authoring-canvas';
import { FrameHeader } from './frame-header';

export function LocalAuthoringFrameRoot({ options }: { options: LocalAuthoringFrameOptions }) {
  const controller = useMemo(() => new LocalAuthoringFrameController(options), [options]);
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const shellRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    let mounted = false;
    const unsubscribe = controller.subscribe((nextSnapshot) => {
      if (!mounted) {
        setSnapshot(nextSnapshot);
        return;
      }
      flushSync(() => setSnapshot(nextSnapshot));
    });
    controller.start();
    mounted = true;
    return () => {
      unsubscribe();
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
    if (!snapshot.focusRequest) return;
    const blockSelector = `[data-block-id="${cssString(snapshot.focusRequest.blockId)}"]`;
    const selector =
      snapshot.focusRequest.target === 'block'
        ? blockSelector
        : `${blockSelector} [data-action="edit-content"]`;
    const element = shellRef.current?.querySelector<HTMLElement>(selector);
    element?.focus();
    if (
      snapshot.focusRequest.caret !== undefined &&
      (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
    ) {
      const position =
        typeof snapshot.focusRequest.caret === 'number'
          ? Math.max(0, Math.min(snapshot.focusRequest.caret, element.value.length))
          : snapshot.focusRequest.caret === 'start'
            ? 0
            : element.value.length;
      element.setSelectionRange(position, position);
    }
  }, [snapshot.focusRequest]);

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
        <AuthoringCanvas controller={controller} snapshot={snapshot} />
      </div>
    </main>
  );
}
