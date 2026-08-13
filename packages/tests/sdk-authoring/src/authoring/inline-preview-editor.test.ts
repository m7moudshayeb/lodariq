// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_ID_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE,
} from '@lodariq/schema/dom';
import { createInlinePreviewEditor } from '../../../../../packages/sdk-authoring/src/authoring/inline-preview-editor';

const IDLE_COMMIT_MS = 750;

describe('inline preview editor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces content commits without replacing focused rich-text runs', async () => {
    const root = createPreviewRoot();
    const paragraph = document.createElement('p');
    paragraph.setAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE, 'paragraph_1');
    paragraph.setAttribute(LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE, 'paragraph');

    const leadingRun = document.createElement('span');
    leadingRun.textContent = 'On track ';
    leadingRun.style.fontSize = '14px';
    const emphasizedRun = document.createElement('span');
    emphasizedRun.textContent = 'with the launch';
    emphasizedRun.style.fontSize = '24px';
    emphasizedRun.style.textDecoration = 'underline';
    paragraph.append(leadingRun, emphasizedRun);
    root.appendChild(paragraph);

    const onCommit = vi.fn();
    const editor = createInlinePreviewEditor({
      document,
      previewOwnerId: 'preview_1',
      onCommit,
    });

    expect(paragraph.getAttribute('contenteditable')).toBe('true');
    const richInput = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'formatBold',
    });
    paragraph.dispatchEvent(richInput);
    expect(richInput.defaultPrevented).toBe(true);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    paragraph.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);

    paragraph.focus();
    emphasizedRun.append(' copy');
    paragraph.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    await vi.advanceTimersByTimeAsync(500);

    emphasizedRun.append(' updated');
    paragraph.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    await vi.advanceTimersByTimeAsync(500);

    expect(onCommit).not.toHaveBeenCalled();
    expect(root.activeElement).toBe(paragraph);
    expect([...paragraph.children]).toEqual([leadingRun, emphasizedRun]);
    expect(emphasizedRun.style.fontSize).toBe('24px');
    expect(emphasizedRun.style.textDecoration).toBe('underline');

    await vi.advanceTimersByTimeAsync(IDLE_COMMIT_MS - 500);

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith({
      blockId: 'paragraph_1',
      content: 'On track with the launch copy updated',
    });
    expect(root.activeElement).toBe(paragraph);
    expect([...paragraph.children]).toEqual([leadingRun, emphasizedRun]);
    expect(emphasizedRun.style.fontSize).toBe('24px');
    expect(emphasizedRun.style.textDecoration).toBe('underline');

    editor.destroy();
  });
});

function createPreviewRoot(): ShadowRoot {
  const host = document.createElement('lodariq-tour');
  host.setAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE, 'preview_1');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}
