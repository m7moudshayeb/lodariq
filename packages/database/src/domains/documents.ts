import type {
  AuthoringActivationCapability,
  AuthoringDocumentIntent,
  AuthoringDocumentQueryScope,
  AuthoringPageContext,
  CompiledDocument,
  LodariqDocument,
} from '@lodariq/schema';
import type {
  PersistedCompiledArtifact,
  PersistedDocumentDeployment,
  PersistedPublication,
  PersistedReleaseOperation,
} from './releases';

export interface PersistedDocument {
  document: LodariqDocument;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  updatedAt: string;
  latestArtifact?: PersistedCompiledArtifact;
}

export interface SaveDocumentInput {
  workspaceId: string;
  document: LodariqDocument;
  actorUserId: string;
  artifact?: CompiledDocument;
  /** Compare-and-swap guard for an existing canonical draft revision. */
  expectedUpdatedAt?: string;
}

export class DocumentSaveConflictError extends Error {
  constructor(readonly currentUpdatedAt: string | null) {
    super('Document changed since it was loaded');
    this.name = 'DocumentSaveConflictError';
  }
}

export interface CreateEnvironmentTokenInput {
  workspaceId: string;
  environmentId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  clientToken?: string;
  actorUserId: string;
}

export interface GetOrCreatePublicSdkInstallationInput {
  workspaceId: string;
  installationId: string;
  name: string;
  actorUserId: string;
}

export interface SetPublicSdkInstallationOriginInput {
  workspaceId: string;
  installationId: string;
  environmentId: string;
  origin: string;
  authoringEnabled: boolean;
}

export interface SyncPublicSdkInstallationOriginsInput {
  workspaceId: string;
  installationId: string;
  origins: Array<{
    environmentId: string;
    origin: string;
    authoringEnabled: boolean;
  }>;
}

export interface CreatePublicSdkBootstrapGrantInput {
  workspaceId: string;
  installationId: string;
  environmentId: string;
  exactOrigin: string;
  grantHash: string;
  expiresAt: string;
}

export interface ConsumePublicSdkBootstrapGrantInput {
  installationId: string;
  exactOrigin: string;
  grantHash: string;
}

export interface CreateAuthoringAuthorizationRequestInput {
  installationId: string;
  exactOrigin: string;
  bootstrapGrantHash: string;
  stateHash: string;
  codeChallenge: string;
  requestedCapabilities: AuthoringActivationCapability[];
  documentIntent?: AuthoringDocumentIntent;
  expiresAt: string;
}

export interface ApproveAuthoringAuthorizationRequestInput {
  workspaceId: string;
  requestId: string;
  stateHash: string;
  creatorId: string;
  authorizationCodeHash: string;
  authorizationCodeExpiresAt: string;
}

export interface ExchangeAuthoringAuthorizationCodeInput {
  installationId: string;
  exactOrigin: string;
  requestId: string;
  bootstrapGrantHash: string;
  stateHash: string;
  authorizationCodeHash: string;
  codeVerifier: string;
  activationGrantHash: string;
  activationGrantExpiresAt: string;
}

export interface ConsumeAuthoringActivationGrantInput {
  installationId: string;
  exactOrigin: string;
  grantHash: string;
}

export interface CreateAuthoringDocumentSessionFromActivationInput {
  installationId: string;
  exactOrigin: string;
  activationGrantHash: string;
  pageContext: AuthoringPageContext;
  selectionScope: AuthoringDocumentQueryScope;
  documentIntent: AuthoringDocumentIntent;
  correlationId: string;
  sessionTokenHash: string;
  iframeSrc: string;
  expiresAt: string;
}

export interface QueryAuthoringDocumentsFromActivationInput {
  installationId: string;
  exactOrigin: string;
  activationGrantHash: string;
  scope: AuthoringDocumentQueryScope;
  pageContext: AuthoringPageContext;
}

export interface RevokeAuthoringSessionInput {
  sessionId: string;
  tokenHash: string;
}

export interface CreateAuthoringSessionInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  correlationId: string;
  tokenHash: string;
  iframeSrc: string;
  expiresAt: string;
  actorUserId: string;
}

export interface PublishCompiledArtifactInput {
  workspaceId: string;
  environmentId: string;
  correlationId: string;
  artifact: PersistedCompiledArtifact;
  actorUserId: string;
}

export type PublicationProvenance = Pick<
  PersistedPublication,
  'action' | 'sourcePublicationId' | 'previousPublicationId' | 'releaseOperationId'
>;

export const LEGACY_PUBLICATION_PROVENANCE: PublicationProvenance = {
  action: 'publish',
  sourcePublicationId: null,
  previousPublicationId: null,
  releaseOperationId: null,
};

export interface ActivateCompiledArtifactInput extends PublishCompiledArtifactInput {
  /** Defaults to `publish`; promotion always reuses the source publication artifact. */
  action?: 'publish' | 'promote';
  sourcePublicationId?: string | null;
  idempotencyKey: string;
  requestHash: string;
  expectedGeneration: number;
  /** CAS pin for the server-authorized environment policy read. */
  expectedEnvironmentPolicyUpdatedAt: string;
}

export interface ReleaseActivationResult {
  operation: PersistedReleaseOperation;
  publication: PersistedPublication;
  deployment: PersistedDocumentDeployment;
  replayed: boolean;
}
