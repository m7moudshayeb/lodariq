/**
 * What the toolbar's contextual middle is currently editing, and which controls
 * that context offers (§4.2a).
 *
 * The toolbar is a persistent frame — Insert on the left, the inspector
 * affordance on the right — and only the middle changes with the selection. That
 * is what stops rule 4's vanishing-controls hunt: the two things a creator always
 * needs stay put, so the bar never reflows under the pointer.
 *
 * The middle has to say what it is now, or a swap is indistinguishable from a
 * layout glitch. Hence a label per kind rather than icons alone.
 *
 * Adding an experience adds a kind here and nowhere else.
 *
 * Reference: authoring-spec.html → `TCTX` · authoring-ux-model.md §4.2a
 */
import type { LodariqBlockType } from '@lodariq/schema';
import { authoringText } from '../../i18n';
import { INSPECTOR_SECTION_LABELS } from './inspector-copy';

export const TOOLBAR_CONTEXT_KINDS = ['step', 'text', 'button', 'media', 'field'] as const;
export type ToolbarContextKind = (typeof TOOLBAR_CONTEXT_KINDS)[number];

/**
 * Block type → context. Anything textual collapses to `text`, because the
 * controls a creator wants for a heading and a paragraph are the same ones.
 */
const CONTEXT_BY_BLOCK_TYPE: Partial<Record<LodariqBlockType, ToolbarContextKind>> = {
  button: 'button',
  link: 'button',
  media: 'media',
  formField: 'field',
};

export function toolbarContextForBlockType(
  type: LodariqBlockType | null | undefined,
): ToolbarContextKind {
  if (!type) return 'step';
  return CONTEXT_BY_BLOCK_TYPE[type] ?? 'text';
}

/** Uppercase in presentation, sentence case here — the CSS owns the casing. */
export const TOOLBAR_CONTEXT_LABELS: Record<ToolbarContextKind, string> = {
  step: authoringText('Step'),
  text: authoringText('Text'),
  button: authoringText('Button'),
  media: authoringText('Media'),
  field: authoringText('Field'),
};

export function toolbarContextLabel(kind: ToolbarContextKind): string {
  return TOOLBAR_CONTEXT_LABELS[kind];
}

/**
 * The step context's controls, which are inspector sections rather than direct
 * manipulations — nothing inside the card is selected, so there is nothing to act
 * on directly, and the honest offer is "which part of this step do you want".
 *
 * Data, not JSX: the same list drives the toolbar, its overflow menu and the
 * control-map test, and three copies of it would drift.
 */
export interface ToolbarSectionControl {
  /** Inspector section this opens. */
  readonly section: string;
  readonly label: string;
}

export const TOOLBAR_STEP_CONTROLS: readonly ToolbarSectionControl[] = [
  { section: 'style', label: INSPECTOR_SECTION_LABELS.style },
  { section: 'placement', label: INSPECTOR_SECTION_LABELS.placement },
  { section: 'actions', label: INSPECTOR_SECTION_LABELS.actions },
];

