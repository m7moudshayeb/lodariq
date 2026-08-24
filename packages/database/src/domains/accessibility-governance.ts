import {
  ACCESSIBILITY_GOVERNANCE_REFERENCE_SCHEMAS,
  AccessibilityFinding,
  AccessibilitySweep,
  type AccessibilityFinding as AccessibilityFindingType,
  type AccessibilityFindingQuery,
  type AccessibilitySweep as AccessibilitySweepType,
} from '@lodariq/schema/accessibility-governance';
import { validateWithReferences } from '@lodariq/schema';

export interface CreateAccessibilitySweepInput {
  workspaceId: string;
  sweep: AccessibilitySweepType;
  findings: AccessibilityFindingType[];
}

export interface ResolveAccessibilityFindingInput {
  workspaceId: string;
  findingId: string;
  expectedRevision: number;
  resolutionNote: string;
  actorUserId: string;
  resolvedAt: string;
  eventId: string;
}

export interface AccessibilityGovernanceRepository {
  createAccessibilitySweep(input: CreateAccessibilitySweepInput): Promise<{
    sweep: AccessibilitySweepType;
    findings: AccessibilityFindingType[];
  }>;
  listAccessibilitySweeps(workspaceId: string, limit?: number): Promise<AccessibilitySweepType[]>;
  getAccessibilitySweep(
    workspaceId: string,
    sweepId: string,
  ): Promise<{ sweep: AccessibilitySweepType; findings: AccessibilityFindingType[] } | null>;
  listAccessibilityFindings(
    workspaceId: string,
    query: AccessibilityFindingQuery,
  ): Promise<AccessibilityFindingType[]>;
  resolveAccessibilityFinding(
    input: ResolveAccessibilityFindingInput,
  ): Promise<AccessibilityFindingType | null>;
  listOpenAccessibilityBlockers(
    workspaceId: string,
    documentVersionId: string,
  ): Promise<AccessibilityFindingType[]>;
}

export class AccessibilityFindingConflictError extends Error {
  readonly code = 'accessibility_finding_conflict' as const;

  constructor() {
    super('Accessibility finding changed before it could be resolved');
    this.name = 'AccessibilityFindingConflictError';
  }
}

export class AccessibilityReleaseBlockedError extends Error {
  readonly code = 'accessibility_sweep_blocked' as const;

  constructor(readonly findings: AccessibilityFindingType[]) {
    super('The exact document version has unresolved accessibility blockers');
    this.name = 'AccessibilityReleaseBlockedError';
  }
}

export function assertAccessibilitySweepInput(input: CreateAccessibilitySweepInput): void {
  const sweep = validateWithReferences(
    AccessibilitySweep,
    ACCESSIBILITY_GOVERNANCE_REFERENCE_SCHEMAS,
    input.sweep,
  );
  if (!sweep.valid) throw new Error('Accessibility sweep does not match its contract');
  if (input.findings.length > 10_000) throw new Error('Accessibility sweep finding limit exceeded');
  for (const finding of input.findings) {
    const result = validateWithReferences(
      AccessibilityFinding,
      ACCESSIBILITY_GOVERNANCE_REFERENCE_SCHEMAS,
      finding,
    );
    if (!result.valid || finding.sweepId !== input.sweep.id) {
      throw new Error('Accessibility finding does not match its sweep contract');
    }
  }
  const blockers = input.findings.filter((finding) => finding.severity === 'blocker').length;
  const warnings = input.findings.length - blockers;
  if (blockers !== input.sweep.blockerCount || warnings !== input.sweep.warningCount) {
    throw new Error('Accessibility sweep summary does not match its findings');
  }
}

export function applyAccessibilityFindingQuery(
  findings: readonly AccessibilityFindingType[],
  query: AccessibilityFindingQuery,
): AccessibilityFindingType[] {
  return findings
    .filter((finding) => {
      if (query.documentId && finding.documentId !== query.documentId) return false;
      if (query.documentVersionId && finding.documentVersionId !== query.documentVersionId) {
        return false;
      }
      if (query.sweepId && finding.sweepId !== query.sweepId) return false;
      if (query.severity && finding.severity !== query.severity) return false;
      return !query.status || finding.status === query.status;
    })
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
    )
    .slice(0, query.limit ?? 1_000)
    .map((finding) => structuredClone(finding));
}

export function assertAccessibilityReleaseAllowed(
  findings: readonly AccessibilityFindingType[],
): void {
  const blockers = findings.filter(
    (finding) => finding.status === 'open' && finding.severity === 'blocker',
  );
  if (blockers.length > 0) throw new AccessibilityReleaseBlockedError(blockers);
}
