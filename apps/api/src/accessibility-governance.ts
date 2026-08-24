import { createHash } from 'node:crypto';
import { collectCompiledAccessibilityIssues } from '@lodariq/compiler';
import {
  ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION,
  type AccessibilityFinding,
  type AccessibilityFindingCode,
  type AccessibilitySweepResult,
} from '@lodariq/schema/accessibility-governance';
import {
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  type BasicVisualPreflightIssue,
  type CompiledDocumentV5,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';
import {
  assertAccessibilityReleaseAllowed,
  type ControlPlaneRepository,
  type PersistedCompiledArtifact,
  type PersistedDocumentVersion,
} from '@lodariq/database';

const MAX_ACCESSIBILITY_FINDINGS = 10_000;

export interface RunWorkspaceAccessibilitySweepInput {
  repository: ControlPlaneRepository;
  workspaceId: string;
  actorUserId: string;
  operationId: string;
  clock?: () => Date;
}

export async function runWorkspaceAccessibilitySweep(
  input: RunWorkspaceAccessibilitySweepInput,
): Promise<AccessibilitySweepResult> {
  const sweepId = deterministicIdentifier(
    'a11ysweep',
    `${input.workspaceId}:${normalizeOperationId(input.operationId)}`,
  );
  const replay = await input.repository.getAccessibilitySweep(input.workspaceId, sweepId);
  if (replay) return replay;

  const clock = input.clock ?? (() => new Date());
  const startedAt = clock().toISOString();
  const summaries = await input.repository.listDocuments(input.workspaceId);
  const findings: AccessibilityFinding[] = [];
  let localeCount = 0;

  for (const summary of summaries) {
    const [record, versions] = await Promise.all([
      input.repository.getDocument(input.workspaceId, summary.id),
      input.repository.listDocumentVersions(input.workspaceId, summary.id),
    ]);
    const version = versions[0];
    if (!record || !version) continue;
    const locales = documentLocales(record.document);
    localeCount += locales.length;
    collectDocumentAccessibilityFindings({
      sweepId,
      document: record.document,
      version,
      artifact: record.latestArtifact,
      createdAt: startedAt,
      findings,
    });
    if (findings.length >= MAX_ACCESSIBILITY_FINDINGS) break;
  }

  const boundedFindings = findings.slice(0, MAX_ACCESSIBILITY_FINDINGS);
  const blockerCount = boundedFindings.filter((finding) => finding.severity === 'blocker').length;
  const completedAt = clock().toISOString();
  return input.repository.createAccessibilitySweep({
    workspaceId: input.workspaceId,
    sweep: {
      schemaVersion: ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION,
      id: sweepId,
      status: 'completed',
      requestedByUserId: input.actorUserId,
      documentCount: summaries.length,
      localeCount,
      blockerCount,
      warningCount: boundedFindings.length - blockerCount,
      startedAt,
      completedAt,
    },
    findings: boundedFindings,
  });
}

export async function assertAccessibilityReleaseGate(
  repository: ControlPlaneRepository,
  workspaceId: string,
  documentVersionId: string | null | undefined,
): Promise<void> {
  if (!documentVersionId) return;
  const blockers = await repository.listOpenAccessibilityBlockers(workspaceId, documentVersionId);
  assertAccessibilityReleaseAllowed(blockers);
}

function collectDocumentAccessibilityFindings(input: {
  sweepId: string;
  document: LodariqDocument;
  version: PersistedDocumentVersion;
  artifact?: PersistedCompiledArtifact;
  createdAt: string;
  findings: AccessibilityFinding[];
}): void {
  const artifact = currentVersionArtifact(input.version, input.artifact);
  if (!artifact) {
    pushFinding(input, {
      code: 'artifact_unavailable',
      severity: 'blocker',
      locale: input.document.localization?.defaultLocale ?? 'en',
      artifact: null,
      stepId: null,
      nodeId: null,
      measuredRatio: null,
      requiredRatio: null,
    });
    return;
  }
  const compiled = artifact.compiled as CompiledDocumentV5;
  for (const { locale, issue } of collectCompiledAccessibilityIssues(compiled)) {
    pushFinding(input, findingFromPreflight(artifact, compiled, locale, issue));
    if (input.findings.length >= MAX_ACCESSIBILITY_FINDINGS) return;
  }
  collectCaptionFindings(input, artifact);
}

function currentVersionArtifact(
  version: PersistedDocumentVersion,
  artifact: PersistedCompiledArtifact | undefined,
): PersistedCompiledArtifact | null {
  if (
    !artifact ||
    artifact.documentVersionId !== version.id ||
    artifact.compiled.artifactSchemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION
  ) {
    return null;
  }
  return artifact;
}

function findingFromPreflight(
  artifact: PersistedCompiledArtifact,
  compiled: CompiledDocumentV5,
  locale: string,
  issue: BasicVisualPreflightIssue,
) {
  const branch =
    locale === compiled.localization.defaultLocale
      ? compiled.steps
      : (compiled.localization.variants.find((variant) => variant.locale === locale)?.steps ?? []);
  const stepIndex = 'stepIndex' in issue ? issue.stepIndex : undefined;
  const nodeIndex = 'nodeIndex' in issue ? issue.nodeIndex : undefined;
  const step = stepIndex === undefined ? undefined : branch[stepIndex];
  const node =
    stepIndex === undefined || nodeIndex === undefined
      ? undefined
      : branch[stepIndex]?.body[nodeIndex];
  const code =
    issue.code === 'artifact_schema_invalid'
      ? ('artifact_unavailable' as const)
      : (issue.code as AccessibilityFindingCode);
  return {
    code,
    severity: issue.severity,
    locale,
    artifact,
    stepId: step?.id ?? null,
    nodeId: node?.id ?? null,
    measuredRatio: 'measuredRatio' in issue ? issue.measuredRatio : null,
    requiredRatio: 'requiredRatio' in issue ? issue.requiredRatio : null,
  };
}

function collectCaptionFindings(
  input: Parameters<typeof collectDocumentAccessibilityFindings>[0],
  artifact: PersistedCompiledArtifact,
): void {
  const defaultLocale = input.document.localization?.defaultLocale ?? 'en';
  for (const root of input.document.blocks) {
    visitBlock(root, root.type === 'tourStep' ? root.id : null, (block, stepId) => {
      const media = block.props.media;
      if (media?.kind !== 'video') return;
      if (!media.captionsAssetId) {
        pushFinding(input, {
          code: 'missing_captions',
          severity: 'blocker',
          locale: defaultLocale,
          artifact,
          stepId,
          nodeId: block.id,
          measuredRatio: null,
          requiredRatio: null,
        });
      }
      for (const variant of media.localeVariants ?? []) {
        if (variant.captionsAssetId) continue;
        pushFinding(input, {
          code: 'missing_captions',
          severity: 'blocker',
          locale: variant.locale,
          artifact,
          stepId,
          nodeId: block.id,
          measuredRatio: null,
          requiredRatio: null,
        });
      }
    });
    if (input.findings.length >= MAX_ACCESSIBILITY_FINDINGS) return;
  }
}

function visitBlock(
  block: LodariqBlock,
  parentStepId: string | null,
  visit: (block: LodariqBlock, stepId: string | null) => void,
): void {
  const stepId = block.type === 'tourStep' ? block.id : parentStepId;
  visit(block, stepId);
  for (const child of block.children) visitBlock(child, stepId, visit);
}

function pushFinding(
  input: Parameters<typeof collectDocumentAccessibilityFindings>[0],
  finding: {
    code: AccessibilityFindingCode;
    severity: AccessibilityFinding['severity'];
    locale: string;
    artifact: PersistedCompiledArtifact | null;
    stepId: string | null;
    nodeId: string | null;
    measuredRatio: number | null;
    requiredRatio: number | null;
  },
): void {
  if (input.findings.length >= MAX_ACCESSIBILITY_FINDINGS) return;
  const ordinal = input.findings.length;
  input.findings.push({
    schemaVersion: ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION,
    id: deterministicIdentifier(
      'a11yfinding',
      [input.sweepId, input.version.id, finding.code, finding.locale, ordinal].join(':'),
    ),
    sweepId: input.sweepId,
    documentId: input.document.id,
    documentVersionId: input.version.id,
    artifactId: finding.artifact?.id ?? null,
    contentHash: finding.artifact?.contentHash ?? null,
    code: finding.code,
    severity: finding.severity,
    status: 'open',
    locale: finding.locale,
    stepId: finding.stepId,
    nodeId: finding.nodeId,
    measuredRatio: finding.measuredRatio,
    requiredRatio: finding.requiredRatio,
    revision: 1,
    resolvedByUserId: null,
    resolutionNote: null,
    resolvedAt: null,
    createdAt: input.createdAt,
  });
}

function documentLocales(document: LodariqDocument): string[] {
  return [
    document.localization?.defaultLocale ?? 'en',
    ...(document.localization?.variants.map((variant) => variant.locale) ?? []),
  ];
}

function normalizeOperationId(operationId: string): string {
  const normalized = operationId.trim();
  if (!normalized || normalized.length > 256) {
    throw new Error('Accessibility sweep operation id is invalid');
  }
  return normalized;
}

function deterministicIdentifier(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 40)}`;
}
