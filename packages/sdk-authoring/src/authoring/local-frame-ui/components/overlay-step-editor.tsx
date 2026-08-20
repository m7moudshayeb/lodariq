import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import {
  resolveTourCompositionRecipe,
  resolveTourPopupStyleRecipe,
  resolveTourThemeStyle,
  tourPopupStyleVariables,
} from '@lodariq/sdk-runtime/renderers/tour';
import { authoringText } from '../../../i18n';
import { INSPECTOR_COPY } from '../../overlay/inspector-copy';
import { selectExperienceRootBlocks } from '../../experience-authoring-capabilities';
import { RICH_CONTENT_BLOCK_TYPES } from '../../../editor/rich-content-doc';
import { RichContentEditor } from '../../../editor/rich-content-editor';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { stepTooltip } from '../tour-step-model';
import { targetIdOf } from '../utils';
import { Crosshair, SlidersHorizontal, Undo2 } from '../design-system';
import { OVERLAY_RESOLVE_HYSTERESIS_PX } from '../../overlay/constants';
import { OVERLAY_FRAME_GEOMETRY_VARS } from '../../overlay/frame-layout';
import { toolbarContextLabel, type ToolbarContextKind } from '../../overlay/toolbar-context';
import type { OverlayInspectorAnchor } from '../../overlay/solver.types';
import type { AiAssistRequest } from '../../ai/assist-contract';
import { AssistPreview, AssistPrompt } from './assist-preview';
import { OverlayStepInspector } from './overlay-step-inspector';
import { OverlayToolbarAssist } from './overlay-toolbar-assist';
import { OverlayToolbarStepControls } from './overlay-toolbar-step-controls';
import { ToolbarStylePicker } from './toolbar-style-picker';
import { useToolbarFit } from './use-toolbar-fit';

/** A scroller's own padding, which its content height does not include. */
function verticalPadding(element: HTMLElement): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return 0;
  return Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
}

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
  const [toolbarAnchor, setToolbarAnchor] = useState<'above' | 'below' | 'docked'>('above');
  const toolbarBelow = toolbarAnchor === 'below';
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [insertHost, setInsertHost] = useState<HTMLElement | null>(null);
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>(null);
  /**
   * §4.3 is one inspector surface, and the section list is chosen by what is
   * selected. Selecting a button used to portal its tray into the same column as
   * the step's popover, so the creator got two stacked inspectors — two headers,
   * two close buttons, and a column taller than the cap. The block's inspector
   * replaces the step's for as long as the block is selected, and closing it
   * brings the step's back.
   */
  const [blockInspectorPresent, setBlockInspectorPresent] = useState(false);
  /** The side the host picked when it positioned this frame. */
  const [hostSide, setHostSide] = useState<'left' | 'right'>('right');
  /** `corner` only when neither side fits inside the frame's own viewport. */
  const [inspectorCornered, setInspectorCornered] = useState(false);
  const inspectorAnchor: OverlayInspectorAnchor = inspectorCornered ? 'corner' : hostSide;
  const [stepInspectorOpen, setStepInspectorOpen] = useState(false);
  const [toolbarContext, setToolbarContext] = useState<ToolbarContextKind>('step');
  /*
   * The middle used to clip whatever did not fit, which at a narrow card hid
   * three of the step's controls with nothing to reveal them. It steps down
   * instead — see `useToolbarFit`.
   */
  const toolbarContextRef = useRef<HTMLDivElement | null>(null);
  const toolbarFit = useToolbarFit(toolbarContextRef, toolbarContext);
  /** Which inspector section the toolbar asked for, when it was opened by name. */
  const [inspectorSection, setInspectorSection] = useState<string | null>(null);
  /** The assist request in flight, kept so a refinement repeats the same scope. */
  const [assistRequest, setAssistRequest] = useState<AiAssistRequest | null>(null);
  const [assistPromptOpen, setAssistPromptOpen] = useState(false);
  const assistAvailable = snapshot.panelWorkflow.assistAvailable;
  const inspectorColumnRef = useRef<HTMLDivElement | null>(null);
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
  const handledTargetInspectToken = useRef<number | null>(null);

  useEffect(() => {
    setStepInspectorOpen(false);
    setInspectorSection(null);
    // A new step is nothing-selected, so the middle goes back to the step itself.
    setToolbarContext('step');
  }, [step?.id]);

  // The on-page ring was clicked (§4.4): open the step inspector on Target.
  useEffect(() => {
    const request = snapshot.targetInspectRequest;
    if (!request || handledTargetInspectToken.current === request.token) return;
    handledTargetInspectToken.current = request.token;
    setInspectorSection(request.section ?? 'target');
    setStepInspectorOpen(true);
    setToolbarContext('step');
  }, [snapshot.targetInspectRequest]);

  /**
   * §4.3 sizing: the inspector reports what its content measures and the host
   * reserves `min(that, 60vh)` for it, so it opens at its natural height and
   * scrolls internally past the cap.
   *
   * The frame cannot resize itself, and the host cannot read across the iframe
   * boundary, so the measurement has to travel as data. Hysteresis keeps a
   * two-pixel reflow from re-solving the whole frame (§4.2a rule 3).
   */
  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null;
    const column = inspectorColumnRef.current;
    if (!frame || !column) return;
    const sync = (): void => {
      /**
       * Measured on the sections themselves, not on the scroller.
       *
       * A scroller stretched to fill its column reports `scrollHeight` as its own
       * client height whenever the content is shorter, so the reserved height could
       * only ever grow: close a long section and the popover stayed tall with a
       * band of empty glass under it.
       */
      /**
       * Either inspector's scroller — both declare themselves with the same
       * attribute now.
       *
       * This used to fall back to the portal slot for the block inspector, and
       * once that inspector grew a real scroller the fallback still matched
       * first: the slot is the scroller's own ancestor, so it won on document
       * order and the formula measured the column against itself. The reported
       * height came back exactly equal to the height already granted, which is
       * why the block inspector sat 100px shorter than the card's and scrolled a
       * section that would have fit.
       */
      const scroller = column.querySelector<HTMLElement>('[data-overlay-inspector-scroll]');
      const content =
        scroller?.querySelector('.inspector-sections') ?? scroller?.firstElementChild;
      /*
       * The column's own border is outside clientHeight but inside the height
       * the host grants, so leaving it out asked for exactly two pixels less
       * than the content needs — enough for a section that fits to scroll anyway.
       */
      const border = column.offsetHeight - column.clientHeight;
      const next =
        scroller && content
          ? Math.ceil(
              column.clientHeight -
                scroller.clientHeight +
                verticalPadding(scroller) +
                content.scrollHeight +
                border,
            )
          : Math.ceil(column.scrollHeight);
      const previous = Number.parseInt(frame.dataset['overlayInspectorContent'] ?? '', 10);
      /*
       * Report every change, not only ones over the solver's hysteresis.
       *
       * This carried the toolbar's 24px threshold, which exists there to stop a
       * bistable above/below choice from flapping. A height is a measurement,
       * not a choice: damping it meant collapsing a section moved the content
       * but not the popover, so the glass lagged a step behind and settled up to
       * 24px wrong. The measurement is self-stabilising — it is header plus
       * content, and does not depend on the height the host grants back — so
       * only an exact repeat is worth skipping.
       */
      if (previous === next) return;
      frame.dataset['overlayInspectorContent'] = String(next);
    };
    sync();
    requestAnimationFrame(sync);
    const mutations = new MutationObserver(sync);
    mutations.observe(column, { attributes: true, childList: true, subtree: true });
    const resize = new ResizeObserver(sync);
    resize.observe(column);
    return () => {
      mutations.disconnect();
      resize.disconnect();
      delete frame.dataset['overlayInspectorContent'];
    };
  }, [stepInspectorOpen, step?.id]);

  /**
   * The host solved where each surface goes; the frame only applies it.
   *
   * Toolbar, card and inspector are absolutely positioned peers here exactly as
   * they are in the prototype, so none of them can push another around: the card
   * sits where the runtime will ship it, and opening the inspector cannot move it.
   */
  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null;
    if (!frame) return;
    const sync = (): void => {
      const anchor = frame.dataset['overlayToolbar'];
      setToolbarAnchor(anchor === 'below' || anchor === 'docked' ? anchor : 'above');
      setHostSide(frame.dataset['overlayInspectorSide'] === 'left' ? 'left' : 'right');
      setInspectorCornered(frame.dataset['overlayInspectorSide'] === 'corner');
      const root = document.documentElement.style;
      for (const [key, property] of Object.entries(OVERLAY_FRAME_GEOMETRY_VARS)) {
        const value = Number.parseInt(frame.dataset[key] ?? '', 10);
        if (Number.isFinite(value)) root.setProperty(property, `${value}px`);
        else root.removeProperty(property);
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(frame, {
      attributes: true,
      attributeFilter: [
        'data-overlay-toolbar',
        'data-overlay-inspector-side',
        ...Object.keys(OVERLAY_FRAME_GEOMETRY_VARS).map(
          (key) => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
        ),
      ],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null;
    if (!inspectorHost) {
      if (frame) frame.dataset['overlayInspector'] = '0';
      return;
    }
    const sync = (): void => {
      // Block-inspector content arrives by portal, so the flag has to be observed
      // rather than derived from React state alone.
      const block = inspectorHost.childElementCount > 0;
      setBlockInspectorPresent(block);
      const present = block || stepInspectorOpen;
      if (frame) frame.dataset['overlayInspector'] = present ? '1' : '0';
      if (inspectorColumnRef.current) {
        inspectorColumnRef.current.dataset['present'] = present ? 'true' : 'false';
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(inspectorHost, { childList: true });
    return () => {
      observer.disconnect();
      if (frame) frame.dataset['overlayInspector'] = '0';
    };
  }, [inspectorHost, stepInspectorOpen]);

  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null;
    const shell = document.querySelector('.overlay-step-shell');
    if (!frame || !shell) return;
    const sync = (): void => {
      const cardBox = shell.querySelector<HTMLElement>('.overlay-step-card');
      if (!cardBox) {
        delete frame.dataset['overlayContentHeight'];
        return;
      }
      /**
       * The card's own box, padding included — the toolbar is placed against its
       * bottom edge, so measuring the canvas inside it left the bar sitting a
       * padding's worth too high, across the card's last line of text.
       *
       * Hysteresis on top (§4.2a rule 3): the observer fires on every keystroke,
       * and a frame that re-solves for a two-pixel text reflow reads as a jitter
       * bug. Only a real change moves it.
       */
      const next = Math.ceil(cardBox.offsetHeight);
      const previous = Number.parseInt(frame.dataset['overlayContentHeight'] ?? '', 10);
      if (
        Number.isFinite(previous) &&
        Math.abs(previous - next) <= OVERLAY_RESOLVE_HYSTERESIS_PX
      ) {
        return;
      }
      frame.dataset['overlayContentHeight'] = String(next);
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

  /**
   * A menu opened from the toolbar has nowhere to go: the iframe is sized to the
   * card and clips everything past its box, so Floating UI correctly reports a few
   * hundred px of available height and the menu renders as a stub.
   *
   * The frame cannot resize itself, so it reports that a menu is open and the host
   * grows the iframe while it is. The extra area is transient and intercepts
   * pointer events — which is right for an open menu, and clicking there closes it.
   */
  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null;
    if (!frame) return;
    let reported = false;
    const sync = (): void => {
      const open = Boolean(
        document.querySelector(
          // `.ui-select-content` is the inspector's own picker. It was missing
          // here, so a seven-row list opened into whatever was left of a 264px
          // frame and rendered as a row and a half.
          '[data-rich-content-floating-menu="true"], [data-chrome-menu="true"], [data-overlay-assist="open"], .ui-select-content',
        ),
      );
      if (open) {
        frame.dataset['overlayMenuOpen'] = '1';
        // Also in-document, so the shell can stop the card stretching into the room.
        document.documentElement.dataset['overlayMenuOpen'] = '1';
      } else {
        delete frame.dataset['overlayMenuOpen'];
        delete document.documentElement.dataset['overlayMenuOpen'];
      }
      /*
       * And tell the host, which paints the card's resize handles *above* this
       * frame: without it an open menu is drawn under eight white squares —
       * §3.4 rule 1, between two surfaces Lodariq owns.
       */
      if (open !== reported) {
        reported = open;
        controller.setFrameMenuOpen(open);
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      delete frame.dataset['overlayMenuOpen'];
      if (reported) controller.setFrameMenuOpen(false);
    };
  }, [controller]);

  /**
   * ⌘K belongs to the host's command palette (§7.5), which is also where the map
   * says it goes. It used to open this frame's prompt row instead, so the chord
   * did one of two different things depending on where the focus happened to be —
   * and since the focus is usually in here, the palette was mostly unreachable.
   * The prompt row keeps its visible Assist control (§3.1a).
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      controller.requestCommandPalette();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [controller]);

  useEffect(() => {
    const request = snapshot.focusRequest;
    if (!request || !step || handledFocusRequestToken.current === request.token) return;
    handledFocusRequestToken.current = request.token;
    const canvas = document.querySelector<HTMLElement>('.overlay-step-card .rich-content-canvas');
    canvas?.focus();
  }, [snapshot.focusRequest, step]);

  return (
    <section
      className={`canvas panel-canvas overlay-step-shell${toolbarBelow ? ' toolbar-below' : ''}${inspectorAnchor === 'left' ? ' inspector-left' : ''}${inspectorAnchor === 'corner' ? ' inspector-corner' : ''}`}
      aria-label={authoringText('Experience editor')}
      tabIndex={-1}
    >
      <div className={`overlay-step-main${toolbarBelow ? ' toolbar-below' : ''}`}>
      {/*
        §4.2a: a persistent frame whose middle is the only part that changes.
        `key` on the context makes the swap animate, and the label says what the
        middle is now editing — a bar that silently rearranges reads as a glitch.
      */}
      <div
        className="overlay-step-toolbar"
        role="toolbar"
        aria-label={authoringText('Step toolbar')}
        data-anchor={toolbarAnchor}
        data-context={toolbarContext}
      >
        <div
          className="overlay-step-toolbar-insert"
          data-rich-content-insert-slot=""
          ref={setInsertHost}
        />
        <span className="overlay-step-toolbar-separator" aria-hidden="true" />
        {/*
          The slot must never be keyed: the editor portals into it, and remounting
          the host tears the toolbar out of the DOM mid-interaction. Only the label
          is keyed, so the swap animates without touching the portal.
        */}
        <div
          className="overlay-step-toolbar-context"
          data-toolbar-fit={toolbarFit}
          ref={toolbarContextRef}
        >
          <span
            className="overlay-step-toolbar-label"
            key={toolbarContext}
            aria-live="polite"
          >
            {toolbarContextLabel(toolbarContext)}
          </span>
          {/*
            Nothing is selected inside the card, so the middle belongs to the step
            itself — which named style it wears (§6.2). Style, Placement and
            Actions are inspector sections and stay there; the ⋯ button is their
            way in, and printing them twice taught nobody where they live.
          */}
          {toolbarContext === 'step' && step && tooltip ? (
            <>
              <ToolbarStylePicker controller={controller} snapshot={snapshot} step={step} />
              <OverlayToolbarStepControls
                controller={controller}
                onOpenInspectorSection={(section) => {
                  setInspectorSection(section);
                  setStepInspectorOpen(true);
                }}
                step={step}
                tooltip={tooltip}
              />
            </>
          ) : null}
          <div
            className="overlay-step-toolbar-slot"
            data-rich-content-toolbar-slot=""
            ref={setToolbarHost}
          />
        </div>
        <span className="overlay-step-toolbar-separator" aria-hidden="true" />
        {/*
          Assist sits with Undo and the inspector affordance: the three controls
          that mean the same thing whatever is selected, so they never move.
        */}
        {step && assistAvailable ? (
          <OverlayToolbarAssist
            controller={controller}
            onAsk={() => setAssistPromptOpen(true)}
            onStartAssist={(request) => {
              setAssistRequest(request);
              controller.askAiAssist(request);
            }}
            step={step}
          />
        ) : null}
        {/*
          Always on the bar, not only while the step is targetless: re-pointing a
          step is the single most common repair, and hiding the control once a
          target exists meant the only way back was the inspector.
        */}
        {step ? (
          <button
            type="button"
            className="overlay-choose-target"
            data-has-target={targetId ? 'true' : 'false'}
            aria-label={targetId ? authoringText('Change target') : authoringText('Choose target')}
            title={targetId ? authoringText('Change target') : authoringText('Choose target')}
            onClick={() => controller.startTargetPick(step.id)}
          >
            {/*
              A glyph, worded in its label rather than on the bar: the labelled
              variant took a third of a 420px toolbar and pushed the step's own
              controls out of the contextual middle.
            */}
            <Crosshair size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
        {/*
          Undo lives on the bar in both contexts (§4.2a). The browser's own ⌘Z
          only reaches the caret; this is the one that reaches the document.
        */}
        <button
          type="button"
          className="overlay-toolbar-glyph"
          aria-label={authoringText('Undo')}
          title={authoringText('Undo')}
          onClick={() => controller.undo()}
        >
          <Undo2 size={15} strokeWidth={2} aria-hidden="true" />
        </button>
        {step && tooltip ? (
          <button
            type="button"
            className="overlay-toolbar-glyph overlay-step-settings"
            aria-label={INSPECTOR_COPY.open}
            aria-expanded={stepInspectorOpen}
            title={INSPECTOR_COPY.open}
            onClick={() => setStepInspectorOpen((open) => !open)}
          >
            {/*
              A settings glyph rather than the prototype's second ⋯: the editor's
              formatting overflow already owns that shape here, and two identical
              ellipses side by side say nothing about which is which.
            */}
            <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
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
            cardCommand={snapshot.cardCommandRequest}
            insertHost={insertHost}
            inspectorHost={inspectorHost}
            onChange={(next) => controller.replaceStepRichContent(step.id, next)}
            onContextChange={setToolbarContext}
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
      {/*
        preview → accept / reject / refine / undo, on the card it belongs to.
        Nothing is applied on arrival, so the creator sees the change before the
        document has one (§7.5).
      */}
      {step && assistAvailable ? (
        <div
          className="overlay-step-assist"
          /* Needs room the frame is not sized for, the same way an open menu does. */
          data-overlay-assist={
            assistPromptOpen || snapshot.panelWorkflow.assist.phase !== 'idle' ? 'open' : undefined
          }
        >
          {assistPromptOpen ? (
            <AssistPrompt
              onClose={() => setAssistPromptOpen(false)}
              onSubmit={(prompt) => {
                setAssistPromptOpen(false);
                const request: AiAssistRequest = {
                  kind: 'command',
                  scope: 'step',
                  prompt,
                  stepIds: [step.id],
                };
                setAssistRequest(request);
                controller.askAiAssist(request);
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
      </div>
      <div
        className="overlay-step-inspector"
        data-present="false"
        data-inspector-anchor={inspectorAnchor}
        ref={inspectorColumnRef}
      >
        {step && tooltip && stepInspectorOpen && !blockInspectorPresent ? (
          <OverlayStepInspector
            controller={controller}
            onClose={() => {
              setStepInspectorOpen(false);
              setInspectorSection(null);
            }}
            requestedSection={inspectorSection}
            popupThemeColors={{
              borderColor: resolvedPopupTheme.variables['--lq-tour-border-color'],
              surfaceColor: resolvedPopupTheme.variables['--lq-tour-surface'],
              textColor: resolvedPopupTheme.variables['--lq-tour-text-color'],
              focusColor: resolvedPopupTheme.variables['--lq-tour-focus-color'],
            }}
            snapshot={snapshot}
            step={step}
            stepIndex={Math.max(
              0,
              selectExperienceRootBlocks(snapshot.documentState).findIndex(
                (candidate) => candidate.id === step.id,
              ),
            )}
            tooltip={tooltip}
          />
        ) : null}
        <div data-rich-content-inspector-slot="" ref={setInspectorHost} />
      </div>
    </section>
  );
}
