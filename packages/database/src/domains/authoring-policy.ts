import { randomUUID } from 'node:crypto';
import {
  AUTHORING_ACTIVATION_CAPABILITIES,
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringDocumentIntent as AuthoringDocumentIntentSchema,
  AuthoringPageContext as AuthoringPageContextSchema,
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  defaultExperienceBehavior,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  LODARIQ_EDITOR_ORIGIN,
  RENDERER_CONTRACT_VERSION,
  ReleaseMutationGuard,
  SCHEMA_VERSION,
  patternMatchesPage,
  validate,
  type AuthoringActivationCapability,
  type AuthoringDocumentIntent,
  type AuthoringDocumentQueryScope,
  type AuthoringEnvironment,
  type AuthoringPageContext,
  type AuthoringSessionCapability,
  type Environment,
  type LodariqDocument,
  type NewAuthoringDocumentIntent,
} from '@lodariq/schema';
import { isValidAuthoringSessionCapabilitySet } from '../authoring-session-capabilities';
import {
  normalizeEnvironmentOriginAllowlist,
  normalizeExactOrigin,
  type WorkspaceEnvironment,
} from './environments';
import type { WorkspaceThemeRecord } from './themes';
import {
  AUTHORING_TOUR_DRAFT_TITLE,
  PUBLIC_SDK_BOOTSTRAP_GRANT_MAX_TTL_MS,
  type AuthoringActivationGrantRecord,
  type AuthoringSessionCompatibilityPins,
  type AuthoringSessionThemeReference,
} from './sdk-authoring';
import type { ActivateCompiledArtifactInput, SaveDocumentInput } from './documents';

export function assertArtifactMatchesDocument(input: SaveDocumentInput): void {
  if (input.artifact && input.artifact.documentId !== input.document.id) {
    throw new Error('compiled artifact document mismatch');
  }
}

export function createOpaqueRecordId(prefix: 'authreq' | 'authgrant' | 'authsess'): string {
  return `${prefix}_${randomUUID()}`;
}

export function isSha256Hash(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

export function isAuthoringPkceChallenge(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/u.test(value);
}

export function isValidAuthoringCapabilities(
  capabilities: AuthoringActivationCapability[],
): boolean {
  const allowedCapabilities = new Set<AuthoringActivationCapability>(
    Object.values(AUTHORING_ACTIVATION_CAPABILITIES),
  );
  return (
    capabilities.length > 0 &&
    capabilities.length <= allowedCapabilities.size &&
    new Set(capabilities).size === capabilities.length &&
    capabilities.every((capability) => allowedCapabilities.has(capability))
  );
}

export function isValidAuthoringDocumentIntent(documentIntent?: AuthoringDocumentIntent): boolean {
  if (!documentIntent) return true;
  return validate(AuthoringDocumentIntentSchema, documentIntent).valid;
}

export function canActivateDocumentIntent(
  grant: AuthoringActivationGrantRecord,
  requestedIntent: AuthoringDocumentIntent,
): boolean {
  const requiredCapability =
    requestedIntent.kind === 'new-draft'
      ? AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT
      : AUTHORING_ACTIVATION_CAPABILITIES.SELECT_DOCUMENT;
  if (!grant.capabilities.includes(requiredCapability)) return false;
  if (!grant.documentIntent) return true;
  if (grant.documentIntent.kind !== requestedIntent.kind) return false;
  if (grant.documentIntent.kind === 'new-draft') {
    return (
      requestedIntent.kind === 'new-draft' &&
      grant.documentIntent.documentType === requestedIntent.documentType
    );
  }
  return (
    requestedIntent.kind === 'existing' &&
    grant.documentIntent.documentId === requestedIntent.documentId &&
    grant.documentIntent.workspace === requestedIntent.workspace &&
    grant.documentIntent.focusBlockId === requestedIntent.focusBlockId
  );
}

export function getAuthoringDocumentSessionCapabilities(
  environment: AuthoringEnvironment,
): AuthoringSessionCapability[] {
  const capabilities: AuthoringSessionCapability[] = [
    AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT,
    AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
    AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
    AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
    AUTHORING_SESSION_CAPABILITIES.SELECT_TARGET,
    AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
  ];
  if (environment === 'staging') {
    capabilities.push(
      AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
      AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
      AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
      AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
      AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
      AUTHORING_SESSION_CAPABILITIES.SCHEDULE_RELEASE,
      AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
    );
  }
  if (!isValidAuthoringSessionCapabilitySet(capabilities)) {
    throw new Error('canonical authoring-session capability set is invalid');
  }
  return capabilities;
}

export function createServerOwnedTourDraft(
  workspaceId: string,
  environment: AuthoringEnvironment,
  exactOrigin: string,
  pageContext: AuthoringPageContext,
  defaultTheme?: Pick<WorkspaceThemeRecord, 'id' | 'activeVersionId'> | null,
): LodariqDocument {
  return createServerOwnedExperienceDraft(
    workspaceId,
    environment,
    exactOrigin,
    pageContext,
    'tour',
    defaultTheme,
  );
}

const SERVER_DRAFT_TITLES: Readonly<Record<NewAuthoringDocumentIntent['documentType'], string>> = {
  tour: AUTHORING_TOUR_DRAFT_TITLE,
  announcement: 'Untitled announcement',
  hotspot: 'Untitled hotspot',
  survey: 'Untitled survey',
  checklist: 'Untitled checklist',
};

export function createServerOwnedExperienceDraft(
  workspaceId: string,
  environment: AuthoringEnvironment,
  exactOrigin: string,
  pageContext: AuthoringPageContext,
  documentType: NewAuthoringDocumentIntent['documentType'],
  defaultTheme?: Pick<WorkspaceThemeRecord, 'id' | 'activeVersionId'> | null,
): LodariqDocument {
  const themeBinding = defaultTheme?.activeVersionId
    ? {
        policy: 'workspace-current' as const,
        themeId: defaultTheme.id,
        acknowledgedThemeVersionId: defaultTheme.activeVersionId,
      }
    : null;
  return {
    id: `doc_${documentType}_${randomUUID()}`,
    workspaceId,
    type: documentType,
    status: 'draft',
    title: SERVER_DRAFT_TITLES[documentType],
    schemaVersion: SCHEMA_VERSION,
    trigger: {
      type: 'urlMatch',
      config: { pattern: `${exactOrigin}${pageContext.pathname}`, mode: 'exact' },
    },
    audience: { environments: [environment] },
    ...(themeBinding ? { themeBinding } : {}),
    appearance: structuredClone(DEFAULT_EXPERIENCE_APPEARANCE),
    experience: defaultExperienceBehavior(documentType),
    ...(documentType === 'announcement' ? { surfaceForm: 'modal' as const } : {}),
    ...(documentType === 'checklist' ? { surfaceForm: 'floating' as const } : {}),
    targets: [],
    blocks: [],
  };
}

export function authoringSessionThemeReference(
  document: LodariqDocument,
): AuthoringSessionThemeReference | null {
  const binding = document.themeBinding;
  if (!binding) {
    if (document.themeRef?.trim()) return null;
    return {
      source: 'fallback',
      themeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
      themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
    };
  }
  return {
    source: 'workspace',
    themeId: binding.themeId,
    themeVersionId:
      binding.policy === 'pinned' ? binding.themeVersionId : binding.acknowledgedThemeVersionId,
  };
}

export function createAuthoringSessionCompatibilityPins(
  themeVersionId: string,
): AuthoringSessionCompatibilityPins {
  if (!themeVersionId.trim()) {
    throw new Error('authoring session compatibility requires an exact theme version');
  }
  return {
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeVersionId,
  };
}

export function isTrustedEditorIframeSrc(value: string): boolean {
  try {
    return new URL(value).origin === LODARIQ_EDITOR_ORIGIN;
  } catch {
    return false;
  }
}

export function hasValidFutureTtl(expiresAt: string, maxTtlMs: number): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  const ttlMs = expiresAtMs - Date.now();
  return Number.isFinite(expiresAtMs) && ttlMs > 0 && ttlMs <= maxTtlMs;
}

export function hasValidBoundedFutureTtl(
  expiresAt: string,
  minTtlMs: number,
  maxTtlMs: number,
): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  const ttlMs = expiresAtMs - Date.now();
  return Number.isFinite(expiresAtMs) && ttlMs >= minTtlMs && ttlMs <= maxTtlMs;
}

export function assertPublicSdkInstallationOriginPolicy(
  environment: Environment,
  exactOrigin: string,
  authoringEnabled: boolean,
): void {
  if (environment !== 'production') return;
  if (!exactOrigin.startsWith('https://')) {
    throw new Error('production public SDK origins must use HTTPS');
  }
  if (authoringEnabled) {
    throw new Error('authoring cannot be enabled for a production environment');
  }
}

export function assertPublicSdkInstallationEnvironmentPolicy(
  environment: Pick<WorkspaceEnvironment, 'kind' | 'enabled' | 'authoringEnabled'>,
  mappingAuthoringEnabled: boolean,
): void {
  if (environment.enabled === false) {
    throw new Error('environment is disabled');
  }
  if (!mappingAuthoringEnabled) return;
  if (environment.kind === 'production') {
    throw new Error('authoring cannot be enabled for a production environment');
  }
  if (environment.authoringEnabled === false) {
    throw new Error('authoring is disabled for the environment');
  }
}

export function assertPublicSdkInstallationEnvironmentOrigin(
  environment: Pick<WorkspaceEnvironment, 'id' | 'kind' | 'originAllowlist'>,
  exactOrigin: string,
): void {
  const allowedOrigins = normalizeEnvironmentOriginAllowlist(
    environment.originAllowlist,
    environment.kind,
    environment.id,
  );
  if (!allowedOrigins.includes(exactOrigin)) {
    throw new Error('public SDK origin is not allowlisted for the environment');
  }
}

export function normalizeAuthoringPathname(value: string): string | null {
  const result = validate(AuthoringPageContextSchema, { pathname: value });
  return result.valid ? result.value.pathname : null;
}

export function isAuthoringDocumentQueryScope(value: string): value is AuthoringDocumentQueryScope {
  return value === 'page' || value === 'workspace';
}

/**
 * Route matching is deliberately literal and semantic. Coordinates and CSS
 * selectors are never used to decide whether a document belongs to a page.
 */
export function matchesAuthoringPageContext(
  document: LodariqDocument,
  customerOrigin: string,
  pageContext: AuthoringPageContext,
): boolean {
  const exactOrigin = normalizeExactOrigin(customerOrigin);
  const pathname = normalizeAuthoringPathname(pageContext.pathname);
  if (!exactOrigin || !pathname) return false;
  if (document.trigger.type === 'pageLoad') return true;
  if (document.trigger.type !== 'urlMatch') return false;

  const { pattern, mode } = document.trigger.config;
  return patternMatchesPage(pattern, mode ?? 'exact', { exactOrigin, pathname });
}

export function requireExactHttpOrigin(value: string): string {
  const exactOrigin = normalizeExactOrigin(value);
  if (!exactOrigin) {
    throw new Error('origin must be an origin-only HTTP(S) URL without credentials');
  }
  return exactOrigin;
}

export function assertPublicSdkInstallationId(installationId: string): void {
  if (!/^ins_pub_[A-Za-z0-9_-]{16,128}$/u.test(installationId)) {
    throw new Error('public SDK installation id must use the ins_pub_ format');
  }
}

export function assertPublicSdkBootstrapGrantLifetime(expiresAt: string): void {
  const expiresAtMs = Date.parse(expiresAt);
  const ttlMs = expiresAtMs - Date.now();
  if (
    !Number.isFinite(expiresAtMs) ||
    ttlMs <= 0 ||
    ttlMs > PUBLIC_SDK_BOOTSTRAP_GRANT_MAX_TTL_MS
  ) {
    throw new Error('bootstrap grant expiry must be within the short-lived TTL');
  }
}

export function isPublicSdkBootstrapGrantHash(grantHash: string): boolean {
  return /^[0-9a-f]{64}$/u.test(grantHash);
}

export function assertPublicSdkBootstrapGrantHash(grantHash: string): void {
  if (!isPublicSdkBootstrapGrantHash(grantHash)) {
    throw new Error('bootstrap grant hash must be a SHA-256 hex digest');
  }
}

export function assertReleaseMutationGuardInput(
  input: Pick<
    ActivateCompiledArtifactInput,
    'idempotencyKey' | 'requestHash' | 'expectedGeneration'
  >,
): void {
  const guard = {
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    expectedGeneration: input.expectedGeneration,
  };
  if (!validate(ReleaseMutationGuard, guard).valid) {
    throw new Error(
      'release mutation requires a valid idempotency key, request hash, and generation',
    );
  }
}
