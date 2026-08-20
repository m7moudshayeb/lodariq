/**
 * Builds the accessible-tree context a step draft is generated from (§7.4).
 *
 * Deliberately not a screenshot: the accessible tree is smaller, cheaper, more
 * accurate, and it does not ship page pixels anywhere. Only the accessible name,
 * the role word, and a bounded slice of nearby text leave the page — no selectors,
 * class names, markup, URLs or coordinates (ADR-0013, ADR-0016).
 */
import { describeTarget } from './legibility';
import type { AiTargetContext } from '../../authoring/ai/assist-contract';

/** Enough for a heading and a sentence; more is noise the model pays for. */
export const DRAFT_NEARBY_TEXT_MAX_CHARS = 280;

export function targetDraftContext(element: Element): AiTargetContext {
  const description = describeTarget(element);
  const nearbyText = nearbyTextOf(element);
  return {
    accessibleName: description.name ?? '',
    role: description.kind,
    ...(nearbyText ? { nearbyText } : {}),
  };
}

/**
 * Text from the nearest meaningful container, minus the target's own label so the
 * draft is not just an echo of the button it points at.
 */
function nearbyTextOf(element: Element): string {
  const container = element.closest('section, article, form, dialog, main, nav') ?? element.parentElement;
  const own = (element.textContent ?? '').trim();
  const all = (container?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  const withoutOwn = own ? all.replace(own, ' ') : all;
  return withoutOwn.replace(/\s+/gu, ' ').trim().slice(0, DRAFT_NEARBY_TEXT_MAX_CHARS);
}

/**
 * A target with no accessible name cannot produce a good draft. Surfacing that as
 * a nudge rather than a silent bad result is the quiet accessibility win in §7.4.
 */
export function draftContextIsWeak(context: AiTargetContext): boolean {
  return context.accessibleName.length === 0;
}
