/**
 * Inspector section contract (§4.3).
 *
 * Sections, not tabs: tabs hide state and force a mode decision before the
 * creator knows what they want. The first section is chosen by *what was
 * selected*; the rest start collapsed.
 */

/**
 * What the creator has selected. A new experience type adds a kind here and one
 * `registerInspectorSections` call — never a branch inside a surface.
 */
export type InspectorSelectionKind =
  | 'card'
  | 'button'
  | 'formField'
  | 'media'
  | 'target'
  | 'step';

export interface InspectorSectionDefinition {
  /** Stable id. Used for the open/collapsed key and by tests. */
  readonly id: string;
  readonly label: string;
  /**
   * Ordering weight. Lower renders first. Explicit so a later registration can
   * slot a section into the middle without the registry caring about call order.
   */
  readonly order: number;
  /**
   * Advanced sections are always last and always collapsed — the archive doc's
   * "off the default path" requirement, expressed as data rather than a comment.
   */
  readonly advanced?: boolean;
}

export interface InspectorSectionsSnapshot {
  readonly kind: InspectorSelectionKind;
  readonly sections: readonly InspectorSectionDefinition[];
  /** The section that opens with the inspector. Exactly one, or none if empty. */
  readonly firstSectionId: string | null;
}
