import { createHash } from 'node:crypto';
import {
  AuthoringProductMatchApplyResult as AuthoringProductMatchApplyResultSchema,
  BRAND_THEME_CONTRACT_VERSION,
  BRAND_THEME_SCHEMA_VERSION,
  BrandThemeSnapshot as BrandThemeSnapshotSchema,
  ProductStyleProposal as ProductStyleProposalSchema,
  ProductStyleSource as ProductStyleSourceSchema,
  validate,
  type BrandThemeSnapshot,
  type ProductStyleProposal,
  type ProductStyleSource,
} from '@lodariq/schema';
import {
  ProductStyleProposalConflictError,
  type ApplyProductStyleProposalInput,
  type ProductStyleApplicationRecord,
  type StyleSourceRecord,
  type WorkspaceThemeRecord,
} from './themes';
import {
  assertBoundedJsonObject,
  assertWorkspaceThemeDraft,
  hashCanonicalJson,
  normalizeWorkspaceThemeName,
  visitJsonObject,
} from './theme-policy';

const FORBIDDEN_STYLE_SOURCE_KEYS = new Set([
  'boundingRect',
  'className',
  'classNames',
  'coordinates',
  'css',
  'dom',
  'domSnapshot',
  'html',
  'rawCss',
  'selector',
  'selectors',
  'stylesheet',
  'stylesheetText',
  'url',
]);

export function assertSafeStyleSource(source: ProductStyleSource): void {
  if (!validate(ProductStyleSourceSchema, source).valid) {
    throw new Error('style source must match ProductStyleSource');
  }
  assertBoundedJsonObject(source, 'style source');
  visitJsonObject(source, (key) => {
    if (FORBIDDEN_STYLE_SOURCE_KEYS.has(key)) {
      throw new Error(`style source must not persist ${key}`);
    }
  });
}

export function assertSafeProductStyleProposal(proposal: ProductStyleProposal): void {
  const validation = validate(ProductStyleProposalSchema, proposal);
  if (!validation.valid) {
    throw new Error('Product match proposal must match ProductStyleProposal');
  }
  assertBoundedJsonObject(proposal, 'Product match proposal');
  const sourceIds = new Set<string>();
  for (const source of proposal.sources) {
    assertSafeStyleSource(source);
    if (sourceIds.has(source.sourceId)) {
      throw new Error('Product match proposal sourceId values must be unique');
    }
    sourceIds.add(source.sourceId);
  }
}

export function createWorkspaceThemeDraftPreviewSnapshot(
  theme: Pick<WorkspaceThemeRecord, 'id' | 'name' | 'draft' | 'revision'>,
): BrandThemeSnapshot {
  assertWorkspaceThemeDraft(theme.draft);
  if (!Number.isSafeInteger(theme.revision) || theme.revision < 1) {
    throw new Error('workspace theme revision must be a positive integer');
  }
  const identityHash = createHash('sha256')
    .update(`${theme.id}\0${theme.revision}`)
    .digest('hex')
    .slice(0, 24);
  const immutableContent = {
    schemaVersion: BRAND_THEME_SCHEMA_VERSION,
    contractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeId: theme.id,
    themeVersionId: `themev_draft_${identityHash}_r${theme.revision}`,
    version: theme.revision,
    name: normalizeWorkspaceThemeName(theme.name),
    definition: clone(theme.draft),
  };
  const contentHash = hashCanonicalJson(immutableContent);
  const snapshot: BrandThemeSnapshot = { ...immutableContent, contentHash };
  const validation = validate(BrandThemeSnapshotSchema, snapshot);
  if (!validation.valid) {
    throw new Error('workspace theme draft preview failed BrandThemeSnapshot validation');
  }
  return validation.value;
}

export function productStyleProposalRequestHash(
  input: Pick<ApplyProductStyleProposalInput, 'environmentId' | 'proposal'>,
): string {
  return hashCanonicalJson({ environmentId: input.environmentId, proposal: input.proposal });
}

export function createProductStyleApplicationRecord(input: {
  id: string;
  input: ApplyProductStyleProposalInput;
  requestHash: string;
  appliedTheme: WorkspaceThemeRecord;
  sources: readonly StyleSourceRecord[];
  createdAt: string;
}): ProductStyleApplicationRecord {
  const sourceReceipts = [...input.sources]
    .sort(compareStyleSourceOrdinal)
    .map((source) => ({ sourceId: source.id, sourceHash: source.sourceHash }));
  const application: ProductStyleApplicationRecord = {
    id: input.id,
    workspaceId: input.input.workspaceId,
    themeId: input.input.themeId,
    environmentId: input.input.environmentId,
    requestHash: input.requestHash,
    sourceSetHash: hashCanonicalJson(sourceReceipts),
    receipt: {
      proposalId: input.input.proposal.proposalId,
      draftRevision: input.appliedTheme.revision,
      draftUpdatedAt: input.appliedTheme.updatedAt,
      previewTheme: createWorkspaceThemeDraftPreviewSnapshot(input.appliedTheme),
      sources: sourceReceipts,
      draftChanged: input.sources[0]?.draftChanged ?? false,
    },
    createdByUserId: input.input.actorUserId,
    createdAt: input.createdAt,
  };
  assertProductStyleApplicationIntegrity(application, input.sources);
  return application;
}

export function assertProductStyleProposalReplay(
  input: Pick<
    ApplyProductStyleProposalInput,
    'workspaceId' | 'themeId' | 'environmentId' | 'proposal'
  >,
  proposalHash: string,
  application: ProductStyleApplicationRecord,
  sources: readonly StyleSourceRecord[],
): void {
  const requestMatches =
    application.workspaceId === input.workspaceId &&
    application.themeId === input.themeId &&
    application.environmentId === input.environmentId &&
    application.receipt.proposalId === input.proposal.proposalId &&
    application.requestHash === proposalHash;
  if (!requestMatches) throw new ProductStyleProposalConflictError(input.proposal.proposalId);
  assertProductStyleApplicationIntegrity(application, sources);
}

export function assertProductStyleApplicationIntegrity(
  application: ProductStyleApplicationRecord,
  sources?: readonly StyleSourceRecord[],
): void {
  const canonicalReceipt = validate(AuthoringProductMatchApplyResultSchema, {
    ...application.receipt,
    replayed: false,
  });
  const previewTheme = application.receipt.previewTheme;
  const { contentHash: _contentHash, ...previewThemeContent } = previewTheme;
  const receiptIsValid =
    canonicalReceipt.valid &&
    application.id.trim().length > 0 &&
    application.workspaceId.trim().length > 0 &&
    application.themeId.trim().length > 0 &&
    application.environmentId.trim().length > 0 &&
    application.createdByUserId.trim().length > 0 &&
    /^sha256-[0-9a-f]{64}$/u.test(application.requestHash) &&
    /^sha256-[0-9a-f]{64}$/u.test(application.sourceSetHash) &&
    previewTheme.themeId === application.themeId &&
    previewTheme.version === application.receipt.draftRevision &&
    previewTheme.contentHash === hashCanonicalJson(previewThemeContent) &&
    application.sourceSetHash === hashCanonicalJson(application.receipt.sources);
  if (!receiptIsValid) {
    throw new Error('persisted Product match application receipt failed integrity validation');
  }
  if (!sources) return;

  const orderedSources = [...sources].sort(compareStyleSourceOrdinal);
  const sourceSetIsValid =
    orderedSources.length === application.receipt.sources.length &&
    orderedSources.every((source, ordinal) => {
      const receipt = application.receipt.sources[ordinal];
      return (
        receipt !== undefined &&
        source.workspaceId === application.workspaceId &&
        source.themeId === application.themeId &&
        source.environmentId === application.environmentId &&
        source.proposalId === application.receipt.proposalId &&
        source.proposalHash === application.requestHash &&
        source.sourceOrdinal === ordinal &&
        source.sourceCount === orderedSources.length &&
        source.appliedThemeRevision === application.receipt.draftRevision &&
        source.draftChanged === application.receipt.draftChanged &&
        source.id === receipt.sourceId &&
        source.sourceHash === receipt.sourceHash &&
        source.sourceHash === hashCanonicalJson(source.source) &&
        source.createdByUserId === application.createdByUserId &&
        source.createdAt === application.createdAt
      );
    });
  if (!sourceSetIsValid) {
    throw new Error('persisted Product match source set does not match its application receipt');
  }
}

export function compareStyleSourceOrdinal(
  left: StyleSourceRecord,
  right: StyleSourceRecord,
): number {
  return left.sourceOrdinal - right.sourceOrdinal || left.id.localeCompare(right.id);
}

export function compareStyleSourceHistory(
  left: StyleSourceRecord,
  right: StyleSourceRecord,
): number {
  const created = right.createdAt.localeCompare(left.createdAt);
  if (created !== 0) return created;
  if (left.proposalId === right.proposalId) return compareStyleSourceOrdinal(left, right);
  return right.id.localeCompare(left.id);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
