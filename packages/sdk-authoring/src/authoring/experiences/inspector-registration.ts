/**
 * Bridges the experience registry to the inspector registry (§4.3, §5).
 *
 * It lives here rather than inside `inspector-sections.ts` because the section
 * registry must stay a leaf: the *card's* sections belong to an experience type,
 * while button, form-field and media sections are selection kinds that are the same
 * everywhere. Keeping the direction one-way is what stops a cycle.
 */
import type { DocumentType } from '@lodariq/schema';
import { registerInspectorSections } from '../overlay/inspector-sections';
import { experienceDefinition } from './definition';

export function registerExperienceInspectorSections(type: DocumentType): void {
  const definition = experienceDefinition(type);
  if (definition) registerInspectorSections('card', definition.inspectorSections);
}
