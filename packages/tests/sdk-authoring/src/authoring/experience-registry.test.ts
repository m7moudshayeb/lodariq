import { beforeEach, describe, expect, it } from 'vitest';
import { DOCUMENT_TYPES, validate, LodariqBlock, type DocumentType } from '@lodariq/schema';
import {
  announcementFormFor,
  BUILT_IN_EXPERIENCES,
  checklistFormFor,
  dropRegion,
  experienceDefinition,
  HOTSPOT_MARKER_FORMS,
  listExperienceDefinitions,
  registerBuiltInExperiences,
  registerExperience,
  resetExperienceRegistry,
  type ExperienceDefinition,
} from '../../../../../packages/sdk-authoring/src/authoring/experiences';
import {
  experienceAuthoringProfile,
  experienceSupportsAuthoringCapability,
  selectExperienceRootBlocks,
} from '../../../../../packages/sdk-authoring/src/authoring/experience-authoring-capabilities';
import { OVERLAY_INSPECTOR_MAX_SECTIONS } from '../../../../../packages/sdk-authoring/src/authoring/overlay/constants';

let counter = 0;
const seedContext = { createBlockId: () => `block_seed_${(counter += 1)}` };

describe('experience registry (S3)', () => {
  beforeEach(() => {
    resetExperienceRegistry();
    registerBuiltInExperiences();
  });

  it('covers every document type the schema allows', () => {
    const registered = new Set(listExperienceDefinitions().map((definition) => definition.type));
    expect([...registered].sort()).toEqual([...DOCUMENT_TYPES].sort());
  });

  it('registers a new type without touching a shell file', () => {
    // The whole contract: one object, one call, and it is visible everywhere.
    const definition: ExperienceDefinition = {
      type: 'knowledge',
      capabilities: ['structuredContent'],
      rootBlockTypes: ['paragraph'],
      workspace: 'collection',
      gestures: ['reorder-items'],
      inspectorSections: [{ id: 'style', label: 'Style', order: 0 }],
      seed: () => [],
    };
    registerExperience(definition);

    expect(experienceDefinition('knowledge')).toBe(definition);
    expect(experienceAuthoringProfile('knowledge').rootBlockTypes).toEqual(['paragraph']);
    expect(experienceSupportsAuthoringCapability('knowledge', 'structuredContent')).toBe(true);
    expect(experienceSupportsAuthoringCapability('knowledge', 'flow')).toBe(false);
  });

  it('is the single source for capability lookups, with no second table', () => {
    resetExperienceRegistry();
    // Reading before registration bootstraps it: no caller has to remember.
    expect(experienceAuthoringProfile('tour').workspace).toBe('sequence');
    expect(experienceSupportsAuthoringCapability('tour', 'flow')).toBe(true);
    expect(experienceSupportsAuthoringCapability('announcement', 'flow')).toBe(false);
  });

  it('keeps every type’s inspector sections inside the cap', () => {
    for (const definition of listExperienceDefinitions()) {
      expect(definition.inspectorSections.length).toBeLessThanOrEqual(
        OVERLAY_INSPECTOR_MAX_SECTIONS,
      );
      // Exactly one advanced section, and it is the last thing a creator meets.
      const advanced = definition.inspectorSections.filter((section) => section.advanced);
      expect(advanced.length).toBeLessThanOrEqual(1);
    }
  });

  it('selects root blocks by the registered types', () => {
    const document = {
      id: 'doc_registry',
      workspaceId: 'wk_registry',
      type: 'tour' as DocumentType,
      status: 'draft' as const,
      title: 'Registry',
      trigger: { type: 'manual' as const },
      audience: { environments: ['development' as const] },
      schemaVersion: '1.0.0',
      targets: [],
      blocks: [
        { id: 'a', type: 'tourStep' as const, props: {}, status: 'ready' as const, children: [] },
        { id: 'b', type: 'paragraph' as const, props: {}, status: 'ready' as const, children: [] },
      ],
    };
    expect(selectExperienceRootBlocks(document).map((block) => block.id)).toEqual(['a']);
  });
});

describe('every type seeds something real (§5)', () => {
  beforeEach(() => {
    resetExperienceRegistry();
    registerBuiltInExperiences();
  });

  it('opens with editable content rather than an empty canvas', () => {
    for (const definition of BUILT_IN_EXPERIENCES) {
      const seeded = definition.seed(seedContext);
      if (definition.type === 'knowledge') {
        // Deferred per ux-revamp; the entry exists so the registry is complete.
        expect(seeded).toEqual([]);
        continue;
      }
      expect(seeded.length).toBeGreaterThan(0);
      for (const block of seeded) expect(validate(LodariqBlock, block).valid).toBe(true);
    }
  });

  it('puts a CSAT question on the survey canvas instead of a template grid', () => {
    const seeded = experienceDefinition('survey')!.seed(seedContext);
    const fields = seeded
      .flatMap((block) => block.children)
      .filter((child) => child.type === 'formField');
    expect(fields).toHaveLength(1);
    expect(fields[0]?.props.formField?.options).toHaveLength(5);
  });

  it('gives every seeded block a distinct id', () => {
    const ids = BUILT_IN_EXPERIENCES.flatMap((definition) =>
      definition
        .seed(seedContext)
        .flatMap((block) => [block.id, ...block.children.map((c) => c.id)]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('edge-drag decides the form (§5)', () => {
  it('reads a drop into a region', () => {
    expect(dropRegion({ xRatio: 0.5, yRatio: 0.5 })).toBe('center');
    expect(dropRegion({ xRatio: 0.5, yRatio: 0.05 })).toBe('top');
    expect(dropRegion({ xRatio: 0.5, yRatio: 0.95 })).toBe('bottom');
    expect(dropRegion({ xRatio: 0.05, yRatio: 0.5 })).toBe('left');
    expect(dropRegion({ xRatio: 0.95, yRatio: 0.5 })).toBe('right');
  });

  it('lets the vertical edge win a corner, because a banner spans', () => {
    expect(dropRegion({ xRatio: 0.02, yRatio: 0.02 })).toBe('top');
  });

  it('clamps nonsense rather than throwing', () => {
    expect(dropRegion({ xRatio: Number.NaN, yRatio: Number.NaN })).toBe('center');
    expect(dropRegion({ xRatio: 42, yRatio: 0.5 })).toBe('right');
  });

  it('turns the announcement’s modal-or-banner question into a gesture', () => {
    expect(announcementFormFor('center')).toBe('modal');
    expect(announcementFormFor('top')).toBe('banner');
    expect(announcementFormFor('left')).toBe('slideIn');
    expect(announcementFormFor('bottom')).toBe('slideIn');
  });

  it('turns the checklist’s drawer-or-floating question into the same gesture', () => {
    expect(checklistFormFor('center')).toBe('floating');
    expect(checklistFormFor('right')).toBe('drawer');
  });

  it('declares the gesture on the types that answer it', () => {
    resetExperienceRegistry();
    registerBuiltInExperiences();
    expect(experienceDefinition('announcement')?.gestures).toContain('drag-to-region');
    expect(experienceDefinition('checklist')?.gestures).toContain('drag-to-region');
    // A hotspot's marker moves on its target instead.
    expect(experienceDefinition('hotspot')?.gestures).toContain('drag-marker');
    expect(experienceDefinition('hotspot')?.gestures).not.toContain('drag-to-region');
    // A tour card moves relative to its target, which is a different gesture.
    expect(experienceDefinition('tour')?.gestures).toContain('drag-anchor');
    expect(experienceDefinition('tour')?.formFromRegion).toBeUndefined();
  });

  it('offers the hotspot marker forms inline, as a short row rather than a dropdown', () => {
    expect(HOTSPOT_MARKER_FORMS).toHaveLength(4);
  });
});
