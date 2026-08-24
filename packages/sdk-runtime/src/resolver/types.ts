import {
  TARGET_MAX_RESOLUTION_RUNNER_UP_MARGIN,
  TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN,
  TARGET_MIN_RESOLUTION_RUNNER_UP_MARGIN,
} from '@lodariq/schema/target-runtime';
import type {
  TargetLocalizedEvidence,
  TargetRequiredAction,
  TargetSignalFamily,
} from '@lodariq/schema/target';
import type { TargetResolutionStatus, TargetVerificationReasonCode } from '@lodariq/schema';

export const MIN_IDENTITY_CONFIDENCE = 55;
export const MIN_LEGACY_CONFIDENCE = 60;
export const MIN_INDEPENDENT_IDENTITY_FAMILIES = 2;
export const MIN_VISUAL_ANCHOR_CONFIDENCE = 55;
export const MIN_INDEPENDENT_VISUAL_FAMILIES = 3;
export const MIN_RUNNER_UP_MARGIN = TARGET_MIN_RESOLUTION_RUNNER_UP_MARGIN;
export const MAX_RUNNER_UP_MARGIN = TARGET_MAX_RESOLUTION_RUNNER_UP_MARGIN;
export const MIN_LEGACY_RUNNER_UP_MARGIN = 20;
export const MIN_CAPTURE_RUNNER_UP_MARGIN = TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN;

export const RESOLUTION_METHOD_BY_FAMILY: Readonly<Record<TargetSignalFamily, string>> = {
  'registry-contract': 'registry_contract',
  'configured-attribute': 'configured_attribute',
  'semantic-attribute': 'semantic_attribute',
  'element-semantics': 'element_semantics',
  'ancestor-context': 'ancestor_context',
  'relationship-context': 'relationship_context',
  'visual-topology': 'visual_topology',
  'visual-structure': 'visual_structure',
  'visual-appearance': 'visual_appearance',
  'visual-neighborhood': 'visual_neighborhood',
  'layout-slot': 'layout_slot',
  'sibling-position': 'sibling_position',
  'localized-text': 'localized_text',
};

export interface ElementResolvedAnchor {
  kind: 'element';
  element: Element;
  interactionSafe: true;
  getBoundingClientRect: () => DOMRect;
}

export interface VisualRegionResolvedAnchor {
  kind: 'visual-region';
  /** Current live owner used only to refresh the region rectangle. */
  element: Element;
  interactionSafe: false;
  getBoundingClientRect: () => DOMRect;
}

export type ResolvedAnchor = ElementResolvedAnchor | VisualRegionResolvedAnchor;

export interface TargetResolutionContext {
  /** Explicit SDK context wins over document or navigator language. */
  locale?: string;
  /**
   * Which page the visitor is on. Read from `location` when absent, so the page
   * gate needs no host wiring — unlike `routePatternId`, which only the customer
   * can name and which therefore never arrives.
   */
  pageKey?: string;
  /** Opaque route-pattern ID already selected by the delivery layer. */
  routePatternId?: string;
  /** Opaque, customer-configured application-state ID. */
  stateId?: string;
  /** Additional actionability required by the consuming runtime action. */
  requiredAction?: TargetRequiredAction;
  /** Resolve a customer-owned registry contract afresh for every attempt. */
  resolveRegistryTarget?: (registryKey: string) => Element | null;
  /** Resolve an opaque relationship/reference key without exposing it in telemetry. */
  resolveStableKey?: (stableKey: string) => Element | null;
}

export interface ResolutionResult {
  state: TargetResolutionStatus;
  element: Element | null;
  anchor: ResolvedAnchor | null;
  confidence: number;
  candidateCount: number;
  resolutionMethod: string;
  reasonCode: TargetVerificationReasonCode;
  evidenceFamilies: TargetSignalFamily[];
  runnerUpConfidence: number | null;
  currentLocale: string | null;
  /**
   * Copy read off a clean win in a locale the target has none for. Offered so a
   * caller can record the translation rather than ask the author for it.
   */
  learnedLocalizedEvidence?: TargetLocalizedEvidence;
}

export type ResolutionState = TargetResolutionStatus;

export interface LegacyResolutionResult extends Omit<ResolutionResult, 'state'> {
  state: Exclude<TargetResolutionStatus, 'needs_review'>;
}

export interface EvidenceMatch {
  family: TargetSignalFamily;
  score: number;
  method: string;
}

export interface ScoredCandidate {
  element: Element;
  score: number;
  method: string;
  evidence: EvidenceMatch[];
  locale: string | null;
}
