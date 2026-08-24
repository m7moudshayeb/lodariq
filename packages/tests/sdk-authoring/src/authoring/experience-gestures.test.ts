import { describe, expect, it } from 'vitest';
import {
  experienceAnswersGesture,
  experienceSupportsAuthoringCapability,
} from '../../../../../packages/sdk-authoring/src/authoring/experience-authoring-capabilities';

/**
 * A target answers "which element is this attached to". Only two types have
 * that question: a tour step points at one, and a hotspot *is* one. The rest
 * are triggered — when they appear is the trigger's job, and where they sit is
 * the surface's.
 */
describe('which experiences are anchored to an element', () => {
  it('offers target picking only to the types that point at something', () => {
    for (const type of ['tour', 'hotspot'] as const) {
      expect(experienceAnswersGesture(type, 'pick-target')).toBe(true);
    }
    for (const type of ['announcement', 'survey', 'checklist'] as const) {
      expect(experienceAnswersGesture(type, 'pick-target')).toBe(false);
    }
  });

  it('keeps the capability list agreeing with the gesture', () => {
    // These two used to disagree for announcements: no pick-target gesture, but
    // a targeting capability, and neither was read by anything.
    for (const type of ['announcement', 'survey', 'checklist'] as const) {
      expect(experienceSupportsAuthoringCapability(type, 'targeting')).toBe(false);
    }
    expect(experienceSupportsAuthoringCapability('tour', 'targeting')).toBe(true);
  });

  it('places a triggered experience by region instead', () => {
    expect(experienceAnswersGesture('announcement', 'drag-to-region')).toBe(true);
    expect(experienceAnswersGesture('checklist', 'drag-to-region')).toBe(true);
  });
});
