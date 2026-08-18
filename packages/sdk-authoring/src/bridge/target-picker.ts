import type { ElementFingerprint, TargetIdentityV2 } from '@lodariq/schema';
import { createNonceStyleElement, roleOf } from '@lodariq/schema/dom';
import { localizedLabelOf } from '@lodariq/sdk-runtime/resolver';
import { CREATOR_CHROME_FONT_STACK, CREATOR_CHROME_TOKENS } from '../creator-chrome-tokens';
import { applyAuthoringLocale, authoringText } from '../i18n';
import {
  captureElementFingerprint,
  captureNeedsConfirmation,
  captureTargetEvidence,
  mergeTargetCaptureVariants,
  normalizeTargetStateId,
  normalizeTargetElement,
  observeTargetEvidence,
  type PassiveTargetProbe,
  type TargetEvidenceCapture,
} from './fingerprint';

const PICKER_Z_INDEX = 2_147_483_645;
const TARGET_CARD_WIDTH = 292;

export { normalizeTargetStateId };

export interface TargetPickResult {
  element: Element;
  fingerprint: ElementFingerprint;
  identity: TargetIdentityV2;
}

export interface TargetPicker {
  cancel: () => void;
}

export interface TargetPickerOptions {
  root?: Document;
  initialTarget?: Element;
  initialIdentity?: TargetIdentityV2;
  /** Legacy caller hint; capture evidence now decides whether review is needed. */
  suggestion?: { confidence: number };
  locale?: string;
  requiredAction?: TargetIdentityV2['intent']['requiredAction'];
  /** Current opaque application state supplied by the host at pick time. */
  stateId?: string;
  onPick: (result: TargetPickResult) => void;
  /** Receives bounded post-click evidence without delaying the one-click attach. */
  onEvidenceUpdate?: (result: TargetPickResult) => void;
  onCancel?: () => void;
}

interface CandidateTrail {
  elements: Element[];
  preferredIndex: number;
}

interface TargetFromEventResult extends CandidateTrail {
  blocked: boolean;
}

interface RectAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CurrentEvidence {
  element: Element;
  capture: TargetEvidenceCapture;
}

export function startTargetPicker(options: TargetPickerOptions): TargetPicker {
  const doc = options.root ?? document;
  const variantStateId = normalizeTargetStateId(options.stateId);
  const outline = createOutline(doc);
  const label = createHoverLabel(doc);
  const labelText = label.querySelector<HTMLElement>('[data-lodariq-bridge="target-label-text"]')!;
  const pickerActions = createPickerActions(doc);
  const controls = createWeakTargetCard(doc);
  const cursor = createPickerCursorStyle(doc);
  const previousPickerState = doc.documentElement.getAttribute('data-lodariq-target-picker');

  doc.documentElement.setAttribute('data-lodariq-target-picker', 'active');
  doc.head.appendChild(cursor);
  doc.body.append(outline, label, controls, pickerActions);

  let currentCandidates: Element[] = [];
  let currentCandidateKey = '';
  let currentIndex = 0;
  let current: Element | null = null;
  let currentEvidence: CurrentEvidence | null = null;
  let activeProbe: PassiveTargetProbe | null = null;
  let pendingWeakResult: TargetPickResult | null = null;
  let committedElement: Element | null = null;
  let clickThroughNext = false;
  let manualTargetOverride = false;
  let showingInitialTarget = Boolean(options.initialTarget);
  let done = false;
  let elementSequence = 0;
  const elementIds = new WeakMap<Element, number>();

  const cleanup = (preserveProbe = false): void => {
    if (done) return;
    done = true;
    doc.removeEventListener('pointerover', onPointer, true);
    doc.removeEventListener('pointermove', onPointer, true);
    doc.removeEventListener('pointerdown', suppressProductEvent, true);
    doc.removeEventListener('pointerup', suppressProductEvent, true);
    doc.removeEventListener('mousedown', suppressProductEvent, true);
    doc.removeEventListener('mouseup', suppressProductEvent, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    controls.removeEventListener('click', onControlClick);
    pickerActions.removeEventListener('click', onPickerActionClick);
    if (!preserveProbe) activeProbe?.cancel();
    if (previousPickerState === null) {
      doc.documentElement.removeAttribute('data-lodariq-target-picker');
    } else {
      doc.documentElement.setAttribute('data-lodariq-target-picker', previousPickerState);
    }
    outline.remove();
    label.remove();
    controls.remove();
    pickerActions.remove();
    cursor.remove();
  };

  const cancel = (): void => {
    if (done) return;
    cleanup();
    options.onCancel?.();
  };

  function onPointer(event: Event): void {
    if (isBridgeEvent(event) || pendingWeakResult) return;
    const target = targetsFromEvent(event);
    if (target.blocked) {
      doc.documentElement.setAttribute('data-lodariq-target-picker', 'blocked');
      outline.style.display = 'none';
      controls.style.display = 'none';
      showLabel(authoringText('Lodariq editor\nChoose an element on the page'), event);
      return;
    }
    doc.documentElement.setAttribute('data-lodariq-target-picker', 'active');
    if (!target.elements.length) {
      hideTargetUi();
      return;
    }
    const key = candidateKey(target.elements);
    if (key !== currentCandidateKey) {
      currentCandidateKey = key;
      currentIndex = target.preferredIndex;
      manualTargetOverride = false;
      showingInitialTarget = false;
    } else {
      currentIndex = Math.min(currentIndex, target.elements.length - 1);
    }
    currentCandidates = target.elements;
    renderCurrentTarget();
  }

  function renderCurrentTarget(): void {
    current = currentCandidates[currentIndex] ?? null;
    if (!current) {
      hideTargetUi();
      return;
    }
    const rect = current.getBoundingClientRect();
    positionPickerActionsAwayFromTarget(pickerActions, rect, doc);
    outline.style.display = 'block';
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    controls.style.display = 'none';
    showLabel(hoverLabelFor(current, showingInitialTarget), rect);
    startEvidenceProbe(current);
  }

  function startEvidenceProbe(element: Element): void {
    if (currentEvidence?.element === element) return;
    activeProbe?.cancel();
    const initialCapture = captureTargetEvidence(element, undefined, {
      locale: options.locale,
      requiredAction: options.requiredAction,
      ...(variantStateId ? { stateId: variantStateId } : {}),
      targetId: options.initialIdentity?.targetId,
    });
    currentEvidence = {
      element,
      capture: mergeTargetCaptureVariants(options.initialIdentity, initialCapture),
    };
    activeProbe = observeTargetEvidence(element, initialCapture, {
      locale: options.locale,
      requiredAction: options.requiredAction,
      ...(variantStateId ? { stateId: variantStateId } : {}),
      targetId: initialCapture.identity.targetId,
      onUpdate: (updatedCapture) => {
        const capture = mergeTargetCaptureVariants(options.initialIdentity, updatedCapture);
        if (currentEvidence?.element === element) {
          currentEvidence = { element, capture };
        }
        if (committedElement === element) {
          options.onEvidenceUpdate?.({ element, ...capture });
        }
        if (pendingWeakResult?.element === element) {
          pendingWeakResult = { element, ...capture };
          updateWeakTargetCard(pendingWeakResult.identity);
        }
      },
    });
  }

  function hideTargetUi(): void {
    outline.style.display = 'none';
    label.style.display = 'none';
    controls.style.display = 'none';
  }

  function showLabel(text: string, anchor: Event | RectAnchor): void {
    const point = labelPoint(anchor);
    labelText.textContent = text;
    label.style.display = 'block';
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;
  }

  function showWeakTargetCard(result: TargetPickResult): void {
    pendingWeakResult = result;
    label.style.display = 'none';
    const rect = result.element.getBoundingClientRect();
    const point = overlayPoint(rect, {
      preferredWidth: TARGET_CARD_WIDTH,
      estimatedHeight: 250,
      offset: 10,
    });
    controls.style.display = 'grid';
    controls.style.left = `${point.x}px`;
    controls.style.top = `${point.y}px`;
    updateWeakTargetCard(result.identity);
  }

  function updateWeakTargetCard(identity: TargetIdentityV2): void {
    const similar = identity.captureEvidence.uniqueCandidateCount !== 1;
    const title = controls.querySelector<HTMLElement>('[data-lodariq-bridge="target-card-title"]');
    const copy = controls.querySelector<HTMLElement>('[data-lodariq-bridge="target-card-copy"]');
    const details = controls.querySelector<HTMLElement>(
      '[data-lodariq-bridge="target-card-technical-copy"]',
    );
    if (title) {
      title.textContent = similar
        ? authoringText('Choose a more specific area')
        : authoringText('This placement may change');
    }
    if (copy) {
      copy.textContent = similar
        ? authoringText(
            'A few places look the same. You can keep this in the draft, but release stays blocked until the placement is specific.',
          )
        : authoringText(
            'You can keep this in the draft, but release stays blocked until Lodariq can verify it.',
          );
    }
    if (details) {
      const evidence = identity.captureEvidence;
      details.textContent = authoringText(
        'Passive samples: {samples}. Similar places: {places}. Stable cue groups: {groups}.',
        {
          samples: evidence.sampleCount,
          places: evidence.uniqueCandidateCount,
          groups: evidence.stableSignalFamilies.length,
        },
      );
    }
    const smaller = controls.querySelector<HTMLButtonElement>('[data-action="deeper"]');
    const larger = controls.querySelector<HTMLButtonElement>('[data-action="parent"]');
    if (smaller) smaller.disabled = currentIndex <= 0;
    if (larger) larger.disabled = currentIndex >= currentCandidates.length - 1;
  }

  function labelPoint(anchor: Event | RectAnchor): { x: number; y: number } {
    if ('left' in anchor) {
      return overlayPoint(anchor, { preferredWidth: 220, estimatedHeight: 64, offset: 8 });
    }
    if (anchor instanceof MouseEvent) {
      return { x: anchor.clientX + 12, y: anchor.clientY + 12 };
    }
    return { x: 12, y: 12 };
  }

  function overlayPoint(
    anchor: RectAnchor,
    placement: { preferredWidth: number; estimatedHeight: number; offset: number },
  ): { x: number; y: number } {
    const viewportWidth = doc.defaultView?.innerWidth ?? anchor.left + placement.preferredWidth;
    const viewportHeight = doc.defaultView?.innerHeight ?? anchor.top + placement.estimatedHeight;
    const rightX = anchor.left + anchor.width + placement.offset;
    if (rightX + placement.preferredWidth <= viewportWidth - 8) {
      return {
        x: rightX,
        y: clamp(anchor.top, 8, viewportHeight - placement.estimatedHeight - 8),
      };
    }
    const belowY = anchor.top + anchor.height + placement.offset;
    if (belowY + placement.estimatedHeight <= viewportHeight - 8) {
      return {
        x: clamp(anchor.left, 8, viewportWidth - placement.preferredWidth - 8),
        y: belowY,
      };
    }
    return {
      x: clamp(anchor.left, 8, viewportWidth - placement.preferredWidth - 8),
      y: Math.max(8, anchor.top - placement.estimatedHeight - placement.offset),
    };
  }

  function onControlClick(event: Event): void {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset['action'];
    if (action === 'use') {
      if (pendingWeakResult) finishPick(pendingWeakResult);
      return;
    }
    if (action === 'pick-another') {
      pendingWeakResult = null;
      controls.style.display = 'none';
      if (current) showLabel(hoverLabelFor(current, false), current.getBoundingClientRect());
      return;
    }
    if (action === 'parent') {
      chooseTrailIndex(Math.min(currentIndex + 1, currentCandidates.length - 1));
      return;
    }
    if (action === 'deeper') {
      chooseTrailIndex(Math.max(currentIndex - 1, 0));
    }
  }

  function chooseTrailIndex(index: number): void {
    pendingWeakResult = null;
    currentIndex = index;
    manualTargetOverride = true;
    currentEvidence = null;
    controls.style.display = 'none';
    renderCurrentTarget();
  }

  function onPickerActionClick(event: Event): void {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset['action'];
    if (action === 'cancel') {
      cancel();
      return;
    }
    if (action === 'click-through') {
      pendingWeakResult = null;
      clickThroughNext = true;
      controls.style.display = 'none';
      showLabel(
        authoringText('Interact with the page\nYour next click will not choose a placement'),
        current?.getBoundingClientRect() ?? { left: 12, top: 56, width: 0, height: 0 },
      );
    }
  }

  function suppressProductEvent(event: Event): void {
    if (isBridgeEvent(event) || clickThroughNext || clickThroughModifier(event)) return;
    if (!targetsFromEvent(event).elements.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onClick(event: MouseEvent): void {
    if (isBridgeEvent(event)) return;
    if (clickThroughNext || clickThroughModifier(event)) {
      clickThroughNext = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = targetsFromEvent(event);
    const fallback = target.elements[target.preferredIndex];
    pickCurrentTarget(event, fallback);
  }

  function pickCurrentTarget(event?: MouseEvent, fallback?: Element): void {
    const candidate = current ?? fallback;
    if (!candidate) return;
    const selected = manualTargetOverride
      ? candidate
      : normalizeTargetElement(fallback ?? candidate);
    if (current !== selected) {
      current = selected;
      currentEvidence = null;
      startEvidenceProbe(selected);
    }
    const sampledCapture =
      currentEvidence?.element === selected
        ? currentEvidence.capture
        : mergeTargetCaptureVariants(
            options.initialIdentity,
            captureTargetEvidence(selected, event, {
              locale: options.locale,
              requiredAction: options.requiredAction,
              ...(variantStateId ? { stateId: variantStateId } : {}),
              targetId: options.initialIdentity?.targetId,
            }),
          );
    const result: TargetPickResult = {
      element: selected,
      fingerprint: captureElementFingerprint(selected, event),
      identity: sampledCapture.identity,
    };
    if (captureNeedsConfirmation(result.identity)) {
      showWeakTargetCard(result);
      return;
    }
    finishPick(result);
  }

  function finishPick(result: TargetPickResult): void {
    if (done) return;
    committedElement = result.element;
    cleanup(Boolean(options.onEvidenceUpdate));
    options.onPick(result);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
  }

  function candidateKey(elements: readonly Element[]): string {
    return elements
      .map((element) => {
        let id = elementIds.get(element);
        if (id === undefined) {
          elementSequence += 1;
          id = elementSequence;
          elementIds.set(element, id);
        }
        return String(id);
      })
      .join('>');
  }

  doc.addEventListener('pointerover', onPointer, true);
  doc.addEventListener('pointermove', onPointer, true);
  doc.addEventListener('pointerdown', suppressProductEvent, true);
  doc.addEventListener('pointerup', suppressProductEvent, true);
  doc.addEventListener('mousedown', suppressProductEvent, true);
  doc.addEventListener('mouseup', suppressProductEvent, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);
  controls.addEventListener('click', onControlClick);
  pickerActions.addEventListener('click', onPickerActionClick);

  if (options.initialTarget) {
    const trail = targetHierarchyFromElement(options.initialTarget);
    currentCandidates = trail.elements;
    currentIndex = trail.preferredIndex;
    currentCandidateKey = candidateKey(currentCandidates);
    renderCurrentTarget();
  }

  return { cancel };
}

function createOutline(doc: Document): HTMLDivElement {
  const outline = doc.createElement('div');
  outline.dataset['lodariqBridge'] = 'target-outline';
  outline.setAttribute('aria-hidden', 'true');
  Object.assign(outline.style, {
    position: 'fixed',
    zIndex: String(PICKER_Z_INDEX),
    pointerEvents: 'none',
    border: `2px solid ${CREATOR_CHROME_TOKENS.focus}`,
    borderRadius: '8px',
    boxShadow: '0 0 0 4px rgba(61, 232, 176, 0.2)',
    display: 'none',
  });
  return outline;
}

function createHoverLabel(doc: Document): HTMLDivElement {
  const label = doc.createElement('div');
  label.dataset['lodariqBridge'] = 'target-label';
  label.setAttribute('aria-hidden', 'true');
  Object.assign(label.style, {
    position: 'fixed',
    zIndex: String(PICKER_Z_INDEX + 1),
    pointerEvents: 'none',
    display: 'none',
    maxWidth: '220px',
    padding: '7px 9px',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '9px',
    background: CREATOR_CHROME_TOKENS.chrome,
    color: CREATOR_CHROME_TOKENS.onChrome,
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.4)',
    font: `600 12px/1.35 ${CREATOR_CHROME_FONT_STACK}`,
    whiteSpace: 'pre-line',
  });
  const labelText = doc.createElement('div');
  labelText.dataset['lodariqBridge'] = 'target-label-text';
  label.appendChild(labelText);
  return label;
}

function createPickerActions(doc: Document): HTMLDivElement {
  const actions = doc.createElement('div');
  applyAuthoringLocale(actions);
  actions.dataset['lodariqBridge'] = 'target-picker-actions';
  Object.assign(actions.style, {
    position: 'fixed',
    top: '14px',
    left: '14px',
    zIndex: String(PICKER_Z_INDEX + 2),
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    pointerEvents: 'auto',
    font: `700 12px/1 ${CREATOR_CHROME_FONT_STACK}`,
  });
  actions.innerHTML = `
    <button type="button" data-lodariq-bridge="target-interact" data-action="click-through" aria-label="${authoringText('Interact with the page once')}">${authoringText('Interact first')}</button>
    <button type="button" data-lodariq-bridge="target-cancel" data-action="cancel" aria-label="${authoringText('Cancel placement selection')}">${authoringText('Cancel')}</button>
  `;
  for (const button of actions.querySelectorAll<HTMLButtonElement>('button')) {
    Object.assign(button.style, {
      minHeight: '40px',
      padding: '0 15px',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '999px',
      background: CREATOR_CHROME_TOKENS.chrome,
      color: CREATOR_CHROME_TOKENS.ink,
      boxShadow: '0 10px 28px rgba(0, 0, 0, 0.4)',
      cursor: 'pointer',
      font: 'inherit',
    });
  }
  return actions;
}

function positionPickerActionsAwayFromTarget(
  actions: HTMLElement,
  target: RectAnchor,
  doc: Document,
): void {
  const margin = 14;
  const clearance = 10;
  const viewportWidth = doc.defaultView?.innerWidth ?? doc.documentElement.clientWidth;
  const viewportHeight = doc.defaultView?.innerHeight ?? doc.documentElement.clientHeight;
  const actionRect = actions.getBoundingClientRect();
  const width = actionRect.width;
  const height = actionRect.height;
  // The authoring panel collapses into a bottom-center chip while picking, so
  // the action pills stack above it instead of on top of it.
  const collapsedPanelClearance = 44 + 12;
  const centeredX = Math.max(margin, (viewportWidth - width) / 2);
  const bottomY = viewportHeight - height - margin - collapsedPanelClearance;
  const positions = [
    { x: centeredX, y: bottomY },
    { x: centeredX, y: margin },
    { x: viewportWidth - width - margin, y: bottomY },
    { x: margin, y: bottomY },
  ];
  const expandedTarget = {
    left: target.left - clearance,
    top: target.top - clearance,
    right: target.left + target.width + clearance,
    bottom: target.top + target.height + clearance,
  };
  const position =
    positions.find((candidate) => {
      const right = candidate.x + width;
      const bottom = candidate.y + height;
      return (
        right <= expandedTarget.left ||
        candidate.x >= expandedTarget.right ||
        bottom <= expandedTarget.top ||
        candidate.y >= expandedTarget.bottom
      );
    }) ?? positions[0]!;

  actions.style.inset = 'auto';
  actions.style.left = `${Math.max(margin, position.x)}px`;
  actions.style.top = `${Math.max(margin, position.y)}px`;
}

function createWeakTargetCard(doc: Document): HTMLDivElement {
  const controls = doc.createElement('div');
  applyAuthoringLocale(controls);
  controls.dataset['lodariqBridge'] = 'target-controls';
  controls.setAttribute('role', 'dialog');
  controls.setAttribute('aria-label', authoringText('Review placement'));
  Object.assign(controls.style, {
    position: 'fixed',
    zIndex: String(PICKER_Z_INDEX + 1),
    pointerEvents: 'auto',
    display: 'none',
    gap: '10px',
    width: `min(${TARGET_CARD_WIDTH}px, calc(100vw - 24px))`,
    padding: '14px',
    border: `1px solid ${CREATOR_CHROME_TOKENS.border}`,
    borderRadius: '14px',
    background: CREATOR_CHROME_TOKENS.surface,
    color: CREATOR_CHROME_TOKENS.ink,
    boxShadow: '0 18px 44px rgba(0, 0, 0, 0.44)',
    font: `12px/1.45 ${CREATOR_CHROME_FONT_STACK}`,
  });
  controls.innerHTML = `
    <div data-lodariq-bridge="target-card-header" style="display:grid; gap: 4px;">
      <strong data-lodariq-bridge="target-card-title" style="font-size: 14px; line-height:1.3;">${authoringText('This placement may change')}</strong>
      <span data-lodariq-bridge="target-card-copy" style="color:${CREATOR_CHROME_TOKENS.muted};">${authoringText('Lodariq may have trouble finding this after the page changes.')}</span>
    </div>
    <div data-lodariq-bridge="target-card-actions" style="display:grid; grid-template-columns:1fr 1fr; gap: 8px;">
      <button type="button" data-lodariq-bridge="target-control" data-action="use">${authoringText('Keep in draft')}</button>
      <button type="button" data-lodariq-bridge="target-control" data-action="pick-another">${authoringText('Choose another')}</button>
    </div>
    <details data-lodariq-bridge="target-card-details" style="border-top:1px solid ${CREATOR_CHROME_TOKENS.border}; padding-top: 8px; color:${CREATOR_CHROME_TOKENS.muted};">
      <summary data-lodariq-bridge="target-card-summary" style="cursor:pointer; font-weight: 700; color:${CREATOR_CHROME_TOKENS.ink};">${authoringText('Troubleshooting details')}</summary>
      <p data-lodariq-bridge="target-card-technical-copy" style="margin: 8px 0;">${authoringText('Lodariq is checking this placement.')}</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap: 8px;">
        <button type="button" data-lodariq-bridge="target-control" data-action="deeper">${authoringText('Smaller area')}</button>
        <button type="button" data-lodariq-bridge="target-control" data-action="parent">${authoringText('Larger area')}</button>
      </div>
    </details>
  ils>
  `;
  for (const button of controls.querySelectorAll<HTMLButtonElement>('button')) {
    Object.assign(button.style, {
      minHeight: '40px',
      padding: '7px 9px',
      border: '1px solid rgba(255, 255, 255, 0.14)',
      borderRadius: '9px',
      background: 'transparent',
      color: CREATOR_CHROME_TOKENS.ink,
      font: 'inherit',
      fontWeight: '600',
      cursor: 'pointer',
    });
  }
  const useButton = controls.querySelector<HTMLButtonElement>('[data-action="use"]');
  if (useButton) {
    Object.assign(useButton.style, {
      borderColor: CREATOR_CHROME_TOKENS.action,
      background: CREATOR_CHROME_TOKENS.action,
      color: CREATOR_CHROME_TOKENS.onAction,
      fontWeight: '700',
    });
  }
  return controls;
}

function createPickerCursorStyle(doc: Document): HTMLStyleElement {
  return createNonceStyleElement(
    doc,
    `
      html[data-lodariq-target-picker="active"],
      html[data-lodariq-target-picker="active"] body,
      html[data-lodariq-target-picker="active"] body * {
        cursor: crosshair !important;
      }

      html[data-lodariq-target-picker="blocked"],
      html[data-lodariq-target-picker="blocked"] body,
      html[data-lodariq-target-picker="blocked"] body * {
        cursor: not-allowed !important;
      }

      html[data-lodariq-target-picker] [data-lodariq-bridge] {
        cursor: default !important;
      }

      html[data-lodariq-target-picker] button[data-lodariq-bridge],
      html[data-lodariq-target-picker] summary[data-lodariq-bridge] {
        cursor: pointer !important;
      }

      html[data-lodariq-target-picker] button[data-lodariq-bridge]:disabled {
        cursor: not-allowed !important;
        opacity: 0.45;
      }
    `,
  );
}

function targetsFromEvent(event: Event): TargetFromEventResult {
  const eventElements: Element[] = [];
  for (const item of event.composedPath()) {
    if (!(item instanceof Element)) continue;
    if (item.hasAttribute('data-lodariq-bridge')) continue;
    if (isAuthoringChrome(item)) return { elements: [], preferredIndex: 0, blocked: true };
    if (isDocumentBoundary(item)) continue;
    eventElements.push(item);
  }
  if (!eventElements.length) return { elements: [], preferredIndex: 0, blocked: false };
  return {
    ...candidateTrail(eventElements, normalizeTargetElement(eventElements[0]!)),
    blocked: false,
  };
}

function targetHierarchyFromElement(element: Element): CandidateTrail {
  const elements: Element[] = [];
  let current: Element | null = element;
  while (current) {
    if (isDocumentBoundary(current) || current.hasAttribute('data-lodariq-bridge')) break;
    if (isAuthoringChrome(current)) break;
    elements.push(current);
    current = composedParentElement(current);
  }
  return candidateTrail(elements, normalizeTargetElement(element));
}

function candidateTrail(eventElements: readonly Element[], preferred: Element): CandidateTrail {
  const elements = [...eventElements];
  let preferredIndex = elements.indexOf(preferred);
  if (preferredIndex < 0) {
    elements.unshift(preferred);
    preferredIndex = 0;
  }
  return { elements: uniqueElements(elements), preferredIndex };
}

function uniqueElements(elements: readonly Element[]): Element[] {
  const seen = new Set<Element>();
  return elements.filter((element) => {
    if (seen.has(element)) return false;
    seen.add(element);
    return true;
  });
}

function hoverLabelFor(element: Element, currentPlacement: boolean): string {
  const name = localizedLabelOf(element)?.replace(/\s+/g, ' ').trim();
  const role = roleOf(element) ?? element.tagName.toLowerCase();
  const title = name ? `“${truncate(name, 72)}”` : humanizeToken(role);
  return currentPlacement
    ? authoringText('Current placement · {title}\nClick to keep or choose another', { title })
    : authoringText('{title}\nClick to attach', { title });
}

function isAuthoringChrome(element: Element): boolean {
  return Boolean(
    element.closest(
      'lodariq-authoring-panel, [data-lodariq-authoring-trigger="true"], [data-lodariq-creator-launcher="true"]',
    ),
  );
}

function isBridgeEvent(event: Event): boolean {
  return event.composedPath().some((item) => {
    return item instanceof Element && item.hasAttribute('data-lodariq-bridge');
  });
}

function clickThroughModifier(event: Event): boolean {
  return event instanceof MouseEvent && event.altKey;
}

function composedParentElement(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return isShadowRoot(root) ? root.host : null;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && 'host' in node;
}

function isDocumentBoundary(element: Element): boolean {
  return (
    element === element.ownerDocument.documentElement || element === element.ownerDocument.body
  );
}

function humanizeToken(value: string): string {
  const words = value.replace(/[-_]+/g, ' ').trim();
  return words
    ? `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`
    : authoringText('Page element');
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
