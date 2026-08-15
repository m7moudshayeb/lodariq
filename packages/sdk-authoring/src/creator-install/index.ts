import {
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringProductMatchApplyResult as AuthoringProductMatchApplyResultSchema,
  AuthoringDocumentPayload as AuthoringDocumentPayloadSchema,
  AuthoringStagingPublicationResult as AuthoringStagingPublicationResultSchema,
  AuthoringStagingReleaseState as AuthoringStagingReleaseStateSchema,
  AuthoringStagingVerificationResult as AuthoringStagingVerificationResultSchema,
  ProductStyleProposal as ProductStyleProposalSchema,
  ProductionPromotionResult as ProductionPromotionResultSchema,
  ReleaseApproval as ReleaseApprovalSchema,
  ReleaseRecoveryResult as ReleaseRecoveryResultSchema,
  ReleaseRecoveryStateResponse as ReleaseRecoveryStateResponseSchema,
  releaseRecoveryStateMatchesScope,
  validate,
  type AuthoringDocumentPayload,
  type AuthoringBrandDriftCheckResult,
  type AuthoringBrandThemeAcknowledgementRequest,
  type AuthoringBrandThemeAcknowledgementResult,
  type BrandDriftCheckRequest,
  type BrandThemeSnapshot,
  type AuthoringReleaseFinding,
  type AuthoringStagingPublicationRequest,
  type AuthoringStagingPublicationResult,
  type AuthoringStagingReleaseState,
  type AuthoringStagingVerificationRequest,
  type AuthoringStagingVerificationResult,
  type LodariqDocument,
  type ProductStyleProposal,
  type ProductionPromotionRequest,
  type ProductionPromotionResult,
  type ReleaseApproval,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
  type ManifestPointer,
  type SdkInstallContext,
} from '@lodariq/schema';
import {
  installLodariq,
  readConfigFromScript,
  type InstallOptions,
  type LoaderConfig,
  type LodariqBrowserApi,
} from '@lodariq/sdk-runtime/lodariq-loader';
import { compilePreview } from '@lodariq/sdk-runtime/lodariq-local-dev';
import type {
  AuthoringSession,
  AuthoringStyleSourceSaveResult,
  LocalAuthoringPanel,
  LocalAuthoringPanelOptions,
} from '../authoring';
import {
  requestAuthoringBrandDrift,
  requestAuthoringBrandThemeAcknowledgement,
} from '../authoring/brand-drift-client';
import { loadExactPublishedArtifact } from '../bridge/exact-publication-loader';
import { installCreatorToolbar, type CreatorToolbarOptions } from '../creator-toolbar';

export interface InstallCreatorLodariqOptions {
  script?: HTMLScriptElement;
  scriptSelector?: string;
  toolbar?: CreatorToolbarOptions | false;
  installOptions?: Omit<InstallOptions, 'openAuthoring'>;
  /** Returns the customer's current opaque application-state key for target capture. */
  getTargetStateId?: () => string | undefined;
}

const DEFAULT_CREATOR_SCRIPT_SELECTOR =
  'script[data-lodariq-loader][data-lodariq-authoring-session]';
const AUTO_INSTALL_ATTRIBUTE = 'data-lodariq-creator-installed';

interface CreatorAuthoringHostModule {
  openLocalAuthoringPanel: (
    session: AuthoringSession,
    options: LocalAuthoringPanelOptions,
  ) => LocalAuthoringPanel;
}
type CreatorAuthoringContext = SdkInstallContext & {
  environment: 'development' | 'staging';
  authoring: NonNullable<SdkInstallContext['authoring']> & {
    enabled: true;
    iframeSrc: string;
    sessionId: string;
  };
};

let creatorAuthoringHostPromise: Promise<CreatorAuthoringHostModule> | undefined;

function loadCreatorAuthoringHost(): Promise<CreatorAuthoringHostModule> {
  creatorAuthoringHostPromise ??= import('../authoring').then(({ openLocalAuthoringPanel }) => ({
    openLocalAuthoringPanel,
  }));
  return creatorAuthoringHostPromise;
}

export async function installCreatorLodariqFromScript(
  options: InstallCreatorLodariqOptions = {},
): Promise<LodariqBrowserApi | null> {
  const script =
    options.script ??
    document.querySelector<HTMLScriptElement>(
      options.scriptSelector ?? DEFAULT_CREATOR_SCRIPT_SELECTOR,
    );
  if (!script) return null;

  const config = readConfigFromScript(script);
  if (!config) return null;

  let installedApi: LodariqBrowserApi | null = null;
  const api = await installLodariq(config, {
    ...options.installOptions,
    openAuthoring: async (manifest, context) => {
      requireCreatorAuthoringContext(context);
      const [payload, authoringHost] = await Promise.all([
        loadCreatorDocument(config, context),
        loadCreatorAuthoringHost(),
      ]);
      if (!installedApi) throw new Error('Lodariq creator runtime is not ready');
      openCreatorAuthoringPanel(
        config,
        manifest,
        context,
        payload,
        installedApi,
        options.getTargetStateId,
        authoringHost.openLocalAuthoringPanel,
      );
    },
  });
  if (!api) return null;
  installedApi = api;

  if (options.toolbar !== false) installCreatorToolbar(options.toolbar);
  return api;
}

function openCreatorAuthoringPanel(
  config: LoaderConfig,
  manifest: ManifestPointer,
  context: SdkInstallContext,
  payload: AuthoringDocumentPayload,
  api: LodariqBrowserApi,
  getTargetStateId: InstallCreatorLodariqOptions['getTargetStateId'],
  openLocalAuthoringPanel: CreatorAuthoringHostModule['openLocalAuthoringPanel'],
): void {
  const { document } = payload;
  const exactTheme = structuredClone(payload.theme);
  let documentUpdatedAt = payload.documentUpdatedAt;
  let brandSessionTheme = structuredClone(exactTheme);
  requireCreatorAuthoringContext(context);
  if (document.id !== manifest.documentId || document.workspaceId !== context.workspaceId) {
    throw new Error('Lodariq creator document does not match the SDK bootstrap context');
  }

  openLocalAuthoringPanel(
    {
      sessionId: context.authoring.sessionId,
      documentId: manifest.documentId,
      workspaceId: context.workspaceId,
      environment: context.environment,
    },
    {
      autoPreview: true,
      iframeSrc: context.authoring.iframeSrc,
      initialDocument: document,
      initialTheme: exactTheme,
      ...(getTargetStateId ? { getTargetStateId } : {}),
      preview: {
        loadDocument: (documentId) =>
          documentId === document.id ? structuredClone(document) : null,
        compilePreview: (candidate, themeOverride) => {
          const requestedTheme = structuredClone(themeOverride ?? exactTheme);
          if (!creatorPreviewThemeMatchesScope(requestedTheme, exactTheme)) {
            throw new Error('Lodariq creator preview theme does not match this session');
          }
          return compilePreview(candidate, requestedTheme);
        },
        loadExactPublishedArtifact: async (expectedContentHash) => {
          const releaseState = await loadCreatorReleaseState(config, context);
          if (
            releaseState.environment !== 'staging' ||
            releaseState.activeContentHash !== expectedContentHash
          ) {
            throw new Error('Exact staging artifact changed before verification');
          }
          return loadExactPublishedArtifact({
            url: creatorPublishedDocumentUrl(config, context, releaseState.environmentId),
            documentId: context.manifest.documentId,
            expectedContentHash,
            expectedThemeVersionId: exactTheme.themeVersionId,
            headers: { authorization: `Bearer ${requireCreatorClientToken(config)}` },
          });
        },
        playPreview: (compiled, previewOptions) => {
          if (!api.playAuthoringPreview) {
            throw new Error('Lodariq creator preview runtime is unavailable');
          }
          return api.playAuthoringPreview(compiled, {
            ownerId: previewOptions.ownerId,
            ...(previewOptions.locale ? { locale: previewOptions.locale } : {}),
            ...(previewOptions.interactive ? { interactive: true } : {}),
            ...(previewOptions.flowConditionContext
              ? { flowConditionContext: previewOptions.flowConditionContext }
              : {}),
            ...(previewOptions.stepId ? { initialStepId: previewOptions.stepId } : {}),
            ...(previewOptions.authoringTargetOverride
              ? { authoringTargetOverride: previewOptions.authoringTargetOverride }
              : {}),
            ...(previewOptions.onStepChange
              ? {
                  onStepChange: (index, step) => previewOptions.onStepChange?.(index, step.id),
                }
              : {}),
            ...(previewOptions.onComplete ? { onComplete: previewOptions.onComplete } : {}),
            ...(previewOptions.onDismiss ? { onDismiss: previewOptions.onDismiss } : {}),
            ...(previewOptions.onSkip ? { onSkip: previewOptions.onSkip } : {}),
            ...(previewOptions.onChoreographyStageChange
              ? {
                  onChoreographyStageChange: (step, update) =>
                    previewOptions.onChoreographyStageChange?.(step.id, update),
                }
              : {}),
            ...(previewOptions.onChoreographyRecovery
              ? {
                  onChoreographyRecovery: (step, update) =>
                    previewOptions.onChoreographyRecovery?.(step.id, update),
                }
              : {}),
            ...(previewOptions.onBranchChoice
              ? {
                  onBranchChoice: (step, ruleIndex, destination) =>
                    previewOptions.onBranchChoice?.(step.id, ruleIndex, destination),
                }
              : {}),
            ...(previewOptions.getAuthoringProtectedSurfaces
              ? { getAuthoringProtectedSurfaces: previewOptions.getAuthoringProtectedSurfaces }
              : {}),
            ...(previewOptions.onAuthoringSurfaceChange
              ? { onAuthoringSurfaceChange: previewOptions.onAuthoringSurfaceChange }
              : {}),
          });
        },
        stopPreview: (ownerId) => api.stopAuthoringPreview?.(ownerId),
      },
      onSave: async (document) => {
        const saved = await saveCreatorDocument(config, context, document, documentUpdatedAt);
        documentUpdatedAt = saved.documentUpdatedAt;
      },
      ...(context.authoring.release?.releaseState.capability ===
      AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE
        ? {
            release: {
              releaseStateCapability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
              getReleaseState: () => loadCreatorReleaseState(config, context),
              ...(context.authoring.release.recoveryState?.capability ===
              AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE
                ? {
                    releaseRecoveryStateCapability:
                      AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
                    getReleaseRecoveryState: (environmentId: string) =>
                      loadCreatorReleaseRecoveryState(config, context, environmentId),
                  }
                : {}),
              ...(context.authoring.release.rollback?.capability ===
              AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE
                ? {
                    rollbackReleaseCapability: AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
                  }
                : {}),
              ...(context.authoring.release.unpublish?.capability ===
              AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE
                ? {
                    unpublishReleaseCapability: AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
                  }
                : {}),
              ...(context.authoring.release.rollback || context.authoring.release.unpublish
                ? {
                    recoverRelease: (environmentId: string, request: ReleaseRecoveryRequest) =>
                      recoverCreatorRelease(config, context, environmentId, request),
                  }
                : {}),
              ...(context.authoring.release.stagingPublication?.capability ===
              AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING
                ? {
                    stagingPublicationCapability: AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
                    publishToStaging: (request: AuthoringStagingPublicationRequest) =>
                      publishCreatorToStaging(config, context, request),
                  }
                : {}),
              ...(context.authoring.release.stagingVerification?.capability ===
              AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING
                ? {
                    stagingVerificationCapability: AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
                    submitStagingVerification: (request: AuthoringStagingVerificationRequest) =>
                      submitCreatorStagingVerification(config, context, request),
                  }
                : {}),
              ...(context.authoring.release.productionPromotion?.capability ===
              AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION
                ? {
                    productionPromotionCapability:
                      AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
                    promoteProduction: (request: ProductionPromotionRequest) =>
                      promoteCreatorProduction(config, context, request),
                  }
                : {}),
              ...(context.authoring.release.productionApproval?.capability ===
              AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION
                ? {
                    productionApprovalCapability: AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
                    approveProduction: (
                      operationId: string,
                      decision: 'approved' | 'rejected',
                      reason?: string,
                    ) => approveCreatorProduction(config, context, operationId, decision, reason),
                  }
                : {}),
              productStyleSamplingCapability: AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
              saveStyleSource: (proposal: ProductStyleProposal) =>
                saveCreatorStyleSource(config, exactTheme.themeId, proposal),
              brandDriftCheckCapability: AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
              checkBrandDrift: (request: BrandDriftCheckRequest) =>
                checkCreatorBrandDrift(config, context, brandSessionTheme, request),
              brandThemeAcknowledgementCapability: AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
              acknowledgeBrandTheme: async (request: AuthoringBrandThemeAcknowledgementRequest) => {
                const acknowledgement = await acknowledgeCreatorBrandTheme(
                  config,
                  context,
                  brandSessionTheme,
                  request,
                );
                brandSessionTheme = structuredClone(acknowledgement.theme);
                return acknowledgement;
              },
            },
          }
        : {}),
    },
  );
}

function requireCreatorAuthoringContext(
  context: SdkInstallContext,
): asserts context is CreatorAuthoringContext {
  if (context.environment === 'production') {
    throw new Error('Lodariq creator authoring is not available in production');
  }
  if (context.environment !== 'development' && context.environment !== 'staging') {
    throw new Error(`Unsupported Lodariq creator environment: ${context.environment}`);
  }
  if (
    context.authoring?.enabled !== true ||
    !context.authoring.sessionId ||
    !context.authoring.iframeSrc
  ) {
    throw new Error('Lodariq creator authoring session is missing or disabled');
  }
}

async function loadCreatorDocument(
  config: LoaderConfig,
  context: SdkInstallContext,
): Promise<AuthoringDocumentPayload> {
  const documentUrl = context.authoring?.documentUrl;
  if (!documentUrl) {
    throw new Error('Lodariq creator authoring document URL is missing');
  }
  const response = await fetchCreatorAuthoringEndpoint(config, documentUrl, { method: 'GET' });
  const result = validate(AuthoringDocumentPayloadSchema, await readCreatorJson(response));
  if (!result.valid) {
    throw new Error('Lodariq creator authoring document response is invalid');
  }
  if (
    result.value.document.id !== context.manifest.documentId ||
    result.value.document.workspaceId !== context.workspaceId
  ) {
    throw new Error('Lodariq creator document does not match the SDK bootstrap context');
  }
  return structuredClone(result.value);
}

async function saveCreatorDocument(
  config: LoaderConfig,
  context: SdkInstallContext,
  document: LodariqDocument,
  expectedDocumentUpdatedAt: string,
): Promise<AuthoringDocumentPayload> {
  const saveDocumentUrl = context.authoring?.saveDocumentUrl;
  if (!saveDocumentUrl) {
    throw new Error('Lodariq creator authoring save URL is missing');
  }
  const response = await fetchCreatorAuthoringEndpoint(config, saveDocumentUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ document, expectedDocumentUpdatedAt }),
  });
  const result = validate(AuthoringDocumentPayloadSchema, await readCreatorJson(response));
  if (!result.valid) {
    throw new Error('Lodariq creator authoring save response is invalid');
  }
  if (
    result.value.document.id !== context.manifest.documentId ||
    result.value.document.workspaceId !== context.workspaceId
  ) {
    throw new Error('Lodariq creator saved document does not match the SDK bootstrap context');
  }
  return structuredClone(result.value);
}

async function fetchCreatorAuthoringEndpoint(
  config: LoaderConfig,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const response = await fetchCreatorAuthoringResponse(config, url, init);
  if (!response.ok) {
    throw new Error(`Lodariq creator authoring request failed: ${response.status}`);
  }
  return response;
}

async function fetchCreatorAuthoringResponse(
  config: LoaderConfig,
  url: string,
  init: RequestInit,
): Promise<Response> {
  if (!config.clientToken || !config.authoringSessionToken) {
    throw new Error('Lodariq creator authoring credentials are missing');
  }

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${config.clientToken}`);
  headers.set('x-lodariq-authoring-session', config.authoringSessionToken);

  const response = await fetch(url, {
    ...init,
    credentials: 'omit',
    headers,
  });
  return response;
}

async function loadCreatorReleaseState(
  config: LoaderConfig,
  context: SdkInstallContext,
): Promise<AuthoringStagingReleaseState> {
  const release = requireCreatorReleaseDescriptor(context);
  const response = await fetchCreatorAuthoringEndpoint(config, release.releaseState.url, {
    method: 'GET',
  });
  const result = validate(AuthoringStagingReleaseStateSchema, await readCreatorJson(response));
  if (
    !result.valid ||
    result.value.environment !== context.environment ||
    result.value.documentId !== context.manifest.documentId
  ) {
    throw new Error('Lodariq creator release state response is invalid');
  }
  return structuredClone(result.value);
}

async function loadCreatorReleaseRecoveryState(
  config: LoaderConfig,
  context: SdkInstallContext,
  environmentId: string,
): Promise<ReleaseRecoveryStateResponse> {
  const endpoint = requireCreatorReleaseRecoveryEndpoint(config, context, environmentId, 'state');
  const response = await fetchCreatorAuthoringEndpoint(config, endpoint, { method: 'GET' });
  const validation = validate(ReleaseRecoveryStateResponseSchema, await readCreatorJson(response));
  if (
    !validation.valid ||
    !releaseRecoveryStateMatchesScope(validation.value, {
      workspaceId: context.workspaceId,
      environmentId,
      documentId: context.manifest.documentId,
    })
  ) {
    throw new Error('Lodariq creator release recovery state response is invalid');
  }
  return structuredClone(validation.value);
}

async function recoverCreatorRelease(
  config: LoaderConfig,
  context: SdkInstallContext,
  environmentId: string,
  request: ReleaseRecoveryRequest,
): Promise<ReleaseRecoveryResult> {
  const endpoint = requireCreatorReleaseRecoveryEndpoint(
    config,
    context,
    environmentId,
    request.action,
  );
  const response = await fetchCreatorAuthoringResponse(config, endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const validation = validate(ReleaseRecoveryResultSchema, await readCreatorJson(response));
  if (!validation.valid || validation.value.action !== request.action) {
    throw new Error('Lodariq creator release recovery response is invalid');
  }
  return structuredClone(validation.value);
}

function requireCreatorReleaseRecoveryEndpoint(
  config: LoaderConfig,
  context: SdkInstallContext,
  environmentId: string,
  operation: 'state' | ReleaseRecoveryRequest['action'],
): string {
  const release = requireCreatorReleaseDescriptor(context);
  const descriptors = {
    state: release.recoveryState,
    rollback: release.rollback,
    unpublish: release.unpublish,
  } as const;
  const descriptor = descriptors[operation];
  if (!descriptor) throw new Error('Lodariq creator release recovery is not authorized');
  if (!config.apiBaseUrl) throw new Error('Lodariq creator release recovery scope is missing');
  const url = new URL(descriptor.url);
  const apiOrigin = new URL(config.apiBaseUrl).origin;
  const expectedTemplatePath = '/v1/sdk/authoring/environments/:environmentId/release-recovery';
  if (
    url.origin !== apiOrigin ||
    url.pathname !== expectedTemplatePath ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error('Lodariq creator release recovery route scope is invalid');
  }
  url.pathname = expectedTemplatePath.replace(':environmentId', encodeURIComponent(environmentId));
  return url.toString();
}

async function publishCreatorToStaging(
  config: LoaderConfig,
  context: SdkInstallContext,
  request: AuthoringStagingPublicationRequest,
): Promise<AuthoringStagingPublicationResult> {
  const release = requireCreatorReleaseDescriptor(context);
  const stagingPublication = release.stagingPublication;
  if (context.environment !== 'staging' || !stagingPublication) {
    throw new Error('Lodariq creator staging publication is not authorized');
  }
  const response = await fetchCreatorAuthoringResponse(config, stagingPublication.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': request.idempotencyKey,
      'x-lodariq-correlation-id': request.correlationId,
    },
    body: JSON.stringify({
      expectedGeneration: request.expectedGeneration,
      expectedArtifactId: request.expectedArtifactId,
      expectedContentHash: request.expectedContentHash,
    }),
  });
  const payload = await readCreatorJson(response);
  const normalized = validate(AuthoringStagingPublicationResultSchema, payload);
  if (normalized.valid && (response.ok || !normalized.value.ok)) {
    return structuredClone(normalized.value);
  }
  if (response.ok) {
    throw new Error('Lodariq creator staging publication response is invalid');
  }
  return normalizeCreatorPublicationFailure(payload);
}

async function saveCreatorStyleSource(
  config: LoaderConfig,
  expectedThemeId: string,
  proposal: ProductStyleProposal,
): Promise<AuthoringStyleSourceSaveResult> {
  const proposalValidation = validate(ProductStyleProposalSchema, proposal);
  if (!proposalValidation.valid || !config.apiBaseUrl) {
    throw new Error('Lodariq creator Brand proposal is invalid');
  }
  const response = await fetchCreatorAuthoringEndpoint(
    config,
    new URL('/v1/sdk/authoring/style-sources', config.apiBaseUrl).toString(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposal: proposalValidation.value }),
    },
  );
  const payload = objectValue(await readCreatorJson(response));
  const normalized = validate(AuthoringProductMatchApplyResultSchema, payload?.['productMatch']);
  if (!normalized.valid || normalized.value.previewTheme.themeId !== expectedThemeId) {
    throw new Error('Lodariq creator Brand response is invalid');
  }
  const source = normalized.value.sources[0];
  if (!source) throw new Error('Lodariq creator Brand response is invalid');
  return {
    ...structuredClone(normalized.value),
    sourceId: source.sourceId,
    sourceHash: source.sourceHash,
  };
}

async function checkCreatorBrandDrift(
  config: LoaderConfig,
  context: SdkInstallContext,
  theme: BrandThemeSnapshot,
  request: BrandDriftCheckRequest,
): Promise<AuthoringBrandDriftCheckResult> {
  if (!config.apiBaseUrl) throw new Error('Lodariq creator Brand scope is missing');
  return requestAuthoringBrandDrift({
    request,
    expectedDocumentId: context.manifest.documentId,
    expectedThemeId: theme.themeId,
    expectedThemeVersionId: theme.themeVersionId,
    fetchAuthorized: (body) =>
      fetchCreatorAuthoringResponse(
        config,
        new URL('/v1/sdk/authoring/brand-drift', config.apiBaseUrl!).toString(),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        },
      ),
  });
}

async function acknowledgeCreatorBrandTheme(
  config: LoaderConfig,
  context: SdkInstallContext,
  theme: BrandThemeSnapshot,
  request: AuthoringBrandThemeAcknowledgementRequest,
): Promise<AuthoringBrandThemeAcknowledgementResult> {
  if (!config.apiBaseUrl) throw new Error('Lodariq creator Brand scope is missing');
  return requestAuthoringBrandThemeAcknowledgement({
    request,
    expectedWorkspaceId: context.workspaceId,
    expectedDocumentId: context.manifest.documentId,
    expectedThemeId: theme.themeId,
    fetchAuthorized: (body) =>
      fetchCreatorAuthoringResponse(
        config,
        new URL('/v1/sdk/authoring/brand-theme-acknowledgement', config.apiBaseUrl!).toString(),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        },
      ),
  });
}

async function submitCreatorStagingVerification(
  config: LoaderConfig,
  context: SdkInstallContext,
  request: AuthoringStagingVerificationRequest,
): Promise<AuthoringStagingVerificationResult> {
  const endpoint = requireCreatorReleaseDescriptor(context).stagingVerification;
  if (!endpoint) throw new Error('Lodariq creator staging verification is not authorized');
  const response = await fetchCreatorAuthoringResponse(config, endpoint.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const validation = validate(
    AuthoringStagingVerificationResultSchema,
    await readCreatorJson(response),
  );
  if (!validation.valid) throw new Error('Lodariq creator verification response is invalid');
  return structuredClone(validation.value);
}

async function promoteCreatorProduction(
  config: LoaderConfig,
  context: SdkInstallContext,
  request: ProductionPromotionRequest,
): Promise<ProductionPromotionResult> {
  const endpoint = requireCreatorReleaseDescriptor(context).productionPromotion;
  if (!endpoint) throw new Error('Lodariq creator production promotion is not authorized');
  const response = await fetchCreatorAuthoringResponse(config, endpoint.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const validation = validate(ProductionPromotionResultSchema, await readCreatorJson(response));
  if (!validation.valid) throw new Error('Lodariq creator promotion response is invalid');
  return structuredClone(validation.value);
}

async function approveCreatorProduction(
  config: LoaderConfig,
  context: SdkInstallContext,
  operationId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<{ approval: ReleaseApproval; promotion: ProductionPromotionResult }> {
  const endpoint = requireCreatorReleaseDescriptor(context).productionApproval;
  if (!endpoint) throw new Error('Lodariq creator production approval is not authorized');
  const url = endpoint.url.replace(':operationId', encodeURIComponent(operationId));
  const response = await fetchCreatorAuthoringEndpoint(config, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
  });
  const payload = objectValue(await readCreatorJson(response));
  const approval = validate(ReleaseApprovalSchema, payload?.['approval']);
  const promotion = validate(ProductionPromotionResultSchema, payload?.['promotion']);
  if (!approval.valid || !promotion.valid) {
    throw new Error('Lodariq creator approval response is invalid');
  }
  return {
    approval: structuredClone(approval.value),
    promotion: structuredClone(promotion.value),
  };
}

function creatorPublishedDocumentUrl(
  config: LoaderConfig,
  context: SdkInstallContext,
  environmentId: string,
): string {
  if (!config.apiBaseUrl) {
    throw new Error('Lodariq creator staging delivery scope is missing');
  }
  const path = [
    '/v1/sdk/workspaces',
    encodeURIComponent(context.workspaceId),
    'environments',
    encodeURIComponent(environmentId),
    'documents',
    encodeURIComponent(context.manifest.documentId),
  ].join('/');
  return new URL(path, config.apiBaseUrl).toString();
}

function requireCreatorClientToken(config: LoaderConfig): string {
  if (!config.clientToken) throw new Error('Lodariq creator environment token is missing');
  return config.clientToken;
}

function requireCreatorReleaseDescriptor(context: SdkInstallContext) {
  const release = context.authoring?.release;
  if (
    context.environment === 'production' ||
    !release ||
    release.releaseState.capability !== AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE
  ) {
    throw new Error('Lodariq creator staging publication is not authorized');
  }
  return release;
}

async function readCreatorJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error('Lodariq creator authoring response is not valid JSON');
  }
}

function normalizeCreatorPublicationFailure(payload: unknown): AuthoringStagingPublicationResult {
  const body = objectValue(payload);
  const code = boundedString(body?.['error'] ?? body?.['code'], 'release_failed', 120);
  const message = boundedString(body?.['message'], 'Staging release failed');
  const expectedGeneration = nonNegativeInteger(body?.['expectedGeneration']);
  const actualGeneration = nonNegativeInteger(body?.['actualGeneration']);
  const findings = releaseFindings(body);
  return {
    ok: false,
    code,
    message,
    ...(expectedGeneration !== null ? { expectedGeneration } : {}),
    ...(actualGeneration !== null ? { actualGeneration } : {}),
    findings: findings.length > 0 ? findings : [{ code, severity: 'blocker', label: message }],
  };
}

function releaseFindings(payload: Record<string, unknown> | null): AuthoringReleaseFinding[] {
  if (!payload) return [];
  const candidates = [
    ...(Array.isArray(payload['findings']) ? payload['findings'] : []),
    ...(Array.isArray(payload['issues']) ? payload['issues'] : []),
  ];
  const findings: AuthoringReleaseFinding[] = [];
  for (const candidate of candidates.slice(0, 64)) {
    const item = objectValue(candidate);
    if (!item) continue;
    const code = boundedString(item['code'], 'release_check', 120);
    findings.push({
      code,
      severity: item['severity'] === 'warning' ? 'warning' : 'blocker',
      label: boundedString(item['label'] ?? item['message'], 'Release check'),
    });
  }
  return findings;
}

function creatorPreviewThemeMatchesScope(
  candidate: BrandThemeSnapshot,
  approved: BrandThemeSnapshot,
): boolean {
  return (
    candidate.themeId === approved.themeId &&
    candidate.schemaVersion === approved.schemaVersion &&
    candidate.contractVersion === approved.contractVersion
  );
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, fallback: string, maxLength = 512): string {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  return value.trim().slice(0, maxLength);
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function autoInstallCreatorFromScript(currentScript: HTMLScriptElement | null): void {
  const script = currentScript ?? findCreatorInstallScript();
  if (!script || script.getAttribute(AUTO_INSTALL_ATTRIBUTE) === 'true') return;
  script.setAttribute(AUTO_INSTALL_ATTRIBUTE, 'true');
  void installCreatorLodariqFromScript({ script }).catch((error: unknown) => {
    window.dispatchEvent(
      new CustomEvent('lodariq:error', {
        detail: {
          error,
          phase: 'authoring-install',
        },
      }),
    );
  });
}

function findCreatorInstallScript(): HTMLScriptElement | null {
  if (typeof document === 'undefined') return null;
  return (
    [...document.scripts]
      .reverse()
      .find(
        (script): script is HTMLScriptElement =>
          script instanceof HTMLScriptElement && script.matches(DEFAULT_CREATOR_SCRIPT_SELECTOR),
      ) ?? null
  );
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const currentScript =
    document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
  queueMicrotask(() => autoInstallCreatorFromScript(currentScript));
}
