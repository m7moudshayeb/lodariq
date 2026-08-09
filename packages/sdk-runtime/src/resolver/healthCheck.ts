import type { Target, TargetSignalFamily } from '@lodariq/schema/target';
import type { TargetResolutionStatus, TargetVerificationReasonCode } from '@lodariq/schema';
import { resolveTarget } from './resolve';
import type { TargetResolutionContext } from './types';

const REDESIGN_CLUSTER_RATIO = 0.3;
const MIN_REDESIGN_CLUSTER_SIZE = 3;

export interface TargetHealthEntry {
  targetId: string;
  state: TargetResolutionStatus;
  confidence: number;
  candidateCount: number;
  reasonCode: TargetVerificationReasonCode;
  evidenceFamilies: readonly TargetSignalFamily[];
}

export interface TargetHealthReport {
  checkedAt: string;
  total: number;
  found: number;
  ambiguous: number;
  missing: number;
  needsReview: number;
  likelyRedesign: boolean;
  entries: TargetHealthEntry[];
}

export interface TargetHealthNotification {
  severity: 'low' | 'high';
  message: string;
  targetIds: string[];
}

/**
 * Resolve a route/state/locale-scoped target set without retaining live DOM
 * nodes in the report. Callers must group targets by applicable context before
 * invoking this function.
 */
export function runTargetHealthCheck(
  targets: readonly Pick<Target, 'id' | 'fingerprint' | 'identity'>[],
  root: ParentNode = document,
  context: TargetResolutionContext = {},
  now: () => Date = () => new Date(),
): TargetHealthReport {
  const entries = targets.map((target): TargetHealthEntry => {
    const result = resolveTarget(target, root, context);
    return {
      targetId: target.id,
      state: result.state,
      confidence: result.confidence,
      candidateCount: result.candidateCount,
      reasonCode: result.reasonCode,
      evidenceFamilies: [...result.evidenceFamilies],
    };
  });
  const count = (state: TargetResolutionStatus): number =>
    entries.filter((entry) => entry.state === state).length;
  const found = count('found');
  const ambiguous = count('ambiguous');
  const missing = count('missing');
  const needsReview = count('needs_review');
  const failing = ambiguous + missing + needsReview;
  return {
    checkedAt: now().toISOString(),
    total: entries.length,
    found,
    ambiguous,
    missing,
    needsReview,
    likelyRedesign:
      entries.length >= MIN_REDESIGN_CLUSTER_SIZE &&
      failing / entries.length >= REDESIGN_CLUSTER_RATIO,
    entries,
  };
}

/** Privacy-safe client summary; target labels and page content stay local. */
export function toTargetHealthNotification(
  report: TargetHealthReport,
): TargetHealthNotification | null {
  const flagged = report.entries.filter((entry) => entry.state !== 'found');
  if (flagged.length === 0) return null;
  if (report.likelyRedesign) {
    return {
      severity: 'high',
      message: `${flagged.length} of ${report.total} placements need review; this may be a broader page redesign.`,
      targetIds: flagged.map((entry) => entry.targetId),
    };
  }
  return {
    severity: 'low',
    message: `${flagged.length} placement${flagged.length === 1 ? '' : 's'} need review.`,
    targetIds: flagged.map((entry) => entry.targetId),
  };
}
