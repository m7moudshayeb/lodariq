import { beforeEach, describe, expect, it } from 'vitest';
import { OVERLAY_INSPECTOR_MAX_SECTIONS } from '../../../../../../packages/sdk-authoring/src/authoring/overlay/constants';
import { INSPECTOR_SECTION_LABELS } from '../../../../../../packages/sdk-authoring/src/authoring/overlay/inspector-copy';
import {
  inspectorSectionsFor,
  registerBuiltInInspectorSections,
  registerInspectorSections,
  resetInspectorSections,
} from '../../../../../../packages/sdk-authoring/src/authoring/overlay/inspector-sections';
import { registerExperienceInspectorSections } from '../../../../../../packages/sdk-authoring/src/authoring/experiences/inspector-registration';
import {
  registerBuiltInExperiences,
  resetExperienceRegistry,
} from '../../../../../../packages/sdk-authoring/src/authoring/experiences';

/** The card's sections live in the experience registry; the rest are selection kinds. */
function registerTourSections(): void {
  registerBuiltInInspectorSections(INSPECTOR_SECTION_LABELS);
  registerBuiltInExperiences();
  registerExperienceInspectorSections('tour');
}

describe('inspector section registry (§4.3)', () => {
  beforeEach(() => {
    resetInspectorSections();
    resetExperienceRegistry();
  });

  it('opens the first non-advanced section, keyed by what was selected', () => {
    registerTourSections();
    expect(inspectorSectionsFor('card').firstSectionId).toBe('style');
    expect(inspectorSectionsFor('button').firstSectionId).toBe('button');
    expect(inspectorSectionsFor('formField').firstSectionId).toBe('field');
    expect(inspectorSectionsFor('media').firstSectionId).toBe('media');
  });

  it('replaces the popup and placement trays with sections rather than tabs', () => {
    registerTourSections();
    expect(inspectorSectionsFor('card').sections.map((section) => section.id)).toEqual([
      'style',
      'actions',
      'placement',
      'target',
      'conditions',
      'narration',
      'advanced',
    ]);
  });

  it('keeps Advanced last, whatever its order weight', () => {
    registerInspectorSections('card', [
      { id: 'advanced', label: 'Advanced', order: -100, advanced: true },
      { id: 'style', label: 'Style', order: 5 },
    ]);
    expect(inspectorSectionsFor('card').sections.map((section) => section.id)).toEqual([
      'style',
      'advanced',
    ]);
    expect(inspectorSectionsFor('card').firstSectionId).toBe('style');
  });

  it('sorts by explicit order so registration order does not matter', () => {
    registerInspectorSections('card', [{ id: 'placement', label: 'Placement', order: 2 }]);
    registerInspectorSections('card', [{ id: 'style', label: 'Style', order: 0 }]);
    expect(inspectorSectionsFor('card').sections.map((section) => section.id)).toEqual([
      'style',
      'placement',
    ]);
  });

  it('is idempotent per section id, so a double registration cannot duplicate rows', () => {
    registerInspectorSections('card', [{ id: 'style', label: 'Style', order: 0 }]);
    registerInspectorSections('card', [{ id: 'style', label: 'Appearance', order: 0 }]);
    const snapshot = inspectorSectionsFor('card');
    expect(snapshot.sections).toHaveLength(1);
    expect(snapshot.sections[0]?.label).toBe('Appearance');
  });

  it('refuses to grow past the cap — a seventh section belongs in Operations', () => {
    const sections = Array.from({ length: OVERLAY_INSPECTOR_MAX_SECTIONS }, (_unused, index) => ({
      id: `section-${index}`,
      label: `Section ${index}`,
      order: index,
    }));
    registerInspectorSections('card', sections);
    expect(inspectorSectionsFor('card').sections).toHaveLength(OVERLAY_INSPECTOR_MAX_SECTIONS);
    expect(() =>
      registerInspectorSections('card', [{ id: 'one-too-many', label: 'Nope', order: 99 }]),
    ).toThrow(/Operations/u);
  });

  it('carries every section §4.3 specifies, exactly at the cap', () => {
    registerTourSections();
    const sections = inspectorSectionsFor('card').sections;
    expect(sections.map((section) => section.id)).toEqual([
      'style',
      'actions',
      'placement',
      'target',
      'conditions',
      'narration',
      'advanced',
    ]);
    // At the cap by design: an eighth section is document-scoped work.
    expect(sections).toHaveLength(OVERLAY_INSPECTOR_MAX_SECTIONS);
  });

  it('returns an empty snapshot for a kind nobody registered', () => {
    expect(inspectorSectionsFor('target')).toEqual({
      kind: 'target',
      sections: [],
      firstSectionId: null,
    });
  });
});
