/**
 * Every string the experience menu renders.
 *
 * Both surfaces read from here, which is what keeps the launcher's palette and
 * the pill's menu from naming the same action two different ways — a creator who
 * learned "View experiences" on one must not meet "Experiences on this page" on
 * the other and read it as a second feature.
 */
import { authoringText } from '../i18n';
import type { CreatorExperienceType, CreatorPageExperienceSummary } from './types';
import { CREATOR_ENABLED_EXPERIENCE_TYPES } from '../creator-experience-types';
import { EXPERIENCE_ACTION_LABELS } from './action-labels';

export const EXPERIENCE_MENU_COPY = {
  // Shared with the launcher's palette, and defined there so the launcher can
  // print them without importing everything below.
  ...EXPERIENCE_ACTION_LABELS,
  newExperienceHint: authoringText('Choose an experience type to start.'),
  viewExperiencesHint: authoringText('Open an experience without leaving this page.'),
  searchPlaceholder: authoringText('Search experiences'),
  loading: authoringText('Loading experiences…'),
  loadingMore: authoringText('Loading more…'),
  /*
   * The two lists, stacked in this order.
   *
   * "All tours" is all of them, this page's included: the first list is a
   * shortcut to what is under the creator's cursor, not a slice taken out of
   * the second. A tour may appear in both, and the second count is the size of
   * the workspace rather than the size of what is left over.
   */
  onThisPage: authoringText('On this page'),
  allTours: authoringText('All tours'),
  emptyOnThisPage: authoringText('No experiences on this page yet.'),
  emptyInWorkspace: authoringText('No experiences in this workspace yet.'),
  failed: authoringText('Experiences could not be loaded. Try again.'),
  retry: authoringText('Try again'),
  create: authoringText('Create'),
  /** The dialog between choosing a type and the experience existing. */
  nameTitle: authoringText('Name this experience'),
  nameHint: authoringText('You can rename it later from Operations.'),
  nameLabel: authoringText('Experience name'),
  nameRequired: authoringText('Give this experience a name.'),
  cancel: authoringText('Cancel'),
  close: authoringText('Close'),
  /** §5's switch, now one guarded row rather than five bare ones. */
  changeType: authoringText('Change experience type…'),
  changeTypeHint: authoringText('Author this same experience as a different kind.'),
  changeTypeTitle: authoringText('Change experience type?'),
  currentType: authoringText('Current'),
} as const;

/**
 * The consequence, said out loud, because the canvas is about to go blank.
 *
 * Both sentences are written so the type name never needs an article in front
 * of it. The first draft said "A {type} shows…", which renders "A Announcement"
 * in English and cannot be fixed by the translator either: half these locales
 * inflect the article for the noun's gender, and the noun arrives at runtime.
 * The type is already named in the title and on the confirm button, so nothing
 * is lost by keeping it out of the middle of a sentence.
 */
export function changeTypeConsequence(stepCount: number, nextLabel: string): string {
  if (stepCount <= 0) {
    return authoringText('Nothing is built yet, so nothing will disappear from the canvas.');
  }
  return authoringText(
    'Switching to {type} changes which blocks the canvas shows, so the {count} you have built will stop appearing there. Nothing is deleted — switching back brings them straight back.',
    { type: nextLabel, count: stepCountLabel(stepCount) },
  );
}

function stepCountLabel(stepCount: number): string {
  return stepCount === 1
    ? authoringText('1 step')
    : authoringText('{count} steps', { count: stepCount });
}

export function changeTypeConfirmLabel(nextLabel: string): string {
  return authoringText('Change to {type}', { type: nextLabel });
}

export function noExperiencesMatching(query: string): string {
  return authoringText('Nothing matches “{query}”.', { query });
}

export function openExperienceLabel(title: string): string {
  return authoringText('Open {experience}', { experience: title });
}

/** The same row in "All tours", where the page it belongs to is half of what it is. */
export function openExperienceOnPageLabel(title: string, page: string): string {
  return authoringText('Open {experience} on {page}', { experience: title, page });
}

export function createExperienceLabel(label: string): string {
  return authoringText('Create {experience}', { experience: label });
}

/** The creator-facing name of a type, falling back to the raw id for an unknown one. */
export function experienceTypeLabel(type: CreatorExperienceType | string): string {
  return CREATOR_ENABLED_EXPERIENCE_TYPES.find((entry) => entry.id === type)?.label ?? String(type);
}

/**
 * What a row is called.
 *
 * An untitled experience is named after its type rather than left blank, because
 * a list of empty rows is unusable and a creator's first three drafts are all
 * untitled.
 */
export function experienceRowTitle(experience: CreatorPageExperienceSummary): string {
  const trimmed = experience.title.trim();
  if (trimmed) return trimmed;
  return authoringText('Untitled {experience}', {
    experience: experienceTypeLabel(experience.type),
  });
}

/** Pre-filled in the name dialog, so Enter alone is a complete answer. */
export function defaultExperienceName(type: CreatorExperienceType): string {
  return authoringText('Untitled {experience}', { experience: experienceTypeLabel(type) });
}
