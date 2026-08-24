import type {
  AdaptivePolicy,
  AdaptiveBehaviorEvidence,
  ApplicationSummary,
  AuthoringPresenceSelection,
  ExperienceAnalytics,
  ExperienceComment,
  ExperienceCommentAnchor,
  ExperienceCommentAuditEvent,
  ExperienceSession,
  ExperienceStepLock,
  Experiment,
  ExperimentArm,
  ExperimentResults,
  SuccessEvent,
} from '@lodariq/schema';
import type {
  AuthoringPresenceRecord,
  ExperienceExperimentAssignmentRecord,
  ExperienceMeasurementRecord,
  ReadAdaptiveBehaviorEvidenceInput,
} from './experience-measurement';
import type { ExperienceStepLockRecord } from './experience-measurement';
import type { ListExperienceSessionsInput } from './experience-sessions';
import type {
  AnalyticsExportAuditEventRecord,
  AnalyticsExportScope,
  ClaimAnalyticsExportJobsInput,
  CompleteAnalyticsExportJobInput,
  CreateAnalyticsExportJobInput,
  FailAnalyticsExportJobInput,
  PersistedAnalyticsExportJob,
  ReadAnalyticsExportEventsInput,
} from './analytics-exports';
import type { PersistedAnalyticsEventRecord } from './analytics';

export interface ExperienceScope {
  workspaceId: string;
  documentId: string;
}

export interface ExperienceExperimentScope extends ExperienceScope {
  environmentId?: string;
}

export interface ResolveExperimentAssignmentInput extends ExperienceScope {
  environmentId: string;
  experimentId: string;
  assignmentKey: string;
}

export interface UpdateExperienceMeasurementInput extends ExperienceScope {
  /** `null` clears the declared success event; `undefined` leaves it alone. */
  successEvent?: SuccessEvent | null;
  adaptivePolicy?: AdaptivePolicy;
  actorUserId: string;
}

export interface QueryExperienceAnalyticsInput extends ExperienceScope {
  environmentId: string;
  /** Document order, so a branch that goes backwards does not reorder the funnel. */
  stepIdsInOrder: readonly string[];
  /** Freezes an asynchronous export to events present when it was requested. */
  asOf?: string;
}

export interface RecordFormResponsesInput extends ExperienceScope {
  environmentId: string;
  responses: ReadonlyArray<{
    stepId: string;
    blockId: string;
    label: string;
    answer: string;
    correlationId?: string;
    occurredAt: string;
  }>;
}

export interface CreateExperimentInput extends ExperienceScope {
  varies: Experiment['varies'];
  successEventName: string;
  arms: readonly ExperimentArm[];
  actorUserId: string;
}

export interface UpdateExperimentInput {
  workspaceId: string;
  /** Required for document-scoped authoring sessions; omitted only by workspace control-plane callers. */
  documentId?: string;
  experimentId: string;
  status?: Experiment['status'];
  arms?: readonly ExperimentArm[];
  promotedArmId?: ExperimentArm['id'];
}

export interface CreateExperienceCommentInput extends ExperienceScope {
  anchor: ExperienceCommentAnchor;
  body: string;
  authorUserId: string;
  authorName: string;
}

export interface ReplyExperienceCommentInput {
  workspaceId: string;
  documentId?: string;
  threadId: string;
  body: string;
  authorUserId: string;
  authorName: string;
}

export interface ResolveExperienceCommentInput {
  workspaceId: string;
  /** Required for document-scoped authoring sessions; omitted only by workspace control-plane callers. */
  documentId?: string;
  commentId: string;
  resolved: boolean;
  actorUserId: string;
}

export interface ClaimStepLockInput extends ExperienceScope {
  stepId: string;
  holderUserId: string;
  holderName: string;
  sessionId: string;
  takeover?: boolean;
}

export interface HeartbeatAuthoringPresenceInput extends ExperienceScope {
  sessionId: string;
  creatorId: string;
  creatorName: string;
  stepId: string | null;
  selection: AuthoringPresenceSelection | null;
  documentUpdatedAt?: string;
}

export interface LeaveAuthoringPresenceInput extends ExperienceScope {
  sessionId: string;
}

export interface ExperienceStepLockClaimResult {
  lock: ExperienceStepLock;
  acquired: boolean;
}

export interface UpsertWorkspaceApplicationInput extends ApplicationSummary {
  workspaceId: string;
}

/** The Operations surface, split out so the interface stays readable. */
export interface ExperienceMeasurementRepository {
  readExperienceMeasurement(scope: ExperienceScope): Promise<ExperienceMeasurementRecord>;
  updateExperienceMeasurement(
    input: UpdateExperienceMeasurementInput,
  ): Promise<ExperienceMeasurementRecord>;
  readAdaptiveBehaviorEvidence(
    input: ReadAdaptiveBehaviorEvidenceInput,
  ): Promise<AdaptiveBehaviorEvidence[]>;
  readExperienceAnalytics(input: QueryExperienceAnalyticsInput): Promise<ExperienceAnalytics>;
  recordFormResponses(input: RecordFormResponsesInput): Promise<number>;
  listExperienceSessions(input: ListExperienceSessionsInput): Promise<ExperienceSession[]>;
  readExperiment(
    scope: ExperienceExperimentScope,
  ): Promise<{ experiment: Experiment | null; results: ExperimentResults | null }>;
  createExperiment(input: CreateExperimentInput): Promise<Experiment>;
  updateExperiment(input: UpdateExperimentInput): Promise<Experiment | null>;
  getOrCreateExperimentAssignment(
    input: ResolveExperimentAssignmentInput,
  ): Promise<ExperienceExperimentAssignmentRecord | null>;
  findExperimentAssignment(
    input: ResolveExperimentAssignmentInput,
  ): Promise<ExperienceExperimentAssignmentRecord | null>;
  listExperienceComments(scope: ExperienceScope): Promise<ExperienceComment[]>;
  createExperienceComment(input: CreateExperienceCommentInput): Promise<ExperienceComment>;
  replyToExperienceComment(input: ReplyExperienceCommentInput): Promise<ExperienceComment | null>;
  resolveExperienceComment(input: ResolveExperienceCommentInput): Promise<ExperienceComment | null>;
  listExperienceCommentAuditEvents(scope: ExperienceScope): Promise<ExperienceCommentAuditEvent[]>;
  listExperienceStepLocks(scope: ExperienceScope): Promise<ExperienceStepLock[]>;
  listExperienceStepLockRecords(scope: ExperienceScope): Promise<ExperienceStepLockRecord[]>;
  findExperienceStepLock(
    scope: ExperienceScope,
    stepId: string,
  ): Promise<ExperienceStepLockRecord | null>;
  claimExperienceStepLock(input: ClaimStepLockInput): Promise<ExperienceStepLockClaimResult>;
  releaseExperienceStepLock(input: ClaimStepLockInput): Promise<void>;
  heartbeatAuthoringPresence(
    input: HeartbeatAuthoringPresenceInput,
  ): Promise<AuthoringPresenceRecord>;
  listAuthoringPresence(scope: ExperienceScope): Promise<AuthoringPresenceRecord[]>;
  leaveAuthoringPresence(input: LeaveAuthoringPresenceInput): Promise<void>;
  listWorkspaceApplications(workspaceId: string): Promise<ApplicationSummary[]>;
  upsertWorkspaceApplication(input: UpsertWorkspaceApplicationInput): Promise<ApplicationSummary>;
  createAnalyticsExportJob(
    input: CreateAnalyticsExportJobInput,
  ): Promise<PersistedAnalyticsExportJob>;
  listAnalyticsExportJobs(scope: AnalyticsExportScope): Promise<PersistedAnalyticsExportJob[]>;
  getAnalyticsExportJob(
    workspaceId: string,
    jobId: string,
  ): Promise<PersistedAnalyticsExportJob | null>;
  claimAnalyticsExportJobs(
    input: ClaimAnalyticsExportJobsInput,
  ): Promise<PersistedAnalyticsExportJob[]>;
  readAnalyticsExportEvents(
    input: ReadAnalyticsExportEventsInput,
  ): Promise<PersistedAnalyticsEventRecord[]>;
  completeAnalyticsExportJob(
    input: CompleteAnalyticsExportJobInput,
  ): Promise<PersistedAnalyticsExportJob | null>;
  failAnalyticsExportJob(
    input: FailAnalyticsExportJobInput,
  ): Promise<PersistedAnalyticsExportJob | null>;
  markAnalyticsExportDownloaded(
    workspaceId: string,
    jobId: string,
    actorUserId: string,
    downloadedAt: string,
  ): Promise<boolean>;
  expireAnalyticsExportJobs(now: string): Promise<number>;
  listAnalyticsExportAuditEvents(
    scope: AnalyticsExportScope,
  ): Promise<AnalyticsExportAuditEventRecord[]>;
}
