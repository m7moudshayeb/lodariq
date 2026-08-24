/**
 * The experiences menu, shared by the launcher's palette and the pill's menu.
 *
 * Both surfaces mount the same flyout so "New experience" and "View experiences"
 * are one feature with two ways in, rather than two implementations that drift
 * (§3.3). Everything a host needs is re-exported here.
 *
 * Importing this barrel pulls the whole menu — the flyout, its paging, its
 * dialogs and its stylesheet. That is right for the panel, which is already
 * loaded by the time a creator can reach the menu. It is wrong for the launcher,
 * which sits on the customer's page from first paint: it imports this module
 * dynamically, on the first hover, and takes the two small pieces it needs
 * before then from `./copy`, `./is-menu-event` and `./provider-bridge` directly.
 */
export { createExperienceFlyout, type ExperienceFlyout } from './flyout';
export { isExperienceMenuEvent } from './is-menu-event';
export { EXPERIENCE_MENU_COPY, experienceRowTitle, experienceTypeLabel } from './copy';
export { experienceTypeGlyph } from './glyphs';
export { EXPERIENCE_PAGE_SIZE, createExperienceListController, filterExperiences } from './paging';
export { publishExperienceMenuProvider, requestExperienceMenuProvider } from './provider-bridge';
export { EXPERIENCE_MENU_CSS, EXPERIENCE_NAME_DIALOG_CSS } from './styles';
export type {
  CreatorExperienceScope,
  CreatorExperienceType,
  CreatorNewExperienceDetails,
  CreatorPageExperiencePage,
  CreatorPageExperienceQuery,
  CreatorPageExperienceResult,
  CreatorPageExperienceSummary,
  ExperienceMenuKind,
  ExperienceMenuProvider,
} from './types';
