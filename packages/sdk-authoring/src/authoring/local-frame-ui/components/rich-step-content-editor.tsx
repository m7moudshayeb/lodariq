import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { TEXT_FONT_SIZE_PX_LIMITS, type LodariqBlock, type TextStyleProps } from '@lodariq/schema';
import {
  resolveTourCompositionRecipe,
  resolveTourPopupStyleRecipe,
  resolveTourThemeStyle,
  tourPopupStyleVariables,
} from '@lodariq/sdk-runtime/renderers/tour';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { applyInlineTextStyle, type InlineTextStylePatch } from '../../document-ops';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AuthoringNumberCombobox,
  Bold,
  GripHorizontal,
  GripVertical,
  Highlighter,
  Italic,
  Link,
  MoreHorizontal,
  MoveDiagonal2,
  RotateCcw,
  Underline,
  X,
} from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { editableBlockTypeValue, isEditableContentBlock, targetIdOf } from '../utils';
import { InlineStepInsert } from './insert-menu';
import type { ActionPropertyTab } from '../properties/button-property-editor';
import { blockSpacingAfterStyle, canvasToolbarStyle } from '../../canvas/canvas-style';
import { usePopupTransform } from '../../canvas/use-popup-transform';
import type { StepHealthTone } from '../tour-step-model';
import { ContextualPropertyTray } from './contextual-property-tray';
import { PopupPointerArrow } from './popup-pointer-arrow';
import {
  DEFAULT_CANVAS_ZOOM,
  POPUP_RESIZE_CORNERS,
  type ActionToolbarPosition,
  type StoryboardToolMode,
} from './tour-sequence-options';
import { claimContextualSurface } from '../../contextual-surface-coordinator';
import { ActionContextToolbar } from './action-context-toolbar';
import { CanvasZoomControl } from './canvas-zoom-control';
import { ContentBlockActionMenu } from './content-block-action-menu';
import {
  InlineMarkButton,
  RichStepBlockEditor,
  handleRichTextEditorKeyDown,
  useMediaPreference,
} from './rich-step-block-editor';
import {
  EDITOR_BLOCK_TYPE_OPTIONS,
  blockTypeEditorLabel,
  boundedFontSizePx,
  extractInlineTextRuns,
  fontSizeOptions,
  inlineMarkActive,
  richTextSelection,
  selectedTextFontSize,
  type RichTextSelection,
} from './rich-text-editing';
import { StepPlacementEditor } from './step-placement-editor';

export function RichStepContentEditor({
  contentTrayRequestToken,
  controller,
  health,
  onFlowMapOpen,
  onToolModeChange,
  snapshot,
  step,
  stepIndex,
  tooltip,
  toolMode,
}: {
  contentTrayRequestToken: number;
  controller: LocalAuthoringFrameController;
  health: { label: string; repair: boolean; tone: StepHealthTone };
  onFlowMapOpen: (stepId: string, actionBlockId: string, mode?: 'branch' | 'sequence') => void;
  onToolModeChange: (mode: StoryboardToolMode) => void;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  stepIndex: number;
  tooltip: LodariqBlock;
  toolMode: StoryboardToolMode;
}) {
  const contentBlocks = tooltip.children.filter(isEditableContentBlock);
  const firstRichContentBlockId = contentBlocks.find(
    (block) => block.type !== 'button' && block.type !== 'link',
  )?.id;
  const hasRichContent = firstRichContentBlockId !== undefined;
  const initiallySelectedBlock = contentBlocks.find(
    (block) => block.id === snapshot.selectedBlockId,
  );
  const [activeBlockId, setActiveBlockId] = useState(initiallySelectedBlock?.id ?? null);
  const [selection, setSelection] = useState<RichTextSelection | null>(null);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [activePropertyTab, setActivePropertyTab] = useState<ActionPropertyTab>('shape');
  const [propertyTrayOpen, setPropertyTrayOpen] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [popupSelected, setPopupSelected] = useState(false);
  const [contextToolbarPosition, setContextToolbarPosition] =
    useState<ActionToolbarPosition | null>(null);
  const suppressedBlurCommitBlockIds = useRef(new Set<string>());
  const handledFocusRequestToken = useRef<number | null>(null);
  const handledContentTrayRequestToken = useRef(0);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const editorStageRef = useRef<HTMLDivElement | null>(null);
  const activeBlockRowRef = useRef<HTMLDivElement | null>(null);
  const activeBlock = activeBlockId
    ? (contentBlocks.find((block) => block.id === activeBlockId) ?? null)
    : null;
  const activeStyle = activeBlock?.props.textStyle;
  const activeIsInlineText = activeBlock?.type === 'heading' || activeBlock?.type === 'paragraph';
  const activeSupportsTypography =
    activeIsInlineText ||
    activeBlock?.type === 'callout' ||
    activeBlock?.type === 'stat' ||
    activeBlock?.type === 'icon';
  const activeIsAction = activeBlock?.type === 'button' || activeBlock?.type === 'link';
  const trayActionBlock = activeIsAction ? activeBlock : null;
  const hasActiveTextSelection =
    activeBlock !== null &&
    selection !== null &&
    selection.blockId === activeBlock.id &&
    selection.start !== selection.end;
  const activeFontSize = selectedTextFontSize(activeBlock, selection);
  const localPrefersDark = useMediaPreference('(prefers-color-scheme: dark)');
  const localPrefersReducedMotion = useMediaPreference('(prefers-reduced-motion: reduce)');
  const prefersDark = snapshot.previewPreferences?.prefersDark ?? localPrefersDark;
  const prefersReducedMotion =
    snapshot.previewPreferences?.prefersReducedMotion ?? localPrefersReducedMotion;
  const resolvedPopupTheme = resolveTourThemeStyle(
    {
      ...(snapshot.documentState.appearance
        ? { appearance: snapshot.documentState.appearance }
        : {}),
      ...(snapshot.previewTheme ? { theme: snapshot.previewTheme } : {}),
    },
    prefersDark,
    prefersReducedMotion,
  );
  const popupStyle = resolvedPopupTheme.variables as CSSProperties;
  const popupComposition = resolveTourCompositionRecipe(tooltip.props.tooltipLayout);
  const popupAppearance = resolveTourPopupStyleRecipe(tooltip.props.tooltipStyle);
  let contextualSurface: 'properties' | 'link' | 'popup' | 'toolbar' | null = null;
  if (propertyTrayOpen) contextualSurface = 'properties';
  else if (linkEditorOpen) contextualSurface = 'link';
  else if (popupSelected) contextualSurface = 'popup';
  else if (activeBlock) contextualSurface = 'toolbar';

  useEffect(() => {
    if (!contextualSurface) return;
    return claimContextualSurface(`step:${step.id}:${contextualSurface}`, () => {
      const focusOrigin = activeBlockRowRef.current?.querySelector<HTMLElement>(
        'input, textarea, button, [contenteditable="true"]',
      );
      setPropertyTrayOpen(false);
      setLinkEditorOpen(false);
      setPopupSelected(false);
      setActiveBlockId(null);
      setSelection(null);
      queueMicrotask(() => focusOrigin?.focus());
    });
  }, [contextualSurface, step.id]);

  useEffect(() => {
    if (activeBlockId === null) return;
    if (activeBlockId && contentBlocks.some((block) => block.id === activeBlockId)) return;
    setActiveBlockId(contentBlocks[0]?.id ?? null);
  }, [activeBlockId, contentBlocks, step.id]);

  useEffect(() => setPopupSelected(false), [step.id]);

  useEffect(() => {
    if (
      contentTrayRequestToken === 0 ||
      handledContentTrayRequestToken.current === contentTrayRequestToken
    ) {
      return;
    }
    handledContentTrayRequestToken.current = contentTrayRequestToken;
    setActiveBlockId(firstRichContentBlockId ?? null);
    setLinkEditorOpen(false);
    setPopupSelected(false);
    setPropertyTrayOpen(true);
  }, [contentBlocks, contentTrayRequestToken, firstRichContentBlockId]);

  useEffect(() => {
    if (toolMode === 'content') return;
    setPropertyTrayOpen(false);
    setLinkEditorOpen(false);
  }, [toolMode]);

  useEffect(() => {
    const request = snapshot.focusRequest;
    if (!request || handledFocusRequestToken.current === request.token) return;
    const requestedBlock = contentBlocks.find((block) => block.id === request.blockId);
    if (!requestedBlock) return;
    handledFocusRequestToken.current = request.token;
    setPopupSelected(false);
    setActiveBlockId(requestedBlock.id);
    setSelection(null);
    setLinkEditorOpen(false);
    onToolModeChange('content');
    if (request.reveal === 'behavior') {
      setActivePropertyTab('behavior');
      setPropertyTrayOpen(true);
    }
  }, [contentBlocks, onToolModeChange, snapshot.focusRequest]);

  const commitBlock = (blockId: string, element: HTMLElement): void => {
    if (suppressedBlurCommitBlockIds.current.delete(blockId)) return;
    const contentRuns = extractInlineTextRuns(element);
    const content = contentRuns.map((run) => run.text).join('');
    controller.commitRichTextContent(blockId, content, contentRuns);
  };

  const suppressNextBlurCommit = (blockId: string): void => {
    suppressedBlurCommitBlockIds.current.add(blockId);
    globalThis.setTimeout(() => suppressedBlurCommitBlockIds.current.delete(blockId), 0);
  };

  const updateStyle = (patch: Partial<TextStyleProps>): void => {
    if (activeBlock) controller.setTextBlockStyle(activeBlock.id, patch);
  };

  const updateInlineStyle = (patch: InlineTextStylePatch): void => {
    if (!activeBlock || !selection || selection.blockId !== activeBlock.id) return;
    const content = activeBlock.content ?? '';
    const contentRuns = applyInlineTextStyle(
      content,
      activeBlock.contentRuns,
      selection.start,
      selection.end,
      patch,
    );
    controller.commitRichTextContent(activeBlock.id, content, contentRuns);
  };

  const openPropertyTray = (tab?: ActionPropertyTab): void => {
    if (tab) setActivePropertyTab(tab);
    setLinkEditorOpen(false);
    onToolModeChange('content');
    setPropertyTrayOpen(true);
  };

  const activateBlock = (block: LodariqBlock): void => {
    if (block.id !== activeBlockId) setPropertyTrayOpen(false);
    onToolModeChange('content');
    setPopupSelected(false);
    setActiveBlockId(block.id);
    setSelection(null);
    setLinkEditorOpen(false);
    if (block.type === 'link') setActivePropertyTab('behavior');
    controller.selectBlock(block.id);
  };

  const dismissActiveBlock = (): void => {
    setActiveBlockId(null);
    setSelection(null);
    setLinkEditorOpen(false);
    setPropertyTrayOpen(false);
  };

  const selectPopup = (): void => {
    dismissActiveBlock();
    const popupContent = popupRef.current?.querySelector<HTMLElement>('.rich-step-content');
    if (popupContent) {
      popupContent.scrollTop = 0;
      popupContent.scrollLeft = 0;
    }
    setPopupSelected(true);
  };

  const {
    dragging: popupDragging,
    moveWithKeyboard: movePopupWithKeyboard,
    offset: popupOffset,
    ready: popupTransformReady,
    resetPosition: resetPopupPosition,
    resetSize: resetPopupSize,
    resizeWithKeyboard: resizePopupWithKeyboard,
    resizing: popupResizing,
    size: livePopupSize,
  } = usePopupTransform({
    experienceKey: step.id,
    initialHeight: tooltip.props.tooltipLayout?.heightPx ?? null,
    initialWidth: tooltip.props.tooltipLayout?.widthPx ?? null,
    onCommitSize: (size) =>
      controller.setTooltipLayout(tooltip.id, {
        widthPx: size.widthPx ?? undefined,
        heightPx: size.heightPx ?? undefined,
      }),
    onInteractionStart: selectPopup,
    popupRef,
    stageRef: editorStageRef,
    zoomPercent: canvasZoom,
  });
  const popupCanvasStyle = {
    ...popupStyle,
    ...tourPopupStyleVariables(popupAppearance),
    '--storyboard-canvas-zoom': String(canvasZoom / 100),
    '--storyboard-popup-x': `${popupOffset.x}px`,
    '--storyboard-popup-y': `${popupOffset.y}px`,
    ...(livePopupSize.widthPx ? { '--storyboard-popup-width': `${livePopupSize.widthPx}px` } : {}),
    ...(livePopupSize.heightPx
      ? { '--storyboard-popup-height': `${livePopupSize.heightPx}px` }
      : {}),
  } as CSSProperties;

  useLayoutEffect(() => {
    const stage = editorStageRef.current;
    const row = activeBlockRowRef.current;
    if (!stage || !row) {
      setContextToolbarPosition(null);
      return;
    }
    const updatePosition = (): void => {
      const stageRect = stage.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      setContextToolbarPosition({
        left: rowRect.left - stageRect.left + rowRect.width / 2 + stage.scrollLeft,
        top: Math.max(12, rowRect.top - stageRect.top + stage.scrollTop - 56),
      });
    };
    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(stage);
    resizeObserver.observe(row);
    const content = row.closest<HTMLElement>('.rich-step-content');
    stage.addEventListener('scroll', updatePosition, { passive: true });
    content?.addEventListener('scroll', updatePosition, { passive: true });
    return () => {
      resizeObserver.disconnect();
      stage.removeEventListener('scroll', updatePosition);
      content?.removeEventListener('scroll', updatePosition);
    };
  }, [activeBlockId, canvasZoom, popupOffset.x, popupOffset.y]);

  return (
    <div className="rich-step-editor">
      <CanvasZoomControl value={canvasZoom} onChange={setCanvasZoom} />
      <div
        className="storyboard-editor-stage"
        ref={editorStageRef}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          dismissActiveBlock();
          setPopupSelected(false);
        }}
      >
        {!activeBlock ||
        propertyTrayOpen ||
        linkEditorOpen ||
        toolMode !== 'content' ? null : activeIsAction ? (
          <ActionContextToolbar
            block={activeBlock}
            onDismiss={dismissActiveBlock}
            onBehavior={() => {
              if (activeBlock.props.action?.type === 'runSequence') {
                onFlowMapOpen(step.id, activeBlock.id, 'sequence');
                return;
              }
              openPropertyTray('behavior');
            }}
            onMore={() => openPropertyTray('appearance')}
            position={contextToolbarPosition}
          />
        ) : (
          <div
            className="rich-step-toolbar text-context-toolbar"
            role="toolbar"
            aria-label={authoringText('Text formatting')}
            data-positioned={contextToolbarPosition ? 'true' : 'false'}
            style={canvasToolbarStyle(contextToolbarPosition)}
          >
            <select
              aria-label={authoringText('Block type')}
              value={activeBlock?.type ?? 'paragraph'}
              onChange={(event) => {
                if (!activeBlock) return;
                const type = editableBlockTypeValue(event.currentTarget.value);
                if (type) controller.transformEditableBlock(activeBlock.id, type);
              }}
            >
              {EDITOR_BLOCK_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {activeSupportsTypography ? (
              <>
                <AuthoringNumberCombobox
                  ariaLabel={authoringText('Font size')}
                  className="rich-step-font-size"
                  max={TEXT_FONT_SIZE_PX_LIMITS.max}
                  min={TEXT_FONT_SIZE_PX_LIMITS.min}
                  onValueChange={(value) => {
                    if (hasActiveTextSelection && value === 'default') {
                      updateInlineStyle({ fontSizePx: null });
                      return;
                    }
                    const fontSizePx = boundedFontSizePx(value);
                    if (!fontSizePx) return;
                    if (hasActiveTextSelection) updateInlineStyle({ fontSizePx });
                    else updateStyle({ fontSizePx });
                  }}
                  options={fontSizeOptions(hasActiveTextSelection)}
                  placeholder={
                    activeFontSize === 'mixed' ? authoringText('Mixed sizes') : undefined
                  }
                  step={TEXT_FONT_SIZE_PX_LIMITS.step}
                  suffix={authoringText('px')}
                  value={activeFontSize}
                />
                <span className="rich-step-toolbar-divider" aria-hidden="true" />
                <InlineMarkButton
                  active={inlineMarkActive(activeBlock, selection, 'bold')}
                  icon={<Bold size={15} strokeWidth={2.2} aria-hidden="true" />}
                  label={authoringText('Bold')}
                  onApply={(enabled) => {
                    if (
                      selection?.blockId === activeBlock?.id &&
                      selection.start !== selection.end
                    ) {
                      updateInlineStyle({ mark: 'bold', markEnabled: enabled });
                    } else {
                      updateStyle({
                        fontWeight: (activeStyle?.fontWeight ?? 400) >= 600 ? 400 : 700,
                      });
                    }
                  }}
                />
                <InlineMarkButton
                  active={inlineMarkActive(activeBlock, selection, 'italic')}
                  icon={<Italic size={15} strokeWidth={2.2} aria-hidden="true" />}
                  label={authoringText('Italic')}
                  onApply={(enabled) => {
                    if (
                      selection?.blockId === activeBlock?.id &&
                      selection.start !== selection.end
                    ) {
                      updateInlineStyle({ mark: 'italic', markEnabled: enabled });
                    } else {
                      updateStyle({
                        fontStyle: activeStyle?.fontStyle === 'italic' ? 'normal' : 'italic',
                      });
                    }
                  }}
                />
                {activeIsInlineText ? (
                  <InlineMarkButton
                    active={inlineMarkActive(activeBlock, selection, 'underline')}
                    disabled={!selection || selection.start === selection.end}
                    icon={<Underline size={15} strokeWidth={2.2} aria-hidden="true" />}
                    label={authoringText('Underline selection')}
                    onApply={(enabled) =>
                      updateInlineStyle({ mark: 'underline', markEnabled: enabled })
                    }
                  />
                ) : null}
                <span className="rich-step-toolbar-divider" aria-hidden="true" />
                {(
                  [
                    ['left', authoringText('Align left'), AlignLeft],
                    ['center', authoringText('Align center'), AlignCenter],
                    ['right', authoringText('Align right'), AlignRight],
                  ] as const
                ).map(([align, label, Icon]) => (
                  <button
                    key={align}
                    type="button"
                    aria-label={label}
                    aria-pressed={(activeStyle?.align ?? 'left') === align}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => updateStyle({ align })}
                  >
                    <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
                  </button>
                ))}
                <label className="rich-step-color" title={authoringText('Text color')}>
                  <span aria-hidden="true">{authoringText('A')}</span>
                  <input
                    type="color"
                    aria-label={authoringText('Text color')}
                    value={activeStyle?.color ?? '#162033'}
                    onChange={(event) => {
                      if (
                        selection?.blockId === activeBlock?.id &&
                        selection.start !== selection.end
                      ) {
                        updateInlineStyle({ color: event.currentTarget.value });
                      } else updateStyle({ color: event.currentTarget.value });
                    }}
                  />
                </label>
                {activeIsInlineText ? (
                  <>
                    <label
                      className="rich-step-color rich-step-highlight"
                      title={authoringText('Highlight selection')}
                    >
                      <Highlighter size={14} strokeWidth={2.1} aria-hidden="true" />
                      <input
                        type="color"
                        aria-label={authoringText('Highlight selected text')}
                        defaultValue="#fff0a8"
                        disabled={!selection || selection.start === selection.end}
                        onChange={(event) =>
                          updateInlineStyle({ highlightColor: event.currentTarget.value })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={authoringText('Link selected text')}
                      aria-pressed={linkEditorOpen}
                      disabled={!selection || selection.start === selection.end}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => setLinkEditorOpen((value) => !value)}
                    >
                      <Link size={15} strokeWidth={2.1} aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  aria-label={
                    selection && selection.start !== selection.end
                      ? authoringText('Clear selected text formatting')
                      : authoringText('Reset block typography to Brand Theme')
                  }
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (
                      selection?.blockId === activeBlock?.id &&
                      selection.start !== selection.end
                    ) {
                      updateInlineStyle({ clear: true });
                      return;
                    }
                    if (activeBlock) controller.resetTextBlockStyle(activeBlock.id);
                  }}
                >
                  <RotateCcw size={15} strokeWidth={2.1} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={authoringText('More text settings')}
                  title={authoringText('More text settings')}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => openPropertyTray()}
                >
                  <MoreHorizontal size={16} strokeWidth={2.1} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <span className="rich-step-toolbar-context">{authoringText('Block settings')}</span>
                <button
                  type="button"
                  aria-label={authoringText('More block settings')}
                  title={authoringText('More block settings')}
                  onClick={() => openPropertyTray()}
                >
                  <MoreHorizontal size={16} strokeWidth={2.1} aria-hidden="true" />
                </button>
              </>
            )}
            <button
              type="button"
              className="rich-step-toolbar-close"
              aria-label={authoringText('Close text controls')}
              title={authoringText('Close controls')}
              onPointerDown={(event) => event.preventDefault()}
              onClick={dismissActiveBlock}
            >
              <X size={15} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </div>
        )}
        {linkEditorOpen ? (
          <div className="rich-step-link-editor">
            <input
              aria-label={authoringText('Selected text link')}
              placeholder={authoringText('https://example.com or /path')}
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.currentTarget.value)}
            />
            <button
              type="button"
              onClick={() => {
                updateInlineStyle({ link: linkDraft });
                setLinkEditorOpen(false);
              }}
            >
              {authoringText('Apply link')}
            </button>
            <button
              type="button"
              onClick={() => {
                updateInlineStyle({ link: null });
                setLinkDraft('');
                setLinkEditorOpen(false);
              }}
            >
              {authoringText('Remove')}
            </button>
            <button
              type="button"
              aria-label={authoringText('Close link editor')}
              title={authoringText('Close link editor')}
              onClick={() => setLinkEditorOpen(false)}
            >
              <X size={15} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div
          ref={popupRef}
          className="rich-step-popup-frame"
          role="group"
          aria-label={authoringText('Step content editor')}
          data-popup-height-custom={livePopupSize.heightPx ? 'true' : 'false'}
          data-popup-selected={popupSelected ? 'true' : 'false'}
          data-popup-width-custom={livePopupSize.widthPx ? 'true' : 'false'}
          data-resizing={popupResizing ? 'true' : 'false'}
          data-transform-ready={popupTransformReady ? 'true' : 'false'}
          data-lodariq-popup-border-weight={popupAppearance.borderWeight}
          data-lodariq-popup-elevation={popupAppearance.elevation}
          style={popupCanvasStyle}
        >
          {POPUP_RESIZE_CORNERS.map((corner) => (
            <button
              key={corner.value}
              type="button"
              className="storyboard-popup-resize-handle"
              aria-label={authoringText('Resize popup from {corner}', {
                corner: corner.label,
              })}
              data-corner={corner.value}
              disabled={!popupTransformReady}
              title={
                popupTransformReady
                  ? authoringText(
                      'Drag to resize. Arrow keys adjust by 8px; Home or double-click resets.',
                    )
                  : authoringText('Loading canvas controls')
              }
              onDoubleClick={resetPopupSize}
              onFocus={selectPopup}
              onKeyDown={(event) => resizePopupWithKeyboard(corner.value, event)}
            >
              <MoveDiagonal2 size={11} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ))}
          {popupSelected && livePopupSize.widthPx && livePopupSize.heightPx ? (
            <output className="storyboard-popup-size" aria-live="polite">
              {livePopupSize.widthPx} × {livePopupSize.heightPx}
              {authoringText('px')}
            </output>
          ) : null}
          <PopupPointerArrow
            placement={tooltip.props.placement ?? 'bottom'}
            visible={popupComposition.showArrow && Boolean(targetIdOf(step))}
          />
          <button
            type="button"
            className="storyboard-popup-drag-handle"
            aria-label={authoringText('Move popup in canvas')}
            data-dragging={popupDragging ? 'true' : 'false'}
            disabled={!popupTransformReady}
            title={
              popupTransformReady
                ? authoringText('Drag to move. Use arrow keys for precise movement; Home resets.')
                : authoringText('Loading canvas controls')
            }
            onDoubleClick={resetPopupPosition}
            onFocus={selectPopup}
            onKeyDown={movePopupWithKeyboard}
          >
            <GripHorizontal size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          <div
            className="rich-step-content"
            data-lodariq-action-align={popupComposition.actionAlign}
            data-lodariq-action-layout={popupComposition.actionLayout}
            data-lodariq-color-mode={resolvedPopupTheme.colorMode}
            data-lodariq-composition-gap={popupComposition.gap}
            data-lodariq-composition-padding={popupComposition.padding}
            data-lodariq-content-align={popupComposition.contentAlign}
            data-lodariq-popup-radius={popupComposition.radius}
            data-lodariq-popup-border-weight={popupAppearance.borderWeight}
            data-lodariq-popup-elevation={popupAppearance.elevation}
            data-lodariq-pointer-arrow={popupComposition.showArrow ? 'show' : 'hide'}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              selectPopup();
            }}
          >
            <InlineStepInsert
              controller={controller}
              index={0}
              label={authoringText('Insert content at start of popup')}
              stepBlockId={step.id}
            />
            {contentBlocks.map((block, index) => {
              const separateAction = block.type === 'button' || block.type === 'link';
              if (!separateAction) {
                return (
                  <div
                    className="rich-step-rendered-content"
                    data-block-id={block.id}
                    data-lodariq-spacing-after-px={block.props.blockLayout?.spacingAfterPx}
                    data-step-block-id={step.id}
                    key={block.id}
                    onDragOver={(event) =>
                      controller.handleStepContentDragOver(event, step.id, block.id)
                    }
                    onDrop={(event) => controller.handleStepContentDrop(event, step.id, block.id)}
                    onPointerDown={() => {
                      activateBlock(block);
                      setPropertyTrayOpen(true);
                    }}
                    style={blockSpacingAfterStyle(block.props.blockLayout)}
                  >
                    <RichStepBlockEditor
                      active={activeBlockId === block.id}
                      block={block}
                      canvasZoom={canvasZoom}
                      controller={controller}
                      onActivate={() => {
                        activateBlock(block);
                        setPropertyTrayOpen(true);
                      }}
                      onCommitRichText={() => undefined}
                      onKeyDown={() => undefined}
                      onSelectionChange={() => undefined}
                    />
                  </div>
                );
              }
              return (
                <div className="rich-step-block-stack" key={block.id}>
                  <div
                    ref={activeBlockId === block.id ? activeBlockRowRef : undefined}
                    className={`rich-step-block-row ${activeBlockId === block.id ? 'active' : ''} ${
                      snapshot.selectedBlockId === block.id ? 'selected' : ''
                    }`.trim()}
                    data-block-id={block.id}
                    data-lodariq-spacing-after={block.props.blockLayout?.spacingAfter}
                    data-lodariq-spacing-after-px={block.props.blockLayout?.spacingAfterPx}
                    data-lodariq-spacing-before={block.props.blockLayout?.spacingBefore}
                    data-step-block-id={step.id}
                    style={blockSpacingAfterStyle(block.props.blockLayout)}
                    onDragOver={(event) =>
                      controller.handleStepContentDragOver(event, step.id, block.id)
                    }
                    onDrop={(event) => controller.handleStepContentDrop(event, step.id, block.id)}
                    onPointerDown={() => activateBlock(block)}
                  >
                    <button
                      type="button"
                      className="rich-step-block-drag"
                      draggable
                      aria-label={authoringText('Drag {type} block', {
                        type: blockTypeEditorLabel(block),
                      })}
                      title={authoringText('Drag to reorder')}
                      onDragEnd={() => controller.endDraggingStepContent()}
                      onDragStart={(event) =>
                        controller.startDraggingStepContent(step.id, block.id, event)
                      }
                    >
                      <GripVertical size={14} strokeWidth={2.1} aria-hidden="true" />
                    </button>
                    <RichStepBlockEditor
                      actionAlign={tooltip.props.tooltipLayout?.actionAlign}
                      active={activeBlockId === block.id}
                      block={block}
                      canvasZoom={canvasZoom}
                      controller={controller}
                      onActivate={() => activateBlock(block)}
                      onCommitRichText={(element) => commitBlock(block.id, element)}
                      onKeyDown={(event, element) =>
                        handleRichTextEditorKeyDown({
                          block,
                          controller,
                          element,
                          event,
                          stepBlockId: step.id,
                          suppressBlurCommit: () => suppressNextBlurCommit(block.id),
                          totalBlocks: contentBlocks.length,
                        })
                      }
                      onSelectionChange={(element) => {
                        const nextSelection = richTextSelection(element, block.id);
                        if (nextSelection) setSelection(nextSelection);
                      }}
                    />
                    <ContentBlockActionMenu
                      block={block}
                      controller={controller}
                      hasRichContent={hasRichContent}
                      stepId={step.id}
                    />
                  </div>
                  <InlineStepInsert
                    controller={controller}
                    index={index + 1}
                    label={`Insert content after ${blockTypeEditorLabel(block)}`}
                    stepBlockId={step.id}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <ContextualPropertyTray
        activeTab={activePropertyTab}
        activeBlock={activeBlock}
        actionBlock={trayActionBlock}
        controller={controller}
        health={health}
        placementEditor={
          <StepPlacementEditor
            controller={controller}
            snapshot={snapshot}
            step={step}
            stepIndex={stepIndex}
          />
        }
        popupThemeColors={{
          borderColor: resolvedPopupTheme.variables['--lq-tour-border-color'],
          surfaceColor: resolvedPopupTheme.variables['--lq-tour-surface'],
          textColor: resolvedPopupTheme.variables['--lq-tour-text-color'],
        }}
        snapshot={snapshot}
        step={step}
        tooltip={tooltip}
        toolMode={toolMode}
        open={propertyTrayOpen || toolMode !== 'content'}
        onActiveTabChange={setActivePropertyTab}
        onClose={() => {
          setPropertyTrayOpen(false);
          if (toolMode !== 'content') onToolModeChange('content');
        }}
        onOpenFlowMap={(mode) => {
          if (trayActionBlock) onFlowMapOpen(step.id, trayActionBlock.id, mode);
        }}
      />
    </div>
  );
}
