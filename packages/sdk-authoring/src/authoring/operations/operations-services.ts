import type {
  ApplicationSummary,
  AiAssistProposal,
  AiAssistRequest,
  AuthoringAuditEvent,
  AuthoringCollaborationSnapshot,
  AuthoringPresenceHeartbeatBody,
  AnalyticsExportKind,
  AnalyticsExportRelease,
  CreateExperimentBody,
  CreateDeploymentScheduleBody,
  DeliveryTransitionHistoryEntry,
  DeploymentSchedule,
  ExperienceAnalytics,
  ExperienceComment,
  ExperienceCommentAnchor,
  ExperienceMeasurementConfig,
  ExperienceSession,
  ExperienceStepLock,
  ExperienceStepLockClaimResponse,
  GenerateNarrationResult,
  Experiment,
  ExperimentResults,
  UpdateExperienceMeasurementBody,
  UpdateExperimentBody,
  WorkspaceCommercialUsage,
  WorkspaceDataCatalog,
  CanonicalTemplateInstantiationResult,
  AuthoringDocumentVersionSummary,
  SemanticVersionDiff,
  ChangeAwareCopySuggestion,
  CreateDemoLinkRequest,
  DemoAnalyticsSummary,
  DemoArtifactReview,
  DemoLink,
  ReviewDemoArtifactRequest,
} from '@lodariq/schema';
import type { AccessibilitySweepResult } from '@lodariq/schema/accessibility-governance';

/**
 * The Operations boundary.
 *
 * The frame never sees a URL or a bearer token — the host implements these and
 * hands back normalized data, the same shape the release and brand seams use.
 * Everything is per-document except `listApplications`, which is a workspace
 * registry a handoff resolves against.
 */
export interface AuthoringOperationsServices {
  readMeasurement: () => Promise<ExperienceMeasurementConfig>;
  updateMeasurement: (
    request: UpdateExperienceMeasurementBody,
  ) => Promise<ExperienceMeasurementConfig>;
  readAnalytics: (environmentId: string) => Promise<ExperienceAnalytics>;
  listSessions?: () => Promise<readonly ExperienceSession[]>;
  readExperiment: () => Promise<{
    experiment: Experiment | null;
    results: ExperimentResults | null;
  }>;
  createExperiment: (request: CreateExperimentBody) => Promise<Experiment>;
  updateExperiment: (experimentId: string, request: UpdateExperimentBody) => Promise<Experiment>;
  listComments: () => Promise<readonly ExperienceComment[]>;
  addComment: (anchor: ExperienceCommentAnchor, body: string) => Promise<ExperienceComment>;
  replyToComment: (commentId: string, body: string) => Promise<ExperienceComment>;
  resolveComment: (commentId: string, resolved: boolean) => Promise<ExperienceComment>;
  listStepLocks: () => Promise<readonly ExperienceStepLock[]>;
  /** Resolves to the winning lease, which may be held by someone else. */
  claimStepLock: (stepId: string, takeover?: boolean) => Promise<ExperienceStepLockClaimResponse>;
  releaseStepLock?: (stepId: string) => Promise<void>;
  heartbeatCollaboration?: (
    state: AuthoringPresenceHeartbeatBody,
  ) => Promise<AuthoringCollaborationSnapshot>;
  leaveCollaboration?: () => Promise<void>;
  /** Hosted/direct HTTP clients stream SSE; bridge clients use heartbeat snapshots. */
  subscribeCollaboration?: (
    onSnapshot: (snapshot: AuthoringCollaborationSnapshot) => void,
    onState?: (state: 'connected' | 'reconnecting') => void,
  ) => () => void;
  listApplications: () => Promise<readonly ApplicationSummary[]>;
  readCommercialUsage?: () => Promise<WorkspaceCommercialUsage>;
  readDataCatalog?: () => Promise<WorkspaceDataCatalog>;
  instantiateTemplate?: (templateId: string) => Promise<CanonicalTemplateInstantiationResult>;
  listDocumentVersions?: () => Promise<readonly AuthoringDocumentVersionSummary[]>;
  compareDocumentVersions?: (
    beforeVersionId: string,
    afterVersionId: string,
  ) => Promise<SemanticVersionDiff>;
  listCopySuggestions?: () => Promise<readonly ChangeAwareCopySuggestion[]>;
  createCopySuggestions?: (
    beforeVersionId: string,
    afterVersionId: string,
  ) => Promise<readonly ChangeAwareCopySuggestion[]>;
  decideCopySuggestion?: (
    suggestionId: string,
    decision: 'applied' | 'dismissed',
  ) => Promise<ChangeAwareCopySuggestion>;
  listDeliverySchedules?: () => Promise<readonly DeploymentSchedule[]>;
  listDeliveryTransitionHistory?: () => Promise<readonly DeliveryTransitionHistoryEntry[]>;
  createDeliverySchedule?: (request: CreateDeploymentScheduleBody) => Promise<DeploymentSchedule>;
  cancelDeliverySchedule?: (
    scheduleId: string,
    expectedRevision: number,
  ) => Promise<DeploymentSchedule>;
  requestAiAssist?: (request: AiAssistRequest) => Promise<AiAssistProposal>;
  generateNarration?: (stepId: string) => Promise<GenerateNarrationResult>;
  listAuditEvents?: () => Promise<readonly AuthoringAuditEvent[]>;
  exportAuditCsv?: () => Promise<void>;
  /** Delivered as a file by the host; the frame never sees a URL or bearer. */
  exportAnalytics?: (kind: AnalyticsExportKind, release?: AnalyticsExportRelease) => Promise<void>;
  readDemoLinks?: () => Promise<readonly DemoLink[]>;
  readDemoAnalytics?: () => Promise<DemoAnalyticsSummary>;
  reviewDemoArtifact?: (request: ReviewDemoArtifactRequest) => Promise<DemoArtifactReview>;
  createDemoLink?: (request: CreateDemoLinkRequest) => Promise<DemoLink>;
  revokeDemoLink?: (demoId: string) => Promise<DemoLink>;
  runAccessibilitySweep?: (operationId: string) => Promise<AccessibilitySweepResult>;
}
