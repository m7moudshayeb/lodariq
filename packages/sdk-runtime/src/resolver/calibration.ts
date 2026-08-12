import type { TargetResolutionStatus } from '@lodariq/schema';
import type { TargetResolutionMode, TargetSignalFamily } from '@lodariq/schema/target';
import type { ResolutionResult } from './types';

export const TARGET_RESOLVER_CALIBRATION_VERSION = 'visual-anchor-v1';

export type TargetCorrectionOutcome = 'accepted' | 'relinked' | 'dismissed';

/** Serializable and privacy-safe; deliberately contains no Element references. */
export interface TargetCorrectionRecord {
  targetId: string;
  resolverVersion: string;
  resolutionMode: TargetResolutionMode;
  outcome: TargetCorrectionOutcome;
  stateAtCorrection: TargetResolutionStatus;
  confidence: number;
  runnerUpConfidence: number | null;
  candidateCount: number;
  evidenceFamilies: TargetSignalFamily[];
  viewportClass?: 'mobile' | 'tablet' | 'desktop';
  correctedAt: string;
}

export interface CreateTargetCorrectionInput {
  targetId: string;
  resolutionMode: TargetResolutionMode;
  outcome: TargetCorrectionOutcome;
  resolution: ResolutionResult;
  viewportClass?: 'mobile' | 'tablet' | 'desktop';
  now?: () => Date;
}

export function createTargetCorrectionRecord(
  input: CreateTargetCorrectionInput,
): TargetCorrectionRecord {
  return {
    targetId: input.targetId,
    resolverVersion: TARGET_RESOLVER_CALIBRATION_VERSION,
    resolutionMode: input.resolutionMode,
    outcome: input.outcome,
    stateAtCorrection: input.resolution.state,
    confidence: input.resolution.confidence,
    runnerUpConfidence: input.resolution.runnerUpConfidence,
    candidateCount: input.resolution.candidateCount,
    evidenceFamilies: [...input.resolution.evidenceFamilies],
    ...(input.viewportClass ? { viewportClass: input.viewportClass } : {}),
    correctedAt: (input.now?.() ?? new Date()).toISOString(),
  };
}

/**
 * Descriptive signal trust only. Production weights must be refit and
 * validated offline rather than mutating live behavior from these ratios.
 */
export function summarizeEvidenceTrust(
  records: readonly TargetCorrectionRecord[],
): Partial<Record<TargetSignalFamily, { accepted: number; observed: number; rate: number }>> {
  const totals = new Map<TargetSignalFamily, { accepted: number; observed: number }>();
  for (const record of records) {
    for (const family of new Set(record.evidenceFamilies)) {
      const value = totals.get(family) ?? { accepted: 0, observed: 0 };
      value.observed += 1;
      if (record.outcome === 'accepted') value.accepted += 1;
      totals.set(family, value);
    }
  }
  return Object.fromEntries(
    [...totals.entries()].map(([family, value]) => [
      family,
      { ...value, rate: value.observed > 0 ? value.accepted / value.observed : 0 },
    ]),
  );
}
