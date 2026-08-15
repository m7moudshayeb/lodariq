// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringMediaAssetResource, LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';
import { RICH_CONTENT_PERSIST_DEBOUNCE_MS } from '@lodariq/sdk-authoring/editor';

const SESSION_ID = 'session_rich_content_canvas';

describe('unified popup content canvas', () => {
  beforeEach(() => {
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

  it(
    'authors continuous rich content in place inside the popup',
    async () => {
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
        _kind: 'image' | 'video' | 'captions',
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
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-step-content .rich-content-canvas')).not.toBeNull(),
    );
    const canvas = document.querySelector<HTMLElement>('.rich-content-canvas')!;
    expect(canvas.getAttribute('contenteditable')).toBe('true');
    expect(canvas.textContent).toContain('Create your first project');
    expect(document.querySelector('.rich-step-rendered-content')).toBeNull();
    expect(document.querySelector('.rich-step-block-row')).toBeNull();

    // Format and insert stay on a persistent toolbar — no selection or hover required.
    expect(document.querySelector('[aria-label="Bold"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[aria-label="Icon"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[aria-label="Emoji"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[aria-label="Media"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[aria-label="Divider"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[aria-label="Button"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[aria-label="Field"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[aria-label="Space after"]')).toBeInstanceOf(HTMLInputElement);
    expect(canvas.querySelector('.rich-content-button-preview')).not.toBeNull();
    canvas.querySelector<HTMLButtonElement>('.rich-content-button-preview')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Button label"]')).toBeInstanceOf(HTMLInputElement),
    );
    expect(document.querySelector('[aria-label="After click"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('[data-property-id="button.alignment"]')).toBeNull();
    expect(document.querySelector('.storyboard-property-tray[data-tool-mode="content"]')).not.toBeNull();
    expect(document.querySelector('.popup-inspector-tabs')).not.toBeNull();
    const label = document.querySelector<HTMLInputElement>('[aria-label="Button label"]')!;
    label.focus();
    setNativeInputValue(label, 'Continue now');
    label.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.activeElement).toBe(label);
    const savesBeforeIdle = saveDocument.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, RICH_CONTENT_PERSIST_DEBOUNCE_MS + 50));
    expect(document.activeElement).toBe(
      document.querySelector('[aria-label="Button label"]'),
    );
    expect(document.querySelector<HTMLInputElement>('[aria-label="Button label"]')?.value).toBe(
      'Continue now',
    );
    expect(saveDocument.mock.calls.length).toBe(savesBeforeIdle);
    document.querySelector<HTMLInputElement>('[aria-label="Button label"]')?.blur();
    await vi.waitFor(() =>
      expect(savedButtonLabel(saveDocument.mock.calls.at(-1)?.[0] as LodariqDocument)).toBe(
        'Continue now',
      ),
    );
    [...document.querySelectorAll<HTMLButtonElement>('.popup-inspector-tabs button')]
      .find((button) => button.textContent?.trim() === 'Appearance')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-property-id="button.fillColor"]')).not.toBeNull(),
    );
    const colorRow = document.querySelector('.storyboard-property-color-row');
    expect(colorRow?.querySelector('[data-property-id="button.fillColor"]')).not.toBeNull();
    expect(colorRow?.querySelector('[data-property-id="button.textColor"]')).not.toBeNull();
    expect(colorRow?.querySelector('[data-property-id="button.borderColor"]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('.storyboard-tool-dock [aria-label="Popup"]')?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('.storyboard-property-tray[data-tool-mode="content"]')).toBeNull();
      expect(document.querySelector('[aria-label="Popup layout settings"]')).not.toBeNull();
    });
    expect(document.querySelector('.rich-step-content')?.dataset['lodariqActionLayout']).toBe(
      'stack',
    );
    expect(document.querySelector('[aria-label="Action layout"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Action alignment"]')).not.toBeNull();
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Action layout"] button')]
      .find((button) => button.textContent?.trim() === 'Inline')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-step-content')?.dataset['lodariqActionLayout']).toBe(
        'inline',
      ),
    );
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Action alignment"] button')]
      .find((button) => button.textContent?.trim() === 'Stretch')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-step-content')?.dataset['lodariqActionAlign']).toBe(
        'stretch',
      ),
    );
    expect(
      document.querySelector('[aria-label="Popup layout settings"] .storyboard-tray-close'),
    ).toBeInstanceOf(HTMLButtonElement);
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Action gap"] button')]
      .find((button) => button.textContent?.trim() === 'Relaxed')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-step-content')?.dataset['lodariqCompositionGap']).toBe(
        'relaxed',
      ),
    );
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Content alignment"] button')]
      .find((button) => button.textContent?.trim() === 'Center')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-step-content')?.dataset['lodariqContentAlign']).toBe(
        'center',
      ),
    );
    canvas.querySelector<HTMLButtonElement>('.rich-content-button-preview')?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('[aria-label="Button label"]')).toBeInstanceOf(HTMLInputElement);
      expect(document.querySelector('[aria-label="Popup layout settings"]')).toBeNull();
    });
    document.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.storyboard-property-tray[data-tool-mode="content"]')).toBeNull(),
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
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-toolbar')).not.toBeNull(),
    );
    expect(document.querySelector('[aria-label="Italic"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Underline"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Font size"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('select[aria-label="Font size"]')).toBeNull();
    expect(document.querySelector('[aria-label="Text color"]')).toBeInstanceOf(HTMLInputElement);
    expect(document.querySelector('[aria-label="Selection background"]')).toBeInstanceOf(
      HTMLInputElement,
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Icon"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-rich-content-floating-menu="true"]')).not.toBeNull(),
    );
    document
      .querySelector<HTMLButtonElement>('[aria-label="Bold"]')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-rich-content-floating-menu="true"]')).toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Font size"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-rich-content-select-content="true"]')).not.toBeNull(),
    );
    document
      .querySelector<HTMLButtonElement>('[aria-label="Bold"]')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-rich-content-select-content="true"]')).toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Bold"]')?.click();
    await vi.waitFor(() =>
      expect(canvas.querySelector('strong.rich-content-bold')?.textContent).toHaveLength(4),
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
    document.querySelector<HTMLButtonElement>('[aria-label="Animation"]')?.click();
    expect(document.querySelector('select[aria-label="Animation effect"]')).toBeNull();
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
        expect(document.querySelector('[aria-label="Add content"]')).not.toBeNull(),
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

    document.querySelector<HTMLButtonElement>('[aria-label="Add content"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-insert-menu')).not.toBeNull(),
    );
    const insertOption = (label: string): HTMLButtonElement | undefined =>
      [
        ...document.querySelectorAll<HTMLButtonElement>('.rich-content-insert-options button'),
      ].find((candidate) => candidate.textContent?.trim() === label);
    expect(insertOption('Heading')).toBeDefined();
    expect(insertOption('Divider')).toBeDefined();
    expect(insertOption('Stat')).toBeDefined();
    expect(insertOption('Checkbox')).toBeDefined();
    expect(insertOption('Text field')).toBeDefined();
    expect(insertOption('Radio')).toBeDefined();
    insertOption('Icon')?.click();
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
    document.querySelector<HTMLButtonElement>('[aria-label="Add content"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-insert-menu')).not.toBeNull(),
    );
    insertOption('Checkbox')?.click();
    await vi.waitFor(() =>
      expect(canvas.querySelector('.rich-content-form-field-preview')).not.toBeNull(),
    );
    canvas.querySelector<HTMLElement>('.rich-content-form-field-preview')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Field label"]')).toBeInstanceOf(HTMLInputElement),
    );
    expect(document.querySelector('[aria-label="Field settings"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Field type"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.body.textContent).toContain(
      'Answers stay in this experience. Lodariq does not read your product database.',
    );
    [...document.querySelectorAll<HTMLButtonElement>('.popup-inspector-tabs button')]
      .find((button) => button.textContent?.trim() === 'Appearance')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-property-id="formField.fillColor"]')).not.toBeNull(),
    );
    const fieldColorRow = document.querySelector('.storyboard-property-color-row');
    expect(fieldColorRow?.querySelector('[data-property-id="formField.fillColor"]')).not.toBeNull();
    expect(fieldColorRow?.querySelector('[data-property-id="formField.labelColor"]')).not.toBeNull();
    expect(fieldColorRow?.querySelector('[data-property-id="formField.borderColor"]')).not.toBeNull();
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedDocumentHasBlockType(latestCall?.[0] as LodariqDocument, 'formField')).toBe(true);
    });

    // Media uploads live in the same insert menu.
    await hoverFirstBlock();
    document.querySelector<HTMLButtonElement>('[aria-label="Add content"]')?.click();
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

    await hoverFirstBlock();
    document.querySelector<HTMLButtonElement>('[aria-label="Add content"]')?.click();
    const videoInput = await waitForInput('.rich-content-insert-media input[accept^="video/"]');
    const video = new File(['video'], 'walkthrough.mp4', { type: 'video/mp4' });
    Object.defineProperty(videoInput, 'files', { configurable: true, value: [video] });
    videoInput.dispatchEvent(new Event('change', { bubbles: true }));
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

    // Captions upload appears in the insert menu once a video has been added.
    await hoverFirstBlock();
    document.querySelector<HTMLButtonElement>('[aria-label="Add content"]')?.click();
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
  },
  20_000,
);
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

async function waitForInput(selector: string): Promise<HTMLInputElement> {
  let input: HTMLInputElement | null = null;
  await vi.waitFor(() => {
    input = document.querySelector<HTMLInputElement>(selector);
    expect(input, selector).not.toBeNull();
  });
  if (!input) throw new Error(`${selector} input is missing`);
  return input;
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
  trigger.click();
  await vi.waitFor(() => {
    expect(findSelectOption(optionLabel), optionLabel).toBeDefined();
  });
  const option = findSelectOption(optionLabel);
  if (!option) throw new Error(`${optionLabel} select option is missing`);
  option.click();
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
