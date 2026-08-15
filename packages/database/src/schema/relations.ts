import { relations } from 'drizzle-orm';
import { authoritativeAnalyticsEvents, events } from './analytics';
import { productStyleApplications, styleSources, themes, themeVersions } from './brand';
import {
  brandDriftRuns,
  authoringDraftCheckpoints,
  authoringMediaAssets,
  authoringStyleRecipes,
  compiledArtifacts,
  documents,
  documentVersions,
  visualCheckRuns,
} from './documents';
import { environments } from './environments';
import {
  authOutbox,
  authSessions,
  emailVerificationChallenges,
  passwordCredentials,
  users,
  workspaceMemberships,
  workspaces,
} from './identity';
import {
  documentDeployments,
  publicationVerifications,
  publications,
  releaseApprovals,
  releaseOperations,
} from './releases';
import { authoringSessions } from './authoring-sessions';
import {
  authoringActivationGrants,
  authoringAuthorizationRequests,
  environmentTokens,
  publicSdkBootstrapGrants,
  publicSdkInstallationOrigins,
  publicSdkInstallations,
} from './sdk-authoring';

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  memberships: many(workspaceMemberships),
  environments: many(environments),
  publicSdkInstallations: many(publicSdkInstallations),
  publicSdkInstallationOrigins: many(publicSdkInstallationOrigins),
  publicSdkBootstrapGrants: many(publicSdkBootstrapGrants),
  authoringAuthorizationRequests: many(authoringAuthorizationRequests),
  authoringActivationGrants: many(authoringActivationGrants),
  themes: many(themes),
  themeVersions: many(themeVersions),
  styleSources: many(styleSources),
  productStyleApplications: many(productStyleApplications),
  brandDriftRuns: many(brandDriftRuns),
  documents: many(documents),
  authoringStyleRecipes: many(authoringStyleRecipes),
  authoringDraftCheckpoints: many(authoringDraftCheckpoints),
  authoringMediaAssets: many(authoringMediaAssets),
  visualCheckRuns: many(visualCheckRuns),
  publicationVerifications: many(publicationVerifications),
  releaseApprovals: many(releaseApprovals),
  events: many(events),
  analyticsEvents: many(authoritativeAnalyticsEvents),
}));

export const userRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMemberships),
  authSessions: many(authSessions),
  emailVerificationChallenges: many(emailVerificationChallenges),
  authOutboxMessages: many(authOutbox),
  createdDocuments: many(documents, { relationName: 'createdDocuments' }),
  updatedDocuments: many(documents, { relationName: 'updatedDocuments' }),
  approvedAuthoringRequests: many(authoringAuthorizationRequests),
  authoringActivationGrants: many(authoringActivationGrants),
  brandDriftRuns: many(brandDriftRuns),
}));

export const passwordCredentialRelations = relations(passwordCredentials, ({ one }) => ({
  user: one(users, {
    fields: [passwordCredentials.userId],
    references: [users.id],
  }),
}));

export const authSessionRelations = relations(authSessions, ({ one }) => ({
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id],
  }),
  activeWorkspace: one(workspaces, {
    fields: [authSessions.activeWorkspaceId],
    references: [workspaces.id],
  }),
}));

export const emailVerificationChallengeRelations = relations(
  emailVerificationChallenges,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationChallenges.userId],
      references: [users.id],
    }),
  }),
);

export const authOutboxRelations = relations(authOutbox, ({ one }) => ({
  user: one(users, {
    fields: [authOutbox.userId],
    references: [users.id],
  }),
}));

export const environmentRelations = relations(environments, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [environments.workspaceId],
    references: [workspaces.id],
  }),
  tokens: many(environmentTokens),
  publicSdkInstallationOrigins: many(publicSdkInstallationOrigins),
  publicSdkBootstrapGrants: many(publicSdkBootstrapGrants),
  authoringAuthorizationRequests: many(authoringAuthorizationRequests),
  authoringActivationGrants: many(authoringActivationGrants),
  publications: many(publications),
  styleSources: many(styleSources),
  productStyleApplications: many(productStyleApplications),
  brandDriftRuns: many(brandDriftRuns),
  publicationVerifications: many(publicationVerifications),
  documentDeployments: many(documentDeployments),
  visualCheckRuns: many(visualCheckRuns),
  authoringSessions: many(authoringSessions),
  events: many(events),
}));

export const themeRelations = relations(themes, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [themes.workspaceId],
    references: [workspaces.id],
  }),
  activeVersion: one(themeVersions, {
    fields: [themes.activeVersionId],
    references: [themeVersions.id],
  }),
  versions: many(themeVersions),
  styleSources: many(styleSources),
  productStyleApplications: many(productStyleApplications),
  brandDriftRuns: many(brandDriftRuns),
}));

export const themeVersionRelations = relations(themeVersions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [themeVersions.workspaceId],
    references: [workspaces.id],
  }),
  theme: one(themes, {
    fields: [themeVersions.themeId],
    references: [themes.id],
  }),
}));

export const styleSourceRelations = relations(styleSources, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [styleSources.workspaceId],
    references: [workspaces.id],
  }),
  theme: one(themes, {
    fields: [styleSources.themeId],
    references: [themes.id],
  }),
  environment: one(environments, {
    fields: [styleSources.environmentId],
    references: [environments.id],
  }),
  creator: one(users, {
    fields: [styleSources.createdByUserId],
    references: [users.id],
  }),
}));

export const productStyleApplicationRelations = relations(productStyleApplications, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [productStyleApplications.workspaceId],
    references: [workspaces.id],
  }),
  theme: one(themes, {
    fields: [productStyleApplications.themeId],
    references: [themes.id],
  }),
  environment: one(environments, {
    fields: [productStyleApplications.environmentId],
    references: [environments.id],
  }),
  creator: one(users, {
    fields: [productStyleApplications.createdByUserId],
    references: [users.id],
  }),
}));

export const brandDriftRunRelations = relations(brandDriftRuns, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [brandDriftRuns.workspaceId],
    references: [workspaces.id],
  }),
  environment: one(environments, {
    fields: [brandDriftRuns.environmentId],
    references: [environments.id],
  }),
  document: one(documents, {
    fields: [brandDriftRuns.documentId],
    references: [documents.id],
  }),
  theme: one(themes, {
    fields: [brandDriftRuns.themeId],
    references: [themes.id],
  }),
  baselineThemeVersion: one(themeVersions, {
    fields: [brandDriftRuns.baselineThemeVersionId],
    references: [themeVersions.id],
  }),
  creator: one(users, {
    fields: [brandDriftRuns.createdByUserId],
    references: [users.id],
  }),
}));

export const publicSdkInstallationRelations = relations(
  publicSdkInstallations,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [publicSdkInstallations.workspaceId],
      references: [workspaces.id],
    }),
    origins: many(publicSdkInstallationOrigins),
    bootstrapGrants: many(publicSdkBootstrapGrants),
    authoringAuthorizationRequests: many(authoringAuthorizationRequests),
    authoringActivationGrants: many(authoringActivationGrants),
  }),
);

export const publicSdkInstallationOriginRelations = relations(
  publicSdkInstallationOrigins,
  ({ one }) => ({
    installation: one(publicSdkInstallations, {
      fields: [publicSdkInstallationOrigins.installationId],
      references: [publicSdkInstallations.id],
    }),
    workspace: one(workspaces, {
      fields: [publicSdkInstallationOrigins.workspaceId],
      references: [workspaces.id],
    }),
    environment: one(environments, {
      fields: [publicSdkInstallationOrigins.environmentId],
      references: [environments.id],
    }),
  }),
);

export const publicSdkBootstrapGrantRelations = relations(
  publicSdkBootstrapGrants,
  ({ one, many }) => ({
    installation: one(publicSdkInstallations, {
      fields: [publicSdkBootstrapGrants.installationId],
      references: [publicSdkInstallations.id],
    }),
    workspace: one(workspaces, {
      fields: [publicSdkBootstrapGrants.workspaceId],
      references: [workspaces.id],
    }),
    environment: one(environments, {
      fields: [publicSdkBootstrapGrants.environmentId],
      references: [environments.id],
    }),
    authorizationRequests: many(authoringAuthorizationRequests),
  }),
);

export const authoringAuthorizationRequestRelations = relations(
  authoringAuthorizationRequests,
  ({ one, many }) => ({
    bootstrapGrant: one(publicSdkBootstrapGrants, {
      fields: [authoringAuthorizationRequests.bootstrapGrantId],
      references: [publicSdkBootstrapGrants.id],
    }),
    installation: one(publicSdkInstallations, {
      fields: [authoringAuthorizationRequests.installationId],
      references: [publicSdkInstallations.id],
    }),
    workspace: one(workspaces, {
      fields: [authoringAuthorizationRequests.workspaceId],
      references: [workspaces.id],
    }),
    environment: one(environments, {
      fields: [authoringAuthorizationRequests.environmentId],
      references: [environments.id],
    }),
    creator: one(users, {
      fields: [authoringAuthorizationRequests.creatorId],
      references: [users.id],
    }),
    activationGrants: many(authoringActivationGrants),
  }),
);

export const authoringActivationGrantRelations = relations(
  authoringActivationGrants,
  ({ one }) => ({
    authorizationRequest: one(authoringAuthorizationRequests, {
      fields: [authoringActivationGrants.requestId],
      references: [authoringAuthorizationRequests.id],
    }),
    installation: one(publicSdkInstallations, {
      fields: [authoringActivationGrants.installationId],
      references: [publicSdkInstallations.id],
    }),
    workspace: one(workspaces, {
      fields: [authoringActivationGrants.workspaceId],
      references: [workspaces.id],
    }),
    environment: one(environments, {
      fields: [authoringActivationGrants.environmentId],
      references: [environments.id],
    }),
    creator: one(users, {
      fields: [authoringActivationGrants.creatorId],
      references: [users.id],
    }),
  }),
);

export const documentRelations = relations(documents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [documents.workspaceId],
    references: [workspaces.id],
  }),
  versions: many(documentVersions),
  compiledArtifacts: many(compiledArtifacts),
  publications: many(publications),
  deployments: many(documentDeployments),
  visualCheckRuns: many(visualCheckRuns),
  brandDriftRuns: many(brandDriftRuns),
  authoringSessions: many(authoringSessions),
}));

export const visualCheckRunRelations = relations(visualCheckRuns, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [visualCheckRuns.workspaceId],
    references: [workspaces.id],
  }),
  environment: one(environments, {
    fields: [visualCheckRuns.environmentId],
    references: [environments.id],
  }),
  document: one(documents, {
    fields: [visualCheckRuns.documentId],
    references: [documents.id],
  }),
  documentVersion: one(documentVersions, {
    fields: [visualCheckRuns.documentVersionId],
    references: [documentVersions.id],
  }),
  compiledArtifact: one(compiledArtifacts, {
    fields: [visualCheckRuns.compiledArtifactId],
    references: [compiledArtifacts.id],
  }),
}));

export const publicationRelations = relations(publications, ({ one, many }) => ({
  activeDeployment: one(documentDeployments, {
    fields: [publications.id],
    references: [documentDeployments.activePublicationId],
  }),
  sourcePublication: one(publications, {
    relationName: 'publicationSource',
    fields: [publications.sourcePublicationId],
    references: [publications.id],
  }),
  previousPublication: one(publications, {
    relationName: 'previousPublication',
    fields: [publications.previousPublicationId],
    references: [publications.id],
  }),
  releaseOperation: one(releaseOperations, {
    fields: [publications.releaseOperationId],
    references: [releaseOperations.id],
  }),
  verifications: many(publicationVerifications),
}));

export const publicationVerificationRelations = relations(publicationVerifications, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [publicationVerifications.workspaceId],
    references: [workspaces.id],
  }),
  publication: one(publications, {
    fields: [publicationVerifications.publicationId],
    references: [publications.id],
  }),
  verifier: one(users, {
    fields: [publicationVerifications.verifiedByUserId],
    references: [users.id],
  }),
}));

export const documentDeploymentRelations = relations(documentDeployments, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [documentDeployments.workspaceId],
    references: [workspaces.id],
  }),
  environment: one(environments, {
    fields: [documentDeployments.environmentId],
    references: [environments.id],
  }),
  document: one(documents, {
    fields: [documentDeployments.documentId],
    references: [documents.id],
  }),
  activePublication: one(publications, {
    fields: [documentDeployments.activePublicationId],
    references: [publications.id],
  }),
  pendingReleaseOperation: one(releaseOperations, {
    fields: [documentDeployments.pendingReleaseOperationId],
    references: [releaseOperations.id],
  }),
}));

export const releaseOperationRelations = relations(releaseOperations, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [releaseOperations.workspaceId],
    references: [workspaces.id],
  }),
  environment: one(environments, {
    fields: [releaseOperations.environmentId],
    references: [environments.id],
  }),
  document: one(documents, {
    fields: [releaseOperations.documentId],
    references: [documents.id],
  }),
  requestedArtifact: one(compiledArtifacts, {
    fields: [releaseOperations.requestedArtifactId],
    references: [compiledArtifacts.id],
  }),
  sourcePublication: one(publications, {
    relationName: 'sourceReleasePublication',
    fields: [releaseOperations.sourcePublicationId],
    references: [publications.id],
  }),
  resultPublication: one(publications, {
    relationName: 'resultReleasePublication',
    fields: [releaseOperations.resultPublicationId],
    references: [publications.id],
  }),
  approvals: many(releaseApprovals),
}));

export const releaseApprovalRelations = relations(releaseApprovals, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [releaseApprovals.workspaceId],
    references: [workspaces.id],
  }),
  releaseOperation: one(releaseOperations, {
    fields: [releaseApprovals.releaseOperationId],
    references: [releaseOperations.id],
  }),
  decider: one(users, {
    fields: [releaseApprovals.decidedByUserId],
    references: [users.id],
  }),
}));
