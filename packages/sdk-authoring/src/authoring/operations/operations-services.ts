import type {
  ApplicationSummary,
  CreateExperimentBody,
  ExperienceAnalytics,
  ExperienceComment,
  ExperienceMeasurementConfig,
  ExperienceStepLock,
  Experiment,
  ExperimentResults,
  UpdateExperienceMeasurementBody,
  UpdateExperimentBody,
} from '@lodariq/schema';

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
  readExperiment: () => Promise<{
    experiment: Experiment | null;
    results: ExperimentResults | null;
  }>;
  createExperiment: (request: CreateExperimentBody) => Promise<Experiment>;
  updateExperiment: (experimentId: string, request: UpdateExperimentBody) => Promise<Experiment>;
  listComments: () => Promise<readonly ExperienceComment[]>;
  addComment: (stepId: string, body: string) => Promise<ExperienceComment>;
  resolveComment: (commentId: string, resolved: boolean) => Promise<ExperienceComment>;
  listStepLocks: () => Promise<readonly ExperienceStepLock[]>;
  /** Resolves to the winning lease, which may be held by someone else. */
  claimStepLock: (stepId: string) => Promise<ExperienceStepLock>;
  listApplications: () => Promise<readonly ApplicationSummary[]>;
  /** Delivered as a file by the host; the frame never builds a download itself. */
  exportAnalyticsCsv?: (environmentId: string) => Promise<void>;
}
