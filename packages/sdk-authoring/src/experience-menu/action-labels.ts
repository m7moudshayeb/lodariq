/**
 * The two labels that name a menu from outside it.
 *
 * Split from the rest of the menu's copy because the launcher prints them on its
 * palette buttons at first paint, and importing the full copy module for two
 * strings put all twenty-five on the customer's page to render two.
 *
 * They stay defined once. A creator who learns "View experiences" on the
 * launcher must meet the same words in the panel's menu, or the two routes to
 * one list read as two different features (§3.3).
 */
import { authoringText } from '../i18n';

export const EXPERIENCE_ACTION_LABELS = {
  newExperience: authoringText('New experience'),
  viewExperiences: authoringText('View experiences'),
} as const;
