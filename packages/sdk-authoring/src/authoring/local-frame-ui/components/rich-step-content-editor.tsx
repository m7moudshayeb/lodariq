import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import {
  resolveTourCompositionRecipe,
  resolveTourPopupStyleRecipe,
  resolveTourThemeStyle,
  tourCompositionPaddingVariables,
  tourPopupStyleVariables,
} from '@lodariq/sdk-runtime/renderers/tour';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { RICH_CONTENT_BLOCK_TYPES } from '../../../editor/rich-content-block-types';
import { LazyRichContentEditor } from './lazy-rich-content-editor';
import { GripHorizontal, MoveDiagonal2 } from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { targetIdOf, cssString } from '../utils';
import { usePopupTransform } from '../../canvas/use-popup-transform';
import type { StepHealthTone } from '../tour-step-model';
import type { AiAssistRequest } from '../../ai/assist-contract';
import { AssistPreview, AssistPrompt } from './assist-preview';
import { ContextualPropertyTray } from './contextual-property-tray';
import { PopupPointerArrow } from './popup-pointer-arrow';
import {
  DEFAULT_CANVAS_ZOOM,
  POPUP_RESIZE_CORNERS,
  type StoryboardToolMode,
} from './tour-sequence-options';
import { claimContextualSurface } from '../../contextual-surface-coordinator';
import { CanvasZoomControl } from './canvas-zoom-control';
import { StepPlacementEditor } from './step-placement-editor';

function useMediaPreference(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mediaQuery = matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function RichStepContentEditor({
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
  const richContentValue = tooltip.children.filter((block) =>
    RICH_CONTENT_BLOCK_TYPES.has(block.type),
  );
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [popupSelected, setPopupSelected] = useState(false);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [assistPromptOpen, setAssistPromptOpen] = useState(false);
  const [assistRequest, setAssistRequest] = useState<AiAssistRequest | null>(null);
  const assistAvailable = snapshot.panelWorkflow.assistAvailable;
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>(null);
  const handledFocusRequestToken = useRef<number | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const editorStageRef = useRef<HTMLDivElement | null>(null);
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
  const trayOpen = toolMode !== 'content';
  const suppressInspector = trayOpen || popupSelected;
  const contextualSurface = trayOpen ? 'properties' : popupSelected ? 'popup' : null;
  const openContentInspector = useCallback(() => {
    setPopupSelected(false);
    onToolModeChange('content');
  }, [onToolModeChange]);

  useEffect(() => {
    if (!contextualSurface) return;
    return claimContextualSurface(`step:${step.id}:${contextualSurface}`, () => {
      setPopupSelected(false);
      onToolModeChange('content');
    });
  }, [contextualSurface, onToolModeChange, step.id]);

  useEffect(() => setPopupSelected(false), [step.id]);

  useEffect(() => {
    const request = snapshot.focusRequest;
    if (!request || handledFocusRequestToken.current === request.token) return;
    const inThisStep =
      request.blockId === step.id ||
      tooltip.children.some((block) => block.id === request.blockId);
    if (!inThisStep) return;
    handledFocusRequestToken.current = request.token;
    setPopupSelected(false);
    if (request.reveal === 'placement' || request.reveal === 'popup') return;
    onToolModeChange('content');
    const canvas = popupRef.current?.querySelector<HTMLElement>('.rich-content-canvas');
    canvas?.focus();
    if (request.reveal === 'behavior' || request.propertyId) {
      popupRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-block-id="${cssString(request.blockId)}"] .rich-content-button-config-trigger, [data-block-id="${cssString(request.blockId)}"] .rich-content-button-preview`,
        )
        ?.click();
    }
  }, [onToolModeChange, snapshot.focusRequest, step.id]);

  const selectPopup = (): void => {
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
    ...tourCompositionPaddingVariables(popupComposition),
    '--storyboard-canvas-zoom': String(canvasZoom / 100),
    '--storyboard-popup-x': `${popupOffset.x}px`,
    '--storyboard-popup-y': `${popupOffset.y}px`,
    ...(livePopupSize.widthPx ? { '--storyboard-popup-width': `${livePopupSize.widthPx}px` } : {}),
    ...(livePopupSize.heightPx
      ? { '--storyboard-popup-height': `${livePopupSize.heightPx}px` }
      : {}),
  } as CSSProperties;

  const startAssist = (request: AiAssistRequest): void => {
    setAssistRequest(request);
    controller.askAiAssist(request);
  };

  /** ⌘K is the host's palette (§7.5), wherever it is pressed. See the note in
   *  `overlay-step-editor.tsx`: two surfaces on one chord left it unreachable. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      controller.requestCommandPalette();
    };
    const view = editorStageRef.current?.ownerDocument;
    view?.addEventListener('keydown', onKeyDown);
    return () => view?.removeEventListener('keydown', onKeyDown);
  }, [controller]);

  return (
    <div className="rich-step-editor">
      <div className="rich-content-editor-chrome">
        <CanvasZoomControl value={canvasZoom} onChange={setCanvasZoom} />
        <div data-rich-content-toolbar-slot="" ref={setToolbarHost} />
      </div>
      <div
        className="storyboard-editor-stage"
        ref={editorStageRef}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          setPopupSelected(false);
        }}
      >
        <div
          ref={popupRef}
          className="rich-step-popup-frame"
          role="group"
          aria-label={authoringText('Step content editor')}
          data-dragging={popupDragging ? 'true' : 'false'}
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
            <LazyRichContentEditor
              key={step.id}
              contentLocale={snapshot.contentLocale}
              inspectorHost={suppressInspector ? null : inspectorHost}
              onChange={(next) => controller.replaceStepRichContent(step.id, next)}
              onInspectOpen={openContentInspector}
              suppressInspector={suppressInspector}
              toolbarHost={toolbarHost}
              onOpenSequence={(blockId) => onFlowMapOpen(step.id, blockId, 'sequence')}
              {...(assistAvailable
                ? {
                    onAskAssist: () => setAssistPromptOpen(true),
                    onRewriteSelection: (verb, text) =>
                      startAssist({ kind: 'rewrite', scope: 'selection', verb, text }),
                  }
                : {})}
              onResolveMediaPreview={(assetId) => controller.resolveMediaAssetPreview(assetId)}
              onUploadMedia={
                controller.canUploadMediaAssets()
                  ? async (kind, file, options) => {
                      const asset = await controller.uploadMediaAsset(kind, file, options);
                      if (!asset) return null;
                      return {
                        asset,
                        previewUrl: await controller.resolveMediaAssetPreview(asset.id),
                      };
                    }
                  : undefined
              }
              value={richContentValue}
            />
          </div>
        </div>
      </div>
      {assistAvailable ? (
        <div className="rich-step-assist">
          {assistPromptOpen ? (
            <AssistPrompt
              onClose={() => setAssistPromptOpen(false)}
              onSubmit={(prompt) => {
                setAssistPromptOpen(false);
                startAssist({ kind: 'command', scope: 'step', prompt, stepIds: [step.id] });
              }}
            />
          ) : null}
          <AssistPreview
            controller={controller}
            request={assistRequest}
            state={snapshot.panelWorkflow.assist}
          />
        </div>
      ) : null}
      <ContextualPropertyTray
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
        open={trayOpen}
        onClose={() => onToolModeChange('content')}
      />
      <div data-rich-content-inspector-slot="" ref={setInspectorHost} />
    </div>
  );
}
