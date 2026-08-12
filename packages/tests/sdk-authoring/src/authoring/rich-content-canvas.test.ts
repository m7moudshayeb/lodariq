// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeMessage, LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';

const SESSION_ID = 'session_rich_content_canvas';

describe('unified popup content canvas', () => {
  beforeEach(() => {
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

  it('keeps every ordered block editable and exposes contextual action and popup styling', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const tooltip = baseDocument.blocks[0]!.children[0]!;
    tooltip.props.tooltipLayout = {
      ...tooltip.props.tooltipLayout,
      widthPx: 320,
      heightPx: 240,
    };
    const button = tooltip.children.find((block) => block.type === 'button')!;
    button.props.blockLayout = { ...button.props.blockLayout, align: 'start' };
    tooltip.children.splice(tooltip.children.indexOf(button) + 1, 0, {
      id: 'paragraph_after_button',
      type: 'paragraph',
      content: 'You can change this later.',
      props: {},
      children: [],
    });
    const link = {
      id: 'link_after_button',
      type: 'link' as const,
      content: 'Read the guide',
      props: { action: { type: 'openPage' as const, url: '/guide' } },
      children: [],
    };
    tooltip.children.push(link);
    const saveDocument = vi.fn();
    const postMessage = vi.fn();
    const peer = { postMessage } as unknown as Window;

    mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument,
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn().mockResolvedValue({}),
        recordMetric: vi.fn(),
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
      },
      frameMode: 'panel',
      sessionId: SESSION_ID,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    await vi.waitFor(() =>
      expect(document.querySelectorAll('.rich-step-block-row')).toHaveLength(
        tooltip.children.length,
      ),
    );
    expect(
      [...document.querySelectorAll<HTMLElement>('.rich-step-block-row')].map(
        (row) => row.dataset['blockId'],
      ),
    ).toEqual(tooltip.children.map((block) => block.id));
    expect(
      [...document.querySelectorAll<HTMLOptionElement>('[aria-label="Block type"] option')].map(
        (option) => option.value,
      ),
    ).toEqual(['paragraph', 'heading', 'list', 'button', 'link', 'media', 'divider']);
    expect(document.querySelectorAll('.tour-storyboard-step')).toHaveLength(
      baseDocument.blocks.length,
    );
    const buttonRow = document.querySelector<HTMLElement>(`[data-block-id="${button.id}"]`)!;
    buttonRow.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.querySelector('[aria-label="Selected action style"]')).toBeNull();
    await vi.waitFor(() => {
      const actionToolbar = document.querySelector('[aria-label="Button configuration"]');
      expect(actionToolbar).not.toBeNull();
      expect(actionToolbar?.getAttribute('data-positioned')).toBe('true');
    });
    const actionToolbar = document.querySelector('[aria-label="Button configuration"]');
    if (!actionToolbar) throw new Error('Button configuration toolbar is missing');
    expect(actionToolbar?.querySelector('[aria-label="Behavior"]')).toBeNull();
    expect(actionToolbar?.querySelector('[aria-label="Alignment"]')).toBeNull();
    expect(actionToolbar?.querySelector('[aria-label="Colors"]')).toBeNull();
    expect(actionToolbar?.querySelector('[aria-label="More button settings"]')).not.toBeNull();
    expect(buttonRow.querySelector('.rich-step-action-stage')?.tagName).toBe('DIV');
    actionToolbar.querySelector<HTMLButtonElement>('[aria-label="More button settings"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Selected action style"]')).not.toBeNull(),
    );
    buttonByText(document, 'Alignment').click();
    await clickInspectorChoice('Alignment', 'Center');
    await vi.waitFor(() =>
      expect(latestSavedTooltip(saveDocument)?.props.tooltipLayout?.actionAlign).toBe('center'),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Selected action style"]')).toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Close button controls"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Button configuration"]')).toBeNull(),
    );
    buttonRow.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Button configuration"]')).not.toBeNull(),
    );
    const toolDock = document.querySelector('.storyboard-tool-dock');
    expect(buttonByText(toolDock, 'Popup')).toBeTruthy();
    expect(
      [...toolDock!.querySelectorAll('button')].some((item) => item.textContent === 'Behavior'),
    ).toBe(false);
    const popupCanvas = document.querySelector<HTMLElement>('.rich-step-popup-frame');
    const popupContent = document.querySelector<HTMLElement>('.rich-step-content');
    expect(popupContent?.dataset['lodariqContentAlign']).toBe('left');
    expect(popupContent?.dataset['lodariqCompositionPadding']).toBe('standard');
    expect(popupCanvas?.style.getPropertyValue('--lq-tour-surface')).not.toBe('');
    expect(popupCanvas?.style.getPropertyValue('--storyboard-canvas-zoom')).toBe('0.8');
    expect(popupCanvas?.style.getPropertyValue('--storyboard-popup-width')).toBe('320px');
    expect(popupCanvas?.style.getPropertyValue('--storyboard-popup-height')).toBe('240px');
    expect(document.querySelector('.rich-step-editor > .storyboard-canvas-zoom')).not.toBeNull();
    expect(document.querySelector('.storyboard-editor-stage > .storyboard-canvas-zoom')).toBeNull();
    const popupDragHandle = document.querySelector<HTMLButtonElement>(
      '[aria-label="Move popup in canvas"]',
    );
    if (!popupDragHandle) throw new Error('Popup drag handle is missing');
    await vi.waitFor(() => expect(popupCanvas?.dataset['transformReady']).toBe('true'));
    popupDragHandle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    popupDragHandle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    await vi.waitFor(() => {
      expect(popupCanvas?.style.getPropertyValue('--storyboard-popup-x')).toBe('8px');
      expect(popupCanvas?.style.getPropertyValue('--storyboard-popup-y')).toBe('8px');
    });
    popupDragHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await vi.waitFor(() => {
      expect(popupCanvas?.style.getPropertyValue('--storyboard-popup-x')).toBe('0px');
      expect(popupCanvas?.style.getPropertyValue('--storyboard-popup-y')).toBe('0px');
    });
    const popupResizeHandles = document.querySelectorAll<HTMLButtonElement>(
      '.storyboard-popup-resize-handle',
    );
    expect(popupResizeHandles).toHaveLength(4);
    const popupEndResizeHandle = document.querySelector<HTMLButtonElement>(
      '[aria-label="Resize popup from bottom right"]',
    );
    if (!popupEndResizeHandle) throw new Error('Popup resize handle is missing');
    popupEndResizeHandle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    popupEndResizeHandle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    await vi.waitFor(() => {
      const layout = latestSavedTooltip(saveDocument)?.props.tooltipLayout;
      expect(layout?.widthPx).toBe(328);
      expect(layout?.heightPx).toBe(248);
    });
    expect(popupCanvas?.style.getPropertyValue('--storyboard-popup-width')).toBe('328px');
    expect(popupCanvas?.style.getPropertyValue('--storyboard-popup-height')).toBe('248px');
    expect(document.querySelector('.storyboard-popup-size')?.textContent).toContain('328 × 248px');
    await vi.waitFor(() =>
      expect(latestPreviewPatch(postMessage)).toMatchObject({
        blockId: tooltip.id,
        patch: {
          ops: expect.arrayContaining([
            expect.objectContaining({
              op: 'setTooltipLayout',
              tooltipLayout: expect.objectContaining({ widthPx: 328, heightPx: 248 }),
            }),
          ]),
        },
      }),
    );
    buttonRow.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Button configuration"]')).not.toBeNull(),
    );
    const actionPreview = buttonRow.querySelector<HTMLElement>('.rich-step-action-preview');
    const actionStage = buttonRow.querySelector<HTMLElement>('.rich-step-action-stage');
    const endResizeHandle = buttonRow.querySelector<HTMLButtonElement>(
      '[aria-label="Resize button from end"]',
    );
    if (!actionPreview || !actionStage || !endResizeHandle) {
      throw new Error('Direct button resize controls are missing');
    }
    vi.spyOn(actionPreview, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 120, 36));
    vi.spyOn(actionStage, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 60));
    endResizeHandle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(latestSavedButton(saveDocument, button.id)?.props.buttonStyle?.widthPx).toBe(160),
    );
    expect(actionPreview.dataset['lodariqActionWidth']).toBe('custom');
    expect(actionPreview.style.width).toBe('160px');
    document.querySelector<HTMLButtonElement>('[aria-label="Zoom in canvas"]')?.click();
    await vi.waitFor(() =>
      expect(popupCanvas?.style.getPropertyValue('--storyboard-canvas-zoom')).toBe('0.9'),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="More button settings"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Selected action style"]')).not.toBeNull(),
    );
    buttonByText(document.querySelector('[aria-label="Button settings"]')!, 'Shape & icon').click();
    await clickInspectorChoice('Corner radius', 'Pill');
    await vi.waitFor(() =>
      expect(latestSavedButton(saveDocument, button.id)?.props.buttonStyle?.radius).toBe('round'),
    );
    expect(actionPreview.dataset['lodariqActionRadius']).toBe('round');
    buttonByText(document.querySelector('[aria-label="Button settings"]')!, 'Spacing').click();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[aria-label="Spacing settings"] input[type="range"]'),
      ).not.toBeNull(),
    );
    expect(document.querySelector('[aria-label="Popup layout"]')).toBeNull();
    expect(document.querySelector('[aria-label="Block spacing"]')).toBeNull();
    buttonByText(toolDock, 'Popup').click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Popup layout"]')).not.toBeNull(),
    );
    expect(document.querySelector('[aria-label="Popup layout"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Action alignment"]')).toBeNull();
    expect(document.querySelectorAll('.rich-step-content .inline-insert')).toHaveLength(
      tooltip.children.length + 1,
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Popup layout"]')).toBeNull(),
    );
    expect(buttonByText(toolDock, 'Content').getAttribute('aria-pressed')).toBe('true');
    buttonByText(toolDock, 'Popup').click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Popup layout"]')).not.toBeNull(),
    );
    buttonByText(toolDock, 'Placement').click();
    let placementTrigger: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      placementTrigger = document.querySelector<HTMLButtonElement>(
        '.tour-live-target [aria-label^="Placement "]',
      );
      expect(placementTrigger).not.toBeNull();
    });
    document
      .querySelector<HTMLButtonElement>('.tour-live-target [aria-label^="Placement "]')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Placement actions"]')).not.toBeNull(),
    );
    expect(document.body.textContent).toContain('Show on page');
    expect(document.body.textContent).toContain('Choose another');
    expect(document.body.textContent).toContain('Use exact area');
    const morePlacementOptions = document.querySelector<HTMLElement>(
      '[data-action="target-more-options"]',
    );
    morePlacementOptions?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Before this element appears"]')).not.toBeNull(),
    );
    expect(document.querySelector('[aria-label="Wait for text"]')).not.toBeNull();
    document
      .querySelector<HTMLButtonElement>('.tour-live-target [aria-label^="Placement "]')
      ?.click();
    document.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Selected action style"]')).toBeNull(),
    );

    const linkRow = document.querySelector<HTMLElement>(`[data-block-id="${link.id}"]`)!;
    linkRow.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Link configuration"]')).not.toBeNull(),
    );
    const linkToolbar = document.querySelector('[aria-label="Link configuration"]');
    expect(linkToolbar?.querySelector('[aria-label="Link behavior"]')).not.toBeNull();
    expect(linkToolbar?.querySelector('[aria-label="Alignment"]')).toBeNull();
    linkToolbar?.querySelector<HTMLButtonElement>('[aria-label="Link behavior"]')?.click();
    const destination = await waitForInput('[aria-label="Behavior settings"] input');
    expect(destination.value).toBe('/guide');
    expect(getComputedStyle(destination).height).toBe('var(--lq-control-sm)');
    expect(
      getComputedStyle(document.documentElement).getPropertyValue('--lq-control-sm').trim(),
    ).toBe('36px');
    document.querySelector<HTMLButtonElement>('[aria-label="Close link behavior"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Behavior settings"]')).toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Close link controls"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Link configuration"]')).toBeNull(),
    );

    const firstInsert = document.querySelector<HTMLButtonElement>(
      '.rich-step-content .inline-insert-trigger',
    );
    firstInsert?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Close content menu"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Close content menu"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Close content menu"]')).toBeNull(),
    );

    const paragraph = tooltip.children.find((block) => block.type === 'paragraph')!;
    const paragraphRow = document.querySelector<HTMLElement>(`[data-block-id="${paragraph.id}"]`)!;
    const paragraphEditor = paragraphRow.querySelector<HTMLElement>('[contenteditable="true"]')!;
    paragraphRow.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const textNode = paragraphEditor.firstChild;
    if (!textNode) throw new Error('Paragraph text node is missing');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(5, textNode.textContent?.length ?? 0));
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    paragraphEditor.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLSelectElement>('[aria-label="Font size"]')?.value).toBe(
        'default',
      );
    });
    expect(
      document.querySelector('[aria-label="Text formatting"]')?.getAttribute('data-positioned'),
    ).toBe('true');
    document.querySelector<HTMLButtonElement>('[aria-label="More text settings"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Block spacing"]')).not.toBeNull(),
    );
    const fontSize = document.querySelector<HTMLSelectElement>('[aria-label="Font size"]');
    if (!fontSize) throw new Error('Font size control is missing');
    setNativeSelectValue(fontSize, '24');
    fontSize.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(latestSavedButton(saveDocument, paragraph.id)?.contentRuns).toEqual([
        { text: paragraph.content?.slice(0, 5), fontSizePx: 24 },
        { text: paragraph.content?.slice(5) },
      ]),
    );

    buttonRow.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Selected action style"]')).toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="More button settings"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Selected action style"]')).not.toBeNull(),
    );

    buttonByText(document, 'Alignment').click();
    await vi.waitFor(() =>
      expect(
        document.querySelector('.rich-step-choice-field [aria-label="Alignment"]'),
      ).not.toBeNull(),
    );
    await clickInspectorChoice('Alignment', 'End');
    await vi.waitFor(() =>
      expect(latestSavedTooltip(saveDocument)?.props.tooltipLayout?.actionAlign).toBe('end'),
    );
    expect(latestSavedButton(saveDocument, button.id)?.props.blockLayout?.align).toBeUndefined();

    buttonByText(document, 'Colors').click();
    await clickWhenPresent('[aria-label="Use #162033 for fill"]');
    await vi.waitFor(() =>
      expect(latestSavedButton(saveDocument, button.id)?.props.buttonStyle?.fillColor).toBe(
        '#162033',
      ),
    );
    expect(
      document
        .querySelector<HTMLElement>('.rich-step-action-preview')
        ?.style.getPropertyValue('--lq-action-fill'),
    ).toBe('#162033');

    buttonByText(document.querySelector('[aria-label="Button settings"]')!, 'Spacing').click();
    const spacingSlider = await waitForInput('[aria-label="Spacing settings"] input[type="range"]');
    expect(spacingSlider.min).toBe('0');
    expect(spacingSlider.max).toBe('24');
    expect(spacingSlider.step).toBe('2');
    expect(spacingSlider.value).toBe('16');
    setNativeInputValue(spacingSlider, '18');
    spacingSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() =>
      expect(latestSavedButton(saveDocument, button.id)?.props.blockLayout?.spacingAfterPx).toBe(
        18,
      ),
    );
    expect(buttonRow.dataset['lodariqSpacingAfterPx']).toBe('18');
    expect(buttonRow.style.getPropertyValue('--lq-block-spacing-after')).toBe('18px');

    buttonByText(document, 'Alignment').click();
    await clickInspectorChoice('Alignment', 'Center');
    await vi.waitFor(() =>
      expect(latestSavedTooltip(saveDocument)?.props.tooltipLayout?.actionAlign).toBe('center'),
    );
    expect(latestSavedButton(saveDocument, button.id)?.props.blockLayout?.align).toBeUndefined();
    expect(
      document.querySelector<HTMLElement>('.rich-step-action-stage')?.dataset['lodariqActionAlign'],
    ).toBe('center');

    buttonByText(document, 'Appearance').click();
    await clickInspectorChoice('Appearance', 'Outline');
    await vi.waitFor(() =>
      expect(latestSavedButton(saveDocument, button.id)?.props.variant).toBe('outline'),
    );
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('.rich-step-action-preview')?.dataset[
          'lodariqActionVariant'
        ],
      ).toBe('outline'),
    );
    await vi.waitFor(() =>
      expect(latestPreviewPatch(postMessage)).toMatchObject({
        blockId: button.id,
        patch: { ops: expect.arrayContaining([{ op: 'setVariant', variant: 'outline' }]) },
      }),
    );

    buttonByText(document, 'Size').click();
    await clickInspectorChoice('Width', 'Fill');
    await vi.waitFor(() =>
      expect(latestSavedButton(saveDocument, button.id)?.props.buttonStyle?.width).toBe('fill'),
    );
    expect(latestSavedButton(saveDocument, button.id)?.props.buttonStyle?.widthPx).toBeUndefined();
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('.rich-step-action-preview')?.dataset[
          'lodariqActionWidth'
        ],
      ).toBe('fill'),
    );

    buttonByText(document, 'Colors').click();
    await clickWhenPresent('[aria-label="Use #c96047 for fill"]');
    await vi.waitFor(() =>
      expect(latestSavedButton(saveDocument, button.id)?.props.buttonStyle?.fillColor).toBe(
        '#c96047',
      ),
    );
    const themeReset = inspectorColorThemeButton('Fill');
    expect(themeReset.disabled).toBe(false);
    themeReset.click();
    await vi.waitFor(() =>
      expect(
        latestSavedButton(saveDocument, button.id)?.props.buttonStyle?.fillColor,
      ).toBeUndefined(),
    );

    buttonByText(toolDock, 'Popup').click();
    await clickInspectorChoice('Content alignment', 'Center');
    await vi.waitFor(() =>
      expect(latestSavedTooltip(saveDocument)?.props.tooltipLayout?.contentAlign).toBe('center'),
    );
    await vi.waitFor(() =>
      expect(latestPreviewPatch(postMessage)).toMatchObject({
        blockId: tooltip.id,
        patch: {
          ops: expect.arrayContaining([
            expect.objectContaining({
              op: 'setTooltipLayout',
              tooltipLayout: expect.objectContaining({ contentAlign: 'center' }),
            }),
          ]),
        },
      }),
    );
    expect(popupContent?.dataset['lodariqContentAlign']).toBe('center');

    await clickInspectorChoice('Corner radius', 'Rounded');
    await vi.waitFor(() =>
      expect(latestSavedTooltip(saveDocument)?.props.tooltipLayout?.radius).toBe('round'),
    );
    expect(popupContent?.dataset['lodariqPopupRadius']).toBe('round');

    await clickInspectorChoice('Pointer arrow', 'Hide');
    await vi.waitFor(() =>
      expect(latestSavedTooltip(saveDocument)?.props.tooltipLayout?.showArrow).toBe(false),
    );
    expect(document.querySelector('.storyboard-popup-arrow')).toBeNull();

    document.querySelector<HTMLButtonElement>('[aria-label="More experience actions"]')?.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>('.review-recovery[role="menuitem"]'),
      ).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('.review-recovery[role="menuitem"]')?.click();
    await vi.waitFor(() => expect(document.querySelector('.panel-advanced-editor')).not.toBeNull());
  });

  it('splits rich text at the caret without losing inline styles', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const tooltip = baseDocument.blocks[0]!.children[0]!;
    const paragraph = tooltip.children.find((block) => block.type === 'paragraph')!;
    paragraph.content = 'Before styled after';
    paragraph.contentRuns = [
      { text: 'Before ' },
      { text: 'styled', fontSizePx: 24, color: '#006b58' },
      { text: ' after' },
    ];
    const saveDocument = vi.fn();

    mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument,
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn().mockResolvedValue({}),
        recordMetric: vi.fn(),
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
      },
      frameMode: 'panel',
      sessionId: `${SESSION_ID}_keyboard`,
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    const editor = await waitForRichTextEditor(paragraph.id);
    const styledText = editor.querySelectorAll('span')[1]?.firstChild;
    if (!styledText) throw new Error('Styled text run is missing');
    const range = document.createRange();
    range.setStart(styledText, styledText.textContent?.length ?? 0);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    editor.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
      const savedDocument = latestCall?.[0] as LodariqDocument | undefined;
      const savedTooltip = savedDocument?.blocks[0]?.children[0];
      const paragraphIndex = savedTooltip?.children.findIndex((block) => block.id === paragraph.id);
      const firstLine =
        paragraphIndex === undefined ? undefined : savedTooltip?.children[paragraphIndex];
      const secondLine =
        paragraphIndex === undefined ? undefined : savedTooltip?.children[paragraphIndex + 1];
      expect(firstLine).toMatchObject({
        id: paragraph.id,
        content: 'Before styled',
        contentRuns: [{ text: 'Before ' }, { text: 'styled', fontSizePx: 24, color: '#006b58' }],
      });
      expect(secondLine).toMatchObject({
        type: 'paragraph',
        content: ' after',
        contentRuns: [{ text: ' after' }],
      });
    });
  });
});

async function waitForRichTextEditor(blockId: string): Promise<HTMLElement> {
  let editor: HTMLElement | null = null;
  await vi.waitFor(() => {
    editor = document.querySelector<HTMLElement>(`[data-rich-block-id="${blockId}"]`);
    expect(editor).not.toBeNull();
  });
  if (!editor) throw new Error(`Rich text editor ${blockId} is missing`);
  return editor;
}

async function clickWhenPresent(selector: string): Promise<void> {
  await vi.waitFor(() => {
    expect(document.querySelector<HTMLButtonElement>(selector)).not.toBeNull();
  });
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`${selector} button is missing`);
  button.click();
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

async function clickInspectorChoice(label: string, option: string): Promise<void> {
  await vi.waitFor(() => {
    expect(inspectorChoice(label, option)).not.toBeNull();
  });
  inspectorChoice(label, option).click();
}

function inspectorChoice(label: string, option: string): HTMLButtonElement {
  const field = [...document.querySelectorAll<HTMLFieldSetElement>('.rich-step-choice-field')].find(
    (candidate) => candidate.querySelector('legend')?.textContent === label,
  );
  const button = [...(field?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === option,
  );
  if (!button) throw new Error(`${label} option ${option} is missing`);
  return button;
}

function inspectorColorThemeButton(label: string): HTMLButtonElement {
  const field = [...document.querySelectorAll<HTMLFieldSetElement>('.rich-step-color-field')].find(
    (candidate) => candidate.querySelector('legend')?.textContent === label,
  );
  const button = [...(field?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === 'Theme',
  );
  if (!button) throw new Error(`${label} Theme button is missing`);
  return button;
}

function buttonByText(scope: ParentNode | null, label: string): HTMLButtonElement {
  const button = [...(scope?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`${label} button is missing`);
  return button;
}

function setNativeSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Native select value setter is unavailable');
  setter.call(select, value);
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Native input value setter is unavailable');
  setter.call(input, value);
}

function latestSavedButton(saveDocument: ReturnType<typeof vi.fn>, blockId: string) {
  const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
  const document = latestCall?.[0] as LodariqDocument | undefined;
  return document ? findBlock(document.blocks, blockId) : undefined;
}

function latestSavedTooltip(saveDocument: ReturnType<typeof vi.fn>) {
  const latestCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
  const document = latestCall?.[0] as LodariqDocument | undefined;
  return document?.blocks[0]?.children.find((block) => block.type === 'tooltip');
}

function findBlock(
  blocks: LodariqDocument['blocks'],
  blockId: string,
): LodariqDocument['blocks'][number] | undefined {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const nested = findBlock(block.children, blockId);
    if (nested) return nested;
  }
  return undefined;
}

function latestPreviewPatch(postMessage: ReturnType<typeof vi.fn>): BridgeMessage | undefined {
  const previewPatches = postMessage.mock.calls
    .map(([message]) => message as BridgeMessage)
    .filter((message) => message.type === 'preview.patch');
  return previewPatches[previewPatches.length - 1];
}
