import type { ElementFingerprint, TargetIdentityV2, TargetSelectionPolicy } from '@lodariq/schema';
import { createNonceStyleElement } from '@lodariq/schema/dom';
import { describeTarget, pickBigger, pickSmaller } from './targeting/legibility';
import {
  lookAlikeQuestion,
  matchCountLabel,
  type LookAlikeOption,
} from './targeting/disambiguation';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import { startPageFreeze } from './targeting/page-freeze';
import { createPickerBand } from './targeting/picker-band';
import {
  AUTHORING_TYPOGRAPHY_CSS_PROPERTIES,
  CREATOR_CHROME_CONTROL_TOKENS,
  CREATOR_CHROME_FONT_STACK,
  CREATOR_CHROME_GLASS,
  CREATOR_CHROME_STATUS_TOKENS,
  CREATOR_CHROME_TOKENS,
} from '../creator-chrome-tokens';
import { applyAuthoringLocale, authoringText } from '../i18n';
import {
  ambiguousCandidates,
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
  /** Author's answer to the disambiguation question, when one was asked. */
  selection?: TargetSelectionPolicy;
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

/**
 * One picker per document. Two concurrent pickers would fight over the outline,
 * the freeze listeners and the click suppression, so starting a new one retires
 * the old one first — in the product and in tests alike.
 */
const activePickers = new WeakMap<Document, () => void>();

export function startTargetPicker(options: TargetPickerOptions): TargetPicker {
  const doc = options.root ?? document;
  activePickers.get(doc)?.();
  const variantStateId = normalizeTargetStateId(options.stateId);
  const outline = createOutline(doc);
  const label = createHoverLabel(doc);
  const labelText = label.querySelector<HTMLElement>('[data-lodariq-bridge="target-label-text"]')!;
  const controls = createWeakTargetCard(doc);
  /**
   * The bands are the picker's self-announcement (§3.3) and the home of the
   * visible controls that replace DevTools' modifier chords (§4.4a).
   */
  const band = createPickerBand(doc, PICKER_Z_INDEX + 3, {
    onCancel: () => cancel(),
    onPickBigger: () => stepTrail('bigger'),
    onPickSmaller: () => stepTrail('smaller'),
    // Without this, an ancestor reached through the trail could only be
    // committed by clicking the page again — which re-picks whatever is there.
    onUseThis: () => pickCurrentTarget(),
    /*
     * Freeze is a mode, not a one-shot. It pinned whatever was already open and
     * then reported `frozen()`, so pressing it with no menu on screen did
     * nothing visible at all. Every layer that opens from here is pinned by the
     * observer for the picker's whole life, which is what the creator asked for.
     */
    onFreeze: () => {
      freeze.freezeNow();
      band.setFrozen(true);
    },
    onUnfreeze: () => {
      freeze.unfreeze();
      band.setFrozen(false);
    },
    onInteractOnce: () => {
      pendingWeakResult = null;
      clickThroughNext = true;
      controls.style.display = 'none';
      showLabel(
        authoringText('Interact with the page\nYour next click will not choose a placement'),
        current?.getBoundingClientRect() ?? { left: 12, top: 56, width: 0, height: 0 },
      );
    },
    onCrumb: (element) => selectElement(element),
    onCrumbHover: (element) => previewElement(element),
  });
  /**
   * Automatic avoidance first (§4.4a): a menu that opens while picking is frozen
   * before the creator notices it would have closed.
   */
  const freeze = startPageFreeze({
    root: doc,
    ignore: (element) => Boolean(element.closest('[data-lodariq-bridge]')) || isAuthoringChrome(element),
    onFroze: () => band.setFrozen(true),
  });
  const cursor = createPickerCursorStyle(doc);
  const previousPickerState = doc.documentElement.getAttribute('data-lodariq-target-picker');

  doc.documentElement.setAttribute('data-lodariq-target-picker', 'active');
  doc.head.appendChild(cursor);
  doc.body.append(outline, label, controls, ...band.elements);

  let currentCandidates: Element[] = [];
  let currentCandidateKey = '';
  let currentIndex = 0;
  let current: Element | null = null;
  let currentEvidence: CurrentEvidence | null = null;
  let ambiguousCache: { element: Element; candidates: readonly Element[] } | null = null;
  let activeProbe: PassiveTargetProbe | null = null;
  let pendingWeakResult: TargetPickResult | null = null;
  let lookAlikeOptions: readonly LookAlikeOption[] = [];
  let committedElement: Element | null = null;
  let clickThroughNext = false;
  let manualTargetOverride = false;
  let showingInitialTarget = Boolean(options.initialTarget);
  let done = false;
  let elementSequence = 0;
  const elementIds = new WeakMap<Element, number>();

  const retire = (): void => cleanup();
  const cleanup = (preserveProbe = false): void => {
    if (done) return;
    done = true;
    if (activePickers.get(doc) === retire) activePickers.delete(doc);
    doc.removeEventListener('pointerover', onPointer, true);
    doc.removeEventListener('pointermove', onPointer, true);
    doc.removeEventListener('pointerdown', suppressProductEvent, true);
    doc.removeEventListener('pointerup', suppressProductEvent, true);
    doc.removeEventListener('mousedown', suppressProductEvent, true);
    doc.removeEventListener('mouseup', suppressProductEvent, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    controls.removeEventListener('click', onControlClick);
    if (!preserveProbe) activeProbe?.cancel();
    if (previousPickerState === null) {
      doc.documentElement.removeAttribute('data-lodariq-target-picker');
    } else {
      doc.documentElement.setAttribute('data-lodariq-target-picker', previousPickerState);
    }
    freeze.stop();
    band.destroy();
    outline.remove();
    label.remove();
    controls.remove();
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
    // A crumb preview leaves the alternate tint behind otherwise.
    outline.style.borderColor = CREATOR_CHROME_TOKENS.action;
    outline.style.background = `color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 14%, transparent)`;
    outline.style.display = 'block';
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    controls.style.display = 'none';
    // Evidence first: the hover card's look-alike count has to come from the
    // same capture the weak-target blocker reads, or it promises "1 of 1" and
    // is contradicted one click later.
    startEvidenceProbe(current);
    showTargetCard(current, showingInitialTarget, rect);
    band.setTarget(current);
  }

  /** `Pick bigger` / `Pick smaller` — one level per click, box-first (§4.4). */
  function stepTrail(direction: 'bigger' | 'smaller'): void {
    if (!current) return;
    const next = direction === 'bigger' ? pickBigger(current) : pickSmaller(current);
    if (next) selectElement(next);
  }

  /** A crumb click is a pick, so it goes through the same trail as a hover. */
  function selectElement(element: Element): void {
    pendingWeakResult = null;
    manualTargetOverride = true;
    currentEvidence = null;
    currentCandidates = [element];
    currentCandidateKey = '';
    currentIndex = 0;
    showingInitialTarget = false;
    renderCurrentTarget();
  }

  /** Hovering a crumb previews its highlight in the alternate tint (§4.4). */
  function previewElement(element: Element | null): void {
    const rect = (element ?? current)?.getBoundingClientRect();
    if (!rect) return;
    const preview = Boolean(element) && element !== current;
    outline.style.borderColor = preview
      ? CREATOR_CHROME_STATUS_TOKENS.attention
      : CREATOR_CHROME_TOKENS.action;
    outline.style.background = `color-mix(in srgb, ${
      preview ? CREATOR_CHROME_STATUS_TOKENS.attention : CREATOR_CHROME_TOKENS.action
    } 14%, transparent)`;
    outline.style.display = 'block';
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
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
    ambiguousCache = null;
    activeProbe = observeTargetEvidence(element, initialCapture, {
      locale: options.locale,
      requiredAction: options.requiredAction,
      ...(variantStateId ? { stateId: variantStateId } : {}),
      targetId: initialCapture.identity.targetId,
      onUpdate: (updatedCapture) => {
        const capture = mergeTargetCaptureVariants(options.initialIdentity, updatedCapture);
        if (currentEvidence?.element === element) {
          currentEvidence = { element, capture };
          ambiguousCache = null;
        }
        if (committedElement === element) {
          options.onEvidenceUpdate?.({ element, ...capture });
        }
        if (pendingWeakResult?.element === element) {
          // A later sample re-describes the element; it does not un-answer the
          // disambiguation question the creator already answered.
          const answered = pendingWeakResult.selection;
          pendingWeakResult = {
            element,
            ...capture,
            ...(answered ? { selection: answered } : {}),
          };
          updateWeakTargetCard(pendingWeakResult.identity);
        }
      },
    });
  }

  function hideTargetUi(): void {
    outline.style.display = 'none';
    label.style.display = 'none';
    controls.style.display = 'none';
    band.setTarget(null);
  }

  function showLabel(text: string, anchor: Event | RectAnchor): void {
    const point = labelPoint(anchor);
    for (const part of ['title', 'size', 'count', 'hint'] as const) {
      labelPart(part).style.display = 'none';
    }
    labelText.style.display = 'block';
    labelText.textContent = text;
    label.style.display = 'block';
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;
  }

  /**
   * The look-alike set for whatever is under the pointer, when evidence for it
   * has already been captured. Falls back to nothing rather than re-capturing:
   * this runs on every pointer move.
   */
  function currentAmbiguousCandidates(element: Element): readonly Element[] | undefined {
    if (currentEvidence?.element !== element) return undefined;
    // Memoised: this is a whole-page scan plus a visual fingerprint per candidate,
    // and the caller runs on every pointermove, not on every new element.
    if (ambiguousCache?.element !== element) {
      ambiguousCache = {
        element,
        candidates: ambiguousCandidates(element, currentEvidence.capture.identity),
      };
    }
    return ambiguousCache.candidates;
  }

  function labelPart(name: string): HTMLElement {
    return label.querySelector<HTMLElement>(`[data-lodariq-bridge="target-label-${name}"]`)!;
  }

  /** The hover card proper: identity, size, look-alike count, and what a click does. */
  function showTargetCard(element: Element, currentPlacement: boolean, anchor: RectAnchor): void {
    const description = describeTarget(element);
    labelText.style.display = 'none';
    const title = labelPart('title');
    title.style.display = 'flex';
    title.querySelector<HTMLElement>('[data-lodariq-bridge="target-label-name"]')!.textContent =
      description.name
        ? `${description.kind} · ${truncate(description.name, 60)}`
        : description.kind;
    const size = labelPart('size');
    size.style.display = 'block';
    size.textContent = authoringText('{width} × {height}', {
      width: description.widthPx,
      height: description.heightPx,
    });
    // A target smaller than the tap minimum is padded at runtime; saying so here
    // is the only moment the creator can pick something bigger instead.
    if (Math.min(description.widthPx, description.heightPx) < TAP_TARGET_MIN_PX) {
      const warning = element.ownerDocument.createElement('span');
      warning.style.color = CREATOR_CHROME_STATUS_TOKENS.attention;
      warning.textContent = ` · ${authoringText('under {min}×{min}', { min: TAP_TARGET_MIN_PX })}`;
      size.appendChild(warning);
    }
    const count = labelPart('count');
    count.style.display = 'flex';
    count.textContent = matchCountLabel(element, {
      candidates: currentAmbiguousCandidates(element),
    });
    const hint = labelPart('hint');
    hint.style.display = 'block';
    hint.textContent = currentPlacement
      ? authoringText('Click to keep or choose another')
      : authoringText('Click to attach');
    const point = labelPoint(anchor);
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
    // `ambiguityIsSoleWeakness` is the flag that says an answer exists. A low
    // runner-up margin at one exact match is ambiguous too, and keying off the
    // count alone left that case blocked with nothing to click. Undefined on
    // capture written before the flag, so the count is still the fallback.
    const similar =
      identity.captureEvidence.ambiguityIsSoleWeakness ??
      identity.captureEvidence.uniqueCandidateCount !== 1;
    const title = controls.querySelector<HTMLElement>('[data-lodariq-bridge="target-card-title"]');
    const copy = controls.querySelector<HTMLElement>('[data-lodariq-bridge="target-card-copy"]');
    const details = controls.querySelector<HTMLElement>(
      '[data-lodariq-bridge="target-card-technical-copy"]',
    );
    const question =
      similar && pendingWeakResult
        ? lookAlikeQuestion(pendingWeakResult.element, {
            root: doc,
            candidates: ambiguousCandidates(pendingWeakResult.element, identity),
          })
        : null;
    renderLookAlikeChoices(question);
    /*
     * `similar` without a question means the candidates could not even be
     * enumerated — there is too little durable evidence to compare anything, so
     * there is no "which one" to ask and no more specific area to choose. Saying
     * "choose a more specific area" there sent creators looking for a smaller
     * box that does not exist; the honest ask is for something to identify it by.
     */
    if (title) {
      title.textContent = question ? question.headline : authoringText('This placement may change');
    }
    if (copy) {
      copy.textContent = question
        ? authoringText('Which one did you mean? Hover an answer to see what it matches.')
        : similar
          ? authoringText(
              'This page does not give Lodariq enough to tell this element apart. You can keep it in the draft, but release stays blocked.',
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

  /**
   * The answers to "which one did you mean", as buttons. Choosing one records an
   * author selection policy, which is what lets the resolver settle a genuine
   * tie deterministically instead of reporting it forever.
   */
  function renderLookAlikeChoices(question: ReturnType<typeof lookAlikeQuestion>): void {
    const host = controls.querySelector<HTMLElement>('[data-lodariq-bridge="target-card-choices"]');
    if (!host) return;
    if (!question) {
      host.style.display = 'none';
      host.replaceChildren();
      // Or `data-choice` would index answers for a question no longer on screen.
      lookAlikeOptions = [];
      return;
    }
    host.style.display = 'grid';
    host.replaceChildren();
    question.options.forEach((option, index) => {
      // Nothing is pre-selected. The previous default was the first option,
      // which was "just the one I clicked" — the one answer that cannot unblock
      // a release, silently pre-committed on the creator's behalf.
      const chosen = pendingWeakResult?.selection
        ? sameSelection(pendingWeakResult.selection, option.policy)
        : false;
      const button = doc.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(chosen));
      button.dataset['lodariqBridge'] = 'target-control';
      button.dataset['action'] = 'choose-look-alike';
      button.dataset['choice'] = String(index);
      button.textContent = option.caveat ? `${option.label} — ${option.caveat}` : option.label;
      Object.assign(button.style, {
        minHeight: '36px',
        padding: '7px 9px',
        textAlign: 'left',
        border: `1px solid ${chosen ? CREATOR_CHROME_TOKENS.action : 'rgba(255,255,255,0.14)'}`,
        borderRadius: '9px',
        background: chosen ? 'rgba(124,140,255,0.16)' : 'transparent',
        color: CREATOR_CHROME_TOKENS.ink,
        font: 'inherit',
        fontWeight: chosen ? '700' : '500',
        cursor: 'pointer',
      });
      button.addEventListener('pointerenter', () => previewSelection(option.policy));
      button.addEventListener('pointerleave', () => {
        if (current) previewElement(current);
      });
      host.appendChild(button);
    });
    lookAlikeOptions = question.options;
  }

  /** Shows what an answer would actually match, before it is chosen. */
  function previewSelection(policy: TargetSelectionPolicy): void {
    if (!pendingWeakResult) return;
    const resolved = resolveTarget(
      {
        id: pendingWeakResult.identity.targetId,
        fingerprint: pendingWeakResult.fingerprint,
        identity: pendingWeakResult.identity,
        selection: policy,
      },
      doc,
    );
    if (resolved.element) previewElement(resolved.element);
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
    if (action === 'choose-look-alike') {
      const option = lookAlikeOptions[Number.parseInt(button.dataset['choice'] ?? '0', 10)];
      if (option && pendingWeakResult) {
        pendingWeakResult = { ...pendingWeakResult, selection: option.policy };
        updateWeakTargetCard(pendingWeakResult.identity);
      }
      return;
    }
    if (action === 'use') {
      if (pendingWeakResult) finishPick(pendingWeakResult);
      return;
    }
    if (action === 'pick-another') {
      pendingWeakResult = null;
      controls.style.display = 'none';
      if (current) showTargetCard(current, false, current.getBoundingClientRect());
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

  band.setTarget(null);
  if (options.initialTarget) {
    const trail = targetHierarchyFromElement(options.initialTarget);
    currentCandidates = trail.elements;
    currentIndex = trail.preferredIndex;
    currentCandidateKey = candidateKey(currentCandidates);
    renderCurrentTarget();
  }

  activePickers.set(doc, retire);
  return { cancel };
}

function createOutline(doc: Document): HTMLDivElement {
  const outline = doc.createElement('div');
  outline.dataset['lodariqBridge'] = 'target-outline';
  outline.setAttribute('aria-hidden', 'true');
  // §4.4's picking highlight is a tinted fill with a hairline, not the target
  // ring: a 2px ring here reads as "this is already the target".
  Object.assign(outline.style, {
    position: 'fixed',
    zIndex: String(PICKER_Z_INDEX),
    pointerEvents: 'none',
    border: `1px solid ${CREATOR_CHROME_TOKENS.action}`,
    borderRadius: '5px',
    background: `color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 14%, transparent)`,
    transition: 'all 0.09s linear',
    display: 'none',
  });
  return outline;
}

/**
 * §4.4's hover card: what this is, how big it is, how many things look like it,
 * and what a click will do. It is anchored to the element rather than to the
 * cursor, so the prototype's pin has nothing to fix and is left out.
 */
function createHoverLabel(doc: Document): HTMLDivElement {
  const label = doc.createElement('div');
  label.dataset['lodariqBridge'] = 'target-label';
  label.setAttribute('aria-hidden', 'true');
  Object.assign(label.style, {
    position: 'fixed',
    zIndex: String(PICKER_Z_INDEX + 1),
    pointerEvents: 'none',
    display: 'none',
    minWidth: '212px',
    maxWidth: '280px',
    padding: '9px 11px',
    border: `1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder}`,
    borderRadius: '9px',
    background: CREATOR_CHROME_CONTROL_TOKENS.menu,
    color: CREATOR_CHROME_TOKENS.ink,
    boxShadow: CREATOR_CHROME_GLASS.shadowRaised,
    font: `var(--lq-font-sm)/1.4 ${CREATOR_CHROME_FONT_STACK}`,
  });
  label.style.cssText += AUTHORING_TYPOGRAPHY_CSS_PROPERTIES;
  label.innerHTML = `
    <div data-lodariq-bridge="target-label-title" style="display:none;align-items:center;gap:6px;font:var(--lq-weight-semibold) var(--lq-font-sm)/1.3 ${CREATOR_CHROME_FONT_STACK};margin-bottom:4px">
      ${CROSSHAIR_GLYPH}<span data-lodariq-bridge="target-label-name"></span>
    </div>
    <div data-lodariq-bridge="target-label-size" style="display:none;color:${CREATOR_CHROME_TOKENS.muted};font-size:var(--lq-font-sm);line-height:1.55"></div>
    <div data-lodariq-bridge="target-label-count" style="display:none;align-items:center;gap:6px;margin-top:7px;padding-top:7px;border-top:1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};color:${CREATOR_CHROME_TOKENS.action};font-size:var(--lq-font-sm)"></div>
    <div data-lodariq-bridge="target-label-hint" style="display:none;margin-top:6px;font-size:var(--lq-font-xs);color:${CREATOR_CHROME_TOKENS.subtle}"></div>
    <div data-lodariq-bridge="target-label-text" style="display:none;white-space:pre-line;font-weight:var(--lq-weight-semibold);font-size:var(--lq-font-sm)"></div>
  `;
  return label;
}

const CROSSHAIR_GLYPH =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';

/** Under this in either dimension, the runtime pads the hit area (§4.4). */
const TAP_TARGET_MIN_PX = 44;

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
    font: `var(--lq-font-sm)/1.45 ${CREATOR_CHROME_FONT_STACK}`,
  });
  controls.style.cssText += AUTHORING_TYPOGRAPHY_CSS_PROPERTIES;
  controls.innerHTML = `
    <div data-lodariq-bridge="target-card-header" style="display:grid; gap: 4px;">
      <strong data-lodariq-bridge="target-card-title" style="font-size: var(--lq-font-md); line-height:1.3;">${authoringText('This placement may change')}</strong>
      <span data-lodariq-bridge="target-card-copy" style="color:${CREATOR_CHROME_TOKENS.muted};">${authoringText('Lodariq may have trouble finding this after the page changes.')}</span>
    </div>
    <div data-lodariq-bridge="target-card-choices" role="radiogroup" style="display:none; gap:2px;"></div>
    <div data-lodariq-bridge="target-card-actions" style="display:grid; grid-template-columns:1fr 1fr; gap: 8px;">
      <button type="button" data-lodariq-bridge="target-control" data-action="use">${authoringText('Keep in draft')}</button>
      <button type="button" data-lodariq-bridge="target-control" data-action="pick-another">${authoringText('Choose another')}</button>
    </div>
    <details data-lodariq-bridge="target-card-details" style="border-top:1px solid ${CREATOR_CHROME_TOKENS.border}; padding-top: 8px; color:${CREATOR_CHROME_TOKENS.muted};">
      <summary data-lodariq-bridge="target-card-summary" style="cursor:pointer; font-weight: var(--lq-weight-bold); color:${CREATOR_CHROME_TOKENS.ink};">${authoringText('Troubleshooting details')}</summary>
      <p data-lodariq-bridge="target-card-technical-copy" style="margin: 8px 0;">${authoringText('Lodariq is checking this placement.')}</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap: 8px;">
        <button type="button" data-lodariq-bridge="target-control" data-action="deeper">${authoringText('Smaller area')}</button>
        <button type="button" data-lodariq-bridge="target-control" data-action="parent">${authoringText('Larger area')}</button>
      </div>
    </details>
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
      fontWeight: 'var(--lq-weight-semibold)',
      cursor: 'pointer',
    });
  }
  const useButton = controls.querySelector<HTMLButtonElement>('[data-action="use"]');
  if (useButton) {
    Object.assign(useButton.style, {
      borderColor: CREATOR_CHROME_TOKENS.action,
      background: CREATOR_CHROME_TOKENS.action,
      color: CREATOR_CHROME_TOKENS.onAction,
      fontWeight: 'var(--lq-weight-bold)',
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

/**
 * The hover card (§4.4), borrowed from DevTools and stripped of implementation
 * detail: what the thing is in plain language, its size, and how many things on
 * the page look like it. Never a selector, never DOM depth.
 *
 * The match count is the most useful number during picking and no DAP shows it.
 */
/** Two policies mean the same answer when their whole shape matches. */
function sameSelection(a: TargetSelectionPolicy, b: TargetSelectionPolicy): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
