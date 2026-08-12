import type {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  RENDERER_CONTRACT_VERSION,
  AuthoringActivationCapability,
  AuthoringDocumentIntent,
  AuthoringEnvironment,
  AuthoringSessionCapability,
  CompiledDocument,
  Environment,
  LodariqDocument,
} from '@lodariq/schema';
import type { WorkspaceEnvironment } from './environments';
import type { WorkspaceMembershipRecord } from './identity';

export interface PublicSdkInstallationRecord {
  installationId: string;
  workspaceId: string;
  name: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface PublicSdkInstallationOriginRecord {
  installationId: string;
  workspaceId: string;
  environmentId: string;
  exactOrigin: string;
  authoringEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSdkInstallationWithOrigins extends PublicSdkInstallationRecord {
  origins: PublicSdkInstallationOriginRecord[];
}

export interface ResolvedPublicSdkInstallation {
  installation: PublicSdkInstallationRecord;
  environment: WorkspaceEnvironment;
  exactOrigin: string;
  authoringEnabled: boolean;
}

export interface PublicSdkBootstrapGrantRecord {
  id: string;
  installationId: string;
  workspaceId: string;
  environmentId: string;
  exactOrigin: string;
  /** A SHA-256 digest. The raw bootstrap grant must never be persisted. */
  grantHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
}

export const PUBLIC_SDK_BOOTSTRAP_GRANT_MAX_TTL_MS = 5 * 60 * 1_000;

export interface AuthoringAuthorizationRequestRecord {
  requestId: string;
  bootstrapGrantId: string;
  installationId: string;
  workspaceId: string;
  environmentId: string;
  environment: AuthoringEnvironment;
  exactOrigin: string;
  /** A SHA-256 digest. The raw browser state must never be persisted. */
  stateHash: string;
  /** The consumed bootstrap grant hash bound to this request and its exchange. */
  bootstrapGrantHash: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  requestedCapabilities: AuthoringActivationCapability[];
  documentIntent?: AuthoringDocumentIntent;
  creatorId: string | null;
  /** A SHA-256 digest. The raw authorization code must never be persisted. */
  authorizationCodeHash: string | null;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  authorizationCodeExpiresAt: string | null;
  authorizationCodeUsedAt: string | null;
}

export interface ResolvedAuthoringAuthorizationForUser {
  request: AuthoringAuthorizationRequestRecord;
  membership: WorkspaceMembershipRecord;
}

export interface AuthoringActivationGrantRecord {
  grantId: string;
  requestId: string;
  installationId: string;
  workspaceId: string;
  environmentId: string;
  environment: AuthoringEnvironment;
  exactOrigin: string;
  creatorId: string;
  capabilities: AuthoringActivationCapability[];
  documentIntent?: AuthoringDocumentIntent;
  /** A SHA-256 digest. The raw activation grant must never be persisted. */
  grantHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}

export interface AuthoringCodeExchangeRecord {
  authorizationRequest: AuthoringAuthorizationRequestRecord;
  activationGrant: AuthoringActivationGrantRecord;
}

export const AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS = 10 * 60 * 1_000;
export const AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS = 60 * 1_000;
export const AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS = 120 * 1_000;
export const AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS = 5 * 60 * 1_000;
export const AUTHORING_DOCUMENT_SESSION_MAX_TTL_MS = 15 * 60 * 1_000;
export const AUTHORING_TOUR_DRAFT_TITLE = 'Untitled tour';

export interface EnvironmentTokenRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  environment: Environment;
  name: string;
  tokenHash?: string;
  tokenPrefix: string;
  clientToken?: string;
  createdAt: string;
  revokedAt?: string | null;
}

export interface AuthoringSessionRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  environment: Environment;
  documentId: string;
  correlationId: string;
  tokenHash?: string;
  iframeSrc: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  installationId?: string | null;
  activationGrantId?: string | null;
  customerOrigin?: string | null;
  capabilities?: AuthoringSessionCapability[] | null;
  compilerVersion?: string | null;
  rendererContractVersion?: string | null;
  themeContractVersion?: string | null;
  themeVersionId?: string | null;
}

export interface AuthoringDocumentSessionRecord {
  sessionId: string;
  correlationId: string;
  installationId: string;
  activationGrantId: string;
  workspaceId: string;
  environmentId: string;
  environment: AuthoringEnvironment;
  documentId: string;
  customerOrigin: string;
  creatorId: string;
  capabilities: AuthoringSessionCapability[];
  compilerVersion: typeof COMPILER_VERSION;
  rendererContractVersion: typeof RENDERER_CONTRACT_VERSION;
  themeContractVersion: typeof BRAND_THEME_CONTRACT_VERSION;
  themeVersionId: string;
  /** A SHA-256 digest. The raw session bearer must never be persisted. */
  tokenHash: string;
  iframeSrc: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface AuthoringSessionCompatibilityPins {
  compilerVersion: typeof COMPILER_VERSION;
  rendererContractVersion: typeof RENDERER_CONTRACT_VERSION;
  themeContractVersion: typeof BRAND_THEME_CONTRACT_VERSION;
  themeVersionId: string;
}

export interface AuthoringSessionThemeReference {
  source: 'fallback' | 'workspace';
  themeId: string;
  themeVersionId: string;
}

export interface AcknowledgeDocumentThemeInput {
  workspaceId: string;
  sessionId: string;
  documentId: string;
  actorUserId: string;
  expectedDocumentUpdatedAt: string;
  expectedThemeVersionId: string;
  reviewedThemeVersionId: string;
  document: LodariqDocument;
  artifact: CompiledDocument;
}

export interface ActivatedAuthoringDocumentSessionRecord {
  activationGrant: AuthoringActivationGrantRecord;
  session: AuthoringDocumentSessionRecord;
  documentCreated: boolean;
}
