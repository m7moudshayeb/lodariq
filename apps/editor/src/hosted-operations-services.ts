import {
  ExperienceAnalytics,
  AuthoringAssistOperationResult,
  AuthoringAuditEventList,
  AuthoringCollaborationSnapshot,
  AnalyticsExportJob,
  CanonicalTemplateInstantiationResult,
  AuthoringDocumentVersionList,
  SemanticVersionDiff,
  ChangeAwareCopySuggestion,
  ChangeAwareCopySuggestionList,
  DeliveryTransitionHistoryList,
  DeploymentSchedule,
  DeploymentScheduleList,
  ExperienceCommentsResponse,
  ExperienceMeasurementConfig,
  ExperienceSessionsResponse,
  ExperienceStepLocksResponse,
  ExperienceStepLockClaimResponse,
  GenerateNarrationResult,
  ExperimentResponse,
  WorkspaceApplicationsResponse,
  WorkspaceDataCatalog,
  DemoAnalyticsSummary,
  DemoArtifactReview,
  DemoLink,
  validate,
  validateWithReferences,
  type CreateExperimentBody,
  type AiAssistProposal,
  type AiAssistRequest,
  type AuthoringAuditEvent,
  type AnalyticsExportJob as AnalyticsExportJobType,
  type AnalyticsExportKind,
  type AnalyticsExportRelease,
  type CreateDeploymentScheduleBody,
  type DeliveryTransitionHistoryEntry,
  type DeploymentSchedule as DeploymentScheduleType,
  type ExperienceComment,
  type ExperienceSession,
  type ExperienceStepLock,
  type Experiment,
  type ExperimentResults,
  type GenerateNarrationResult as GenerateNarrationResultType,
  type UpdateExperienceMeasurementBody,
  type UpdateExperimentBody,
  type CreateDemoLinkRequest,
  type ReviewDemoArtifactRequest,
  type CanonicalTemplateInstantiationResult as CanonicalTemplateInstantiationResultType,
  type AuthoringDocumentVersionList as AuthoringDocumentVersionListType,
  type SemanticVersionDiff as SemanticVersionDiffType,
  type ChangeAwareCopySuggestion as ChangeAwareCopySuggestionType,
  type ChangeAwareCopySuggestionList as ChangeAwareCopySuggestionListType,
} from '@lodariq/schema';
import {
  ACCESSIBILITY_GOVERNANCE_REFERENCE_SCHEMAS,
  AccessibilitySweepResult,
  type AccessibilitySweepResult as AccessibilitySweepResultType,
} from '@lodariq/schema/accessibility-governance';
import type { AuthoringOperationsServices } from '@lodariq/sdk-authoring';
import { subscribeToCollaborationEvents } from '@lodariq/sdk-authoring/authoring-collaboration-transport';
import { authoringText } from '@lodariq/sdk-authoring/i18n';

type HostedRequest = (
  url: URL,
  init: Pick<RequestInit, 'body' | 'headers' | 'keepalive' | 'method' | 'signal'> & {
    longLived?: boolean;
  },
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
  options: { documentUpdatedAt?: () => string | undefined } = {},
): AuthoringOperationsServices {
  const url = (path: string): URL => new URL(path, apiOrigin);
  const operationsUrl = (suffix: string): URL => url(`/v1/authoring/operations${suffix}`);

  async function send<T>(
    target: URL,
    init: Pick<RequestInit, 'body' | 'headers' | 'keepalive' | 'method'>,
    schema: object,
    pick: (payload: Record<string, unknown>) => unknown = (payload) => payload,
    references?: readonly object[],
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
    const validation = references
      ? validateWithReferences(schema as never, references as never[], value)
      : validate(schema as never, value);
    if (!validation.valid) {
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

    listSessions: async () =>
      (
        await send<{ sessions: ExperienceSession[] }>(
          operationsUrl('/sessions'),
          { method: 'GET' },
          ExperienceSessionsResponse,
        )
      ).sessions,

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

    addComment: (anchor, body: string) =>
      send<ExperienceComment>(
        operationsUrl('/comments'),
        { method: 'POST', body: JSON.stringify({ anchor, body }) },
        ExperienceCommentsResponse.properties.comments.items,
        (payload) => payload['comment'],
      ),

    replyToComment: (commentId: string, body: string) =>
      send<ExperienceComment>(
        operationsUrl(`/comments/${encodeURIComponent(commentId)}/replies`),
        { method: 'POST', body: JSON.stringify({ body }) },
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
    claimStepLock: async (stepId: string, takeover = false) => {
      const response = await request(operationsUrl('/step-locks'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stepId, ...(takeover ? { takeover: true } : {}) }),
      });
      if (!response.ok && response.status !== 409) throw new Error(await failureMessage(response));
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!validate(ExperienceStepLockClaimResponse, payload).valid) {
        throw new Error(authoringText('Operations returned data that does not match its contract'));
      }
      return payload as ExperienceStepLockClaimResponse;
    },

    releaseStepLock: async (stepId: string) => {
      const response = await request(operationsUrl('/step-locks'), {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stepId }),
        keepalive: true,
      });
      if (!response.ok) throw new Error(await failureMessage(response));
    },

    heartbeatCollaboration: (state) => {
      const documentUpdatedAt = state.documentUpdatedAt ?? options.documentUpdatedAt?.();
      return send(
        operationsUrl('/collaboration/presence'),
        {
          method: 'PUT',
          body: JSON.stringify({
            ...state,
            ...(documentUpdatedAt ? { documentUpdatedAt } : {}),
          }),
        },
        AuthoringCollaborationSnapshot,
      );
    },

    leaveCollaboration: async () => {
      const response = await request(operationsUrl('/collaboration/presence'), {
        method: 'DELETE',
        keepalive: true,
      });
      if (!response.ok) throw new Error(await failureMessage(response));
    },

    subscribeCollaboration: (onSnapshot, onState) =>
      subscribeToCollaborationEvents(
        (suffix, init) =>
          request(operationsUrl(suffix), {
            method: init.method,
            headers: init.headers,
            signal: init.signal,
            longLived: true,
          }),
        onSnapshot,
        onState,
      ),

    listApplications: async () =>
      (
        await send<{
          applications: Awaited<ReturnType<AuthoringOperationsServices['listApplications']>>;
        }>(operationsUrl('/applications'), { method: 'GET' }, WorkspaceApplicationsResponse)
      ).applications,

    readDataCatalog: () =>
      send(operationsUrl('/data-catalog'), { method: 'GET' }, WorkspaceDataCatalog),

    runAccessibilitySweep: (operationId: string) =>
      send<AccessibilitySweepResultType>(
        operationsUrl('/accessibility-sweeps'),
        { method: 'POST', body: JSON.stringify({ operationId }) },
        AccessibilitySweepResult,
        undefined,
        ACCESSIBILITY_GOVERNANCE_REFERENCE_SCHEMAS,
      ),

    instantiateTemplate: (templateId: string) =>
      send<CanonicalTemplateInstantiationResultType>(
        operationsUrl('/templates/instantiate'),
        {
          method: 'POST',
          body: JSON.stringify({ operationId: createTemplateOperationId(), templateId }),
        },
        CanonicalTemplateInstantiationResult,
      ),

    listDocumentVersions: async () =>
      (
        await send<AuthoringDocumentVersionListType>(
          operationsUrl('/document-versions'),
          { method: 'GET' },
          AuthoringDocumentVersionList,
        )
      ).versions,

    compareDocumentVersions: (beforeVersionId: string, afterVersionId: string) =>
      send<SemanticVersionDiffType>(
        operationsUrl('/document-version-diff'),
        {
          method: 'POST',
          body: JSON.stringify({ beforeVersionId, afterVersionId }),
        },
        SemanticVersionDiff,
      ),

    listCopySuggestions: async () =>
      (
        await send<ChangeAwareCopySuggestionListType>(
          operationsUrl('/copy-suggestions'),
          { method: 'GET' },
          ChangeAwareCopySuggestionList,
        )
      ).suggestions,

    createCopySuggestions: async (beforeVersionId: string, afterVersionId: string) =>
      (
        await send<ChangeAwareCopySuggestionListType>(
          operationsUrl('/copy-suggestions'),
          {
            method: 'POST',
            body: JSON.stringify({
              operationId: createCopySuggestionOperationId(),
              beforeVersionId,
              afterVersionId,
            }),
          },
          ChangeAwareCopySuggestionList,
        )
      ).suggestions,

    decideCopySuggestion: (suggestionId, decision) =>
      send<ChangeAwareCopySuggestionType>(
        operationsUrl('/copy-suggestions/decisions'),
        {
          method: 'POST',
          body: JSON.stringify({
            operationId: createCopySuggestionOperationId(),
            suggestionId,
            decision,
          }),
        },
        ChangeAwareCopySuggestion,
      ),

    listDeliverySchedules: async () =>
      (
        await send<{ schedules: DeploymentScheduleType[] }>(
          operationsUrl('/delivery-schedules'),
          { method: 'GET' },
          DeploymentScheduleList,
        )
      ).schedules,

    listDeliveryTransitionHistory: async () =>
      (
        await send<{ history: DeliveryTransitionHistoryEntry[] }>(
          operationsUrl('/delivery-schedules/history'),
          { method: 'GET' },
          DeliveryTransitionHistoryList,
        )
      ).history,

    createDeliverySchedule: (body: CreateDeploymentScheduleBody) =>
      send<DeploymentScheduleType>(
        operationsUrl('/delivery-schedules'),
        { method: 'POST', body: JSON.stringify(body) },
        DeploymentSchedule,
      ),

    cancelDeliverySchedule: (scheduleId: string, expectedRevision: number) =>
      send<DeploymentScheduleType>(
        operationsUrl(`/delivery-schedules/${encodeURIComponent(scheduleId)}`),
        { method: 'DELETE', body: JSON.stringify({ expectedRevision }) },
        DeploymentSchedule,
      ),

    requestAiAssist: (body: AiAssistRequest) =>
      send<AiAssistProposal>(
        operationsUrl('/assist'),
        {
          method: 'POST',
          body: JSON.stringify({ operationId: createAssistOperationId(), request: body }),
        },
        AuthoringAssistOperationResult.properties.proposal,
        (payload) => payload['proposal'],
      ),

    generateNarration: (stepId: string) =>
      send<GenerateNarrationResultType>(
        operationsUrl('/narration'),
        {
          method: 'POST',
          body: JSON.stringify({ operationId: createNarrationOperationId(), stepId }),
        },
        GenerateNarrationResult,
      ),

    listAuditEvents: async () =>
      (
        await send<{ events: AuthoringAuditEvent[] }>(
          operationsUrl('/audit-events'),
          { method: 'GET' },
          AuthoringAuditEventList,
        )
      ).events,

    exportAuditCsv: async () => {
      const response = await request(operationsUrl('/audit-events.csv'), { method: 'GET' });
      if (!response.ok) throw new Error(await failureMessage(response));
      await deliverDownload(response, 'lodariq-audit-log.csv');
    },
    readDemoLinks: async () =>
      (
        await send<{ links: DemoLink[] }>(
          operationsUrl('/demo-links'),
          { method: 'GET' },
          {
            type: 'object',
            properties: { links: { type: 'array', items: DemoLink } },
            required: ['links'],
            additionalProperties: false,
          },
        )
      ).links,
    readDemoAnalytics: () =>
      send<DemoAnalyticsSummary>(
        operationsUrl('/demo-links/analytics'),
        { method: 'GET' },
        DemoAnalyticsSummary,
      ),
    reviewDemoArtifact: (body: ReviewDemoArtifactRequest) =>
      send<DemoArtifactReview>(
        operationsUrl('/demo-links/review'),
        { method: 'POST', body: JSON.stringify(body) },
        DemoArtifactReview,
      ),
    createDemoLink: (body: CreateDemoLinkRequest) =>
      send<DemoLink>(
        operationsUrl('/demo-links'),
        { method: 'POST', body: JSON.stringify(body) },
        DemoLink,
      ),
    revokeDemoLink: (demoId: string) =>
      send<DemoLink>(
        operationsUrl(`/demo-links/${encodeURIComponent(demoId)}`),
        { method: 'DELETE' },
        DemoLink,
      ),

    exportAnalytics: async (kind: AnalyticsExportKind, release?: AnalyticsExportRelease) => {
      const initial = await send<AnalyticsExportJobType>(
        operationsUrl('/analytics-exports'),
        {
          method: 'POST',
          body: JSON.stringify({
            operationId: createAnalyticsExportOperationId(),
            kind,
            ...(release ? { release } : {}),
          }),
        },
        AnalyticsExportJob,
      );
      const job = await waitForAnalyticsExport(initial, (jobId) =>
        send<AnalyticsExportJobType>(
          operationsUrl(`/analytics-exports/${encodeURIComponent(jobId)}`),
          { method: 'GET' },
          AnalyticsExportJob,
        ),
      );
      const response = await request(
        operationsUrl(`/analytics-exports/${encodeURIComponent(job.id)}/download`),
        { method: 'GET' },
      );
      if (!response.ok) throw new Error(await failureMessage(response));
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
      throw new Error(authoringText('Analytics export failed'));
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    job = await read(job.id);
  }
  throw new Error(authoringText('Analytics export timed out'));
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

async function failureMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message ?? authoringText('Operations request failed');
}
