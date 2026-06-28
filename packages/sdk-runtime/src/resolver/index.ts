import type { ElementFingerprint } from '@talmeh/schema';

/**
 * Confidence-scored semantic resolver (PRD §8.4).
 *
 * Candidates are SCORED, not resolved by an ordered CSS-first fallback chain.
 * Coordinates are diagnostic only and never trigger production clicks.
 */

export const MIN_CONFIDENCE = 60;
/** Top candidate must beat the runner-up by this margin to be unambiguous. */
export const AMBIGUITY_MARGIN = 20;

export type ResolutionState = 'found' | 'missing' | 'ambiguous';

export interface ResolutionResult {
  state: ResolutionState;
  element: Element | null;
  confidence: number;
  candidateCount: number;
  /** Highest-weight signal that contributed, for diagnostics (PRD §15). */
  resolutionMethod: string;
}

interface ScoredCandidate {
  element: Element;
  score: number;
  method: string;
}

function accessibleNameOf(el: Element): string | undefined {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const text = labelledby
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (text) return text;
  }
  const text = el.textContent?.trim();
  return text ? text : undefined;
}

function roleOf(el: Element): string | undefined {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') {
    const select = el as HTMLSelectElement;
    return select.multiple || select.size > 1 ? 'listbox' : 'combobox';
  }
  if (tag === 'input') {
    const inputType = (el.getAttribute('type') ?? 'text').toLowerCase();
    switch (inputType) {
      case 'button':
      case 'image':
      case 'reset':
      case 'submit':
        return 'button';
      case 'checkbox':
        return 'checkbox';
      case 'email':
      case 'password':
      case 'tel':
      case 'text':
      case 'url':
        return 'textbox';
      case 'number':
        return 'spinbutton';
      case 'radio':
        return 'radio';
      case 'range':
        return 'slider';
      case 'search':
        return 'searchbox';
      default:
        return 'textbox';
    }
  }
  return undefined;
}

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  if (el.hidden) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

/** Score a single candidate against the fingerprint per PRD §8.4 weights. */
export function scoreCandidate(
  fp: ElementFingerprint,
  el: Element,
): { score: number; method: string } {
  let score = 0;
  let method = 'none';

  for (const [name, value] of Object.entries(fp.stableAttributes)) {
    if (el.getAttribute(name) === value) {
      if (name === 'data-talmeh-id') {
        score += 100;
        method = 'talmeh_id';
      } else {
        score += 90;
        if (method === 'none') method = 'stable_attribute';
      }
    }
  }

  const role = roleOf(el);
  const accName = accessibleNameOf(el);
  if (fp.role && role === fp.role && fp.accessibleName && accName === fp.accessibleName) {
    score += 70;
    if (method === 'none') method = 'role_and_name';
  }

  const labelLike = fp.label ?? fp.placeholder ?? fp.title ?? fp.alt;
  if (
    labelLike &&
    (el.getAttribute('placeholder') === labelLike ||
      el.getAttribute('title') === labelLike ||
      el.getAttribute('alt') === labelLike ||
      accName === labelLike)
  ) {
    score += 65;
    if (method === 'none') method = 'label';
  }

  if (fp.tagName && el.tagName.toLowerCase() === fp.tagName.toLowerCase()) {
    score += 15;
  }

  if (fp.nearbyText?.length) {
    const haystack = el.parentElement?.textContent ?? '';
    if (fp.nearbyText.some((t) => haystack.includes(t))) score += 20;
  }

  return { score, method };
}

/**
 * Resolve a fingerprint to a live element within `root` (default: document).
 * Returns found / ambiguous / missing with confidence + diagnostics.
 */
export function resolve(fp: ElementFingerprint, root: ParentNode = document): ResolutionResult {
  const candidates: ScoredCandidate[] = [];
  for (const el of root.querySelectorAll('*')) {
    if (!isVisible(el)) continue;
    const { score, method } = scoreCandidate(fp, el);
    if (score > 0) candidates.push({ element: el, score, method });
  }

  candidates.sort((a, b) => b.score - a.score);
  const [top, second] = candidates;

  if (!top || top.score < MIN_CONFIDENCE) {
    return {
      state: 'missing',
      element: null,
      confidence: top?.score ?? 0,
      candidateCount: candidates.length,
      resolutionMethod: top?.method ?? 'none',
    };
  }

  if (second && top.score - second.score < AMBIGUITY_MARGIN) {
    return {
      state: 'ambiguous',
      element: null,
      confidence: top.score,
      candidateCount: candidates.length,
      resolutionMethod: top.method,
    };
  }

  return {
    state: 'found',
    element: top.element,
    confidence: top.score,
    candidateCount: candidates.length,
    resolutionMethod: top.method,
  };
}
