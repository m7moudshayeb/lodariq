/**
 * The inspector's section registry (§4.3).
 *
 * The risk this module exists to contain is named in §13: the inspector becomes
 * the panel again. Sections accrete, someone pins it open, and in six months it
 * is a 320px permanent sidebar. So the cap is enforced here, at registration,
 * rather than left to review.
 *
 * Only sections with a real body are registered. §4.3 also specifies Conditions
 * and Narration on the card; those arrive with Slices E and F, and registering
 * them early would ship rows that do nothing.
 */
import { OVERLAY_INSPECTOR_MAX_SECTIONS } from './constants';
import type {
  InspectorSectionDefinition,
  InspectorSectionsSnapshot,
  InspectorSelectionKind,
} from './inspector-sections.types';

const registry = new Map<InspectorSelectionKind, InspectorSectionDefinition[]>();

/**
 * Registers sections for a selection kind. Idempotent per section id, so a hot
 * reload or a double import cannot silently double the section list.
 *
 * Throws past the cap: a surface that needs a seventh section is describing a
 * document-scoped job, and that belongs in Operations (Tier 3).
 */
export function registerInspectorSections(
  kind: InspectorSelectionKind,
  sections: readonly InspectorSectionDefinition[],
): void {
  const existing = registry.get(kind) ?? [];
  const merged = [...existing];
  for (const section of sections) {
    const index = merged.findIndex((candidate) => candidate.id === section.id);
    if (index >= 0) merged[index] = section;
    else merged.push(section);
  }
  if (merged.length > OVERLAY_INSPECTOR_MAX_SECTIONS) {
    throw new Error(
      `Lodariq inspector: "${kind}" would have ${merged.length} sections, over the ${OVERLAY_INSPECTOR_MAX_SECTIONS} cap. ` +
        'A seventh section is document-scoped work; put it in Operations.',
    );
  }
  registry.set(kind, merged);
}

/** Advanced last, then by order — a stable rule that ignores registration order. */
function compare(a: InspectorSectionDefinition, b: InspectorSectionDefinition): number {
  if (Boolean(a.advanced) !== Boolean(b.advanced)) return a.advanced ? 1 : -1;
  return a.order - b.order;
}

export function inspectorSectionsFor(kind: InspectorSelectionKind): InspectorSectionsSnapshot {
  const sections = [...(registry.get(kind) ?? [])].sort(compare);
  const first = sections.find((section) => !section.advanced) ?? sections[0];
  return { kind, sections, firstSectionId: first?.id ?? null };
}

/** Tests and hot reload only. Production registers once at module load. */
export function resetInspectorSections(): void {
  registry.clear();
}

export interface InspectorSectionLabels {
  readonly style: string;
  readonly actions: string;
  readonly placement: string;
  readonly target: string;
  readonly conditions: string;
  readonly narration: string;
  readonly advanced: string;
  readonly button: string;
  readonly action: string;
  readonly field: string;
  readonly validation: string;
  readonly media: string;
  readonly frame: string;
  readonly altText: string;
  readonly ringStyle: string;
  readonly spotlight: string;
  readonly evidence: string;
  readonly approach: string;
  readonly repair: string;
}

/**
 * The sections the shipped selection kinds have today, in one place so §4.3's
 * table and the code cannot drift apart unnoticed.
 */
export function registerBuiltInInspectorSections(labels: InspectorSectionLabels): void {
  /**
   * The card's sections come from the *experience* registry, because they differ by
   * type (§5): a tour card has Placement and Narration, an announcement has
   * Dismissal and Frequency. The kinds below are selection kinds rather than
   * experience types, so they are the same everywhere.
   */
  registerInspectorSections('button', [
    { id: 'button', label: labels.button, order: 0 },
    { id: 'action', label: labels.action, order: 1 },
    { id: 'style', label: labels.style, order: 2 },
  ]);
  registerInspectorSections('formField', [
    { id: 'field', label: labels.field, order: 0 },
    { id: 'validation', label: labels.validation, order: 1 },
    { id: 'style', label: labels.style, order: 2 },
  ]);
  registerInspectorSections('media', [
    { id: 'media', label: labels.media, order: 0 },
    { id: 'frame', label: labels.frame, order: 1 },
    { id: 'altText', label: labels.altText, order: 2 },
  ]);
}
