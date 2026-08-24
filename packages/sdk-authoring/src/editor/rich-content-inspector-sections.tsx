import type { ReactElement, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  inspectorSectionsFor,
  registerBuiltInInspectorSections,
} from '../authoring/overlay/inspector-sections';
import { registerBuiltInExperiences } from '../authoring/experiences/built-in';
import { registerExperienceInspectorSections } from '../authoring/experiences/inspector-registration';
import type { InspectorSelectionKind } from '../authoring/overlay/inspector-sections.types';
import { INSPECTOR_SECTION_LABELS } from '../authoring/overlay/inspector-copy';
import { ChevronRight } from '../authoring/local-frame-ui/design-system';

registerBuiltInInspectorSections(INSPECTOR_SECTION_LABELS);
// The card's sections belong to the experience type; tour is the shipped surface.
registerBuiltInExperiences();
registerExperienceInspectorSections('tour');

/**
 * The one section renderer, shared by every inspector (§4.3).
 *
 * Sections, not tabs: tabs hide state and force a mode decision before the
 * creator knows what they want. Order, labels and the six-section cap come from
 * the registry, so no inspector can drift from §4.3's table on its own.
 */
export function InspectorSections({
  bodies,
  kind,
  requestedSection,
  resetKey,
}: {
  /** Section id → body. A missing or null id renders nothing, not an empty row. */
  bodies: Readonly<Record<string, ReactNode>>;
  kind: InspectorSelectionKind;
  /**
   * Open straight to this section. The toolbar's step controls (§4.2a) name a
   * section, so landing on the first one instead would make them all identical.
   */
  requestedSection?: string | null;
  /** Changing this reopens at the first section: no state carried across selections. */
  resetKey?: string;
}): ReactElement {
  const { firstSectionId, sections } = inspectorSectionsFor(kind);
  const [openSection, setOpenSection] = useState<string | null>(
    requestedSection ?? firstSectionId,
  );

  useEffect(
    () => setOpenSection(requestedSection ?? firstSectionId),
    [firstSectionId, requestedSection, resetKey],
  );

  return (
    <div className="inspector-sections">
      {sections.map((section) => {
        const body = bodies[section.id];
        if (!body) return null;
        return (
          <details
            className="inspector-section"
            data-section={section.id}
            key={section.id}
            open={openSection === section.id}
            onToggle={(event) => {
              const open = (event.currentTarget as HTMLDetailsElement).open;
              setOpenSection((current) => {
                if (open) return section.id;
                return current === section.id ? null : current;
              });
            }}
          >
            {/*
              The disclosure arrow the prototype puts on every summary. Without
              it a closed section reads as a heading, and seven headings in a
              column do not say "these open".
            */}
            <summary>
              {section.label}
              <ChevronRight
                className="inspector-section-chevron"
                size={12}
                strokeWidth={2}
                aria-hidden="true"
              />
            </summary>
            <div className="inspector-section-body">{body}</div>
          </details>
        );
      })}
    </div>
  );
}
