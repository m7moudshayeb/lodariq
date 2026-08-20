/**
 * The experience registry (§4.7, S3).
 *
 * The shell knows this contract, not a set of document types. Adding
 * announcement, hotspot, survey or checklist behaviour is one file plus one
 * `registerExperience()` call — no switch statement in a surface, and no shell
 * file touched. That is the success condition this module exists to satisfy.
 *
 * A definition carries only what is genuinely experience-specific: which
 * capabilities it composes, which blocks sit at its root, how its workspace
 * behaves, the Tier-1 gestures it answers on the page, its inspector sections, and
 * the content a brand-new document starts with.
 */
import type {
  DocumentType,
  ExperienceSurfaceForm,
  LodariqBlock,
  LodariqBlockType,
} from '@lodariq/schema';
import type { InspectorSectionDefinition } from '../overlay/inspector-sections.types';
import type { AuthoringExperienceCapability, ExperienceWorkspaceKind } from './capabilities';
import type { ExperienceGesture, ViewportRegion } from './gestures';

export interface ExperienceSeedContext {
  /** Fresh block ids. Injected so seeding is pure and testable. */
  readonly createBlockId: () => string;
}

export interface ExperienceDefinition {
  readonly type: DocumentType;
  readonly capabilities: readonly AuthoringExperienceCapability[];
  readonly rootBlockTypes: readonly LodariqBlockType[];
  readonly workspace: ExperienceWorkspaceKind;
  /**
   * What the creator can do by touching the thing itself. Data rather than code so
   * §9's control map and the shipped affordances cannot drift apart silently.
   */
  readonly gestures: readonly ExperienceGesture[];
  /** Sections for this type's primary selection, in §4.3's order. */
  readonly inspectorSections: readonly InspectorSectionDefinition[];
  /**
   * The content a new document opens with. Nobody should face an empty canvas or a
   * template grid before seeing anything (§5's resolved decisions), so every type
   * seeds something real and immediately editable.
   */
  readonly seed: (context: ExperienceSeedContext) => readonly LodariqBlock[];
  /**
   * Maps a drop region to the form the type takes (§5). Present only on the types
   * that answer `drag-to-region`; a type without one ignores the drop, which is how
   * the gesture stays additive rather than something every type must handle.
   */
  readonly formFromRegion?: (region: ViewportRegion) => ExperienceSurfaceForm;
}

const REGISTRY = new Map<DocumentType, ExperienceDefinition>();

export function registerExperience(definition: ExperienceDefinition): void {
  REGISTRY.set(definition.type, definition);
}

export function experienceDefinition(type: DocumentType): ExperienceDefinition | undefined {
  return REGISTRY.get(type);
}

export function listExperienceDefinitions(): readonly ExperienceDefinition[] {
  return [...REGISTRY.values()];
}

/** Test seam. Registration is module-level, so suites need a way back to empty. */
export function resetExperienceRegistry(): void {
  REGISTRY.clear();
}
