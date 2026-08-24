import { msg } from '@lingui/core/macro';

export const DASHBOARD_METADATA_MESSAGES = {
  title: msg({
    id: 'dashboard.metadata.title',
    message: 'Lodariq Experience Workspace',
  }),
  description: msg({
    id: 'dashboard.metadata.description',
    message: 'Lodariq dashboard for authoring, installing, and publishing product experiences.',
  }),
} as const;

export const DASHBOARD_NAVIGATION_MESSAGES = {
  overview: msg({ id: 'dashboard.navigation.overview', message: 'Overview' }),
  experiences: msg({ id: 'dashboard.navigation.experiences', message: 'Experiences' }),
  releases: msg({ id: 'dashboard.navigation.releases', message: 'Releases' }),
  analytics: msg({ id: 'dashboard.navigation.analytics', message: 'Analytics' }),
  brandSystem: msg({ id: 'dashboard.navigation.brandSystem', message: 'Brand system' }),
  environments: msg({ id: 'dashboard.navigation.environments', message: 'Environments' }),
  members: msg({ id: 'dashboard.navigation.members', message: 'Members' }),
  applications: msg({ id: 'dashboard.navigation.applications', message: 'Applications' }),
  billing: msg({ id: 'dashboard.navigation.billing', message: 'Billing' }),
  support: msg({ id: 'dashboard.navigation.support', message: 'Help & support' }),
  workspace: msg({ id: 'dashboard.navigation.workspaceLabel', message: 'Workspace' }),
  supportLabel: msg({ id: 'dashboard.navigation.supportLabel', message: 'Support' }),
  open: msg({ id: 'dashboard.navigation.open', message: 'Open workspace navigation' }),
  close: msg({ id: 'dashboard.navigation.close', message: 'Close workspace navigation' }),
  collapse: msg({ id: 'dashboard.navigation.collapse', message: 'Collapse workspace navigation' }),
  expand: msg({ id: 'dashboard.navigation.expand', message: 'Expand workspace navigation' }),
  appearance: msg({ id: 'dashboard.navigation.appearance', message: 'Appearance' }),
} as const;

export const DASHBOARD_THEME_MESSAGES = {
  switchToLight: msg({ id: 'dashboard.theme.switchToLight', message: 'Switch to light theme' }),
  switchToDark: msg({ id: 'dashboard.theme.switchToDark', message: 'Switch to dark theme' }),
} as const;

export const ACCOUNT_PAGE_MESSAGES = {
  workspace: msg({ id: 'account.navigation.workspace', message: 'Workspace' }),
  securityEyebrow: msg({ id: 'account.security.eyebrow', message: 'Account security' }),
  emailChangeTitle: msg({ id: 'account.emailChange.title', message: 'Confirm email change' }),
  emailChangeDescription: msg({
    id: 'account.emailChange.description',
    message: 'Complete one half of the two-address verification.',
  }),
  emailChangeInvalidDescription: msg({
    id: 'account.emailChange.invalidDescription',
    message: 'Use the complete link from your most recent Lodariq email.',
  }),
  returnToSecurity: msg({
    id: 'account.emailChange.returnToSecurity',
    message: 'Return to account security',
  }),
  accessEyebrow: msg({ id: 'account.access.eyebrow', message: 'Account access' }),
  forgotUsernameTitle: msg({
    id: 'account.forgotUsername.title',
    message: 'Forgot your username?',
  }),
  forgotUsernameDescription: msg({
    id: 'account.forgotUsername.description',
    message:
      'Your verified email is always a valid Lodariq sign-in identifier. If you also forgot your password, request a private recovery link.',
  }),
  signInWithEmail: msg({
    id: 'account.forgotUsername.signInWithEmail',
    message: 'Sign in with email',
  }),
  recoverAccess: msg({
    id: 'account.forgotUsername.recoverAccess',
    message: 'Recover account access',
  }),
} as const;

export const RECOVERY_CODE_MESSAGES = {
  eyebrow: msg({ id: 'recoveryCode.eyebrow', message: 'Account recovery' }),
  title: msg({ id: 'recoveryCode.title', message: 'Use a recovery code' }),
  description: msg({
    id: 'recoveryCode.description',
    message: 'Enter one saved single-use code. Lodariq will never ask for more than one.',
  }),
  identifier: msg({ id: 'recoveryCode.identifier', message: 'Email or username' }),
  code: msg({ id: 'recoveryCode.code', message: 'Recovery code' }),
  codeHelp: msg({
    id: 'recoveryCode.codeHelp',
    message: 'Codes begin with LQRC and work once.',
  }),
  rememberMe: msg({ id: 'recoveryCode.rememberMe', message: 'Remember this device' }),
  submit: msg({ id: 'recoveryCode.submit', message: 'Recover account' }),
  submitting: msg({ id: 'recoveryCode.submitting', message: 'Checking recovery code…' }),
  invalid: msg({
    id: 'recoveryCode.invalid',
    message: 'Enter your identifier and a complete recovery code.',
  }),
  unavailable: msg({
    id: 'recoveryCode.unavailable',
    message: 'The identifier or recovery code is incorrect.',
  }),
} as const;

export const DASHBOARD_LOCALE_MESSAGES = {
  label: msg({ id: 'dashboard.locale.label', message: 'Language' }),
  change: msg({ id: 'dashboard.locale.change', message: 'Change language' }),
  changing: msg({ id: 'dashboard.locale.changing', message: 'Changing language' }),
  error: msg({
    id: 'dashboard.locale.error',
    message: 'Language could not be changed. Try again.',
  }),
} as const;

export const DASHBOARD_PAGE_MESSAGES = {
  overviewTitle: msg({ id: 'dashboard.page.overview.title', message: 'Launch queue' }),
  overviewDescription: msg({
    id: 'dashboard.page.overview.description',
    message: 'Follow the progress of experiences from draft to production.',
  }),
  experiencesTitle: msg({ id: 'dashboard.page.experiences.title', message: 'Experiences' }),
  experiencesDescription: msg({
    id: 'dashboard.page.experiences.description',
    message: 'Find every saved experience and inspect its current publishing state.',
  }),
  releasesTitle: msg({ id: 'dashboard.page.releases.title', message: 'Release details' }),
  releasesDescription: msg({
    id: 'dashboard.page.releases.description',
    message: 'Review the environment state Lodariq can currently prove for each experience.',
  }),
  analyticsTitle: msg({ id: 'dashboard.page.analytics.title', message: 'Analytics' }),
  analyticsDescription: msg({
    id: 'dashboard.page.analytics.description',
    message: 'Inspect release-scoped facts for one explicitly selected environment at a time.',
  }),
  brandSystemTitle: msg({ id: 'dashboard.page.brandSystem.title', message: 'Brand system' }),
  brandSystemDescription: msg({
    id: 'dashboard.page.brandSystem.description',
    message: 'Shape the customer experience with safe tokens, then approve each version.',
  }),
  environmentsTitle: msg({ id: 'dashboard.page.environments.title', message: 'Environments' }),
  environmentsDescription: msg({
    id: 'dashboard.page.environments.description',
    message: 'Manage trusted product origins and each environment runtime installation.',
  }),
  membersTitle: msg({ id: 'dashboard.page.members.title', message: 'Members & access' }),
  membersDescription: msg({
    id: 'dashboard.page.members.description',
    message: 'Invite collaborators, assign roles, and review workspace access.',
  }),
  applicationsTitle: msg({ id: 'dashboard.page.applications.title', message: 'Applications' }),
  applicationsDescription: msg({
    id: 'dashboard.page.applications.description',
    message:
      'One application is one brand theme plus one content library. A journey hands off between them.',
  }),
  billingTitle: msg({ id: 'dashboard.page.billing.title', message: 'Billing & usage' }),
  billingDescription: msg({
    id: 'dashboard.page.billing.description',
    message: 'Review plan limits, reconciled usage, invoices, and subscription status.',
  }),
  supportTitle: msg({ id: 'dashboard.page.support.title', message: 'Help & support' }),
  supportDescription: msg({
    id: 'dashboard.page.support.description',
    message: 'Use fallback authoring and diagnostic tools only when the in-product path fails.',
  }),
  openInProduct: msg({ id: 'dashboard.page.openInProduct', message: 'Open in product' }),
} as const;

export const DASHBOARD_COMMON_MESSAGES = {
  draft: msg({ id: 'dashboard.common.draft', message: 'Draft' }),
  development: msg({ id: 'dashboard.common.development', message: 'Development' }),
  staging: msg({ id: 'dashboard.common.staging', message: 'Staging' }),
  production: msg({ id: 'dashboard.common.production', message: 'Production' }),
  reviewRelease: msg({ id: 'dashboard.common.reviewRelease', message: 'Review release' }),
  active: msg({ id: 'dashboard.common.active', message: 'Active' }),
  inactive: msg({ id: 'dashboard.common.inactive', message: 'Inactive' }),
  disabled: msg({ id: 'dashboard.common.disabled', message: 'Disabled' }),
  unknown: msg({ id: 'dashboard.common.unknown', message: 'Unknown' }),
  notAvailable: msg({ id: 'dashboard.common.notAvailable', message: 'Not available' }),
  loading: msg({ id: 'dashboard.common.loading', message: 'Loading…' }),
  close: msg({ id: 'dashboard.common.close', message: 'Close' }),
  cancel: msg({ id: 'dashboard.common.cancel', message: 'Cancel' }),
  save: msg({ id: 'dashboard.common.save', message: 'Save' }),
  refresh: msg({ id: 'dashboard.common.refresh', message: 'Refresh' }),
  choose: msg({ id: 'dashboard.common.choose', message: 'Choose' }),
} as const;

export const DASHBOARD_VIEW_MODEL_MESSAGES = {
  statusReview: msg({ id: 'dashboard.viewModel.status.review', message: 'Review' }),
  statusApproved: msg({ id: 'dashboard.viewModel.status.approved', message: 'Approved' }),
  statusLive: msg({ id: 'dashboard.viewModel.status.live', message: 'Live' }),
  typeTour: msg({ id: 'dashboard.viewModel.type.tour', message: 'Tour' }),
  typeAnnouncement: msg({
    id: 'dashboard.viewModel.type.announcement',
    message: 'Announcement',
  }),
  typeChecklist: msg({ id: 'dashboard.viewModel.type.checklist', message: 'Checklist' }),
  typeSurvey: msg({ id: 'dashboard.viewModel.type.survey', message: 'Survey' }),
  typeHotspot: msg({ id: 'dashboard.viewModel.type.hotspot', message: 'Hotspot' }),
  typeKnowledge: msg({ id: 'dashboard.viewModel.type.knowledge', message: 'Knowledge' }),
  noOrigins: msg({ id: 'dashboard.viewModel.noOrigins', message: 'No origins' }),
  revoked: msg({ id: 'dashboard.viewModel.revoked', message: 'Revoked' }),
  active: msg({ id: 'dashboard.viewModel.active', message: 'Active' }),
  notSpecified: msg({ id: 'dashboard.viewModel.notSpecified', message: 'Not specified' }),
  needsReview: msg({ id: 'dashboard.viewModel.needsReview', message: 'Needs review' }),
  reviewBlockers: msg({ id: 'dashboard.viewModel.reviewBlockers', message: 'Review blockers' }),
  publishIssues: msg({
    id: 'dashboard.viewModel.publishIssues',
    message: '{count} publish {count, plural, one {issue} other {issues}}',
  }),
  reviewBeforePublish: msg({
    id: 'dashboard.viewModel.reviewBeforePublish',
    message: '{issues} must be reviewed before this draft can be published.',
  }),
  draftNotPrepared: msg({
    id: 'dashboard.viewModel.draftNotPrepared',
    message: 'Draft not prepared',
  }),
  prepareDraft: msg({ id: 'dashboard.viewModel.prepareDraft', message: 'Prepare draft' }),
  previewToPrepareDraft: msg({
    id: 'dashboard.viewModel.previewToPrepareDraft',
    message: 'Preview this experience once to prepare a publishable draft.',
  }),
  productionLive: msg({ id: 'dashboard.viewModel.productionLive', message: 'Production live' }),
  productionPublished: msg({
    id: 'dashboard.viewModel.productionPublished',
    message: 'Production published',
  }),
  reviewRelease: msg({ id: 'dashboard.viewModel.reviewRelease', message: 'Review release' }),
  productionUpdate: msg({
    id: 'dashboard.viewModel.productionUpdate',
    message: 'Production update',
  }),
  reviewProductionUpdate: msg({
    id: 'dashboard.viewModel.reviewProductionUpdate',
    message: 'Review production update',
  }),
  productionEarlierHash: msg({
    id: 'dashboard.viewModel.productionEarlierHash',
    message:
      'The latest production publication record uses an earlier content hash than the saved draft.',
  }),
  stagingVerified: msg({ id: 'dashboard.viewModel.stagingVerified', message: 'Staging verified' }),
  stagingPublished: msg({
    id: 'dashboard.viewModel.stagingPublished',
    message: 'Staging published',
  }),
  reviewPromotion: msg({
    id: 'dashboard.viewModel.reviewPromotion',
    message: 'Review promotion',
  }),
  reviewVerification: msg({
    id: 'dashboard.viewModel.reviewVerification',
    message: 'Review verification',
  }),
  stagedArtifactReady: msg({
    id: 'dashboard.viewModel.stagedArtifactReady',
    message: 'The exact staged artifact is verified and ready for deliberate production promotion.',
  }),
  stagedArtifactNeedsVerification: msg({
    id: 'dashboard.viewModel.stagedArtifactNeedsVerification',
    message: 'The staged artifact matches the draft; exact browser verification is still required.',
  }),
  stagingUpdate: msg({ id: 'dashboard.viewModel.stagingUpdate', message: 'Staging update' }),
  publishCurrentDraft: msg({
    id: 'dashboard.viewModel.publishCurrentDraft',
    message: 'Publish current draft',
  }),
  stagingEarlierHash: msg({
    id: 'dashboard.viewModel.stagingEarlierHash',
    message:
      'The latest staging publication record uses an earlier content hash than the saved draft.',
  }),
  readyForStaging: msg({
    id: 'dashboard.viewModel.readyForStaging',
    message: 'Ready for staging',
  }),
  publishToStaging: msg({
    id: 'dashboard.viewModel.publishToStaging',
    message: 'Publish to staging',
  }),
  noStagingRecordYet: msg({
    id: 'dashboard.viewModel.noStagingRecordYet',
    message: 'The saved draft has no staging publication record yet.',
  }),
  draftSaved: msg({ id: 'dashboard.viewModel.draftSaved', message: 'Draft saved' }),
  currentSavedContent: msg({
    id: 'dashboard.viewModel.currentSavedContent',
    message: 'Current saved content',
  }),
  needsPreview: msg({ id: 'dashboard.viewModel.needsPreview', message: 'Needs preview' }),
  noCompiledDraft: msg({
    id: 'dashboard.viewModel.noCompiledDraft',
    message: 'No compiled draft yet',
  }),
  noRecord: msg({ id: 'dashboard.viewModel.noRecord', message: 'No record' }),
  noEnvironmentPublicationRecord: msg({
    id: 'dashboard.viewModel.noEnvironmentPublicationRecord',
    message: 'No {environment} publication record',
  }),
  newerDraft: msg({ id: 'dashboard.viewModel.newerDraft', message: 'Newer draft' }),
  latestRecordAt: msg({
    id: 'dashboard.viewModel.latestRecordAt',
    message: 'Latest record {date}',
  }),
  verified: msg({ id: 'dashboard.viewModel.verified', message: 'Verified' }),
  verifiedExactArtifactAt: msg({
    id: 'dashboard.viewModel.verifiedExactArtifactAt',
    message: 'Verified exact artifact {date}',
  }),
  live: msg({ id: 'dashboard.viewModel.live', message: 'Live' }),
  activePublicationAt: msg({
    id: 'dashboard.viewModel.activePublicationAt',
    message: 'Active publication {date}',
  }),
  published: msg({ id: 'dashboard.viewModel.published', message: 'Published' }),
  publishedVerificationPending: msg({
    id: 'dashboard.viewModel.publishedVerificationPending',
    message: 'Published {date} · verification pending',
  }),
  publishedDeliveryUnconfirmed: msg({
    id: 'dashboard.viewModel.publishedDeliveryUnconfirmed',
    message: 'Published {date} · active delivery unconfirmed',
  }),
  exactArtifactPromoted: msg({
    id: 'dashboard.viewModel.exactArtifactPromoted',
    message: 'Production points to the exact artifact promoted from staging.',
  }),
  activeProvenanceUnavailable: msg({
    id: 'dashboard.viewModel.activeProvenanceUnavailable',
    message: 'Production is active, but exact staging-artifact provenance is not available yet.',
  }),
  productionMatchesNoDeliveryEvidence: msg({
    id: 'dashboard.viewModel.productionMatchesNoDeliveryEvidence',
    message:
      'A production publication matches the draft; active-delivery evidence is not available yet.',
  }),
  currentDraft: msg({ id: 'dashboard.viewModel.currentDraft', message: 'Current draft' }),
  notPrepared: msg({ id: 'dashboard.viewModel.notPrepared', message: 'Not prepared' }),
  stagingEvidence: msg({ id: 'dashboard.viewModel.stagingEvidence', message: 'Staging evidence' }),
  productionEvidence: msg({
    id: 'dashboard.viewModel.productionEvidence',
    message: 'Production evidence',
  }),
  artifactIdentity: msg({
    id: 'dashboard.viewModel.artifactIdentity',
    message: 'Artifact identity',
  }),
  previewToPrepareArtifact: msg({
    id: 'dashboard.viewModel.previewToPrepareArtifact',
    message: 'Preview once to prepare a publishable artifact',
  }),
  noBlockingChecks: msg({
    id: 'dashboard.viewModel.noBlockingChecks',
    message: 'No blocking checks',
  }),
  blockingChecks: msg({
    id: 'dashboard.viewModel.blockingChecks',
    message: '{count} blocking {count, plural, one {check} other {checks}}',
  }),
  notPublished: msg({ id: 'dashboard.viewModel.notPublished', message: 'Not published' }),
  noStagingPublicationRecord: msg({
    id: 'dashboard.viewModel.noStagingPublicationRecord',
    message: 'No staging publication record',
  }),
  exactArtifactVerifiedAt: msg({
    id: 'dashboard.viewModel.exactArtifactVerifiedAt',
    message: 'Exact artifact verified {date}',
  }),
  publishedNoBrowserVerification: msg({
    id: 'dashboard.viewModel.publishedNoBrowserVerification',
    message: 'Published {date} · browser verification not recorded',
  }),
  noProductionPublicationRecord: msg({
    id: 'dashboard.viewModel.noProductionPublicationRecord',
    message: 'No production publication record',
  }),
  exactStagedArtifactActiveAt: msg({
    id: 'dashboard.viewModel.exactStagedArtifactActiveAt',
    message: 'Exact staged artifact active since {date}',
  }),
  activeNoProvenanceAt: msg({
    id: 'dashboard.viewModel.activeNoProvenanceAt',
    message: 'Active since {date} · exact staging provenance unavailable',
  }),
  publishedPointerNotExposed: msg({
    id: 'dashboard.viewModel.publishedPointerNotExposed',
    message: 'Published {date} · active pointer not exposed',
  }),
  immutableCompiledArtifact: msg({
    id: 'dashboard.viewModel.immutableCompiledArtifact',
    message: 'Immutable compiled artifact',
  }),
  contentHashStrongestEvidence: msg({
    id: 'dashboard.viewModel.contentHashStrongestEvidence',
    message: 'Content hash is the strongest artifact evidence available',
  }),
  createdDuringPublication: msg({
    id: 'dashboard.viewModel.createdDuringPublication',
    message: 'Created during server-side publication',
  }),
  accessibleFallback: msg({
    id: 'dashboard.viewModel.accessibleFallback',
    message: 'Lodariq accessible fallback',
  }),
  semanticDefaultsActive: msg({
    id: 'dashboard.viewModel.semanticDefaultsActive',
    message: 'Safe semantic defaults are active until a workspace Brand theme is approved.',
  }),
  safeFallback: msg({ id: 'dashboard.viewModel.safeFallback', message: 'Safe fallback' }),
  noApprovedVersion: msg({
    id: 'dashboard.viewModel.noApprovedVersion',
    message: 'No approved version',
  }),
  productMatchNotRecorded: msg({
    id: 'dashboard.viewModel.productMatchNotRecorded',
    message: 'Product match has not been recorded',
  }),
  accent: msg({ id: 'dashboard.viewModel.accent', message: 'Accent' }),
  surface: msg({ id: 'dashboard.viewModel.surface', message: 'Surface' }),
  text: msg({ id: 'dashboard.viewModel.text', message: 'Text' }),
  typography: msg({ id: 'dashboard.viewModel.typography', message: 'Typography' }),
  radius: msg({ id: 'dashboard.viewModel.radius', message: 'Radius' }),
  approvedSource: msg({ id: 'dashboard.viewModel.approvedSource', message: 'Approved source' }),
  needsApproval: msg({ id: 'dashboard.viewModel.needsApproval', message: 'Needs approval' }),
  sourceRevision: msg({
    id: 'dashboard.viewModel.sourceRevision',
    message: 'Source revision {revision}',
  }),
  themeRevision: msg({
    id: 'dashboard.viewModel.themeRevision',
    message: 'Theme revision {revision}',
  }),
  checkedAt: msg({ id: 'dashboard.viewModel.checkedAt', message: 'Checked {date}' }),
  workspaceDraft: msg({
    id: 'dashboard.viewModel.workspaceDraft',
    message: '{theme} workspace draft',
  }),
  tokensSavedAsDraft: msg({
    id: 'dashboard.viewModel.tokensSavedAsDraft',
    message: 'Semantic tokens are saved as a draft and cannot change live releases.',
  }),
  draftRevision: msg({
    id: 'dashboard.viewModel.draftRevision',
    message: 'Draft revision {revision}',
  }),
  updatedAt: msg({ id: 'dashboard.viewModel.updatedAt', message: 'Updated {date}' }),
  workspaceApprovedTokens: msg({
    id: 'dashboard.viewModel.workspaceApprovedTokens',
    message: 'Workspace-approved semantic tokens',
  }),
  themeCompiledSnapshot: msg({
    id: 'dashboard.viewModel.themeCompiledSnapshot',
    message: '{theme} is compiled into releases as an immutable Brand snapshot.',
  }),
  version: msg({ id: 'dashboard.viewModel.version', message: 'Version {version}' }),
  approvedAt: msg({ id: 'dashboard.viewModel.approvedAt', message: 'Approved {date}' }),
  registeredDesignTokens: msg({
    id: 'dashboard.viewModel.registeredDesignTokens',
    message: 'Registered design tokens',
  }),
  selectedProductElement: msg({
    id: 'dashboard.viewModel.selectedProductElement',
    message: 'Selected product element',
  }),
  nearbyProductControls: msg({
    id: 'dashboard.viewModel.nearbyProductControls',
    message: 'Nearby product controls',
  }),
  productTypography: msg({
    id: 'dashboard.viewModel.productTypography',
    message: 'Product typography',
  }),
  productSurfaceContext: msg({
    id: 'dashboard.viewModel.productSurfaceContext',
    message: 'Product surface context',
  }),
  accessibleFallbackShort: msg({
    id: 'dashboard.viewModel.accessibleFallbackShort',
    message: 'Accessible fallback',
  }),
  groundedInTokens: msg({
    id: 'dashboard.viewModel.groundedInTokens',
    message: '{theme} is grounded in explicitly registered semantic customer tokens.',
  }),
  proposedFromElement: msg({
    id: 'dashboard.viewModel.proposedFromElement',
    message:
      '{theme} was proposed from one representative product element and reviewed semantically.',
  }),
  privacySafeEvidence: msg({
    id: 'dashboard.viewModel.privacySafeEvidence',
    message:
      '{theme} uses privacy-safe product style evidence and stores no raw CSS or DOM snapshot.',
  }),
  highConfidenceEvidence: msg({
    id: 'dashboard.viewModel.highConfidenceEvidence',
    message: 'High-confidence evidence',
  }),
  reviewRecommended: msg({
    id: 'dashboard.viewModel.reviewRecommended',
    message: 'Review recommended',
  }),
  lowConfidenceEvidence: msg({
    id: 'dashboard.viewModel.lowConfidenceEvidence',
    message: 'Low-confidence evidence',
  }),
  documentUpdated: msg({
    id: 'dashboard.viewModel.documentUpdated',
    message: '{document} was last updated',
  }),
  documentPublished: msg({
    id: 'dashboard.viewModel.documentPublished',
    message: '{document} was published to {environment}',
  }),
  exactArtifactVerified: msg({
    id: 'dashboard.viewModel.exactArtifactVerified',
    message: 'Exact artifact verified',
  }),
  immutablePublication: msg({
    id: 'dashboard.viewModel.immutablePublication',
    message: 'Immutable publication',
  }),
  brandVersionApproved: msg({
    id: 'dashboard.viewModel.brandVersionApproved',
    message: '{theme} Brand version {version} was approved',
  }),
  immutableBrandSnapshot: msg({
    id: 'dashboard.viewModel.immutableBrandSnapshot',
    message: 'Immutable Brand snapshot',
  }),
  artifactShort: msg({
    id: 'dashboard.viewModel.artifactShort',
    message: 'Artifact …{suffix}',
  }),
  workspaceTeammate: msg({
    id: 'dashboard.viewModel.workspaceTeammate',
    message: 'Workspace teammate',
  }),
  teamUpdate: msg({ id: 'dashboard.viewModel.teamUpdate', message: 'Team update' }),
  readinessBlocked: msg({
    id: 'dashboard.viewModel.readinessBlocked',
    message: 'Needs fixes before publishing',
  }),
  readinessDraft: msg({ id: 'dashboard.viewModel.readinessDraft', message: 'Draft in progress' }),
  readinessPreviewable: msg({
    id: 'dashboard.viewModel.readinessPreviewable',
    message: 'Ready to preview',
  }),
  archived: msg({ id: 'dashboard.viewModel.archived', message: 'Archived' }),
  noPublishBlockers: msg({
    id: 'dashboard.viewModel.noPublishBlockers',
    message: 'No publish blockers',
  }),
  moreIssues: msg({ id: 'dashboard.viewModel.moreIssues', message: '{message} +{count} more' }),
  changesTracked: msg({
    id: 'dashboard.viewModel.changesTracked',
    message: 'Changes are being tracked',
  }),
  readyFirstPublish: msg({
    id: 'dashboard.viewModel.readyFirstPublish',
    message: 'Ready for first publish',
  }),
  previewToPreparePublishing: msg({
    id: 'dashboard.viewModel.previewToPreparePublishing',
    message: 'Preview once to prepare publishing',
  }),
  unpublished: msg({ id: 'dashboard.viewModel.unpublished', message: 'Unpublished' }),
  noPublicationRecord: msg({
    id: 'dashboard.viewModel.noPublicationRecord',
    message: 'No environment publication record yet',
  }),
  recordsUseEarlierHash: msg({
    id: 'dashboard.viewModel.recordsUseEarlierHash',
    message: 'Publication records for {sites} use an earlier content hash',
  }),
  publicationRecorded: msg({
    id: 'dashboard.viewModel.publicationRecorded',
    message: 'Publication recorded',
  }),
  currentDraftRecorded: msg({
    id: 'dashboard.viewModel.currentDraftRecorded',
    message: 'Current draft recorded for {sites}',
  }),
  unknownTime: msg({ id: 'dashboard.viewModel.unknownTime', message: 'Unknown time' }),
  flowHealth: msg({ id: 'dashboard.viewModel.flowHealth', message: 'Flow health' }),
  flowHealthy: msg({ id: 'dashboard.viewModel.flowHealthy', message: 'Healthy' }),
  flowHealthyDetail: msg({
    id: 'dashboard.viewModel.flowHealthyDetail',
    message: 'Every reachable path has a terminal outcome.',
  }),
  flowIssues: msg({
    id: 'dashboard.viewModel.flowIssues',
    message: '{count} flow {count, plural, one {issue} other {issues}}',
  }),
  flowIssueSummary: msg({
    id: 'dashboard.viewModel.flowIssueSummary',
    message: '{first} · {remaining} more',
  }),
} as const;

export const DASHBOARD_ENTRY_MESSAGES = {
  signInTitle: msg({ id: 'dashboard.entry.signInTitle', message: 'Sign in to Lodariq' }),
  signInDescription: msg({
    id: 'dashboard.entry.signInDescription',
    message: 'Your workspace and authoring tools stay protected by your Lodariq session.',
  }),
  retryAction: msg({ id: 'dashboard.entry.retryAction', message: 'Try again' }),
  unavailableTitle: msg({
    id: 'dashboard.entry.unavailableTitle',
    message: 'We could not open your workspace',
  }),
  unavailableDescription: msg({
    id: 'dashboard.entry.unavailableDescription',
    message: 'Lodariq could not verify your session. The service may be temporarily unavailable.',
  }),
  workspaceUnavailable: msg({
    id: 'dashboard.entry.workspaceUnavailable',
    message: 'The workspace is temporarily unavailable.',
  }),
} as const;

export const DASHBOARD_ERROR_MESSAGES = {
  title: msg({
    id: 'dashboard.error.title',
    message: 'The workspace did not finish loading',
  }),
  description: msg({
    id: 'dashboard.error.description',
    message: 'Your work is safe. Retry the request without leaving this page.',
  }),
  retry: msg({ id: 'dashboard.error.retry', message: 'Try again' }),
  loading: msg({
    id: 'dashboard.loading.label',
    message: 'Opening your Lodariq workspace',
  }),
} as const;

export const DASHBOARD_SERVER_MESSAGES = {
  requestRejected: msg({
    id: 'dashboard.server.requestRejected',
    message: 'The request could not be accepted.',
  }),
  invalidRequest: msg({
    id: 'dashboard.server.invalidRequest',
    message: 'The request was invalid.',
  }),
  authenticationRequired: msg({
    id: 'dashboard.server.authenticationRequired',
    message: 'Sign in again to continue.',
  }),
  capabilityDenied: msg({
    id: 'dashboard.server.capabilityDenied',
    message: 'Your workspace role does not allow this action.',
  }),
  notFound: msg({
    id: 'dashboard.server.notFound',
    message: 'The requested workspace record was not found.',
  }),
  conflict: msg({
    id: 'dashboard.server.conflict',
    message: 'The record changed in another session. Refresh and try again.',
  }),
  rateLimited: msg({
    id: 'dashboard.server.rateLimited',
    message: 'Too many requests. Wait briefly and try again.',
  }),
  unavailable: msg({
    id: 'dashboard.server.unavailable',
    message: 'The workspace is temporarily unavailable.',
  }),
  requestFailed: msg({
    id: 'dashboard.server.requestFailed',
    message: 'The workspace request could not be completed.',
  }),
  invalidResponse: msg({
    id: 'dashboard.server.invalidResponse',
    message: 'The workspace response could not be verified.',
  }),
  partialData: msg({
    id: 'dashboard.server.partialData',
    message: 'Some workspace data is temporarily unavailable. Available sections remain usable.',
  }),
} as const;

export const DASHBOARD_ACTION_MESSAGES = {
  productionApprovalInvalid: msg({
    id: 'dashboard.action.productionApprovalInvalid',
    message: 'The production approval policy is invalid.',
  }),
  approvalRequired: msg({
    id: 'dashboard.action.approvalRequired',
    message: 'One approval is now required before production promotion.',
  }),
  approvalNotRequired: msg({
    id: 'dashboard.action.approvalNotRequired',
    message: 'Production promotion no longer requires a separate approval.',
  }),
  productionChanged: msg({
    id: 'dashboard.action.productionChanged',
    message: 'The production environment changed in another session. Refresh and try again.',
  }),
  releasePolicyForbidden: msg({
    id: 'dashboard.action.releasePolicyForbidden',
    message: 'Your workspace role does not allow release-policy changes.',
  }),
  updateReleaseApprovalFailed: msg({
    id: 'dashboard.action.updateReleaseApprovalFailed',
    message: 'Unable to update release approval.',
  }),
  environmentPolicyInvalid: msg({
    id: 'dashboard.action.environmentPolicyInvalid',
    message: 'The environment policy is invalid.',
  }),
  environmentPolicyUpdated: msg({
    id: 'dashboard.action.environmentPolicyUpdated',
    message: 'Environment policy updated.',
  }),
  environmentPolicyChanged: msg({
    id: 'dashboard.action.environmentPolicyChanged',
    message:
      'The environment policy changed or conflicts with the release pipeline. Refresh and try again.',
  }),
  environmentPolicyForbidden: msg({
    id: 'dashboard.action.environmentPolicyForbidden',
    message: 'Your workspace role does not allow environment-policy changes.',
  }),
  updateEnvironmentPolicyFailed: msg({
    id: 'dashboard.action.updateEnvironmentPolicyFailed',
    message: 'Unable to update the environment policy.',
  }),
  brandCreated: msg({
    id: 'dashboard.action.brandCreated',
    message: 'Brand system created. Review the essentials, then approve the first version.',
  }),
  createBrandFailed: msg({
    id: 'dashboard.action.createBrandFailed',
    message: 'Unable to create the Brand system.',
  }),
  chooseBrandTheme: msg({
    id: 'dashboard.action.chooseBrandTheme',
    message: 'Choose a Brand theme.',
  }),
  impactRefreshed: msg({ id: 'dashboard.action.impactRefreshed', message: 'Impact refreshed.' }),
  loadBrandImpactFailed: msg({
    id: 'dashboard.action.loadBrandImpactFailed',
    message: 'Unable to load Brand impact.',
  }),
  themeIdentityInvalid: msg({
    id: 'dashboard.action.themeIdentityInvalid',
    message: 'Theme name or identifier is invalid.',
  }),
  themeValuesInvalid: msg({
    id: 'dashboard.action.themeValuesInvalid',
    message: 'Theme values are invalid. Review the highlighted controls.',
  }),
  draftSaved: msg({ id: 'dashboard.action.draftSaved', message: 'Draft saved.' }),
  saveBrandDraftFailed: msg({
    id: 'dashboard.action.saveBrandDraftFailed',
    message: 'Unable to save this Brand draft.',
  }),
  themeApprovalInvalid: msg({
    id: 'dashboard.action.themeApprovalInvalid',
    message: 'Theme approval request is invalid.',
  }),
  versionApproved: msg({
    id: 'dashboard.action.versionApproved',
    message:
      'Version {version} approved. Live artifacts stay unchanged until an experience explicitly adopts and publishes it.',
  }),
  approveBrandFailed: msg({
    id: 'dashboard.action.approveBrandFailed',
    message: 'Unable to approve this Brand version.',
  }),
  defaultThemeInvalid: msg({
    id: 'dashboard.action.defaultThemeInvalid',
    message: 'Default theme request is invalid.',
  }),
  workspaceDefaultUpdated: msg({
    id: 'dashboard.action.workspaceDefaultUpdated',
    message: 'Workspace default updated.',
  }),
  setWorkspaceDefaultFailed: msg({
    id: 'dashboard.action.setWorkspaceDefaultFailed',
    message: 'Unable to make this the workspace default.',
  }),
  themeAcknowledgementInvalid: msg({
    id: 'dashboard.action.themeAcknowledgementInvalid',
    message: 'Theme acknowledgement request is invalid.',
  }),
  experienceBrandUpdated: msg({
    id: 'dashboard.action.experienceBrandUpdated',
    message: 'The experience will use the approved Brand version in its next compiled artifact.',
  }),
  updateExperienceFailed: msg({
    id: 'dashboard.action.updateExperienceFailed',
    message: 'Unable to update this experience.',
  }),
  chooseEnvironment: msg({
    id: 'dashboard.action.chooseEnvironment',
    message: 'Choose an environment.',
  }),
  siteLabelRequired: msg({
    id: 'dashboard.action.siteLabelRequired',
    message: 'Site label is required.',
  }),
  createTokenFailed: msg({
    id: 'dashboard.action.createTokenFailed',
    message: 'Unable to create token.',
  }),
  applicationNameRequired: msg({
    id: 'dashboard.action.applicationNameRequired',
    message: 'Application name is required.',
  }),
  originsNotSynced: msg({
    id: 'dashboard.action.originsNotSynced',
    message:
      'The installation was created, but trusted origins could not be synced. Retry the origin sync before using it.',
  }),
  prepareInstallationFailed: msg({
    id: 'dashboard.action.prepareInstallationFailed',
    message: 'Unable to prepare the SDK installation.',
  }),
  chooseInstallation: msg({
    id: 'dashboard.action.chooseInstallation',
    message: 'Choose an SDK installation.',
  }),
  installationNotFound: msg({
    id: 'dashboard.action.installationNotFound',
    message: 'SDK installation was not found.',
  }),
  syncOriginsFailed: msg({
    id: 'dashboard.action.syncOriginsFailed',
    message: 'Unable to sync trusted origins.',
  }),
  revokeInstallationFailed: msg({
    id: 'dashboard.action.revokeInstallationFailed',
    message: 'Unable to revoke the SDK installation.',
  }),
  pauseInstallationFailed: msg({
    id: 'dashboard.action.pauseInstallationFailed',
    message: 'Unable to pause the SDK installation.',
  }),
  resumeInstallationFailed: msg({
    id: 'dashboard.action.resumeInstallationFailed',
    message: 'Unable to resume the SDK installation.',
  }),
  chooseExperience: msg({
    id: 'dashboard.action.chooseExperience',
    message: 'Choose an experience.',
  }),
  loadSupportFailed: msg({
    id: 'dashboard.action.loadSupportFailed',
    message: 'Unable to load support details.',
  }),
  notPrepared: msg({ id: 'dashboard.action.notPrepared', message: 'Not prepared' }),
  noDeliveryRecord: msg({
    id: 'dashboard.action.noDeliveryRecord',
    message: 'No delivery record',
  }),
  noVersions: msg({ id: 'dashboard.action.noVersions', message: 'No versions' }),
  chooseToken: msg({ id: 'dashboard.action.chooseToken', message: 'Choose a token.' }),
  revokeTokenFailed: msg({
    id: 'dashboard.action.revokeTokenFailed',
    message: 'Unable to revoke token.',
  }),
  brandChanged: msg({
    id: 'dashboard.action.brandChanged',
    message: 'This Brand theme changed in another session. Refresh its impact before trying again.',
  }),
  brandForbidden: msg({
    id: 'dashboard.action.brandForbidden',
    message: 'Your workspace role does not allow this Brand action.',
  }),
  noProductOrigins: msg({
    id: 'dashboard.action.noProductOrigins',
    message: 'No canonical product origins are configured yet.',
  }),
  ambiguousOrigin: msg({
    id: 'dashboard.action.ambiguousOrigin',
    message:
      'One origin mapping was skipped because the same origin belongs to more than one environment.',
  }),
  ambiguousOrigins: msg({
    id: 'dashboard.action.ambiguousOrigins',
    message:
      '{count} origin mappings were skipped because the same origin belongs to more than one environment.',
  }),
  chooseAnalyticsEnvironment: msg({
    id: 'dashboard.action.chooseAnalyticsEnvironment',
    message: 'Choose one valid analytics environment.',
  }),
  analyticsEnvironmentUnavailable: msg({
    id: 'dashboard.action.analyticsEnvironmentUnavailable',
    message: 'The selected analytics environment is unavailable.',
  }),
  analyticsForbidden: msg({
    id: 'dashboard.action.analyticsForbidden',
    message: 'Your current workspace access cannot read analytics.',
  }),
  analyticsInvalid: msg({
    id: 'dashboard.action.analyticsInvalid',
    message: 'Analytics data could not be verified. No partial results were shown.',
  }),
  analyticsUnavailable: msg({
    id: 'dashboard.action.analyticsUnavailable',
    message: 'Analytics are temporarily unavailable for the selected environment.',
  }),
  chooseReleaseScope: msg({
    id: 'dashboard.action.chooseReleaseScope',
    message: 'Choose a valid document and release environment.',
  }),
  releaseRecoveryInvalid: msg({
    id: 'dashboard.action.releaseRecoveryInvalid',
    message: 'The release recovery request is invalid.',
  }),
  releaseRecoveryForbidden: msg({
    id: 'dashboard.action.releaseRecoveryForbidden',
    message: 'Your current workspace access cannot perform this release recovery action.',
  }),
  releaseRecoveryUncertain: msg({
    id: 'dashboard.action.releaseRecoveryUncertain',
    message:
      'The recovery result is uncertain. Retry the exact request or refresh release history.',
  }),
  releaseHistoryMissing: msg({
    id: 'dashboard.action.releaseHistoryMissing',
    message: 'Release history is not available for this document.',
  }),
  releaseHistoryForbidden: msg({
    id: 'dashboard.action.releaseHistoryForbidden',
    message: 'Your current workspace access cannot read this release history.',
  }),
  releaseHistoryIncomplete: msg({
    id: 'dashboard.action.releaseHistoryIncomplete',
    message: 'Complete release history is temporarily unavailable. Nothing was truncated.',
  }),
  releaseHistoryUnavailable: msg({
    id: 'dashboard.action.releaseHistoryUnavailable',
    message: 'Unable to load complete release history.',
  }),
} as const;

export const AUTH_SHELL_MESSAGES = {
  authorOnce: msg({ id: 'auth.shell.authorOnce', message: 'Author once' }),
  productExperiences: msg({
    id: 'auth.shell.productExperiences',
    message: 'Product experiences that stay close to the product.',
  }),
  workflow: msg({
    id: 'auth.shell.workflow',
    message: 'Create, review, and release without carrying authoring work across tabs and tools.',
  }),
  secureAccess: msg({
    id: 'auth.shell.secureAccess',
    message: 'Secure, first-party Lodariq access',
  }),
  back: msg({ id: 'auth.shell.back', message: 'Back' }),
} as const;

export const AUTH_PAGE_MESSAGES = {
  accountAccess: msg({ id: 'auth.page.accountAccess', message: 'Account access' }),
  emailVerification: msg({ id: 'auth.page.emailVerification', message: 'Email verification' }),
  signInEyebrow: msg({ id: 'auth.page.signIn.eyebrow', message: 'Welcome back' }),
  signInTitle: msg({ id: 'auth.page.signIn.title', message: 'Continue your work' }),
  signInDescription: msg({
    id: 'auth.page.signIn.description',
    message: 'Use your Lodariq account to return to your product workspace.',
  }),
  signUpEyebrow: msg({ id: 'auth.page.signUp.eyebrow', message: 'Start authoring' }),
  signUpTitle: msg({
    id: 'auth.page.signUp.title',
    message: 'Bring the experience into the product',
  }),
  signUpDescription: msg({
    id: 'auth.page.signUp.description',
    message: 'Create your account and first workspace together—no setup detour.',
  }),
  signUpDisabledEyebrow: msg({
    id: 'auth.page.signUpDisabled.eyebrow',
    message: 'Account creation',
  }),
  signUpDisabledTitle: msg({
    id: 'auth.page.signUpDisabled.title',
    message: 'Sign-up is not available here',
  }),
  signUpDisabledDescription: msg({
    id: 'auth.page.signUpDisabled.description',
    message:
      'This deployment is not accepting new accounts. Existing creators can continue with their Lodariq account.',
  }),
  signUpDisabledBody: msg({
    id: 'auth.page.signUpDisabled.body',
    message: 'Account creation is not available in this deployment.',
  }),
  signInInstead: msg({ id: 'auth.page.signInInstead', message: 'Sign in instead' }),
  recoveryDisabledTitle: msg({
    id: 'auth.page.recoveryDisabled.title',
    message: 'Recovery is unavailable',
  }),
  recoveryDisabledDescription: msg({
    id: 'auth.page.recoveryDisabled.description',
    message: 'Password recovery has not been enabled for this deployment yet.',
  }),
  returnToSignIn: msg({ id: 'auth.page.returnToSignIn', message: 'Return to sign in' }),
  recoveryTitle: msg({
    id: 'auth.page.recovery.title',
    message: 'Set or reset your password',
  }),
  recoveryDescription: msg({
    id: 'auth.page.recovery.description',
    message: 'One email link lets an existing creator establish or replace their Lodariq password.',
  }),
  incompleteLinkTitle: msg({
    id: 'auth.page.incompleteLink.title',
    message: 'This link is incomplete',
  }),
  incompletePasswordLinkDescription: msg({
    id: 'auth.page.incompletePasswordLink.description',
    message: 'Use the complete password link from your latest Lodariq email.',
  }),
  requestAnotherLink: msg({ id: 'auth.page.requestAnotherLink', message: 'Request another link' }),
  newPasswordTitle: msg({ id: 'auth.page.newPassword.title', message: 'Choose a new password' }),
  newPasswordDescription: msg({
    id: 'auth.page.newPassword.description',
    message:
      'The secret is cleared from your browser before the form appears. Saving signs you in.',
  }),
  incompleteVerificationDescription: msg({
    id: 'auth.page.incompleteVerification.description',
    message: 'Use the complete verification link from your latest Lodariq email.',
  }),
  returnToAccountCreation: msg({
    id: 'auth.page.returnToAccountCreation',
    message: 'Return to account creation',
  }),
  finishAccountTitle: msg({ id: 'auth.page.finishAccount.title', message: 'Finish your account' }),
  finishAccountDescription: msg({
    id: 'auth.page.finishAccount.description',
    message:
      'Your email link proves ownership. Choose the password that will protect your account.',
  }),
} as const;

export const WORKSPACE_INVITATION_MESSAGES = {
  eyebrow: msg({ id: 'workspaceInvitation.eyebrow', message: 'Workspace invitation' }),
  title: msg({ id: 'workspaceInvitation.title', message: 'Join your workspace' }),
  description: msg({
    id: 'workspaceInvitation.description',
    message: 'Accept this invitation with the verified email address it was sent to.',
  }),
  reading: msg({ id: 'workspaceInvitation.reading', message: 'Reading your secure invitation' }),
  accept: msg({ id: 'workspaceInvitation.accept', message: 'Accept invitation' }),
  accepting: msg({ id: 'workspaceInvitation.accepting', message: 'Accepting invitation' }),
  accepted: msg({ id: 'workspaceInvitation.accepted', message: 'Invitation accepted' }),
  acceptedHelp: msg({
    id: 'workspaceInvitation.acceptedHelp',
    message: 'You now have access to the workspace.',
  }),
  openWorkspace: msg({ id: 'workspaceInvitation.openWorkspace', message: 'Open workspace' }),
  signInRequired: msg({
    id: 'workspaceInvitation.signInRequired',
    message: 'Sign in with the invited email address, then return to this tab and try again.',
  }),
  signInNewTab: msg({
    id: 'workspaceInvitation.signInNewTab',
    message: 'Sign in in a new tab',
  }),
  unavailable: msg({
    id: 'workspaceInvitation.unavailable',
    message: 'This invitation is invalid, expired, already used, or belongs to another email.',
  }),
  incomplete: msg({
    id: 'workspaceInvitation.incomplete',
    message: 'Use the complete invitation link from your latest Lodariq email.',
  }),
} as const;

export const WORKSPACE_MEMBERS_MESSAGES = {
  members: msg({ id: 'workspaceMembers.members', message: 'Workspace members' }),
  membersDescription: msg({
    id: 'workspaceMembers.membersDescription',
    message: 'Roles are enforced from current server membership on every request.',
  }),
  invite: msg({ id: 'workspaceMembers.invite', message: 'Invite a collaborator' }),
  inviteDescription: msg({
    id: 'workspaceMembers.inviteDescription',
    message: 'A private, single-use invitation will be queued for this email address.',
  }),
  email: msg({ id: 'workspaceMembers.email', message: 'Email address' }),
  role: msg({ id: 'workspaceMembers.role', message: 'Role' }),
  sendInvitation: msg({ id: 'workspaceMembers.sendInvitation', message: 'Send invitation' }),
  invitationQueued: msg({
    id: 'workspaceMembers.invitationQueued',
    message: 'Invitation queued for delivery.',
  }),
  pendingInvitations: msg({
    id: 'workspaceMembers.pendingInvitations',
    message: 'Pending invitations',
  }),
  noPendingInvitations: msg({
    id: 'workspaceMembers.noPendingInvitations',
    message: 'There are no pending invitations.',
  }),
  revoke: msg({ id: 'workspaceMembers.revoke', message: 'Revoke' }),
  remove: msg({ id: 'workspaceMembers.remove', message: 'Remove' }),
  transferOwnership: msg({
    id: 'workspaceMembers.transferOwnership',
    message: 'Transfer ownership',
  }),
  owner: msg({ id: 'workspaceMembers.role.owner', message: 'Owner' }),
  admin: msg({ id: 'workspaceMembers.role.admin', message: 'Admin' }),
  member: msg({ id: 'workspaceMembers.role.member', message: 'Member' }),
  viewer: msg({ id: 'workspaceMembers.role.viewer', message: 'Viewer' }),
  joined: msg({ id: 'workspaceMembers.joined', message: 'Joined {date}' }),
  expires: msg({ id: 'workspaceMembers.expires', message: 'Expires {date}' }),
  unavailable: msg({
    id: 'workspaceMembers.unavailable',
    message: 'Workspace access could not be loaded. Try again.',
  }),
  invalidEmail: msg({
    id: 'workspaceMembers.invalidEmail',
    message: 'Enter a complete email address.',
  }),
  operationFailed: msg({
    id: 'workspaceMembers.operationFailed',
    message: 'The workspace change could not be completed.',
  }),
  dangerZone: msg({ id: 'workspaceMembers.dangerZone', message: 'Danger zone' }),
  deletionDescription: msg({
    id: 'workspaceMembers.deletionDescription',
    message: 'Scheduling deletion revokes active workspace access and starts the retention window.',
  }),
  deletionConfirmation: msg({
    id: 'workspaceMembers.deletionConfirmation',
    message: 'Type the workspace ID to confirm: {workspaceId}',
  }),
  scheduleDeletion: msg({
    id: 'workspaceMembers.scheduleDeletion',
    message: 'Schedule workspace deletion',
  }),
  noManagementAccess: msg({
    id: 'workspaceMembers.noManagementAccess',
    message: 'Your role can view members but cannot change workspace access.',
  }),
} as const;

export const AUTH_FORM_MESSAGES = {
  enterpriseSso: msg({ id: 'auth.form.enterpriseSso', message: 'Continue with SSO' }),
  enterpriseSsoUnavailable: msg({
    id: 'auth.form.enterpriseSsoUnavailable',
    message: 'Enterprise sign-in is not configured for this company email.',
  }),
  google: msg({ id: 'auth.form.google', message: 'Continue with Google' }),
  microsoft: msg({ id: 'auth.form.microsoft', message: 'Continue with Microsoft' }),
  providerWaiting: msg({ id: 'auth.form.providerWaiting', message: 'Opening secure sign-in…' }),
  passkey: msg({ id: 'auth.form.passkey', message: 'Use Passkey' }),
  passkeyWaiting: msg({ id: 'auth.form.passkeyWaiting', message: 'Waiting for your passkey…' }),
  recoveryCode: msg({ id: 'auth.form.recoveryCode', message: 'Use a recovery code' }),
  rememberMe: msg({ id: 'auth.form.rememberMe', message: 'Remember me' }),
  rememberMeHelp: msg({
    id: 'auth.form.rememberMeHelp',
    message: 'Keep this device signed in for up to 30 days. Leave unchecked for a session cookie.',
  }),
  forgotUsername: msg({ id: 'auth.form.forgotUsername', message: 'Forgot username?' }),
  yourName: msg({ id: 'auth.form.yourName', message: 'Your name' }),
  email: msg({ id: 'auth.form.email', message: 'Email' }),
  identifier: msg({ id: 'auth.form.identifier', message: 'Email or username' }),
  password: msg({ id: 'auth.form.password', message: 'Password' }),
  showPassword: msg({ id: 'auth.form.showPassword', message: 'Show password' }),
  hidePassword: msg({ id: 'auth.form.hidePassword', message: 'Hide password' }),
  reviewFields: msg({
    id: 'auth.form.validation.reviewFields',
    message: 'Check the highlighted fields and try again.',
  }),
  fieldRequired: msg({
    id: 'auth.form.validation.required',
    message: '{field} is required.',
  }),
  fieldTooShort: msg({
    id: 'auth.form.validation.tooShort',
    message: '{field} must be at least {limit} characters.',
  }),
  fieldTooLong: msg({
    id: 'auth.form.validation.tooLong',
    message: '{field} must be no more than {limit} characters.',
  }),
  emailInvalid: msg({
    id: 'auth.form.validation.emailInvalid',
    message: 'Enter an email address in the format name@example.com.',
  }),
  identifierInvalid: msg({
    id: 'auth.form.validation.identifierInvalid',
    message: 'Enter your email address or username without spaces.',
  }),
  setOrResetPassword: msg({
    id: 'auth.form.setOrResetPassword',
    message: 'Set or reset password',
  }),
  workspace: msg({ id: 'auth.form.workspace', message: 'Workspace' }),
  workspaceHelp: msg({
    id: 'auth.form.workspaceHelp',
    message: 'Your shared home for experiences, environments, and releases.',
  }),
  pleaseTryAgain: msg({ id: 'auth.form.pleaseTryAgain', message: 'Please try again.' }),
  signingIn: msg({ id: 'auth.form.signingIn', message: 'Signing in' }),
  creatingAccount: msg({ id: 'auth.form.creatingAccount', message: 'Creating account' }),
  createAccount: msg({ id: 'auth.form.createAccount', message: 'Create account' }),
  continue: msg({ id: 'auth.form.continue', message: 'Continue' }),
  existingAccount: msg({
    id: 'auth.form.existingAccount',
    message: 'Already have a Lodariq account?',
  }),
  newToLodariq: msg({ id: 'auth.form.newToLodariq', message: 'New to Lodariq?' }),
  signIn: msg({ id: 'auth.form.signIn', message: 'Sign in' }),
  createAnAccount: msg({ id: 'auth.form.createAnAccount', message: 'Create an account' }),
  checkEmail: msg({ id: 'auth.form.checkEmail', message: 'Check your email' }),
  requestAccepted: msg({ id: 'auth.form.requestAccepted', message: 'Request accepted' }),
  recoveryRequestAccepted: msg({
    id: 'auth.form.recoveryRequestAccepted',
    message:
      'If that address belongs to a Lodariq account, a secure one-time link has been queued. Delivery can take a few minutes. Only the newest link works, and it expires after 30 minutes.',
  }),
  openLocalRecoveryLink: msg({
    id: 'auth.form.openLocalRecoveryLink',
    message: 'Open local recovery link',
  }),
  useAnotherEmail: msg({ id: 'auth.form.useAnotherEmail', message: 'Use another email' }),
  emailSecureLink: msg({ id: 'auth.form.emailSecureLink', message: 'Email a secure link' }),
  requestingSecureLink: msg({
    id: 'auth.form.requestingSecureLink',
    message: 'Requesting a secure link',
  }),
  requestAnotherLink: msg({
    id: 'auth.form.requestAnotherLink',
    message: 'Request another link',
  }),
  requestAgainIn: msg({
    id: 'auth.form.requestAgainIn',
    message: 'Request again in {seconds}s',
  }),
  passwordsDoNotMatch: msg({
    id: 'auth.form.passwordsDoNotMatch',
    message: 'Passwords do not match.',
  }),
  readingSecureLink: msg({
    id: 'auth.form.readingSecureLink',
    message: 'Reading your secure link…',
  }),
  incompletePasswordLink: msg({
    id: 'auth.form.incompletePasswordLink',
    message: 'This password link is incomplete. Request a new link to continue.',
  }),
  passwordLinkUnavailable: msg({
    id: 'auth.form.passwordLinkUnavailable',
    message: 'This password link cannot be used',
  }),
  passwordLinkUnavailableHelp: msg({
    id: 'auth.form.passwordLinkUnavailableHelp',
    message:
      'The link may have expired, already been used, or been replaced by a newer request. Request a fresh link and use only the newest email.',
  }),
  newPassword: msg({ id: 'auth.form.newPassword', message: 'New password' }),
  passwordLength: msg({ id: 'auth.form.passwordLength', message: 'Use 12 to 128 characters.' }),
  confirmPassword: msg({ id: 'auth.form.confirmPassword', message: 'Confirm password' }),
  savePassword: msg({
    id: 'auth.form.savePassword',
    message: 'Save password and continue',
  }),
  savingPassword: msg({ id: 'auth.form.savingPassword', message: 'Saving password' }),
  invalidVerificationLink: msg({
    id: 'auth.form.invalidVerificationLink',
    message: 'The verification link is invalid or expired.',
  }),
  verificationLinkUnavailable: msg({
    id: 'auth.form.verificationLinkUnavailable',
    message: 'This verification link cannot be used',
  }),
  verificationLinkUnavailableHelp: msg({
    id: 'auth.form.verificationLinkUnavailableHelp',
    message:
      'The link may have expired, already been used, or been replaced by a newer request. Request another link or restart account creation.',
  }),
  restartVerification: msg({
    id: 'auth.form.restartVerification',
    message: 'Restart account verification',
  }),
  requestAnotherVerification: msg({
    id: 'auth.form.requestAnotherVerification',
    message: 'Request another verification link',
  }),
  requestingVerification: msg({
    id: 'auth.form.requestingVerification',
    message: 'Requesting another verification link',
  }),
  verificationRequestAccepted: msg({
    id: 'auth.form.verificationRequestAccepted',
    message:
      'If the account is awaiting verification, a new one-time link has been queued. Delivery can take a few minutes.',
  }),
  emailVerified: msg({ id: 'auth.form.emailVerified', message: 'Email verified' }),
  verifyingEmail: msg({ id: 'auth.form.verifyingEmail', message: 'Verifying your email' }),
  openingWorkspace: msg({
    id: 'auth.form.openingWorkspace',
    message: 'Opening your Lodariq workspace…',
  }),
  moment: msg({ id: 'auth.form.moment', message: 'This should only take a moment.' }),
  readingVerificationLink: msg({
    id: 'auth.form.readingVerificationLink',
    message: 'Reading your secure verification link…',
  }),
  incompleteVerificationLink: msg({
    id: 'auth.form.incompleteVerificationLink',
    message:
      'This verification link is incomplete. Restart account verification to request a fresh link.',
  }),
  choosePassword: msg({ id: 'auth.form.choosePassword', message: 'Choose your password' }),
  choosePasswordHelp: msg({
    id: 'auth.form.choosePasswordHelp',
    message:
      'Your email link proved ownership. Choose the password that will protect this account.',
  }),
  verifyAndContinue: msg({
    id: 'auth.form.verifyAndContinue',
    message: 'Verify email and continue',
  }),
  verificationSent: msg({
    id: 'auth.form.verificationSent',
    message:
      'A secure verification link for {email} has been queued. Delivery can take a few minutes. Keep this page open or use the link directly.',
  }),
  openVerificationLink: msg({
    id: 'auth.form.openVerificationLink',
    message:
      'Open the complete verification link from your email, then choose the password for your account.',
  }),
  linkExpires: msg({ id: 'auth.form.linkExpires', message: 'The link expires {expiry}.' }),
  soon: msg({ id: 'auth.form.soon', message: 'soon' }),
  invalidCredentials: msg({
    id: 'auth.error.invalidCredentials',
    message: 'Email, username, or password is incorrect.',
  }),
  onboardingIncomplete: msg({
    id: 'auth.error.onboardingIncomplete',
    message: 'Account setup could not be completed. Sign in again to resume securely.',
  }),
  rateLimited: msg({
    id: 'auth.error.rateLimited',
    message: 'Too many attempts. Wait a little and try again.',
  }),
  invalidPasswordLink: msg({
    id: 'auth.error.invalidPasswordLink',
    message: 'The password link is invalid or expired.',
  }),
  signupUnavailable: msg({
    id: 'auth.error.signupUnavailable',
    message: 'Account creation is not available right now.',
  }),
  recoveryUnavailable: msg({
    id: 'auth.error.recoveryUnavailable',
    message: 'Password recovery is temporarily unavailable.',
  }),
  serviceUnavailable: msg({
    id: 'auth.error.serviceUnavailable',
    message: 'Lodariq sign-in is temporarily unavailable.',
  }),
} as const;

export const WORKSPACE_SELECTION_MESSAGES = {
  eyebrow: msg({ id: 'workspaceSelection.eyebrow', message: 'Workspace' }),
  title: msg({ id: 'workspaceSelection.title', message: 'Where are you working today?' }),
  description: msg({
    id: 'workspaceSelection.description',
    message: 'Choose an existing workspace or create one without leaving this screen.',
  }),
  create: msg({ id: 'workspaceSelection.create', message: 'Create a workspace' }),
  placeholder: msg({ id: 'workspaceSelection.placeholder', message: 'Product team' }),
  createAndOpen: msg({ id: 'workspaceSelection.createAndOpen', message: 'Create and open' }),
  openError: msg({
    id: 'workspaceSelection.openError',
    message: 'Could not open this workspace.',
  }),
  createError: msg({
    id: 'workspaceSelection.createError',
    message: 'Could not create the workspace.',
  }),
  roleOwner: msg({ id: 'workspaceSelection.role.owner', message: 'Owner' }),
  roleAdmin: msg({ id: 'workspaceSelection.role.admin', message: 'Admin' }),
  roleMember: msg({ id: 'workspaceSelection.role.member', message: 'Member' }),
  roleViewer: msg({ id: 'workspaceSelection.role.viewer', message: 'Viewer' }),
} as const;
