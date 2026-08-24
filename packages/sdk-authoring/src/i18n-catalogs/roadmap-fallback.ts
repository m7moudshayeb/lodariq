import type { AuthoringCatalog } from '../i18n-catalog-types';

/**
 * New roadmap copy shared by every non-English lazy catalog until localized
 * wording is approved. A locale-specific translation overrides any key here.
 */
export const AUTHORING_ROADMAP_FALLBACK_CATALOG: AuthoringCatalog = {
  'Current copy basis': 'Current copy basis',
  'Suggested copy reference': 'Suggested copy reference',
  'Find copy changes': 'Find copy changes',
  Applied: 'Applied',
  Dismiss: 'Dismiss',
  'Save another document version to create bounded copy drift evidence.':
    'Save another document version to create bounded copy drift evidence.',
  'Before version': 'Before version',
  'After version': 'After version',
  'Save another document version to compare persisted history.':
    'Save another document version to compare persisted history.',
  'Canonical content is always compared. Theme and renderer changes are included when both saved versions have immutable compiled artifacts.':
    'Canonical content is always compared. Theme and renderer changes are included when both saved versions have immutable compiled artifacts.',
  'The proposal is evidence-bound and review-required. Adding it preserves available semantic target bindings and bounded lifecycle recipes; unresolved evidence stays visible for manual repair.':
    'The proposal is evidence-bound and review-required. Adding it preserves available semantic target bindings and bounded lifecycle recipes; unresolved evidence stays visible for manual repair.',
  'Structured artifact review': 'Structured artifact review',
  'The server creates a targetless presentation from the immutable staging artifact. Product targets, lifecycle actions, external links, audience rules, raw DOM, CSS, selectors, and coordinates are excluded.':
    'The server creates a targetless presentation from the immutable staging artifact. Product targets, lifecycle actions, external links, audience rules, raw DOM, CSS, selectors, and coordinates are excluded.',
  'Review again': 'Review again',
  'Review artifact': 'Review artifact',
  'The reviewed artifact is ready for a time-limited link.':
    'The reviewed artifact is ready for a time-limited link.',
  'Review evidence': 'Review evidence',
  'Policy version': 'Policy version',
  'Target bindings removed': 'Target bindings removed',
  'Product actions replaced': 'Product actions replaced',
  'External links removed': 'External links removed',
  'Audience rules removed': 'Audience rules removed',
  'Anonymous demo activity': 'Anonymous demo activity',
  '{count} target proposal': '{count} target proposal',
  '{count} target proposals': '{count} target proposals',
  'No target proposals': 'No target proposals',
  'Template draft creation is not enabled in this build.':
    'Template draft creation is not enabled in this build.',
  'Created as document {documentId}. The open document was not changed.':
    'Created as document {documentId}. The open document was not changed.',
  'Review target proposals: {targets}': 'Review target proposals: {targets}',
  'Templates create separate drafts with fresh document and block identities. Suggested targets stay unbound until a creator reviews them against real semantic evidence.':
    'Templates create separate drafts with fresh document and block identities. Suggested targets stay unbound until a creator reviews them against real semantic evidence.',
  'Narration script': 'Narration script',
  'Target: {target}': 'Target: {target}',
  'Reviewed recorded flow and its available semantic targets added to the draft.':
    'Reviewed recorded flow and its available semantic targets added to the draft.',
  '{count} semantic version changes are ready for review.':
    '{count} semantic version changes are ready for review.',
  'Those persisted versions are semantically identical.':
    'Those persisted versions are semantically identical.',
  '{count} persisted copy suggestions are ready for review.':
    '{count} persisted copy suggestions are ready for review.',
  'Those versions contain no bounded copy changes.':
    'Those versions contain no bounded copy changes.',
  'Template creation is unavailable in this authoring session.':
    'Template creation is unavailable in this authoring session.',
  'Creating a separate template draft…': 'Creating a separate template draft…',
  '“{title}” was created as a separate draft. Review its target proposals before publishing.':
    '“{title}” was created as a separate draft. Review its target proposals before publishing.',
  '“{title}” already exists for this request. No duplicate was created.':
    '“{title}” already exists for this request. No duplicate was created.',
  'Reviewed voice step, narration, and target added to the draft.':
    'Reviewed voice step, narration, and target added to the draft.',
  'Reviewed voice step and narration added to the draft.':
    'Reviewed voice step and narration added to the draft.',
  'Copy suggestion review is unavailable in this session.':
    'Copy suggestion review is unavailable in this session.',
  'Copy suggestion applied and its review decision recorded.':
    'Copy suggestion applied and its review decision recorded.',
  'Copy suggestion dismissed and recorded.': 'Copy suggestion dismissed and recorded.',
  'Publish to staging before reviewing a demo artifact.':
    'Publish to staging before reviewing a demo artifact.',
  'The structured artifact passed review. Product targets, lifecycle actions, links, and customer audience rules were removed.':
    'The structured artifact passed review. Product targets, lifecycle actions, links, and customer audience rules were removed.',
  'Review the current staging artifact before sharing it.':
    'Review the current staging artifact before sharing it.',
  'Live language layout checking is unavailable on this page.':
    'Live language layout checking is unavailable on this page.',
  'The draft changed before live language layouts could be checked.':
    'The draft changed before live language layouts could be checked.',
  'Live language layouts could not be checked on this page.':
    'Live language layouts could not be checked on this page.',
  'Live language layout checking is unavailable in this session.':
    'Live language layout checking is unavailable in this session.',
  'Checking every language in the live product layout…':
    'Checking every language in the live product layout…',
  'Live language layouts found {count} presentations to review.':
    'Live language layouts found {count} presentations to review.',
  'Every live language layout fits on this page.': 'Every live language layout fits on this page.',
  'Checking live layouts…': 'Checking live layouts…',
  'Check live language layouts': 'Check live language layouts',
  'Workspace accessibility checking is unavailable.':
    'Workspace accessibility checking is unavailable.',
  'Checking accessibility across the workspace…': 'Checking accessibility across the workspace…',
  'Accessibility sweep found {count} blockers.': 'Accessibility sweep found {count} blockers.',
  'Accessibility sweep found no blockers.': 'Accessibility sweep found no blockers.',
  'Workspace accessibility checking failed.': 'Workspace accessibility checking failed.',
  'Workspace accessibility checking is unavailable in this session.':
    'Workspace accessibility checking is unavailable in this session.',
  'Checking workspace accessibility…': 'Checking workspace accessibility…',
  'Predictive checks run automatically. Live language layouts render on this page; workspace accessibility findings are pinned to immutable document versions.':
    'Predictive checks run automatically. Live language layouts render on this page; workspace accessibility findings are pinned to immutable document versions.',
  'Workspace accessibility result': 'Workspace accessibility result',
  'Checked {documents} experiences across {locales} language versions.':
    'Checked {documents} experiences across {locales} language versions.',
  '{blockers} blockers · {warnings} warnings': '{blockers} blockers · {warnings} warnings',
  'Accessibility sweep · {locale} · version {version}':
    'Accessibility sweep · {locale} · version {version}',
  'Current compiled artifact is unavailable': 'Current compiled artifact is unavailable',
  'Text or control contrast is unusable': 'Text or control contrast is unusable',
  'Text or control contrast is below target': 'Text or control contrast is below target',
  'Accessible name is missing': 'Accessible name is missing',
  'Video captions are missing': 'Video captions are missing',
  'Content may not fit at a compact viewport': 'Content may not fit at a compact viewport',
  'Long copy may be difficult to read or zoom': 'Long copy may be difficult to read or zoom',
  'Live language layout result': 'Live language layout result',
  'Checked {presentations} presentations across {locales} languages and {steps} steps at {width}×{height}.':
    'Checked {presentations} presentations across {locales} languages and {steps} steps at {width}×{height}.',
  '{passed} passed · {failed} failed · {unavailable} unavailable':
    '{passed} passed · {failed} failed · {unavailable} unavailable',
  'content runs past the card horizontally': 'content runs past the card horizontally',
  'content runs past the card vertically': 'content runs past the card vertically',
  'the card is clipped by the current viewport': 'the card is clipped by the current viewport',
  'an action is clipped inside the card': 'an action is clipped inside the card',
  'the presentation could not be rendered on this page':
    'the presentation could not be rendered on this page',
  'In {locale}, {issues}.': 'In {locale}, {issues}.',
  'More live layout findings exist than this bounded report can show.':
    'More live layout findings exist than this bounded report can show.',
};
