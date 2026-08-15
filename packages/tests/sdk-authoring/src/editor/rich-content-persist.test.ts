// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  getNearestEditorFromDOMNode,
} from 'lexical';
import type { LodariqBlock } from '@lodariq/schema';
import {
  RICH_CONTENT_PERSIST_DEBOUNCE_MS,
  RichContentEditor,
} from '@lodariq/sdk-authoring/editor';

const INITIAL: LodariqBlock[] = [
  { id: 'p1', type: 'paragraph', content: 'Hello', props: {}, children: [] },
];
const INITIAL_WITH_BUTTON: LodariqBlock[] = [
  ...INITIAL,
  {
    id: 'b1',
    type: 'button',
    content: 'Continue',
    props: { variant: 'primary', action: { type: 'next' } },
    children: [],
  },
];

describe('rich content persist debounce', () => {
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it('does not persist while typing and keeps the canvas focused after the idle flush', async () => {
    const onPersist = vi.fn();
    await act(async () => {
      root.render(createElement(PersistHarness, { onPersist }));
    });

    const canvas = document.querySelector<HTMLElement>('.rich-content-canvas');
    if (!canvas) throw new Error('Rich content canvas is missing');
    canvas.focus();
    expect(document.activeElement).toBe(canvas);

    await act(async () => {
      typeInCanvas('!');
      typeInCanvas('!');
    });
    expect(onPersist).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(canvas);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RICH_CONTENT_PERSIST_DEBOUNCE_MS - 1);
    });
    expect(onPersist).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(canvas);
  });

  it('does not persist while a tray field is focused', async () => {
    const onPersist = vi.fn();
    const inspectorHost = document.createElement('div');
    document.body.append(inspectorHost);
    await act(async () => {
      root.render(
        createElement(InspectorPersistHarness, { inspectorHost, onPersist }),
      );
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>('.rich-content-button-preview')?.click();
    });
    const label = document.querySelector<HTMLInputElement>('[aria-label="Button label"]');
    if (!label) throw new Error('Button label field is missing');
    await act(async () => {
      label.focus();
      setNativeInputValue(label, 'Continue now');
      label.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.activeElement).toBe(label);
    expect(onPersist).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RICH_CONTENT_PERSIST_DEBOUNCE_MS + 50);
    });
    expect(onPersist).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      document.querySelector('[aria-label="Button label"]'),
    );
    expect(document.querySelector<HTMLInputElement>('[aria-label="Button label"]')?.value).toBe(
      'Continue now',
    );

    await act(async () => {
      label.blur();
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(
      (onPersist.mock.calls[0]?.[0] as LodariqBlock[]).some(
        (block) => block.type === 'button' && block.content === 'Continue now',
      ),
    ).toBe(true);
    inspectorHost.remove();
  });
});

function PersistHarness({ onPersist }: { onPersist: (value: LodariqBlock[]) => void }) {
  const [, setTick] = useState(0);
  return createElement(RichContentEditor, {
    onChange: (next) => {
      onPersist(next);
      setTick((value) => value + 1);
    },
    value: INITIAL,
  });
}

function InspectorPersistHarness({
  inspectorHost,
  onPersist,
}: {
  inspectorHost: HTMLElement;
  onPersist: (value: LodariqBlock[]) => void;
}) {
  const [, setTick] = useState(0);
  return createElement(RichContentEditor, {
    inspectorHost,
    onChange: (next) => {
      onPersist(next);
      setTick((value) => value + 1);
    },
    value: INITIAL_WITH_BUTTON,
  });
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Native input value setter is unavailable');
  setter.call(input, value);
}

function typeInCanvas(text: string): void {
  const canvas = document.querySelector('.rich-content-canvas');
  if (!(canvas instanceof HTMLElement)) throw new Error('Rich content canvas is missing');
  const editor = getNearestEditorFromDOMNode(canvas);
  if (!editor) throw new Error('Lexical editor is missing');
  editor.update(() => {
    $getRoot().selectEnd();
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.insertText(text);
  });
}
