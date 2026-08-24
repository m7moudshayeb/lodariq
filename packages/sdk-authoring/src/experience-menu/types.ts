/**
 * The contract between the creator chrome and whoever owns the experiences.
 *
 * Two surfaces render this menu — the launcher's palette on the host page and
 * the mode pill's own menu once the panel has covered the launcher (§3.3) — and
 * both read the same provider. The types live here rather than in either one so
 * neither imports the other.
 */
import type { CreatorEnabledExperienceType } from '../creator-experience-types';

export type CreatorExperienceType = CreatorEnabledExperienceType;

export type MaybePromise<T> = T | Promise<T>;

/**
 * One row in the experiences list.
 *
 * Deliberately the smallest thing that renders a row. The list used to be built
 * by loading every document on the page and reading two fields off each one,
 * which parsed a whole authored sequence per row to print its title. A host must
 * be able to answer this from an index.
 */
export interface CreatorPageExperienceSummary {
  id: string;
  title: string;
  type: CreatorExperienceType;
  /**
   * Which page this experience was authored against.
   *
   * Printed under the title on every row of the "All tours" list, which is
   * otherwise a wall of names with no way to tell which screen any of them
   * belongs to. Optional: a host that only answers the page scope has nothing
   * to add, since every row there is on the page the creator is standing on.
   */
  routeKey?: string;
}

/**
 * Which of the two stacked lists is asking.
 *
 * The two answer different questions — what is on this screen, and what exists
 * — so `all` is every experience in the workspace, this page's included. A tour
 * in both lists is a shortcut sitting above a complete list, not a row printed
 * twice, and neither count has to be read against the other to mean anything.
 */
export type CreatorExperienceScope = 'page' | 'all';

/**
 * One page of the list.
 *
 * The cursor is opaque and belongs to the host: a database offset, a keyset
 * bound, a slice index. The menu only ever hands back the last one it was given,
 * so a host may put whatever it needs in there.
 */
export interface CreatorPageExperienceQuery {
  /** Which of the two lists is asking. */
  readonly scope: CreatorExperienceScope;
  /** Absent asks for the first page. */
  readonly cursor?: string;
  /** How many rows the menu wants. It asks for a screenful, then a screenful more. */
  readonly limit: number;
  /**
   * Trimmed search text, absent when the field is empty.
   *
   * Filtering is the host's job because it is the only party that can do it
   * without loading everything: the point of the cursor is that the menu never
   * holds the full list, so it cannot filter one it does not have.
   */
  readonly query?: string;
}

export interface CreatorPageExperiencePage {
  readonly items: readonly CreatorPageExperienceSummary[];
  /** Absent when this was the last page. */
  readonly nextCursor?: string;
  /**
   * How many rows match in total, when the host can say so without a second
   * query. It is what a collapsed section header prints, so a creator can see
   * there is something behind it without opening it. Absent prints no count
   * rather than a number that only means "loaded so far".
   */
  readonly total?: number;
}

/**
 * What a host may return for a listing.
 *
 * A bare array means "this is all of them" — the honest answer for a host with a
 * handful of experiences, which should not have to implement a cursor to say so.
 * The menu pages such an array itself, including the search, so both shapes
 * behave identically on screen.
 */
export type CreatorPageExperienceResult =
  CreatorPageExperiencePage | readonly CreatorPageExperienceSummary[];

/** What the creator typed before the experience existed. */
export interface CreatorNewExperienceDetails {
  readonly title: string;
}

/**
 * The three capabilities the menu can offer, each independently optional.
 *
 * A row prints only when its capability is present: a menu that names something
 * this build cannot do is worse than a shorter menu (§14.4).
 */
export interface ExperienceMenuProvider {
  readonly listExperiences?: (
    query: CreatorPageExperienceQuery,
  ) => MaybePromise<CreatorPageExperienceResult>;
  readonly createExperience?: (
    type: CreatorExperienceType,
    details: CreatorNewExperienceDetails,
  ) => MaybePromise<void>;
  readonly openExperience?: (experienceId: string) => MaybePromise<void>;
}

/**
 * What this menu opens.
 *
 * The first two match the launcher's own action ids. The third belongs to the
 * panel alone — there has to be a document open before its type can change —
 * and is deliberately kept away from `new-experience` in the menu, because two
 * adjacent lists of the same five type names doing opposite things is how a
 * creator converts a Tour when they meant to start one.
 */
export type ExperienceMenuKind =
  'new-experience' | 'experiences-on-page' | 'change-experience-type';

/** Supplied by the panel, which is the only surface with a document to convert. */
export interface ExperienceTypeSwitch {
  readonly currentType: () => string;
  /** Steps already authored, used to say what the switch will actually hide. */
  readonly stepCount: () => number;
  readonly onSwitch: (type: CreatorExperienceType) => void;
}
