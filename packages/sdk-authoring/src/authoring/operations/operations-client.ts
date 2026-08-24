import {
  AuthoringAssistOperationResult,
  AuthoringAuditEventList,
  AuthoringCollaborationSnapshot,
  AnalyticsExportJob,
  CanonicalTemplateInstantiationResult,
  AuthoringDocumentVersionList,
  SemanticVersionDiff,
  ChangeAwareCopySuggestion,
  ChangeAwareCopySuggestionList,
  GenerateNarrationResult,
  validate,
} from '@lodariq/schema';
import type {
  ApplicationSummary,
  CreateDeploymentScheduleBody,
  CreateExperimentBody,
  ExperienceAnalytics,
  ExperienceComment,
  ExperienceMeasurementConfig,
  ExperienceSession,
  ExperienceStepLock,
  ExperienceStepLockClaimResponse,
  Experiment,
  ExperimentResults,
  UpdateExperienceMeasurementBody,
  UpdateExperimentBody,
  AiAssistRequest,
  AuthoringAuditEvent,
  AnalyticsExportJob as AnalyticsExportJobType,
  AnalyticsExportKind,
  AnalyticsExportRelease,
  WorkspaceCommercialUsage,
  WorkspaceDataCatalog,
  DeploymentSchedule,
  DeliveryTransitionHistoryEntry,
  CreateDemoLinkRequest,
  DemoAnalyticsSummary,
  DemoArtifactReview,
  DemoLink,
  ReviewDemoArtifactRequest,
} from '@lodariq/schema';
import type { AuthoringOperationsServices } from './operations-services';

/**
 * The host half of the Operations boundary.
 *
 * Every route is scoped to the authoring session on the server, so nothing here
 * sends a document or workspace id — a session can only read and change the
 * experience it was opened on. The frame still never sees the bearer.
 */
export interface AuthoringOperationsClientOptions {
  /** API origin. Paths are appended, so a trailing slash is harmless. */
  readonly baseUrl: string;
  /**
   * The environment client token. Read at call time rather than captured: both
   * credentials rotate, and a stale one is an authentication failure the creator
   * would see as Operations simply not loading.
   */
  readonly authorization: () => string;
  /** The authoring session, which is what scopes every route to one document. */
  readonly authoringSession: () => string;
  readonly documentUpdatedAt?: () => string | undefined;
  readonly fetch?: typeof fetch;
}

const BASE_PATH = '/v1/sdk/authoring/operations';

export function createAuthoringOperationsClient(
  options: AuthoringOperationsClientOptions,
): AuthoringOperationsServices {
  const rawCall = async (path: string, init?: RequestInit): Promise<Response> => {
    const request = options.fetch ?? fetch;
    return request(new URL(`${BASE_PATH}${path}`, options.baseUrl).toString(), {
      ...init,
      credentials: 'omit',
      headers: {
        accept: 'application/json',
        authorization: options.authorization(),
        'x-lodariq-authoring-session': options.authoringSession(),
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  };
  const call = async <T>(
    path: string,
    init?: RequestInit,
    acceptedErrorStatuses: readonly number[] = [],
  ): Promise<T> => {
    const response = await rawCall(path, init);
    if (!response.ok && !acceptedErrorStatuses.includes(response.status)) {
      throw await operationsError(response);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  const send = <T>(
    path: string,
    method: string,
    body: unknown,
    acceptedErrorStatuses: readonly number[] = [],
  ): Promise<T> => call<T>(path, { method, body: JSON.stringify(body) }, acceptedErrorStatuses);

  return {
    readMeasurement: () => call<ExperienceMeasurementConfig>('/measurement'),
    updateMeasurement: (request: UpdateExperienceMeasurementBody) =>
      send<ExperienceMeasurementConfig>('/measurement', 'PATCH', request),
    // The environment is the session's own; the argument is kept for the seam's
    // shape and deliberately not sent, so a panel cannot read another's numbers.
    readAnalytics: (_environmentId: string) => call<ExperienceAnalytics>('/analytics'),
    listSessions: () =>
      call<{ sessions: ExperienceSession[] }>('/sessions').then((body) => body.sessions),
    readExperiment: () =>
      call<{ experiment: Experiment | null; results: ExperimentResults | null }>('/experiment'),
    createExperiment: (request: CreateExperimentBody) =>
      send<{ experiment: Experiment }>('/experiment', 'POST', request).then(
        (body) => body.experiment,
      ),
    updateExperiment: (experimentId: string, request: UpdateExperimentBody) =>
      send<{ experiment: Experiment }>(
        `/experiment/${encodeURIComponent(experimentId)}`,
        'PATCH',
        request,
      ).then((body) => body.experiment),
    listComments: () =>
      call<{ comments: ExperienceComment[] }>('/comments').then((body) => body.comments),
    addComment: (anchor, body: string) =>
      send<{ comment: ExperienceComment }>('/comments', 'POST', { anchor, body }).then(
        (result) => result.comment,
      ),
    replyToComment: (commentId: string, body: string) =>
      send<{ comment: ExperienceComment }>(
        `/comments/${encodeURIComponent(commentId)}/replies`,
        'POST',
        { body },
      ).then((result) => result.comment),
    resolveComment: (commentId: string, resolved: boolean) =>
      send<{ comment: ExperienceComment }>(`/comments/${encodeURIComponent(commentId)}`, 'PATCH', {
        resolved,
      }).then((result) => result.comment),
    listStepLocks: () =>
      call<{ locks: ExperienceStepLock[] }>('/step-locks').then((body) => body.locks),
    claimStepLock: (stepId: string, takeover = false) =>
      send<ExperienceStepLockClaimResponse>(
        '/step-locks',
        'POST',
        { stepId, ...(takeover ? { takeover: true } : {}) },
        [409],
      ),
    releaseStepLock: (stepId: string) =>
      call<void>('/step-locks', {
        method: 'DELETE',
        body: JSON.stringify({ stepId }),
        keepalive: true,
      }),
    heartbeatCollaboration: async (state) => {
      const documentUpdatedAt = state.documentUpdatedAt ?? options.documentUpdatedAt?.();
      const payload = await send<unknown>('/collaboration/presence', 'PUT', {
        ...state,
        ...(documentUpdatedAt ? { documentUpdatedAt } : {}),
      });
      const checked = validate(AuthoringCollaborationSnapshot, payload);
      if (!checked.valid) {
        throw new Error('Collaboration returned data that does not match its contract');
      }
      return checked.value;
    },
    leaveCollaboration: () =>
      call<void>('/collaboration/presence', { method: 'DELETE', keepalive: true }),
    subscribeCollaboration: (onSnapshot, onState) => {
      let stopped = false;
      let stopActiveStream: (() => void) | undefined;
      void import('./collaboration-transport').then(({ subscribeToCollaborationEvents }) => {
        if (stopped) return;
        stopActiveStream = subscribeToCollaborationEvents(
          (path, init) => rawCall(path, init),
          onSnapshot,
          onState,
        );
      });
      return () => {
        stopped = true;
        stopActiveStream?.();
      };
    },
    listApplications: () =>
      call<{ applications: ApplicationSummary[] }>('/applications').then(
        (body) => body.applications,
      ),
    readCommercialUsage: () => call<WorkspaceCommercialUsage>('/commercial-usage'),
    readDataCatalog: () => call<WorkspaceDataCatalog>('/data-catalog'),
    instantiateTemplate: async (templateId: string) => {
      const result = await send<unknown>('/templates/instantiate', 'POST', {
        operationId: createTemplateOperationId(),
        templateId,
      });
      const checked = validate(CanonicalTemplateInstantiationResult, result);
      if (!checked.valid) {
        throw new Error('Template creation returned data that does not match its contract');
      }
      return checked.value;
    },
    listDocumentVersions: async () => {
      const result = await call<unknown>('/document-versions');
      const checked = validate(AuthoringDocumentVersionList, result);
      if (!checked.valid) {
        throw new Error('Version history returned data that does not match its contract');
      }
      return checked.value.versions;
    },
    compareDocumentVersions: async (beforeVersionId: string, afterVersionId: string) => {
      const result = await send<unknown>('/document-version-diff', 'POST', {
        beforeVersionId,
        afterVersionId,
      });
      const checked = validate(SemanticVersionDiff, result);
      if (!checked.valid) {
        throw new Error('Version diff returned data that does not match its contract');
      }
      return checked.value;
    },
    listCopySuggestions: async () => {
      const result = await call<unknown>('/copy-suggestions');
      const checked = validate(ChangeAwareCopySuggestionList, result);
      if (!checked.valid) {
        throw new Error('Copy suggestions returned data that does not match their contract');
      }
      return checked.value.suggestions;
    },
    createCopySuggestions: async (beforeVersionId: string, afterVersionId: string) => {
      const result = await send<unknown>('/copy-suggestions', 'POST', {
        operationId: createCopySuggestionOperationId(),
        beforeVersionId,
        afterVersionId,
      });
      const checked = validate(ChangeAwareCopySuggestionList, result);
      if (!checked.valid) {
        throw new Error('Copy suggestions returned data that does not match their contract');
      }
      return checked.value.suggestions;
    },
    decideCopySuggestion: async (suggestionId, decision) => {
      const result = await send<unknown>('/copy-suggestions/decisions', 'POST', {
        operationId: createCopySuggestionOperationId(),
        suggestionId,
        decision,
      });
      const checked = validate(ChangeAwareCopySuggestion, result);
      if (!checked.valid) {
        throw new Error('Copy suggestion decision did not match its contract');
      }
      return checked.value;
    },
    listDeliverySchedules: () =>
      call<{ schedules: DeploymentSchedule[] }>('/delivery-schedules').then(
        (body) => body.schedules,
      ),
    listDeliveryTransitionHistory: () =>
      call<{ history: DeliveryTransitionHistoryEntry[] }>('/delivery-schedules/history').then(
        (body) => body.history,
      ),
    createDeliverySchedule: (request: CreateDeploymentScheduleBody) =>
      send<DeploymentSchedule>('/delivery-schedules', 'POST', request),
    cancelDeliverySchedule: (scheduleId: string, expectedRevision: number) =>
      send<DeploymentSchedule>(`/delivery-schedules/${encodeURIComponent(scheduleId)}`, 'DELETE', {
        expectedRevision,
      }),
    requestAiAssist: async (request: AiAssistRequest) => {
      const result = await send<unknown>('/assist', 'POST', {
        operationId: createAssistOperationId(),
        request,
      });
      const checked = validate(AuthoringAssistOperationResult, result);
      if (!checked.valid)
        throw new Error('Ask Lodariq returned data that does not match its contract');
      return checked.value.proposal;
    },
    generateNarration: async (stepId: string) => {
      const result = await send<unknown>('/narration', 'POST', {
        operationId: createNarrationOperationId(),
        stepId,
      });
      const checked = validate(GenerateNarrationResult, result);
      if (!checked.valid)
        throw new Error('Narration returned data that does not match its contract');
      return checked.value;
    },
    listAuditEvents: async () => {
      const result = await call<unknown>('/audit-events');
      const checked = validate(AuthoringAuditEventList, result);
      if (!checked.valid)
        throw new Error('Audit log returned data that does not match its contract');
      return checked.value.events as AuthoringAuditEvent[];
    },
    exportAuditCsv: async () => {
      const response = await rawCall('/audit-events.csv');
      if (!response.ok) throw await operationsError(response);
      await deliverDownload(response, 'lodariq-audit-log.csv');
    },
    readDemoLinks: () => call<{ links: DemoLink[] }>('/demo-links').then((body) => body.links),
    readDemoAnalytics: () => call<DemoAnalyticsSummary>('/demo-links/analytics'),
    reviewDemoArtifact: (request: ReviewDemoArtifactRequest) =>
      send<DemoArtifactReview>('/demo-links/review', 'POST', request),
    createDemoLink: (request: CreateDemoLinkRequest) =>
      send<DemoLink>('/demo-links', 'POST', request),
    revokeDemoLink: (demoId: string) =>
      send<DemoLink>(`/demo-links/${encodeURIComponent(demoId)}`, 'DELETE', undefined),
    exportAnalytics: async (kind: AnalyticsExportKind, release?: AnalyticsExportRelease) => {
      const payload = await send<unknown>('/analytics-exports', 'POST', {
        operationId: createAnalyticsExportOperationId(),
        kind,
        ...(release ? { release } : {}),
      });
      const checked = validate(AnalyticsExportJob, payload);
      if (!checked.valid) {
        throw new Error('Analytics export returned data that does not match its contract');
      }
      const job = await waitForAnalyticsExport(checked.value, async (jobId) => {
        const next = await call<unknown>(`/analytics-exports/${encodeURIComponent(jobId)}`);
        const validated = validate(AnalyticsExportJob, next);
        if (!validated.valid) {
          throw new Error('Analytics export returned data that does not match its contract');
        }
        return validated.value;
      });
      const response = await rawCall(`/analytics-exports/${encodeURIComponent(job.id)}/download`);
      if (!response.ok) throw await operationsError(response);
      await deliverDownload(response, job.filename ?? 'lodariq-analytics-export');
    },
  };
}

function createAssistOperationId(): string {
  return `aiop_${globalThis.crypto.randomUUID().replace(/-/gu, '')}`;
}

function createNarrationOperationId(): string {
  return `ttsop_${globalThis.crypto.randomUUID().replace(/-/gu, '')}`;
}

function createTemplateOperationId(): string {
  return `tplop_${globalThis.crypto.randomUUID().replace(/-/gu, '')}`;
}

function createCopySuggestionOperationId(): string {
  return `copyop_${globalThis.crypto.randomUUID().replace(/-/gu, '')}`;
}

function createAnalyticsExportOperationId(): string {
  return `anxop_${globalThis.crypto.randomUUID().replace(/-/gu, '')}`;
}

async function waitForAnalyticsExport(
  initial: AnalyticsExportJobType,
  read: (jobId: string) => Promise<AnalyticsExportJobType>,
): Promise<AnalyticsExportJobType> {
  let job = initial;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (job.status === 'completed') return job;
    if (job.status === 'failed' || job.status === 'expired') {
      throw new Error(`Analytics export ${job.status}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    job = await read(job.id);
  }
  throw new Error('Analytics export timed out');
}

async function deliverDownload(response: Response, filename: string): Promise<void> {
  const href = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

/**
 * A 409 on a claim is not a failure — it carries the winning lease, which is the
 * whole point of a soft lock. The client resolves it rather than throwing, so
 * the panel can name who holds the step.
 */
async function operationsError(response: Response): Promise<Error> {
  let message = `Operations request failed (${response.status})`;
  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === 'string' && body.message) message = body.message;
  } catch {
    /* A non-JSON error body still deserves the status. */
  }
  const error = new Error(message);
  error.name =
    response.status === 403 ? 'LodariqOperationsForbiddenError' : 'LodariqOperationsError';
  return error;
}
