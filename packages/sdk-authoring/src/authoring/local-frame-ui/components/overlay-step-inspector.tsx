import { lazy, Suspense, useEffect, useId, useRef, type ReactNode } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { INSPECTOR_COPY } from '../../overlay/inspector-copy';
import { targetVerificationPresentation } from '../../target-verification';
import { InspectorSections } from '../../../editor/rich-content-inspector-sections';
import { selectExperienceRootBlocks } from '../../experience-authoring-capabilities';
import type { LocalAuthoringFrameController } from '../controller';
import { ExclusiveFloatingGroup, X } from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';
import type { PopupThemeColors } from './contextual-property-types';
import { firstHeadingText } from '../../overlay/filmstrip';
import { PopupCompositionInspector } from './popup-composition-inspector';
import { StepActionsSection } from './step-actions-section';
import { StepFlowSection } from './step-flow-section';
import { StepNarrationSection } from './step-narration-section';
import { StepPresentationInspector } from './step-presentation-inspector';
import { StepStyleHeader } from './step-style-header';
import { StepStyleReuse } from './step-style-reuse';
import { StepConditionsSection } from './step-conditions-section';
import { StepTargetSection } from './step-target-section';
import type { ExperienceBehaviorSectionProps } from './experience-behavior-section';
import { registerExperienceInspectorSections } from '../../experiences/inspector-registration';

const LazyExperienceBehaviorSection = lazy(async () => {
  const module = await import('./experience-behavior-section');
  return { default: module.ExperienceBehaviorSection };
});

function ExperienceBehaviorSection(props: ExperienceBehaviorSectionProps) {
  return (
    <Suspense fallback={null}>
      <LazyExperienceBehaviorSection {...props} />
    </Suspense>
  );
}

/**
 * The step inspector (§4.3): one popover, anchored to the card, replacing the
 * Popup tray, the Placement tray and the under-canvas property tray.
 *
 * Sections rather than tabs, because tabs hide state and force a mode decision
 * before the creator knows what they want. No pinned state and no persistence
 * across selection changes — that is what turns an inspector back into a panel.
 */
export function OverlayStepInspector({
  controller,
  onClose,
  popupThemeColors,
  requestedSection,
  snapshot,
  step,
  stepIndex,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  onClose: () => void;
  /** The section the toolbar asked for, when it was opened from a named control. */
  requestedSection?: string | null;
  popupThemeColors: PopupThemeColors;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  stepIndex: number;
  tooltip: LodariqBlock;
}) {
  registerExperienceInspectorSections(snapshot.documentState.type);
  const containerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  /**
   * The trap below opens the popover and restores focus when it closes, so it
   * must run on open and on close and at no other time. `onClose` is written
   * inline by the caller and so is a new function on every render — as a
   * dependency it re-ran the whole effect on every keystroke, moving focus to
   * the opener and back to the first section, which is what sent the creator's
   * scroll position to the top mid-edit. The ref carries the latest callback
   * without making the effect depend on its identity.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  /**
   * §9.1: a focus-trapped popover, `Esc` to dismiss, focus restored to whatever
   * opened it. The trap is Tab-only — it cycles within the popover and never
   * captures pointer input, so the creator can still click their own content and
   * leave. A trap that also swallowed clicks would lock them out of the page.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const opener = container.ownerDocument.activeElement;
    container.querySelector<HTMLElement>('summary')?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = focusableWithin(container);
      if (stops.length === 0) return;
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = container.ownerDocument.activeElement;
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };
    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  const bodies = sectionBodies({
    controller,
    popupThemeColors,
    snapshot,
    step,
    tooltip,
  });

  return (
    <section
      ref={containerRef}
      className="overlay-step-inspector-panel storyboard-property-tray"
      aria-labelledby={titleId}
      data-tool-mode="step"
    >
      <header className="overlay-step-inspector-header">
        {/* The prototype titles the popover with the thing it is inspecting. */}
        <strong id={titleId}>
          {INSPECTOR_COPY.stepTitle(stepIndex + 1, firstHeadingText(step) || undefined)}
        </strong>
        {/*
          §4.3 tags the header with how the target is holding up, not with the
          step's own status — that is the one fact worth carrying above every
          section, since a card that cannot find its element cannot publish.
        */}
        <InspectorHeaderTag snapshot={snapshot} step={step} tooltip={tooltip} />
        {step.status === 'incomplete' || step.status === 'invalid' ? (
          <span className="overlay-step-inspector-status" data-status={step.status}>
            {step.status === 'invalid' ? INSPECTOR_COPY.invalid : INSPECTOR_COPY.incomplete}
          </span>
        ) : null}
        <button
          type="button"
          className="storyboard-tray-close"
          aria-label={INSPECTOR_COPY.close}
          onClick={onClose}
        >
          <X size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </header>
      {/* §4.3's cap is a cap on the popover, not on its content: this scrolls. */}
      <div className="overlay-step-inspector-body" data-overlay-inspector-scroll="">
        {/* One picker open at a time — see ExclusiveFloatingGroup. */}
        <ExclusiveFloatingGroup>
          <InspectorSections
            bodies={bodies}
            kind="card"
            requestedSection={requestedSection}
            resetKey={step.id}
          />
        </ExclusiveFloatingGroup>
      </div>
    </section>
  );
}

/**
 * Section bodies, keyed by section id. A map rather than a switch, so a new
 * section is one registry entry plus one key here.
 */
/**
 * Tab stops in DOM order. Controls inside a collapsed section are not stops — the
 * check is structural rather than geometric, because a layout measurement cannot
 * distinguish "collapsed" from "not laid out yet".
 */
export function focusableWithin(container: HTMLElement): readonly HTMLElement[] {
  const candidates = container.querySelectorAll<HTMLElement>(
    'summary, button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  );
  return [...candidates].filter((element) => !isInsideClosedSection(element, container));
}

function isInsideClosedSection(element: HTMLElement, container: HTMLElement): boolean {
  if (element.hasAttribute('hidden')) return true;
  for (let node = element.parentElement; node && node !== container; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement && !node.open && element.tagName !== 'SUMMARY') {
      return true;
    }
  }
  return false;
}

function sectionBodies({
  controller,
  popupThemeColors,
  snapshot,
  step,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  popupThemeColors: PopupThemeColors;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  tooltip: LodariqBlock;
}): Readonly<Record<string, ReactNode>> {
  const presentationAvailable = snapshot.deliveryCapabilities.has('presentation.v1');
  return {
    style: (
      <>
        <StepStyleHeader
          controller={controller}
          snapshot={snapshot}
          step={step}
          tooltip={tooltip}
        />
        {/* §4.3 order: the two colours, then spacing, then the edges. */}
        <PopupCompositionInspector
          appearanceScope="colours"
          controller={controller}
          density="compact"
          section="appearance"
          themeColors={popupThemeColors}
          tooltip={tooltip}
        />
        <PopupCompositionInspector
          controller={controller}
          density="compact"
          layoutScope="spacing"
          section="layout"
          themeColors={popupThemeColors}
          tooltip={tooltip}
        />
        <PopupCompositionInspector
          appearanceScope="edges"
          controller={controller}
          density="compact"
          section="appearance"
          themeColors={popupThemeColors}
          tooltip={tooltip}
        />
        <PopupCompositionInspector
          controller={controller}
          density="compact"
          layoutScope="frame"
          section="layout"
          themeColors={popupThemeColors}
          tooltip={tooltip}
        />
        {/*
          Reuse comes last, as the prototype has it. It was first, which put four
          buttons about *other* steps above the rows that change this one — so the
          section opened on a detour rather than on its own subject.
        */}
        <StepStyleReuse controller={controller} snapshot={snapshot} step={step} />
        <p className="storyboard-property-hint">
          {authoringText(
            'Styles bind to tokens, not values — change the theme and every step bound to this style follows.',
          )}
        </p>
      </>
    ),
    actions: <StepActionsSection controller={controller} tooltip={tooltip} />,
    flow: (
      <StepFlowSection
        controller={controller}
        snapshot={snapshot}
        step={step}
        steps={selectExperienceRootBlocks(snapshot.documentState)}
        tooltip={tooltip}
      />
    ),
    target: (
      <StepTargetSection
        controller={controller}
        snapshot={snapshot}
        step={step}
        themeAccent={popupThemeColors.focusColor}
      />
    ),
    conditions: <StepConditionsSection controller={controller} snapshot={snapshot} step={step} />,
    narration: (
      <StepNarrationSection
        controller={controller}
        snapshot={snapshot}
        step={step}
        tooltip={tooltip}
      />
    ),
    dismissal: (
      <ExperienceBehaviorSection controller={controller} section="dismissal" snapshot={snapshot} />
    ),
    frequency: (
      <ExperienceBehaviorSection controller={controller} section="frequency" snapshot={snapshot} />
    ),
    audience: (
      <ExperienceBehaviorSection controller={controller} section="content" snapshot={snapshot} />
    ),
    marker: (
      <ExperienceBehaviorSection controller={controller} section="marker" snapshot={snapshot} />
    ),
    trigger: (
      <ExperienceBehaviorSection controller={controller} section="trigger" snapshot={snapshot} />
    ),
    tooltip: (
      <ExperienceBehaviorSection controller={controller} section="content" snapshot={snapshot} />
    ),
    question: (
      <ExperienceBehaviorSection controller={controller} section="content" snapshot={snapshot} />
    ),
    options: (
      <ExperienceBehaviorSection controller={controller} section="content" snapshot={snapshot} />
    ),
    logic: (
      <ExperienceBehaviorSection controller={controller} section="logic" snapshot={snapshot} />
    ),
    items: (
      <ExperienceBehaviorSection controller={controller} section="items" snapshot={snapshot} />
    ),
    completion: (
      <ExperienceBehaviorSection controller={controller} section="completion" snapshot={snapshot} />
    ),
    /**
     * Advanced also carries the destructive action. `deleteTopLevelBlock` has
     * existed on the controller all along — nothing in the overlay ever called it,
     * so a step could be added and never removed. Advanced is the right home: one
     * click from the toolbar's ⋯, and not somewhere a stray click lands.
     */
    advanced: (
      <>
        {presentationAvailable ? (
          <StepPresentationInspector
            controller={controller}
            snapshot={snapshot}
            step={step}
            steps={selectExperienceRootBlocks(snapshot.documentState)}
            tooltip={tooltip}
          />
        ) : null}
        <StepAdvancedLinks controller={controller} />
        <StepDangerZone controller={controller} snapshot={snapshot} step={step} />
      </>
    ),
  };
}

function InspectorHeaderTag({
  snapshot,
  step,
  tooltip,
}: {
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  tooltip: LodariqBlock;
}): ReactNode {
  const targetId = tooltip.props.targetId ?? step.props.targetId;
  if (!targetId) return null;
  const health = snapshot.targetHealth.get(targetId);
  const shown = targetVerificationPresentation(health?.presentation ?? 'unverified');
  return (
    <span className="overlay-step-inspector-status" data-tone={shown.tone}>
      {shown.label}
    </span>
  );
}

/** §4.3 advanced: four ways out to Operations, which owns each of them. */
function StepAdvancedLinks({
  controller,
}: {
  controller: LocalAuthoringFrameController;
}): ReactNode {
  const links = [
    { tab: 'recovery', label: authoringText('Backup JSON') },
    { tab: 'check', label: authoringText('Diagnostics') },
    { tab: 'recovery', label: authoringText('Support package') },
    { tab: 'release', label: authoringText('Step lifecycle') },
  ] as const;
  return (
    <>
      <div className="inspector-menu">
        {links.map((link) => (
          <button
            data-advanced-link={link.tab}
            key={link.label}
            onClick={() => controller.openOperationsMode(link.tab)}
            type="button"
          >
            {link.label}
          </button>
        ))}
      </div>
      <p className="storyboard-property-hint">
        {authoringText('Collapsed, last, and never on the default path.')}
      </p>
    </>
  );
}

/**
 * Deleting a step is undoable, so it does not ask twice — the confirmation is the
 * undo, which is cheaper for the creator than a dialog on every removal.
 */
function StepDangerZone({
  controller,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
}): ReactNode {
  const steps = selectExperienceRootBlocks(snapshot.documentState);
  // An experience with no steps cannot be published, so the last one stays.
  const isLast = steps.length <= 1;
  return (
    <div className="step-danger-zone">
      <button
        type="button"
        className="step-danger-action"
        disabled={isLast}
        onClick={() => controller.deleteTopLevelBlock(step.id)}
      >
        {authoringText('Delete step')}
      </button>
      <p className="step-danger-note">
        {isLast
          ? authoringText('An experience needs at least one step.')
          : authoringText('You can undo this.')}
      </p>
    </div>
  );
}
