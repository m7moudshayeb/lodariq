import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import {
  resolveTourCompositionRecipe,
  resolveTourPopupStyleRecipe,
  resolveTourThemeStyle,
  tourPopupStyleVariables,
} from '@lodariq/sdk-runtime/renderers/tour';
import { authoringText } from '../../../i18n';
import { RICH_CONTENT_BLOCK_TYPES } from '../../../editor/rich-content-doc';
import { RichContentEditor } from '../../../editor/rich-content-editor';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { stepTooltip } from '../tour-step-model';
import { targetIdOf } from '../utils';

export function OverlayStepEditor({
  controller,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock | null;
}) {
  const tooltip = step ? stepTooltip(step) : null;
  const targetId = step ? targetIdOf(step) : null;
  const [toolbarBelow, setToolbarBelow] = useState(false);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>(null);
  const [inspectorOnLeft, setInspectorOnLeft] = useState(false);
  const prefersDark = snapshot.previewPreferences?.prefersDark ?? false;
  const prefersReducedMotion = snapshot.previewPreferences?.prefersReducedMotion ?? false;
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
  const popupComposition = tooltip
    ? resolveTourCompositionRecipe(tooltip.props.tooltipLayout)
    : null;
  const popupAppearance = tooltip
    ? resolveTourPopupStyleRecipe(tooltip.props.tooltipStyle)
    : null;
  const popupStyle = {
    ...resolvedPopupTheme.variables,
    ...(popupAppearance ? tourPopupStyleVariables(popupAppearance) : {}),
  } as CSSProperties;
  const richContentValue = tooltip
    ? tooltip.children.filter((block) => RICH_CONTENT_BLOCK_TYPES.has(block.type))
    : [];
  const handledFocusRequestToken = useRef<number | null>(null);

  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null;
    if (!frame) return;
    const sync = (): void => {
      setToolbarBelow(frame.dataset['overlayToolbar'] === 'below');
      setInspectorOnLeft(frame.dataset['overlayInspectorSide'] === 'left');
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(frame, {
      attributes: true,
      attributeFilter: ['data-overlay-toolbar', 'data-overlay-inspector-side'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null;
    if (!frame || !inspectorHost) {
      if (frame) frame.dataset['overlayInspector'] = '0';
      return;
    }
    const sync = (): void => {
      frame.dataset['overlayInspector'] = inspectorHost.childElementCount > 0 ? '1' : '0';
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(inspectorHost, { childList: true });
    return () => {
      observer.disconnect();
      frame.dataset['overlayInspector'] = '0';
    };
  }, [inspectorHost]);

  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null;
    const shell = document.querySelector('.overlay-step-shell');
    if (!frame || !shell) return;
    const sync = (): void => {
      const canvas = shell.querySelector('.rich-content-canvas');
      if (!canvas) {
        delete frame.dataset['overlayContentHeight'];
        return;
      }
      frame.dataset['overlayContentHeight'] = String(Math.ceil(canvas.scrollHeight));
    };
    sync();
    requestAnimationFrame(sync);
    const mutations = new MutationObserver(sync);
    mutations.observe(shell, { childList: true, subtree: true });
    const resize = new ResizeObserver(sync);
    resize.observe(shell);
    shell.addEventListener('load', sync, true);
    return () => {
      shell.removeEventListener('load', sync, true);
      mutations.disconnect();
      resize.disconnect();
      delete frame.dataset['overlayContentHeight'];
    };
  }, [step?.id]);

  useEffect(() => {
    const request = snapshot.focusRequest;
    if (!request || !step || handledFocusRequestToken.current === request.token) return;
    handledFocusRequestToken.current = request.token;
    const canvas = document.querySelector<HTMLElement>('.overlay-step-card .rich-content-canvas');
    canvas?.focus();
  }, [snapshot.focusRequest, step]);

  return (
    <section
      className={`canvas panel-canvas overlay-step-shell${toolbarBelow ? ' toolbar-below' : ''}${inspectorOnLeft ? ' inspector-left' : ''}`}
      aria-label={authoringText('Experience editor')}
      tabIndex={-1}
    >
      <div className={`overlay-step-main${toolbarBelow ? ' toolbar-below' : ''}`}>
      <div className="overlay-step-toolbar">
        <div
          className="overlay-step-toolbar-slot"
          data-rich-content-toolbar-slot=""
          ref={setToolbarHost}
        />
        {step && !targetId ? (
          <button
            type="button"
            className="overlay-choose-target"
            onClick={() => controller.startTargetPick(step.id)}
          >
            {authoringText('Choose target')}
          </button>
        ) : null}
      </div>
      {step && tooltip ? (
        <div
          className="overlay-step-card rich-step-content"
          role="group"
          aria-label={authoringText('Step content editor')}
          data-lodariq-action-align={popupComposition?.actionAlign}
          data-lodariq-action-layout={popupComposition?.actionLayout}
          data-lodariq-color-mode={resolvedPopupTheme.colorMode}
          data-lodariq-composition-gap={popupComposition?.gap}
          data-lodariq-composition-padding={popupComposition?.padding}
          data-lodariq-content-align={popupComposition?.contentAlign}
          data-lodariq-popup-radius={popupComposition?.radius}
          data-lodariq-popup-border-weight={popupAppearance?.borderWeight}
          data-lodariq-popup-elevation={popupAppearance?.elevation}
          data-lodariq-pointer-arrow={popupComposition?.showArrow ? 'show' : 'hide'}
          style={popupStyle}
        >
          <RichContentEditor
            key={step.id}
            inspectorHost={inspectorHost}
            onChange={(next) => controller.replaceStepRichContent(step.id, next)}
            onOpenSequence={() => controller.openOperationsMode()}
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
            toolbarHost={toolbarHost}
            value={richContentValue}
          />
        </div>
      ) : (
        <p className="overlay-step-empty" role="status">
          {authoringText('Add a step from the filmstrip')}
        </p>
      )}
      </div>
      <div className="overlay-step-inspector" data-rich-content-inspector-slot="" ref={setInspectorHost} />
    </section>
  );
}
