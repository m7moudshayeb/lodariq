import type {
  TargetIdentityV2,
  TargetSignalFamily,
  TargetVisualFingerprint,
} from '@lodariq/schema/target';
import { isInsideCollection } from '@lodariq/schema/dom';
import { bitGridSimilarity, hashSimilarity } from './hashing';
import { captureVisualStructure } from './structural';
import { viewportClassOf } from './visual-topology';

const VISUAL_STRUCTURE_FLOOR = 0.72;
const VISUAL_OCCUPANCY_FLOOR = 0.78;
const VISUAL_APPEARANCE_FLOOR = 0.75;
const VISUAL_NEIGHBORHOOD_FLOOR = 0.72;

export interface VisualEvidenceMatch {
  family: Extract<
    TargetSignalFamily,
    | 'visual-structure'
    | 'visual-appearance'
    | 'visual-neighborhood'
    | 'layout-slot'
    | 'sibling-position'
  >;
  similarity: number;
}

export function captureVisualFingerprint(
  element: Element,
  stateId?: string,
): TargetVisualFingerprint | null {
  const structure = captureVisualStructure(element);
  const viewportClass = viewportClassOf(element.ownerDocument);
  if (!structure || !viewportClass) return null;
  return {
    viewportClass,
    ...(stateId ? { stateId } : {}),
    ...structure,
  };
}

export function visualEvidenceFor(
  identity: TargetIdentityV2,
  element: Element,
  stateId?: string,
): VisualEvidenceMatch[] {
  const expected = selectVisualFingerprint(
    identity.visualFingerprints,
    element.ownerDocument,
    stateId,
  );
  const actual = captureVisualFingerprint(element, stateId);
  if (!expected || !actual) return [];

  const structuralSimilarity = Math.min(
    hashSimilarity(expected.structuralHash, actual.structuralHash),
    bitGridSimilarity(expected.occupancyGrid, actual.occupancyGrid),
  );
  const appearanceSimilarity = hashSimilarity(expected.appearanceHash, actual.appearanceHash);
  const neighborhoodSimilarity = hashSimilarity(expected.neighborhoodHash, actual.neighborhoodHash);
  const matches: VisualEvidenceMatch[] = [];
  if (
    structuralSimilarity >= VISUAL_STRUCTURE_FLOOR &&
    bitGridSimilarity(expected.occupancyGrid, actual.occupancyGrid) >= VISUAL_OCCUPANCY_FLOOR
  ) {
    matches.push({ family: 'visual-structure', similarity: structuralSimilarity });
  }
  if (appearanceSimilarity >= VISUAL_APPEARANCE_FLOOR) {
    matches.push({ family: 'visual-appearance', similarity: appearanceSimilarity });
  }
  if (neighborhoodSimilarity >= VISUAL_NEIGHBORHOOD_FLOOR) {
    matches.push({ family: 'visual-neighborhood', similarity: neighborhoodSimilarity });
  }
  const slotMatches =
    Boolean(expected.layoutSlot) &&
    Boolean(actual.layoutSlot) &&
    expected.layoutSlot?.siblingIndex === actual.layoutSlot?.siblingIndex &&
    expected.layoutSlot?.siblingCount === actual.layoutSlot?.siblingCount;
  if (identity.intent.resolutionMode === 'layout-slot') {
    if (slotMatches) matches.push({ family: 'layout-slot', similarity: 1 });
    return matches;
  }
  /*
   * The same measurement, offered to ordinary targets as a tie-breaker (ADR-0016).
   *
   * Both numbers have to agree, so a sibling added, hidden or folded away drops
   * the signal instead of sliding it one over. A swap at constant count still
   * matches the wrong one — hence a supporting family the resolver never lets
   * qualify a target alone. Offered only where the position held across samples,
   * and never inside a collection, where position is data rather than layout.
   */
  if (
    slotMatches &&
    (identity.intent.resolutionMode ?? 'semantic') === 'semantic' &&
    identity.captureEvidence.stableSignalFamilies.includes('sibling-position') &&
    !isInsideCollection(element)
  ) {
    matches.push({ family: 'sibling-position', similarity: 1 });
  }
  return matches;
}

export function visualFingerprintStabilityValue(fingerprint: TargetVisualFingerprint): string {
  return [
    fingerprint.viewportClass,
    fingerprint.stateId ?? '',
    fingerprint.structuralHash,
    fingerprint.occupancyGrid,
    fingerprint.appearanceHash,
    fingerprint.neighborhoodHash,
    fingerprint.layoutSlot
      ? `${fingerprint.layoutSlot.siblingIndex}:${fingerprint.layoutSlot.siblingCount}`
      : '',
  ].join('|');
}

function selectVisualFingerprint(
  fingerprints: readonly TargetVisualFingerprint[] | undefined,
  document: Document,
  stateId?: string,
): TargetVisualFingerprint | null {
  if (!fingerprints?.length) return null;
  const viewportClass = viewportClassOf(document);
  if (!viewportClass) return null;
  const viewportMatches = fingerprints.filter((entry) => entry.viewportClass === viewportClass);
  if (stateId) {
    const exact = viewportMatches.find((entry) => entry.stateId === stateId);
    if (exact) return exact;
  }
  return viewportMatches.find((entry) => !entry.stateId) ?? null;
}
