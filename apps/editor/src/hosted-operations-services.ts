import {
  ExperienceAnalytics,
  ExperienceCommentsResponse,
  ExperienceMeasurementConfig,
  ExperienceStepLocksResponse,
  ExperimentResponse,
  WorkspaceApplicationsResponse,
  validate,
  type CreateExperimentBody,
  type ExperienceComment,
  type ExperienceStepLock,
  type Experiment,
  type ExperimentResults,
  type UpdateExperienceMeasurementBody,
  type UpdateExperimentBody,
} from '@lodariq/schema';
import type { AuthoringOperationsServices } from '@lodariq/sdk-authoring';
import { authoringText } from '@lodariq/sdk-authoring/i18n';

type HostedRequest = (
  url: URL,
  init: Pick<RequestInit, 'body' | 'headers' | 'method'>,
) => Promise<Response>;

/**
 * The hosted Operations boundary.
 *
 * Every response is validated against its published contract before it reaches
 * the frame — Operations drives irreversible decisions (promoting an arm,
 * declaring what "worked" means), so a malformed response fails loudly instead
 * of rendering as a plausible number.
 */
export function createHostedOperationsServices(
  apiOrigin: string,
  request: HostedRequest,
): AuthoringOperationsServices {
  const url = (path: string): URL => new URL(path, apiOrigin);
  const operationsUrl = (suffix: string): URL => url(`/v1/authoring/operations${suffix}`);

  async function send<T>(
    target: URL,
    init: Pick<RequestInit, 'body' | 'headers' | 'method'>,
    schema: object,
    pick: (payload: Record<string, unknown>) => unknown = (payload) => payload,
  ): Promise<T> {
    const response = await request(target, {
      ...init,
      ...(init.body
        ? { headers: { ...(init.headers ?? {}), 'content-type': 'application/json' } }
        : {}),
    });
    if (!response.ok) throw new Error(await failureMessage(response));
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) throw new Error(authoringText('Operations returned an unreadable response'));
    const value = pick(payload);
    if (!validate(schema as never, value).valid) {
      throw new Error(authoringText('Operations returned data that does not match its contract'));
    }
    return value as T;
  }

  return {
    readMeasurement: () =>
      send<ExperienceMeasurementConfig>(
        operationsUrl('/measurement'),
        { method: 'GET' },
        ExperienceMeasurementConfig,
      ),

    updateMeasurement: (body: UpdateExperienceMeasurementBody) =>
      send<ExperienceMeasurementConfig>(
        operationsUrl('/measurement'),
        { method: 'PATCH', body: JSON.stringify(body) },
        ExperienceMeasurementConfig,
      ),

    readAnalytics: (_environmentId: string) => {
      return send<ExperienceAnalytics>(
        operationsUrl('/analytics'),
        { method: 'GET' },
        ExperienceAnalytics,
      );
    },

    readExperiment: () =>
      send<{ experiment: Experiment | null; results: ExperimentResults | null }>(
        operationsUrl('/experiment'),
        { method: 'GET' },
        ExperimentResponse,
      ),

    createExperiment: (body: CreateExperimentBody) =>
      send<Experiment>(
        operationsUrl('/experiment'),
        { method: 'POST', body: JSON.stringify(body) },
        ExperimentResponse.properties.experiment.anyOf[0]!,
        (payload) => payload['experiment'],
      ),

    updateExperiment: (experimentId: string, body: UpdateExperimentBody) =>
      send<Experiment>(
        operationsUrl(`/experiment/${encodeURIComponent(experimentId)}`),
        { method: 'PATCH', body: JSON.stringify(body) },
        ExperimentResponse.properties.experiment.anyOf[0]!,
        (payload) => payload['experiment'],
      ),

    listComments: async () =>
      (
        await send<{ comments: ExperienceComment[] }>(
          operationsUrl('/comments'),
          { method: 'GET' },
          ExperienceCommentsResponse,
        )
      ).comments,

    addComment: (stepId: string, body: string) =>
      send<ExperienceComment>(
        operationsUrl('/comments'),
        { method: 'POST', body: JSON.stringify({ stepId, body }) },
        ExperienceCommentsResponse.properties.comments.items,
        (payload) => payload['comment'],
      ),

    resolveComment: (commentId: string, resolved: boolean) =>
      send<ExperienceComment>(
        operationsUrl(`/comments/${encodeURIComponent(commentId)}`),
        { method: 'PATCH', body: JSON.stringify({ resolved }) },
        ExperienceCommentsResponse.properties.comments.items,
        (payload) => payload['comment'],
      ),

    listStepLocks: async () =>
      (
        await send<{ locks: ExperienceStepLock[] }>(
          operationsUrl('/step-locks'),
          { method: 'GET' },
          ExperienceStepLocksResponse,
        )
      ).locks,

    /**
     * A contested claim answers 409 with the winning lease, which is data rather
     * than an error — the creator needs to know who holds the step.
     */
    claimStepLock: async (stepId: string) => {
      const response = await request(operationsUrl('/step-locks'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stepId, sessionId: crypto.randomUUID() }),
      });
      if (!response.ok && response.status !== 409) throw new Error(await failureMessage(response));
      const payload = (await response.json().catch(() => null)) as { lock?: unknown } | null;
      if (!validate(ExperienceStepLocksResponse.properties.locks.items, payload?.lock).valid) {
        throw new Error(authoringText('Operations returned data that does not match its contract'));
      }
      return payload!.lock as ExperienceStepLock;
    },

    listApplications: async () =>
      (
        await send<{
          applications: Awaited<ReturnType<AuthoringOperationsServices['listApplications']>>;
        }>(operationsUrl('/applications'), { method: 'GET' }, WorkspaceApplicationsResponse)
      ).applications,
  };
}

async function failureMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message ?? authoringText('Operations request failed');
}
