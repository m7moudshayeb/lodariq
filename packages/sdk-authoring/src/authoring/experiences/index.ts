/**
 * The experience registry's public surface (§4.7, S3).
 *
 * A new experience type is one file in this folder plus one `registerExperience()`
 * call from `built-in.ts`. No shell file, no surface, and no switch statement.
 */
export {
  experienceDefinition,
  listExperienceDefinitions,
  registerExperience,
  resetExperienceRegistry,
  type ExperienceDefinition,
  type ExperienceSeedContext,
} from './definition';
export { BUILT_IN_EXPERIENCES, registerBuiltInExperiences } from './built-in';
export { registerExperienceInspectorSections } from './inspector-registration';
export {
  AUTHORING_EXPERIENCE_CAPABILITIES,
  type AuthoringExperienceCapability,
  type ExperienceAuthoringProfile,
  type ExperienceWorkspaceKind,
} from './capabilities';
export {
  announcementFormFor,
  checklistFormFor,
  dropRegion,
  EDGE_REGION_RATIO,
  HOTSPOT_MARKER_FORMS,
  type ExperienceGesture,
  type HotspotMarkerForm,
  type ViewportRegion,
} from './gestures';
