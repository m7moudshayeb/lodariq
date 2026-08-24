// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringMediaAssetResource, LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';
import { installJsdomInteractionShims } from '../support/jsdom-interaction';
import { RICH_CONTENT_PERSIST_DEBOUNCE_MS } from '@lodariq/sdk-authoring/editor';
import { $getRoot, $isElementNode, getNearestEditorFromDOMNode } from 'lexical';

const SESSION_ID = 'session_rich_content_canvas';

describe('unified popup content canvas', () => {
  beforeEach(() => {
    installJsdomInteractionShims();
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class AuthoringTestURL extends NativeURL {
        static override createObjectURL(): string {
          return 'blob:lodariq-authoring-preview';
        }

        static override revokeObjectURL(): void {}
      },
    );
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverStub {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('authors continuous rich content in place inside the popup', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const saveDocument = vi.fn();
    const uploadedMediaAsset = {
      id: 'asset_uploaded_image',
      kind: 'image' as const,
      filename: 'preview.png',
      contentType: 'image/png',
      byteLength: 4,
      contentHash: `sha256-${'d'.repeat(64)}`,
      savedToLibrary: true,
      createdAt: '2026-08-15T00:00:00.000Z',
      downloadPath: '/v1/authoring/media-assets/asset_uploaded_image',
    };
    let resolveMediaUpload!: (asset: AuthoringMediaAssetResource) => void;
    const uploadMediaAsset = vi.fn(
      (
        _kind: 'image' | 'video' | 'captions' | 'audio',
        _file: File,
        _options: { onProgress?: (progress: number) => void; savedToLibrary: boolean },
      ) =>
        new Promise<AuthoringMediaAssetResource>((resolve) => {
          resolveMediaUpload = resolve;
        }),
    );

    await mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument,
        loadMediaAssets: () => [],
        loadMediaAssetPreview: async () => new Blob(['test'], { type: 'image/png' }),
        uploadMediaAsset,
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn().mockResolvedValue({}),
        recordMetric: vi.fn(),
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
      },
      frameMode: 'panel',
      sessionId: `${SESSION_ID}_freeform`,
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    // The Lexical editor mounts directly inside the popup — no activation step.
    await vi.waitFor(() => {
      expect(document.querySelector('.rich-step-content .rich-content-canvas')).not.toBeNull();
      expect(document.querySelector('[aria-label="Bold"]')).toBeInstanceOf(HTMLButtonElement);
    });
    const canvas = document.querySelector<HTMLElement>('.rich-content-canvas')!;
    expect(canvas.getAttribute('contenteditable')).toBe('true');
    expect(canvas.textContent).toContain('Create your first project');
    expect(document.querySelector('.rich-step-rendered-content')).toBeNull();
    expect(document.querySelector('.rich-step-block-row')).toBeNull();

    // Compact docked chip: style, bold/italic, link, insert, more. Insert is the
    // bar's one worded control (§4.2a), so it is named rather than a glyph.
    expect(document.querySelector('[aria-label="Bold"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[aria-label="Insert"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[aria-label="More formatting"]')).toBeInstanceOf(
      HTMLButtonElement,
    );
    expect(document.querySelector('.rich-content-toolbar [aria-label="Icon"]')).toBeNull();
    expect(canvas.querySelector('.rich-content-button-preview')).not.toBeNull();
    canvas.querySelector<HTMLButtonElement>('.rich-content-button-preview')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Label"]')).toBeInstanceOf(HTMLInputElement),
    );
    expect(document.querySelector('[aria-label="On click"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[data-property-id="button.alignment"]')).toBeNull();
    expect(
      document.querySelector('.storyboard-property-tray[data-tool-mode="content"]'),
    ).not.toBeNull();
    // Sections, not tabs (§4.3): every inspector renders the same section list.
    expect(document.querySelector('.popup-inspector-tabs')).toBeNull();
    expect(document.querySelector('.inspector-section[data-section="button"]')).not.toBeNull();
    const label = document.querySelector<HTMLInputElement>('[aria-label="Label"]')!;
    label.focus();
    setNativeInputValue(label, 'Continue now');
    label.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.activeElement).toBe(label);
    const savesBeforeIdle = saveDocument.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, RICH_CONTENT_PERSIST_DEBOUNCE_MS + 50));
    expect(document.activeElement).toBe(document.querySelector('[aria-label="Label"]'));
    expect(document.querySelector<HTMLInputElement>('[aria-label="Label"]')?.value).toBe(
      'Continue now',
    );
    expect(saveDocument.mock.calls.length).toBe(savesBeforeIdle);
    document.querySelector<HTMLInputElement>('[aria-label="Label"]')?.blur();
    await vi.waitFor(() => {
      const lastCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedButtonLabel(lastCall?.[0] as LodariqDocument)).toBe('Continue now');
    });
    openInspectorSection('style');
    await vi.waitFor(() =>
      expect(document.querySelector('[data-property-id="button.fillColor"]')).not.toBeNull(),
    );
    const colorRow = document.querySelector('.storyboard-property-color-row');
    expect(colorRow?.querySelector('[data-property-id="button.fillColor"]')).not.toBeNull();
    expect(colorRow?.querySelector('[data-property-id="button.textColor"]')).not.toBeNull();
    expect(colorRow?.querySelector('[data-property-id="button.borderColor"]')).not.toBeNull();
    expect(document.querySelector('.storyboard-tool-dock')).toBeNull();
    expect(document.querySelector('[aria-label="Popup layout settings"]')).toBeNull();
    document.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector('.storyboard-property-tray[data-tool-mode="content"]'),
      ).toBeNull(),
    );

    const firstTextHost = canvas.querySelector<HTMLElement>('[data-lexical-text="true"]');
    const firstText = firstTextHost?.firstChild;
    if (!firstText?.textContent) throw new Error('Rich-content text is missing');
    firstTextHost?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    firstTextHost?.click();
    canvas.focus();
    const range = document.createRange();
    range.setStart(firstText, 0);
    range.setEnd(firstText, Math.min(4, firstText.textContent.length));
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await vi.waitFor(() => expect(document.querySelector('.rich-content-toolbar')).not.toBeNull());
    expect(document.querySelector('[aria-label="Italic"]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[aria-label="More formatting"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Underline"]')).not.toBeNull(),
    );
    expect(document.querySelector('[aria-label="Font size"]')).toBeInstanceOf(HTMLButtonElement);
    expect(
      document
        .querySelector('select.ui-native-select-mirror[aria-label="Font size"]')
        ?.getAttribute('tabindex'),
    ).toBe('-1');
    expect(document.querySelector('[aria-label="Text color"]')).toBeInstanceOf(HTMLInputElement);
    expect(document.querySelector('[aria-label="Selection background"]')).toBeInstanceOf(
      HTMLInputElement,
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Add content"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-rich-content-floating-menu="true"]')).not.toBeNull(),
    );
    document
      .querySelector<HTMLButtonElement>('[aria-label="Bold"]')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-rich-content-floating-menu="true"]')).toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="More formatting"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('button[aria-label="Font size"]')).toBeInstanceOf(
        HTMLButtonElement,
      ),
    );
    document
      .querySelector<HTMLButtonElement>('button[aria-label="Font size"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    await vi.waitFor(() => expect(document.querySelector('.ui-select-content')).not.toBeNull());
    document
      .querySelector<HTMLButtonElement>('[aria-label="Bold"]')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.ui-select-content')).toBeNull());

    document.querySelector<HTMLButtonElement>('[aria-label="Bold"]')?.click();
    await vi.waitFor(() =>
      expect(canvas.querySelector('strong.rich-content-bold')?.textContent).toHaveLength(4),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="More formatting"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Text color"]')).toBeInstanceOf(HTMLInputElement),
    );
    const textColor = document.querySelector<HTMLInputElement>('[aria-label="Text color"]');
    if (!textColor) throw new Error('Text color control is missing');
    setNativeInputValue(textColor, '#112233');
    textColor.dispatchEvent(new Event('input', { bubbles: true }));
    const selectionBackground = document.querySelector<HTMLInputElement>(
      '[aria-label="Selection background"]',
    );
    if (!selectionBackground) throw new Error('Selection background control is missing');
    setNativeInputValue(selectionBackground, '#ffeeaa');
    selectionBackground.dispatchEvent(new Event('input', { bubbles: true }));
    // Editing inside an open menu never closes it; the trigger stays untouched.
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Animation effect"]')).toBeInstanceOf(
        HTMLButtonElement,
      ),
    );
    expect(
      document
        .querySelector('select.ui-native-select-mirror[aria-label="Animation effect"]')
        ?.getAttribute('tabindex'),
    ).toBe('-1');
    selectFirstTextRun();
    await chooseDesignedSelect('Animation effect', 'Rise in');
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedDocumentHasAnimatedHighlight(latestCall?.[0] as LodariqDocument)).toBe(true);
    });
    expect(document.querySelector('[aria-label="Link"]')).not.toBeNull();

    const hoverFirstBlock = async (): Promise<void> => {
      document.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 }),
      );
      await vi.waitFor(() =>
        expect(document.querySelector('[aria-label="Block options"]')).not.toBeNull(),
      );
    };

    // Block hover handles: `+` opens the insert menu, the grip opens block options.
    await hoverFirstBlock();
    const heading = canvas.querySelector<HTMLElement>('.rich-content-heading');
    const paragraph = canvas.querySelector<HTMLElement>('.rich-content-paragraph');
    if (!heading || !paragraph) throw new Error('Heading or paragraph is missing');
    heading.getBoundingClientRect = () => new DOMRect(0, 0, 240, 40);
    paragraph.getBoundingClientRect = () => new DOMRect(0, 40, 240, 40);
    const grip = document.querySelector<HTMLButtonElement>('[aria-label="Block options"]');
    if (!grip) throw new Error('Block options grip is missing');
    const transfer = {
      dropEffect: 'move',
      effectAllowed: 'move',
      setData() {},
      setDragImage() {},
    };
    const dragEvent = (type: string, clientY: number): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clientX', { value: 8 });
      Object.defineProperty(event, 'clientY', { value: clientY });
      Object.defineProperty(event, 'dataTransfer', { value: transfer });
      return event;
    };
    grip.dispatchEvent(dragEvent('dragstart', 0));
    document.dispatchEvent(dragEvent('dragover', 72));
    document.dispatchEvent(dragEvent('drop', 72));
    grip.dispatchEvent(dragEvent('dragend', 72));
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedTooltipChildIds(latestCall?.[0] as LodariqDocument)).toEqual([
        'block_paragraph_1',
        'block_heading_1',
        'block_button_1',
      ]);
    });
    await hoverFirstBlock();
    document.querySelector<HTMLButtonElement>('[aria-label="Block options"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Space after"]')).toBeInstanceOf(HTMLInputElement),
    );
    expect(document.querySelector('.rich-content-block-settings-menu')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[aria-label="Block options"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-block-settings-menu')).toBeNull(),
    );

    document
      .querySelector<HTMLButtonElement>('.rich-content-block-handles [aria-label="Add content"]')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-insert-menu')).not.toBeNull(),
    );
    // §4.2a: pressing the handle opens the four-up grid of block types. One
    // "Form field" tile, not one per control — the control is a property on the
    // field and the inspector switches it.
    const insertOption = (label: string): HTMLButtonElement | undefined =>
      [...document.querySelectorAll<HTMLButtonElement>('.rich-content-insert-grid button')].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
    expect(insertOption('Heading')).toBeDefined();
    expect(insertOption('Divider')).toBeDefined();
    expect(insertOption('Stat')).toBeDefined();
    expect(insertOption('Form field')).toBeDefined();
    expect(insertOption('Target chip')).toBeDefined();
    expect(insertOption('Status badge')).toBeDefined();
    insertOption('Icon + text')?.click();
    const iconColor = await waitForInput('input[aria-label="Icon color"]');
    setNativeInputValue(iconColor, '#c2410c');
    iconColor.dispatchEvent(new Event('input', { bubbles: true }));
    const iconSearch = await waitForInput('input[aria-label="Search icons"]');
    setNativeInputValue(iconSearch, 'party');
    iconSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('button[aria-label="Party Popper"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('button[aria-label="Party Popper"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('button[aria-label="Party Popper"]')).not.toBeNull(),
    );
    await vi.waitFor(() => {
      expect(
        saveDocument.mock.calls.some(([saved]) =>
          savedDocumentHasBlockType(saved as LodariqDocument, 'icon'),
        ),
      ).toBe(true);
    });
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedIconColor(latestCall?.[0] as LodariqDocument)).toBe('#c2410c');
    });
    canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    const iconPreview = canvas.querySelector<HTMLElement>('.rich-content-icon-preview');
    expect(iconPreview).not.toBeNull();
    iconPreview?.focus();
    iconPreview?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }));
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedDocumentHasBlockType(latestCall?.[0] as LodariqDocument, 'icon')).toBe(false);
    });

    await hoverFirstBlock();
    document
      .querySelector<HTMLButtonElement>('.rich-content-block-handles [aria-label="Add content"]')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-insert-menu')).not.toBeNull(),
    );
    insertOption('Form field')?.click();
    await vi.waitFor(() =>
      expect(canvas.querySelector('.rich-content-form-field-preview')).not.toBeNull(),
    );
    canvas.querySelector<HTMLElement>('.rich-content-form-field-preview')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Field label"]')).toBeInstanceOf(HTMLInputElement),
    );
    expect(document.querySelector('section[aria-label="Form field"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Control"]')).not.toBeNull();
    expect(document.body.textContent).toContain(
      'Answers stay in this experience. Lodariq does not read your product database.',
    );
    openInspectorSection('style');
    await vi.waitFor(() =>
      expect(document.querySelector('[data-property-id="formField.fillColor"]')).not.toBeNull(),
    );
    const fieldColorRow = document.querySelector('.storyboard-property-color-row');
    expect(fieldColorRow?.querySelector('[data-property-id="formField.fillColor"]')).not.toBeNull();
    expect(document.querySelector('[data-property-id="formField.labelColor"]')).not.toBeNull();
    expect(
      fieldColorRow?.querySelector('[data-property-id="formField.borderColor"]'),
    ).not.toBeNull();
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedDocumentHasBlockType(latestCall?.[0] as LodariqDocument, 'formField')).toBe(true);
    });

    // Media uploads live in the same insert menu, one step in: an image carries
    // an asset id, so its tile opens the upload panel rather than dropping an
    // empty frame the creator then has to work out how to fill.
    openToolbarInsertMenu();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-insert-grid')).not.toBeNull(),
    );
    insertOption('Image')?.click();
    const saveToLibrary = await waitForInput('.rich-content-library-option input[type="checkbox"]');
    saveToLibrary.click();
    const imageInput = await waitForInput('.rich-content-insert-media input[accept^="image/"]');
    expect(imageInput.accept).toContain('image/gif');
    const image = new File(['test'], 'preview.png', { type: 'image/png' });
    Object.defineProperty(imageInput, 'files', { configurable: true, value: [image] });
    imageInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(uploadMediaAsset).toHaveBeenCalledWith('image', image, {
        savedToLibrary: true,
        onProgress: expect.any(Function),
      }),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Media upload progress"]')).not.toBeNull(),
    );
    const imageProgress = document.querySelector('[aria-label="Media upload progress"]');
    expect(imageProgress?.getAttribute('aria-valuenow')).toBe('0');
    expect(imageProgress?.closest('.rich-content-media-frame')).not.toBeNull();
    expect(
      canvas.querySelector('.rich-content-media-preview[data-uploading="true"] img'),
    ).not.toBeNull();
    uploadMediaAsset.mock.calls[0]?.[2].onProgress?.(46);
    await vi.waitFor(() =>
      expect(
        canvas.querySelector('[aria-label="Media upload progress"]')?.getAttribute('aria-valuenow'),
      ).toBe('46'),
    );
    resolveMediaUpload(uploadedMediaAsset);
    await vi.waitFor(() => expect(canvas.querySelector('img')).not.toBeNull());
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      const saved = latestCall?.[0] as LodariqDocument | undefined;
      expect(savedDocumentHasBlockType(saved, 'media')).toBe(true);
    });

    const resizeSurface = document.querySelector<HTMLElement>(
      '.rich-content-editor [aria-label^="Resize image."]',
    );
    expect(resizeSurface).not.toBeNull();
    expect(resizeSurface?.querySelector('.rich-content-media-resize-handle')).toBeNull();
    expect(resizeSurface?.querySelectorAll('.rich-content-media-resize-edge')).toHaveLength(8);
    resizeSurface?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    resizeSurface?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      const saved = latestCall?.[0] as LodariqDocument | undefined;
      expect(savedMediaWidth(saved)).toBe(95);
      expect(savedMediaHeight(saved)).toBeGreaterThanOrEqual(64);
    });
    resizeSurface?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }));
    await vi.waitFor(() => expect(canvas.querySelector('img')).toBeNull());
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedDocumentHasBlockType(latestCall?.[0] as LodariqDocument, 'media')).toBe(false);
    });

    openToolbarInsertMenu();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-insert-grid')).not.toBeNull(),
    );
    insertOption('Video')?.click();
    const video = new File(['video'], 'walkthrough.mp4', { type: 'video/mp4' });
    await pickMediaFile('video', video);
    await vi.waitFor(() => expect(uploadMediaAsset).toHaveBeenCalledTimes(2));
    const pendingVideo = canvas.querySelector<HTMLVideoElement>(
      'video[data-video-thumbnail="true"]',
    );
    expect(pendingVideo).not.toBeNull();
    expect(pendingVideo?.muted).toBe(true);
    expect(pendingVideo?.controls).toBe(false);
    const videoProgress = canvas.querySelector('[aria-label="Media upload progress"]');
    expect(videoProgress?.closest('.rich-content-media-frame')).not.toBeNull();

    const uploadedVideoAsset: AuthoringMediaAssetResource = {
      ...uploadedMediaAsset,
      id: 'asset_uploaded_video',
      kind: 'video',
      filename: video.name,
      contentType: video.type,
      contentHash: `sha256-${'e'.repeat(64)}`,
    };
    resolveMediaUpload(uploadedVideoAsset);
    await vi.waitFor(() => {
      const uploadedVideo = canvas.querySelector<HTMLVideoElement>('video');
      expect(uploadedVideo).not.toBeNull();
      expect(uploadedVideo?.controls).toBe(true);
      expect(uploadedVideo?.dataset['videoThumbnail']).toBeUndefined();
    });
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedVideoAssetId(latestCall?.[0] as LodariqDocument)).toBe(uploadedVideoAsset.id);
    });

    // Captions attach to the video that was just uploaded, so they are offered by
    // the same media panel that uploaded it — the toolbar's, not the gutter's.
    openToolbarInsertMenu();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-insert-grid')).not.toBeNull(),
    );
    insertOption('Video')?.click();
    const captionsInput = await waitForInput('.rich-content-insert-media input[accept="text/vtt"]');
    const captions = new File(['WEBVTT'], 'walkthrough.vtt', { type: 'text/vtt' });
    Object.defineProperty(captionsInput, 'files', { configurable: true, value: [captions] });
    captionsInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(uploadMediaAsset).toHaveBeenCalledTimes(3));
    const uploadedCaptionsAsset: AuthoringMediaAssetResource = {
      ...uploadedMediaAsset,
      id: 'asset_uploaded_captions',
      kind: 'captions',
      filename: captions.name,
      contentType: captions.type,
      contentHash: `sha256-${'f'.repeat(64)}`,
    };
    resolveMediaUpload(uploadedCaptionsAsset);
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedVideoCaptionsAssetId(latestCall?.[0] as LodariqDocument)).toBe(
        uploadedCaptionsAsset.id,
      );
    });
    expect(canvas.querySelectorAll('video')).toHaveLength(1);
  }, 20_000);
});

function savedTooltipChildIds(document: LodariqDocument | undefined): string[] {
  const step = document?.blocks[0];
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  return tooltip?.children.map((block) => block.id) ?? [];
}

function savedButtonLabel(document: LodariqDocument | undefined): string | undefined {
  const step = document?.blocks[0];
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  return tooltip?.children.find((block) => block.type === 'button')?.content;
}

function savedDocumentHasBlockType(
  document: LodariqDocument | undefined,
  type: 'icon' | 'media' | 'formField',
): boolean {
  const step = document?.blocks[0];
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  return Boolean(tooltip?.children.some((block) => block.type === type));
}

function savedMediaWidth(document: LodariqDocument | undefined): number | undefined {
  const step = document?.blocks[0];
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  return tooltip?.children.find((block) => block.type === 'media')?.props.media?.widthPercent;
}

function savedMediaHeight(document: LodariqDocument | undefined): number | undefined {
  const step = document?.blocks[0];
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  return tooltip?.children.find((block) => block.type === 'media')?.props.media?.heightPx;
}

function savedVideoAssetId(document: LodariqDocument | undefined): string | undefined {
  const step = document?.blocks[0];
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  const media = tooltip?.children.find((block) => block.props.media?.kind === 'video')?.props.media;
  return media?.kind === 'video' ? media.assetId : undefined;
}

function savedVideoCaptionsAssetId(document: LodariqDocument | undefined): string | undefined {
  const step = document?.blocks[0];
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  const media = tooltip?.children.find((block) => block.props.media?.kind === 'video')?.props.media;
  return media?.kind === 'video' ? media.captionsAssetId : undefined;
}

function savedIconColor(document: LodariqDocument | undefined): string | undefined {
  const step = document?.blocks[0];
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  return tooltip?.children.find((block) => block.type === 'icon')?.props.textStyle?.color;
}

function savedDocumentHasAnimatedHighlight(document: LodariqDocument | undefined): boolean {
  const step = document?.blocks[0];
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  return Boolean(
    tooltip?.children.some((block) =>
      block.contentRuns?.some(
        (run) =>
          run.color === '#112233' &&
          run.highlightColor === '#ffeeaa' &&
          run.animation?.recipe === 'lift',
      ),
    ),
  );
}

/** Expands an inspector section by clicking its summary, the way a creator would. */
function openInspectorSection(id: string): void {
  const summary = document.querySelector<HTMLElement>(
    `.inspector-section[data-section="${id}"] > summary`,
  );
  if (!summary) throw new Error(`Inspector section "${id}" is missing`);
  summary.click();
}

/**
 * The toolbar's Insert menu is always mounted; the block-handle menu closes with
 * hover. Insert lives in the frame's pinned slot rather than inside the editor's
 * toolbar — §4.2a keeps it still while the contextual middle swaps.
 */
function openToolbarInsertMenu(): void {
  const trigger = document.querySelector<HTMLButtonElement>(
    '.overlay-step-toolbar-insert [aria-label="Insert"], .rich-content-toolbar [aria-label="Insert"]',
  );
  if (!trigger) throw new Error('Toolbar insert trigger is missing');
  trigger.click();
}

async function waitForInput(selector: string): Promise<HTMLInputElement> {
  let input: HTMLInputElement | null = null;
  await vi.waitFor(() => {
    input = document.querySelector<HTMLInputElement>(selector);
    expect(input, selector).not.toBeNull();
    // A menu that is being torn down still matches the selector for a tick.
    expect(input?.isConnected, `${selector} is detached`).toBe(true);
  });
  if (!input) throw new Error(`${selector} input is missing`);
  return input;
}

/** Picks a file through the toolbar's insert menu, re-querying so the node is live. */
async function pickMediaFile(accept: 'image' | 'video', file: File): Promise<void> {
  const selector = `.rich-content-insert-media input[accept^="${accept}/"]`;
  await waitForInput(selector);
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input?.isConnected) throw new Error(`${accept} input is not live`);
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function chooseDesignedSelect(ariaLabel: string, optionLabel: string): Promise<void> {
  await vi.waitFor(() => {
    expect(
      document.querySelector<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`),
      ariaLabel,
    ).not.toBeNull();
  });
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`);
  if (!trigger) throw new Error(`${ariaLabel} select trigger is missing`);
  trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  await vi.waitFor(() => {
    expect(findSelectOption(optionLabel), optionLabel).toBeDefined();
  });
  const option = findSelectOption(optionLabel);
  if (!option) throw new Error(`${optionLabel} select option is missing`);
  // The designed select commits on pointer release, not a synthetic click.
  for (const type of ['pointermove', 'pointerdown', 'pointerup'] as const) {
    option.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  }
  option.click();
}

/** Re-selects the first run through Lexical; a jsdom range dies on a node split. */
function selectFirstTextRun(): void {
  const canvas = document.querySelector('.rich-content-canvas');
  if (!(canvas instanceof HTMLElement)) throw new Error('Rich content canvas is missing');
  const editor = getNearestEditorFromDOMNode(canvas);
  if (!editor) throw new Error('Lexical editor is missing');
  editor.update(() => {
    const first = $getRoot().getFirstChild();
    if ($isElementNode(first)) first.select(0, 1);
  });
}

function findSelectOption(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Native input value setter is unavailable');
  setter.call(input, value);
}
