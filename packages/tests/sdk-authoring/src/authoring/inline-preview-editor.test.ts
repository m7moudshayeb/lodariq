// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_ID_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE,
} from '@lodariq/schema/dom';
import { createInlinePreviewEditor } from '../../../../../packages/sdk-authoring/src/authoring/inline-preview-editor';

describe('inline preview editor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the rendered popup output-only and emits no content commits', async () => {
    const root = createPreviewRoot();
    const paragraph = document.createElement('p');
    paragraph.setAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE, 'paragraph_1');
    paragraph.setAttribute(LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE, 'paragraph');
    paragraph.textContent = 'On track with the launch';
    root.appendChild(paragraph);

    const onCommit = vi.fn();
    const editor = createInlinePreviewEditor({
      document,
      previewOwnerId: 'preview_1',
      onCommit,
    });

    expect(paragraph.hasAttribute('contenteditable')).toBe(false);
    expect(paragraph.hasAttribute('role')).toBe(false);

    const richInput = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'formatBold',
    });
    paragraph.dispatchEvent(richInput);
    expect(richInput.defaultPrevented).toBe(false);

    paragraph.textContent = 'A DOM-only mutation';
    paragraph.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    await vi.runAllTimersAsync();
    expect(onCommit).not.toHaveBeenCalled();

    editor.destroy();
  });
});

function createPreviewRoot(): ShadowRoot {
  const host = document.createElement('lodariq-tour');
  host.setAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE, 'preview_1');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}
