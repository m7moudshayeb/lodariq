import type {
  ApplicationSummary,
  CreateExperimentBody,
  ExperienceAnalytics,
  ExperienceComment,
  ExperienceMeasurementConfig,
  ExperienceSession,
  ExperienceStepLock,
  Experiment,
  ExperimentResults,
  UpdateExperienceMeasurementBody,
  UpdateExperimentBody,
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
  readonly fetch?: typeof fetch;
}

const BASE_PATH = '/v1/sdk/authoring/operations';

export function createAuthoringOperationsClient(
  options: AuthoringOperationsClientOptions,
): AuthoringOperationsServices & { listSessions: () => Promise<readonly ExperienceSession[]> } {
  const call = async <T>(
    path: string,
    init?: RequestInit,
    acceptedErrorStatuses: readonly number[] = [],
  ): Promise<T> => {
    const request = options.fetch ?? fetch;
    const response = await request(new URL(`${BASE_PATH}${path}`, options.baseUrl).toString(), {
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
    addComment: (stepId: string, body: string) =>
      send<{ comment: ExperienceComment }>('/comments', 'POST', { stepId, body }).then(
        (result) => result.comment,
      ),
    resolveComment: (commentId: string, resolved: boolean) =>
      send<{ comment: ExperienceComment }>(`/comments/${encodeURIComponent(commentId)}`, 'PATCH', {
        resolved,
      }).then((result) => result.comment),
    listStepLocks: () =>
      call<{ locks: ExperienceStepLock[] }>('/step-locks').then((body) => body.locks),
    claimStepLock: (stepId: string) =>
      send<{ lock: ExperienceStepLock }>(
        '/step-locks',
        'POST',
        {
          stepId,
          sessionId: sessionIdFor(stepId),
        },
        [409],
      ).then((body) => body.lock),
    listApplications: () =>
      call<{ applications: ApplicationSummary[] }>('/applications').then(
        (body) => body.applications,
      ),
  };
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

/** One id per tab, so a second tab's claim is recognised as a different holder. */
let tabSessionId: string | null = null;
function sessionIdFor(_stepId: string): string {
  tabSessionId ??= `tab_${Math.random().toString(36).slice(2, 12)}`;
  return tabSessionId;
}
