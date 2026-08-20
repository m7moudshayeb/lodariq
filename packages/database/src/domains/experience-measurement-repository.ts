import type {
  AdaptivePolicy,
  ApplicationSummary,
  ExperienceAnalytics,
  ExperienceComment,
  ExperienceSession,
  ExperienceStepLock,
  Experiment,
  ExperimentArm,
  ExperimentResults,
  SuccessEvent,
} from '@lodariq/schema';
import type { ExperienceMeasurementRecord } from './experience-measurement';
import type { ListExperienceSessionsInput } from './experience-sessions';

export interface ExperienceScope {
  workspaceId: string;
  documentId: string;
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
  stepId: string;
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
  readExperienceAnalytics(input: QueryExperienceAnalyticsInput): Promise<ExperienceAnalytics>;
  recordFormResponses(input: RecordFormResponsesInput): Promise<number>;
  listExperienceSessions(input: ListExperienceSessionsInput): Promise<ExperienceSession[]>;
  readExperiment(
    scope: ExperienceScope,
  ): Promise<{ experiment: Experiment | null; results: ExperimentResults | null }>;
  createExperiment(input: CreateExperimentInput): Promise<Experiment>;
  updateExperiment(input: UpdateExperimentInput): Promise<Experiment | null>;
  listExperienceComments(scope: ExperienceScope): Promise<ExperienceComment[]>;
  createExperienceComment(input: CreateExperienceCommentInput): Promise<ExperienceComment>;
  resolveExperienceComment(input: ResolveExperienceCommentInput): Promise<ExperienceComment | null>;
  listExperienceStepLocks(scope: ExperienceScope): Promise<ExperienceStepLock[]>;
  claimExperienceStepLock(input: ClaimStepLockInput): Promise<ExperienceStepLock>;
  releaseExperienceStepLock(input: ClaimStepLockInput): Promise<void>;
  listWorkspaceApplications(workspaceId: string): Promise<ApplicationSummary[]>;
  upsertWorkspaceApplication(input: UpsertWorkspaceApplicationInput): Promise<ApplicationSummary>;
}
