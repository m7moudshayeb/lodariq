/**
 * Disambiguation in plain language (§4.4, §4.4a).
 *
 * Two problems, one pattern:
 *
 * 1. A transparent overlay is swallowing my click. DevTools answers with hold-`⇧`
 *    to pick through. Here the creator is asked which of the things under the
 *    pointer they meant, each option live-highlighting on hover — a pattern they
 *    have already met, rather than a chord to learn.
 * 2. Four things on this page look like this one. Userflow's three plain-language
 *    resolutions are the proven answer, and this module produces them as data so
 *    the picker only has to render buttons.
 *
 * No selector, precision slider, or match rule is ever shown (ADR-0016).
 */
import type { TargetSelectionPolicy } from '@lodariq/schema';
import { TARGET_SELECTION_ORDINAL_LIMITS } from '@lodariq/schema/target-runtime';
import { authoringText } from '../../i18n';
import { countLookAlikes, describeTarget } from './legibility';

export interface StackedChoice {
  readonly element: Element;
  /** `the “Create project” button`, `the panel behind it`. */
  readonly label: string;
}

/**
 * The things under a click point, innermost first, as a chooser.
 *
 * Only offered when there is genuinely more than one plausible answer —
 * a chooser that always appears is a tax on every pick.
 */
export function stackedChoices(
  candidates: readonly Element[],
  options: { readonly limit?: number } = {},
): readonly StackedChoice[] {
  const limit = options.limit ?? 3;
  if (candidates.length < 2) return [];
  return candidates.slice(0, limit).map((element, index) => ({
    element,
    label: index === 0 ? nearestLabel(element) : behindLabel(element),
  }));
}

function nearestLabel(element: Element): string {
  const description = describeTarget(element);
  return description.name
    ? authoringText('the “{name}” {kind}', {
        name: description.name,
        kind: description.kind.toLowerCase(),
      })
    : authoringText('the {kind}', { kind: description.kind.toLowerCase() });
}

function behindLabel(element: Element): string {
  const description = describeTarget(element);
  return description.name
    ? authoringText('the “{name}” {kind} behind it', {
        name: description.name,
        kind: description.kind.toLowerCase(),
      })
    : authoringText('the {kind} behind it', { kind: description.kind.toLowerCase() });
}

/** How a target should be matched when several elements look alike. */
export type LookAlikeResolution =
  | 'exact'
  | 'by-name'
  | 'nth'
  | 'any'
  | 'newest-in-collection'
  | 'first-in-collection'
  | 'within-container';

export interface LookAlikeOption {
  readonly resolution: LookAlikeResolution;
  readonly label: string;
  /** What the answer means to the resolver. */
  readonly policy: TargetSelectionPolicy;
  /** Shown under an answer whose correctness depends on something else. */
  readonly caveat?: string;
}

export interface LookAlikeQuestion {
  /** The question, stated as a fact the creator can check. */
  readonly headline: string;
  readonly options: readonly LookAlikeOption[];
}

export interface LookAlikeQuestionOptions {
  readonly root?: ParentNode;
  /**
   * The elements capture could not separate, in document order and including
   * the target. Supply this whenever it is known — see below.
   */
  readonly candidates?: readonly Element[];
}

/**
 * Which elements the question is about.
 *
 * There are two ways to count look-alikes and they do not agree. The accessible
 * name separates a "Schedule report" button from a "Save report" button; the
 * resolver's durable evidence does not, because two buttons that differ only in
 * their words are not distinguishable in a way worth trusting. The resolver's
 * answer is the one that matters: it decides whether release is blocked, and it
 * is the set an ordinal answer is counted within.
 *
 * So the caller's candidate set wins whenever it has one. `countLookAlikes` is
 * the fallback for callers with no capture in hand, and it is deliberately the
 * weaker source: it can only ever under-count.
 */
function questionCandidates(
  element: Element,
  options: LookAlikeQuestionOptions,
): { total: number; index: number } {
  const supplied = options.candidates ?? [];
  if (supplied.length > 1) {
    const index = supplied.indexOf(element);
    return { total: supplied.length, index: index >= 0 ? index + 1 : 1 };
  }
  const count = countLookAlikes(element, options.root ?? element.ownerDocument);
  return { total: count.total, index: count.index };
}

/**
 * Userflow's three resolutions, phrased as a question with visual answers. This
 * is the whole of what a Loosest↔Strictest precision slider does, in language a
 * product marketer can answer.
 *
 * Returns null when the target is already unique: there is nothing to ask.
 */
export function lookAlikeQuestion(
  element: Element,
  options: LookAlikeQuestionOptions = {},
): LookAlikeQuestion | null {
  const count = questionCandidates(element, options);
  if (count.total < 2) return null;
  const description = describeTarget(element);
  /*
   * The collection answers lead, because a collection is now the only place the
   * question is asked: everywhere else the ordinal is recorded without asking.
   * "The 3rd one" is the wrong answer about rows and it used to be offered first.
   */
  const answers: LookAlikeOption[] = [...dataRelativeOptions(element)];
  const aboutRows = answers.length > 0;
  if (description.name) {
    answers.push({
      resolution: 'by-name',
      label: authoringText('Any {kind} that says “{name}”', {
        kind: description.kind.toLowerCase(),
        name: description.name,
      }),
      policy: { kind: 'any-matching' },
    });
  }
  // The schema caps an ordinal; the candidate set does not. Offering an answer
  // the document would reject on save is worse than not offering it.
  if (count.index <= TARGET_SELECTION_ORDINAL_LIMITS.max) {
    answers.push({
      resolution: 'nth',
      label: authoringText('Always the {position} one', { position: ordinal(count.index) }),
      policy: { kind: 'ordinal', position: count.index, order: 'reading-order' },
    });
  }
  answers.push({
    resolution: 'any',
    label: authoringText('Always the first one'),
    policy: { kind: 'first' },
  });
  /*
   * "Just the one I clicked" is last, and carries its consequence.
   *
   * It reads like the safest answer and is the opposite: it declines to give the
   * resolver a rule, so on a page where the evidence genuinely ties it abstains
   * every time. Offering it first — worse, pre-selecting it — turned the whole
   * question into a dead end. It stays available because "none of these" is a
   * real position, but the creator is told what it costs.
   */
  answers.push({
    resolution: 'exact',
    label: authoringText('Just the one I clicked'),
    policy: { kind: 'only' },
    caveat: authoringText('Release stays blocked while the page cannot tell them apart.'),
  });
  return {
    headline: aboutRows
      ? authoringText('This is one of several items in a list. Which one did you mean?')
      : authoringText('{count} things on this page look like this one.', {
          count: count.total,
        }),
    options: answers,
  };
}

/**
 * Answers that survive the data changing — which happens far more often than
 * the UI changing, and is invisible in testing because test data is static.
 * Only offered when the element genuinely sits inside a collection.
 */
function dataRelativeOptions(element: Element): LookAlikeOption[] {
  const collection = nearestCollection(element);
  if (!collection) return [];
  const collectionLabel = collectionLabelOf(collection);
  const options: LookAlikeOption[] = [
    {
      resolution: 'first-in-collection',
      label: collectionLabel
        ? authoringText('The first item in “{collection}”', { collection: collectionLabel })
        : authoringText('The first item in this list'),
      policy: { kind: 'first-in-collection', ...(collectionLabel ? { collectionLabel } : {}) },
    },
  ];
  if (declaresItsOwnOrder(collection)) {
    options.unshift({
      resolution: 'newest-in-collection',
      label: authoringText('Whichever is newest'),
      policy: { kind: 'newest-in-collection', ...(collectionLabel ? { collectionLabel } : {}) },
      caveat: authoringText('Follows the column this list is sorted by.'),
    });
  }
  const container = nearestLabelledContainer(element, collection);
  if (container) {
    options.push({
      resolution: 'within-container',
      label: authoringText('The one inside “{container}”', { container }),
      policy: { kind: 'within-container', containerLabel: container },
    });
  }
  return options;
}

const COLLECTION_ROLES = new Set(['list', 'table', 'grid', 'listbox', 'menu', 'treegrid', 'feed']);

function nearestCollection(element: Element): Element | null {
  let node: Element | null = element.parentElement;
  let hops = 0;
  while (node && hops < 12) {
    const role = node.getAttribute('role') ?? implicitCollectionRole(node);
    if (role && COLLECTION_ROLES.has(role)) return node;
    node = node.parentElement;
    hops += 1;
  }
  return null;
}

function implicitCollectionRole(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  if (tag === 'ul' || tag === 'ol') return 'list';
  if (tag === 'table') return 'table';
  return null;
}

/** `aria-sort` is the only place a product states how its own list is ordered. */
function declaresItsOwnOrder(collection: Element): boolean {
  return Boolean(collection.querySelector('[aria-sort="ascending"], [aria-sort="descending"]'));
}

function collectionLabelOf(collection: Element): string | undefined {
  const labelled = collection.closest('[aria-label]');
  return labelled?.getAttribute('aria-label')?.trim() || undefined;
}

/** A labelled region between the element and its collection, if one exists. */
function nearestLabelledContainer(element: Element, collection: Element): string | undefined {
  let node: Element | null = element.parentElement;
  let hops = 0;
  while (node && node !== collection && hops < 12) {
    const label = node.getAttribute('aria-label')?.trim();
    if (label) return label;
    node = node.parentElement;
    hops += 1;
  }
  return undefined;
}

/** English ordinals for the small numbers this question ever shows. */
function ordinal(value: number): string {
  const remainderTen = value % 10;
  const remainderHundred = value % 100;
  if (remainderTen === 1 && remainderHundred !== 11) return `${value}st`;
  if (remainderTen === 2 && remainderHundred !== 12) return `${value}nd`;
  if (remainderTen === 3 && remainderHundred !== 13) return `${value}rd`;
  return `${value}th`;
}

/**
 * `1 of 1 on this page` / `2 of 3 that look like this` — the hover card's number.
 *
 * Same rule as the question above: when the caller knows the set the resolver
 * ties on, that is the set the creator is shown. Otherwise the hover card
 * promises uniqueness that the blocker then takes away a click later.
 */
export function matchCountLabel(element: Element, options: LookAlikeQuestionOptions = {}): string {
  const count = questionCandidates(element, options);
  if (count.total === 1) return authoringText('1 of 1 on this page');
  return authoringText('{index} of {total} that look like this', {
    index: count.index,
    total: count.total,
  });
}
