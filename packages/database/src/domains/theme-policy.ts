import { createHash, randomUUID } from 'node:crypto';
import {
  BasicVisualPreflightReport as BasicVisualPreflightReportSchema,
  BrandDriftAuditReport as BrandDriftAuditReportSchema,
  BRAND_THEME_CONTRACT_VERSION,
  BRAND_THEME_SCHEMA_VERSION,
  BrandThemeDefinition as BrandThemeDefinitionSchema,
  BrandThemeSnapshot as BrandThemeSnapshotSchema,
  BrowserVerificationReport as BrowserVerificationReportSchema,
  validate,
  type BasicVisualPreflightReport,
  type BrandDriftAuditReport,
  type BrandThemeDefinition,
  type BrandThemeSnapshot,
  type BrowserVerificationReport,
  type CompiledDocument,
  type LodariqDocument,
} from '@lodariq/schema';
import {
  WorkspaceThemeChangedError,
  type WorkspaceThemeImpactRecord,
  type WorkspaceThemeMutationGuard,
  type WorkspaceThemeRecord,
  type WorkspaceThemeVersionRecord,
} from './themes';
import type { PersistedCompiledArtifact } from './releases';

export function hashCanonicalJson(value: unknown): string {
  return `sha256-${createHash('sha256').update(canonicalThemeJson(value)).digest('hex')}`;
}

export function assertBoundedJsonObject(value: unknown, label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`${label} must be JSON serializable`);
  }
  if (!serialized) throw new Error(`${label} must be JSON serializable`);
  if (serialized.length > 64_000) {
    throw new Error(`${label} must not exceed 64KB`);
  }
}

export function assertBrowserVerificationReport(report: BrowserVerificationReport): void {
  if (!validate(BrowserVerificationReportSchema, report).valid) {
    throw new Error('publication verification report must match BrowserVerificationReport');
  }
}

export function visitJsonObject(value: unknown, visitor: (key: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visitJsonObject(item, visitor);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    visitor(key);
    visitJsonObject(nested, visitor);
  }
}

export function assertRequiredApprovalCount(value: number): asserts value is 0 | 1 {
  if (value !== 0 && value !== 1) {
    throw new Error('requiredApprovalCount must be 0 or 1');
  }
}

export function normalizeReleaseApprovalReason(reason?: string | null): string | null {
  if (reason === undefined || reason === null) return null;
  const normalized = reason.trim();
  if (normalized.length < 1 || normalized.length > 500) {
    throw new Error('release approval reason must be between 1 and 500 characters');
  }
  return normalized;
}

export function normalizeWorkspaceThemeName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 120) {
    throw new Error('workspace theme name must be between 1 and 120 characters');
  }
  return normalized;
}

export function assertWorkspaceThemeDraft(draft: BrandThemeDefinition): void {
  if (!validate(BrandThemeDefinitionSchema, draft).valid) {
    throw new Error('workspace theme draft must match BrandThemeDefinition');
  }
}

export function normalizeThemeGuardUpdatedAt(guard: WorkspaceThemeMutationGuard): string {
  if (!Number.isSafeInteger(guard.expectedRevision) || guard.expectedRevision < 1) {
    throw new Error('workspace theme expectedRevision must be a positive integer');
  }
  const timestamp = Date.parse(guard.expectedUpdatedAt);
  if (!Number.isFinite(timestamp)) {
    throw new Error('workspace theme expectedUpdatedAt must be an ISO timestamp');
  }
  return new Date(timestamp).toISOString();
}

export function assertWorkspaceThemeMutationGuard(
  current: Pick<WorkspaceThemeRecord, 'revision' | 'updatedAt'>,
  expectedRevision: number,
  expectedUpdatedAt: string,
): void {
  if (current.revision === expectedRevision && current.updatedAt === expectedUpdatedAt) return;
  throw new WorkspaceThemeChangedError(
    expectedRevision,
    current.revision,
    expectedUpdatedAt,
    current.updatedAt,
  );
}

export function createWorkspaceThemeVersion(
  theme: Pick<WorkspaceThemeRecord, 'id' | 'workspaceId' | 'name' | 'draft'>,
  version: number,
  actorUserId: string,
  createdAt: string,
): WorkspaceThemeVersionRecord {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error('workspace theme version must be a positive integer');
  }
  assertWorkspaceThemeDraft(theme.draft);
  const id = `themev_${randomUUID()}`;
  const immutableContent = {
    schemaVersion: BRAND_THEME_SCHEMA_VERSION,
    contractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeId: theme.id,
    themeVersionId: id,
    version,
    name: normalizeWorkspaceThemeName(theme.name),
    definition: clone(theme.draft),
  };
  const contentHash = `sha256-${createHash('sha256')
    .update(canonicalThemeJson(immutableContent))
    .digest('hex')}`;
  const snapshot: BrandThemeSnapshot = { ...immutableContent, contentHash };
  const validated = validate(BrandThemeSnapshotSchema, snapshot);
  if (!validated.valid) {
    throw new Error('approved workspace theme snapshot failed BrandThemeSnapshot validation');
  }
  return {
    id,
    workspaceId: theme.workspaceId,
    themeId: theme.id,
    version,
    schemaVersion: validated.value.schemaVersion,
    contractVersion: validated.value.contractVersion,
    snapshot: validated.value,
    contentHash,
    approvedByUserId: actorUserId,
    approvedAt: createdAt,
    createdAt,
  };
}

export function assertVisualCheckReport(report: BasicVisualPreflightReport): void {
  if (!validate(BasicVisualPreflightReportSchema, report).valid) {
    throw new Error('visual check report must match BasicVisualPreflightReport');
  }
}

export function assertBrandDriftReport(report: BrandDriftAuditReport): void {
  if (!validate(BrandDriftAuditReportSchema, report).valid) {
    throw new Error('Brand drift report must match the bounded canonical schema');
  }
}

function canonicalThemeJson(value: unknown): string {
  return JSON.stringify(sortThemeHashValue(value));
}

function sortThemeHashValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortThemeHashValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, sortThemeHashValue((value as Record<string, unknown>)[key])]),
  );
}

export function themeImpactBinding(
  document: LodariqDocument,
  themeId: string,
): Pick<
  WorkspaceThemeImpactRecord,
  'bindingPolicy' | 'acknowledgedThemeVersionId' | 'pinnedThemeVersionId'
> | null {
  const binding = document.themeBinding;
  if (binding?.themeId === themeId) {
    if (binding.policy === 'workspace-current') {
      return {
        bindingPolicy: binding.policy,
        acknowledgedThemeVersionId: binding.acknowledgedThemeVersionId,
        pinnedThemeVersionId: null,
      };
    }
    return {
      bindingPolicy: binding.policy,
      acknowledgedThemeVersionId: null,
      pinnedThemeVersionId: binding.themeVersionId,
    };
  }
  if (document.themeRef === themeId) {
    return {
      bindingPolicy: 'legacy',
      acknowledgedThemeVersionId: null,
      pinnedThemeVersionId: null,
    };
  }
  return null;
}

export function compiledArtifactMetadata(
  compiled: CompiledDocument,
): Pick<
  PersistedCompiledArtifact,
  'themeVersionId' | 'themeContentHash' | 'rendererContractVersion'
> {
  if (compiled.artifactSchemaVersion !== '2' && compiled.artifactSchemaVersion !== '3') return {};
  return {
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
