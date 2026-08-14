import { Type, type Static } from '@sinclair/typebox';
import { BrandThemeDefinition, BrandThemeSnapshot, ProductStyleSource } from './brand';
import { Environment, DocumentStatus, DocumentType } from './common';
import { ControlPlaneAuthContext } from './control-plane';
import { EnvironmentPolicyValidationIssue, EnvironmentReleasePolicy } from './environment-policy';
import { DocumentDeployment } from './release';
import { AuthoringActivationCapabilitySet, AuthoringDocumentIntent } from './sdk';

const DashboardIdentifier = Type.String({ minLength: 1, maxLength: 256 });
const DashboardTimestamp = Type.String({ minLength: 1, maxLength: 64 });
const NullableIdentifier = Type.Union([DashboardIdentifier, Type.Null()]);

export const DashboardPublishReadinessIssue = Type.Object(
  {
    code: Type.String({ minLength: 1, maxLength: 256 }),
    blockId: Type.Optional(DashboardIdentifier),
    targetId: Type.Optional(DashboardIdentifier),
    severity: Type.Optional(Type.Union([Type.Literal('blocker'), Type.Literal('warning')])),
    label: Type.String({ minLength: 1, maxLength: 256 }),
    message: Type.String({ minLength: 1, maxLength: 2_048 }),
  },
  { additionalProperties: false },
);
export type DashboardPublishReadinessIssue = Static<typeof DashboardPublishReadinessIssue>;

const DashboardPublicationVerification = Type.Union([
  Type.Object({ status: Type.Literal('not-run') }, { additionalProperties: false }),
  Type.Object(
    {
      status: Type.Union([Type.Literal('passed'), Type.Literal('failed')]),
      result: Type.Union([Type.Literal('passed'), Type.Literal('failed')]),
      verificationId: DashboardIdentifier,
      verifiedAt: DashboardTimestamp,
      createdAt: DashboardTimestamp,
    },
    { additionalProperties: false },
  ),
]);

export const DashboardDocumentPublication = Type.Object(
  {
    id: Type.Optional(DashboardIdentifier),
    publicationId: Type.Optional(DashboardIdentifier),
    environmentId: DashboardIdentifier,
    environment: Type.Ref(Environment),
    contentHash: Type.String({ minLength: 1, maxLength: 256 }),
    publishedAt: DashboardTimestamp,
    compiledArtifactId: Type.Optional(DashboardIdentifier),
    action: Type.Optional(
      Type.Union([
        Type.Literal('publish'),
        Type.Literal('promote'),
        Type.Literal('rollback'),
        Type.Null(),
      ]),
    ),
    sourcePublicationId: Type.Optional(NullableIdentifier),
    previousPublicationId: Type.Optional(NullableIdentifier),
    releaseOperationId: Type.Optional(NullableIdentifier),
    active: Type.Optional(Type.Boolean()),
    generation: Type.Optional(Type.Integer({ minimum: 0 })),
    rendererContractVersion: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    themeVersionId: Type.Optional(DashboardIdentifier),
    themeContentHash: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    verification: Type.Optional(DashboardPublicationVerification),
  },
  { additionalProperties: false },
);
export type DashboardDocumentPublication = Static<typeof DashboardDocumentPublication>;

export const DashboardDocumentSummary = Type.Object(
  {
    id: DashboardIdentifier,
    workspaceId: DashboardIdentifier,
    type: Type.Ref(DocumentType),
    status: Type.Ref(DocumentStatus),
    title: Type.String({ minLength: 1, maxLength: 512 }),
    schemaVersion: Type.String({ minLength: 1, maxLength: 64 }),
    createdByUserId: NullableIdentifier,
    updatedByUserId: NullableIdentifier,
    updatedAt: DashboardTimestamp,
    latestContentHash: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    latestCompiledArtifactId: Type.Optional(DashboardIdentifier),
    publishReadinessIssues: Type.Array(DashboardPublishReadinessIssue, { maxItems: 10_000 }),
    publications: Type.Array(DashboardDocumentPublication, { maxItems: 1_000 }),
    deployments: Type.Optional(Type.Array(Type.Ref(DocumentDeployment), { maxItems: 1_000 })),
  },
  { additionalProperties: false },
);
export type DashboardDocumentSummary = Static<typeof DashboardDocumentSummary>;

export const DashboardWorkspaceEnvironment = Type.Object(
  {
    id: DashboardIdentifier,
    workspaceId: DashboardIdentifier,
    kind: Type.Ref(Environment),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    originAllowlist: Type.Array(Type.String({ minLength: 1, maxLength: 2_048 }), {
      maxItems: 100,
      uniqueItems: true,
    }),
    requiredApprovalCount: Type.Optional(Type.Union([Type.Literal(0), Type.Literal(1)])),
    enabled: Type.Optional(Type.Boolean()),
    pipelinePosition: Type.Optional(Type.Integer({ minimum: 0, maximum: 2 })),
    authoringEnabled: Type.Optional(Type.Boolean()),
    promotionSourceEnvironmentId: Type.Optional(DashboardIdentifier),
    releasePolicy: Type.Optional(Type.Ref(EnvironmentReleasePolicy)),
    createdAt: DashboardTimestamp,
    updatedAt: DashboardTimestamp,
  },
  { additionalProperties: false },
);
export type DashboardWorkspaceEnvironment = Static<typeof DashboardWorkspaceEnvironment>;

export const DashboardEnvironmentToken = Type.Object(
  {
    id: DashboardIdentifier,
    workspaceId: DashboardIdentifier,
    environmentId: DashboardIdentifier,
    environment: Type.Ref(Environment),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    tokenPrefix: Type.String({ minLength: 1, maxLength: 256 }),
    createdAt: DashboardTimestamp,
    revokedAt: Type.Optional(Type.Union([DashboardTimestamp, Type.Null()])),
  },
  { additionalProperties: false },
);
export type DashboardEnvironmentToken = Static<typeof DashboardEnvironmentToken>;

export const DashboardPublicSdkInstallationOrigin = Type.Object(
  {
    installationId: DashboardIdentifier,
    workspaceId: DashboardIdentifier,
    environmentId: DashboardIdentifier,
    exactOrigin: Type.String({ minLength: 1, maxLength: 2_048 }),
    authoringEnabled: Type.Boolean(),
    createdAt: DashboardTimestamp,
    updatedAt: DashboardTimestamp,
  },
  { additionalProperties: false },
);
export type DashboardPublicSdkInstallationOrigin = Static<
  typeof DashboardPublicSdkInstallationOrigin
>;

export const DashboardPublicSdkInstallation = Type.Object(
  {
    installationId: DashboardIdentifier,
    workspaceId: DashboardIdentifier,
    name: Type.String({ minLength: 1, maxLength: 120 }),
    createdByUserId: NullableIdentifier,
    createdAt: DashboardTimestamp,
    updatedAt: DashboardTimestamp,
    revokedAt: Type.Union([DashboardTimestamp, Type.Null()]),
    origins: Type.Array(DashboardPublicSdkInstallationOrigin, { maxItems: 100 }),
    sdkSnippet: Type.String({ minLength: 1, maxLength: 16_384 }),
  },
  { additionalProperties: false },
);
export type DashboardPublicSdkInstallation = Static<typeof DashboardPublicSdkInstallation>;

export const DashboardWorkspaceThemeVersion = Type.Object(
  {
    id: DashboardIdentifier,
    workspaceId: DashboardIdentifier,
    themeId: DashboardIdentifier,
    version: Type.Integer({ minimum: 1 }),
    schemaVersion: BrandThemeSnapshot.properties.schemaVersion,
    contractVersion: BrandThemeSnapshot.properties.contractVersion,
    snapshot: Type.Ref(BrandThemeSnapshot),
    contentHash: Type.String({ minLength: 1, maxLength: 256 }),
    approvedByUserId: NullableIdentifier,
    approvedAt: DashboardTimestamp,
    createdAt: DashboardTimestamp,
  },
  { additionalProperties: false },
);
export type DashboardWorkspaceThemeVersion = Static<typeof DashboardWorkspaceThemeVersion>;

export const DashboardWorkspaceThemeStyleSource = Type.Object(
  {
    ...ProductStyleSource.properties,
    recordId: DashboardIdentifier,
    sourceHash: Type.String({ minLength: 1, maxLength: 256 }),
    environmentId: DashboardIdentifier,
    recordedAt: DashboardTimestamp,
  },
  { additionalProperties: false },
);
export type DashboardWorkspaceThemeStyleSource = Static<typeof DashboardWorkspaceThemeStyleSource>;

export const DashboardWorkspaceTheme = Type.Object(
  {
    id: DashboardIdentifier,
    workspaceId: DashboardIdentifier,
    name: Type.String({ minLength: 1, maxLength: 120 }),
    draft: Type.Ref(BrandThemeDefinition),
    revision: Type.Integer({ minimum: 1 }),
    isDefault: Type.Boolean(),
    activeVersionId: NullableIdentifier,
    activeVersion: Type.Union([DashboardWorkspaceThemeVersion, Type.Null()]),
    createdByUserId: NullableIdentifier,
    updatedByUserId: NullableIdentifier,
    createdAt: DashboardTimestamp,
    updatedAt: DashboardTimestamp,
    latestStyleSource: Type.Optional(Type.Union([DashboardWorkspaceThemeStyleSource, Type.Null()])),
  },
  { additionalProperties: false },
);
export type DashboardWorkspaceTheme = Static<typeof DashboardWorkspaceTheme>;

export const DashboardWorkspaceData = Type.Object(
  {
    controlPlaneContext: Type.Ref(ControlPlaneAuthContext),
    documents: Type.Array(DashboardDocumentSummary, { maxItems: 10_000 }),
    environments: Type.Array(DashboardWorkspaceEnvironment, { maxItems: 100 }),
    tokens: Type.Array(DashboardEnvironmentToken, { maxItems: 10_000 }),
    installations: Type.Array(DashboardPublicSdkInstallation, { maxItems: 1_000 }),
    themes: Type.Array(DashboardWorkspaceTheme, { maxItems: 1_000 }),
    unavailableResources: Type.Array(
      Type.Union([
        Type.Literal('documents'),
        Type.Literal('environments'),
        Type.Literal('tokens'),
        Type.Literal('installations'),
        Type.Literal('themes'),
      ]),
      { maxItems: 5, uniqueItems: true },
    ),
  },
  { $id: 'DashboardWorkspaceData', additionalProperties: false },
);
export type DashboardWorkspaceData = Static<typeof DashboardWorkspaceData>;

export const DashboardDocumentsResponse = Type.Object(
  { documents: Type.Array(DashboardDocumentSummary, { maxItems: 10_000 }) },
  { additionalProperties: false },
);
export const DashboardEnvironmentsResponse = Type.Object(
  { environments: Type.Array(DashboardWorkspaceEnvironment, { maxItems: 100 }) },
  { additionalProperties: false },
);
export const DashboardEnvironmentTokensResponse = Type.Object(
  { tokens: Type.Array(DashboardEnvironmentToken, { maxItems: 10_000 }) },
  { additionalProperties: false },
);
export const DashboardSdkInstallationsResponse = Type.Object(
  { installations: Type.Array(DashboardPublicSdkInstallation, { maxItems: 1_000 }) },
  { additionalProperties: false },
);
export const DashboardThemesResponse = Type.Object(
  { themes: Type.Array(DashboardWorkspaceTheme, { maxItems: 1_000 }) },
  { additionalProperties: false },
);

export const DashboardWorkspaceThemeImpact = Type.Object(
  {
    documentId: DashboardIdentifier,
    title: Type.String({ minLength: 1, maxLength: 512 }),
    status: Type.Ref(DocumentStatus),
    bindingPolicy: Type.Union([
      Type.Literal('workspace-current'),
      Type.Literal('pinned'),
      Type.Literal('legacy'),
    ]),
    acknowledgedThemeVersionId: NullableIdentifier,
    pinnedThemeVersionId: NullableIdentifier,
    latestArtifactThemeVersionId: NullableIdentifier,
    activeEnvironmentIds: Type.Array(DashboardIdentifier, { maxItems: 100 }),
  },
  { additionalProperties: false },
);
export type DashboardWorkspaceThemeImpact = Static<typeof DashboardWorkspaceThemeImpact>;

export const DashboardWorkspaceThemeDetail = Type.Object(
  {
    theme: DashboardWorkspaceTheme,
    versions: Type.Array(DashboardWorkspaceThemeVersion, { maxItems: 10_000 }),
    impact: Type.Array(DashboardWorkspaceThemeImpact, { maxItems: 10_000 }),
  },
  { additionalProperties: false },
);
export type DashboardWorkspaceThemeDetail = Static<typeof DashboardWorkspaceThemeDetail>;

export const DashboardEnvironmentMutationResponse = Type.Object(
  { environment: DashboardWorkspaceEnvironment },
  { additionalProperties: false },
);
export const DashboardEnvironmentMutationError = Type.Object(
  {
    error: Type.String({ minLength: 1, maxLength: 120 }),
    message: Type.String({ minLength: 1, maxLength: 512 }),
    expectedUpdatedAt: Type.Optional(DashboardTimestamp),
    actualUpdatedAt: Type.Optional(DashboardTimestamp),
    issues: Type.Optional(
      Type.Array(Type.Ref(EnvironmentPolicyValidationIssue), { maxItems: 100 }),
    ),
  },
  { additionalProperties: false },
);
export const DashboardEnvironmentTokenCreateResponse = Type.Object(
  {
    token: DashboardEnvironmentToken,
    clientToken: Type.String({ minLength: 1, maxLength: 4_096 }),
    sdkSnippet: Type.String({ minLength: 1, maxLength: 16_384 }),
  },
  { additionalProperties: false },
);
export const DashboardEnvironmentTokenRevokeResponse = Type.Object(
  { token: DashboardEnvironmentToken },
  { additionalProperties: false },
);

export const DashboardPublicSdkInstallationRecord = Type.Omit(
  DashboardPublicSdkInstallation,
  ['origins', 'sdkSnippet'],
  { additionalProperties: false },
);
export const DashboardPublicSdkInstallationCreateResponse = Type.Object(
  {
    installation: DashboardPublicSdkInstallationRecord,
    sdkSnippet: Type.String({ minLength: 1, maxLength: 16_384 }),
  },
  { additionalProperties: false },
);
export const DashboardPublicSdkInstallationOriginsResponse = Type.Object(
  {
    origins: Type.Array(DashboardPublicSdkInstallationOrigin, { maxItems: 100 }),
  },
  { additionalProperties: false },
);
export const DashboardPublicSdkInstallationRevokeResponse = Type.Object(
  { installation: DashboardPublicSdkInstallationRecord },
  { additionalProperties: false },
);

export const DashboardThemeMutationResponse = Type.Object(
  { theme: DashboardWorkspaceTheme },
  { additionalProperties: false },
);
export const DashboardThemeMutationError = Type.Object(
  {
    error: Type.String({ minLength: 1, maxLength: 120 }),
    message: Type.String({ minLength: 1, maxLength: 512 }),
    themeId: Type.Optional(DashboardIdentifier),
    proposalId: Type.Optional(DashboardIdentifier),
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    actualRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    expectedUpdatedAt: Type.Optional(DashboardTimestamp),
    actualUpdatedAt: Type.Optional(DashboardTimestamp),
  },
  { additionalProperties: false },
);
export const DashboardThemeApprovalResponse = Type.Object(
  {
    theme: DashboardWorkspaceTheme,
    approvedVersion: DashboardWorkspaceThemeVersion,
  },
  { additionalProperties: false },
);

const DashboardDebugArtifact = Type.Object(
  {
    id: DashboardIdentifier,
    workspaceId: DashboardIdentifier,
    documentId: DashboardIdentifier,
    documentVersionId: Type.Optional(NullableIdentifier),
    contentHash: Type.String({ minLength: 1, maxLength: 256 }),
    compilerVersion: Type.String({ minLength: 1, maxLength: 256 }),
    createdAt: DashboardTimestamp,
    compiled: Type.Unknown(),
  },
  { additionalProperties: true },
);

const DashboardDebugDocumentVersion = Type.Object(
  {
    id: DashboardIdentifier,
    workspaceId: DashboardIdentifier,
    documentId: DashboardIdentifier,
    version: Type.Integer({ minimum: 1 }),
    canonical: Type.Unknown(),
    createdByUserId: NullableIdentifier,
    createdAt: DashboardTimestamp,
  },
  { additionalProperties: true },
);

export const DashboardDocumentDebugResponse = Type.Object(
  {
    canonical: Type.Unknown(),
    latestArtifact: Type.Union([DashboardDebugArtifact, Type.Null()]),
    publishReadinessIssues: Type.Array(DashboardPublishReadinessIssue, { maxItems: 10_000 }),
    versions: Type.Array(DashboardDebugDocumentVersion, { maxItems: 10_000 }),
  },
  { additionalProperties: false },
);

export const DashboardPendingAuthoringAuthorization = Type.Object(
  {
    requestId: DashboardIdentifier,
    installationId: DashboardIdentifier,
    environmentId: DashboardIdentifier,
    environment: Type.Union([Type.Literal('development'), Type.Literal('staging')]),
    customerOrigin: Type.String({ minLength: 1, maxLength: 2_048 }),
    requestedCapabilities: Type.Ref(AuthoringActivationCapabilitySet),
    documentIntent: Type.Optional(Type.Ref(AuthoringDocumentIntent)),
    expiresAt: DashboardTimestamp,
  },
  { additionalProperties: false },
);
export type DashboardPendingAuthoringAuthorization = Static<
  typeof DashboardPendingAuthoringAuthorization
>;

export const DashboardClientError = Type.Object(
  {
    code: Type.String({ minLength: 1, maxLength: 120 }),
    message: Type.String({ minLength: 1, maxLength: 512 }),
    requestId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  },
  { $id: 'DashboardClientError', additionalProperties: false },
);
export type DashboardClientError = Static<typeof DashboardClientError>;
