// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringMediaAssetResource, LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';

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

  it('authors continuous rich content while the popup remains output-only', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const tooltip = baseDocument.blocks[0]!.children[0]!;
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

    const richBlockCount = tooltip.children.filter(
      (block) => block.type !== 'button' && block.type !== 'link',
    ).length;
    const actionCount = tooltip.children.length - richBlockCount;
    await vi.waitFor(() =>
      expect(document.querySelectorAll('.rich-step-rendered-content')).toHaveLength(richBlockCount),
    );
    expect(document.querySelectorAll('.rich-step-block-row')).toHaveLength(actionCount);
    expect(document.querySelector('.rich-step-rendered-content input')).toBeNull();

    document
      .querySelector<HTMLElement>('.rich-step-rendered-content')
      ?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.rich-content-canvas')).not.toBeNull());

    const canvas = document.querySelector<HTMLElement>('.rich-content-canvas')!;
    expect(canvas.getAttribute('contenteditable')).toBe('true');
    expect(canvas.textContent).toContain('Create your first project');
    expect(document.querySelector('[aria-label="Before"]')).toBeNull();
    expect(document.querySelector('[aria-label="After"]')).toBeNull();
    expect(document.querySelector('[aria-label="Bold"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Italic"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Underline"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Font size"]')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('select[aria-label="Font size"]')).toBeNull();
    expect(document.querySelector('[aria-label="Selection background"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Space after"]')).toBeInstanceOf(HTMLInputElement);

    const firstText = canvas.querySelector('[data-lexical-text="true"]')?.firstChild;
    if (!firstText?.textContent) throw new Error('Rich-content text is missing');
    canvas.focus();
    const range = document.createRange();
    range.setStart(firstText, 0);
    range.setEnd(firstText, Math.min(4, firstText.textContent.length));
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    document.querySelector<HTMLButtonElement>('[aria-label="Bold"]')?.click();
    await vi.waitFor(() =>
      expect(canvas.querySelector('strong.rich-content-bold')?.textContent).toHaveLength(4),
    );

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
    canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('.rich-content-animation-menu')).toBeNull(),
    );

    expect(document.querySelector('[aria-label="Link"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Apply"]')).toBeNull();

    document.querySelector<HTMLButtonElement>('[aria-label="Icon"]')?.click();
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
    expect(document.querySelector('.rich-content-icon-menu')).not.toBeNull();
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
    await vi.waitFor(() => expect(document.querySelector('.rich-content-icon-menu')).toBeNull());
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }));
    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      expect(savedDocumentHasBlockType(latestCall?.[0] as LodariqDocument, 'icon')).toBe(false);
    });

    canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.rich-content-media-menu')).toBeNull());
    document.querySelector<HTMLButtonElement>('[aria-label="Media"]')?.click();
    const saveToLibrary = await waitForInput('.rich-content-library-option input[type="checkbox"]');
    saveToLibrary.click();
    const imageInput = await waitForInput('.rich-content-media-menu input[accept^="image/"]');
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
    expect(imageProgress?.closest('.rich-content-media-menu')).toBeNull();
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

    await vi.waitFor(() =>
      expect(document.querySelector<HTMLButtonElement>('[aria-label="Media"]')?.disabled).toBe(
        false,
      ),
    );
    canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.rich-content-media-menu')).toBeNull());
    document.querySelector<HTMLButtonElement>('[aria-label="Media"]')?.click();
    const videoInput = await waitForInput('.rich-content-media-menu input[accept^="video/"]');
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
    expect(document.querySelector('.rich-content-media-menu [role="progressbar"]')).toBeNull();

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

    const captionsInput = await waitForInput('.rich-content-media-menu input[accept="text/vtt"]');
    const captions = new File(['WEBVTT'], 'walkthrough.vtt', { type: 'text/vtt' });
    Object.defineProperty(captionsInput, 'files', { configurable: true, value: [captions] });
    captionsInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(uploadMediaAsset).toHaveBeenCalledTimes(3));
    expect(
      canvas
        .querySelector('[aria-label="Media upload progress"]')
        ?.closest('.rich-content-media-frame'),
    ).not.toBeNull();
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
  });
});

function savedDocumentHasBlockType(
  document: LodariqDocument | undefined,
  type: 'icon' | 'media',
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
        (run) => run.highlightColor === '#ffeeaa' && run.animation?.recipe === 'lift',
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
