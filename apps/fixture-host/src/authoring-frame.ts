import type {
  AuthoringOperationsServices,
  LocalAuthoringFrameServices,
} from '@lodariq/sdk-authoring';
import {
  CANONICAL_DOCUMENT_TEMPLATES,
  COMMERCIAL_PLAN_IDS,
  COMMERCIAL_PLAN_VERSION,
  commercialUsageValue,
  instantiateCanonicalTemplate,
  resolveCommercialEntitlements,
  type AuthoringAuditEvent,
  type AuthoringCollaborationSnapshot,
  type CanonicalTemplateInstantiationResult,
  type CommercialPlanId,
  type DeploymentSchedule,
  type Experiment,
  type ExperienceComment,
  type LodariqDocument,
  type WorkspaceCommercialUsage,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringDevFrame } from '@lodariq/sdk-authoring/local-dev/frame';
import { rememberLocalExperienceForPage } from '@lodariq/sdk-authoring/local-dev/install';
import { loadDocument, saveDocument } from '@lodariq/sdk-runtime/lodariq-local-dev';
import { approachFixtureDocument } from './approach-fixture';
import { experienceTypeFixtureDocument } from './experience-type-fixture';

const root = document.getElementById('authoring');
if (!root) throw new Error('#authoring not found');
const fixtureScenario = new URLSearchParams(window.parent.location.search).get('scenario');
const fixtureParams = new URLSearchParams(window.parent.location.search);
let fixtureOperations: AuthoringOperationsServices | undefined;
const fixtureServices: Partial<LocalAuthoringFrameServices> = {};
if (fixtureScenario === 'scoped-replay') fixtureOperations = replayFixtureOperations();
if (fixtureScenario === 'templates') fixtureOperations = replayFixtureOperations();
if (fixtureScenario === 'experiment') fixtureOperations = experimentFixtureOperations();
if (fixtureScenario === 'comment-threads') fixtureOperations = commentFixtureOperations();
if (fixtureScenario === 'lock-conflict') fixtureOperations = lockFixtureOperations();
if (fixtureScenario === 'collaboration') {
  fixtureOperations = collaborationFixtureOperations(
    fixtureParams.get('connection') === 'reconnecting',
  );
}
if (fixtureScenario === 'commercial') {
  const planId = commercialFixturePlan(fixtureParams.get('plan'));
  fixtureOperations = commercialFixtureOperations(
    planId,
    fixtureParams.get('credits') === 'exhausted',
  );
  fixtureServices.getReleaseWorkflowState = async () => ({
    draft: { version: 4, contentHash: `sha256-${'a'.repeat(64)}`, dirty: false },
    staging: {
      version: 4,
      publicationId: 'pub_fixture_staging',
      environmentId: 'env_staging',
      generation: 4,
      artifactId: 'artifact_fixture_verified',
      contentHash: `sha256-${'a'.repeat(64)}`,
      exactOrigin: 'https://staging.customer.example',
      verification: {
        state: 'passed',
        verifiedAt: '2026-08-21T10:00:00.000Z',
        exactOrigin: 'https://staging.customer.example',
        checks: [],
      },
    },
    production: null,
    environments: [
      { environment: 'staging', environmentId: 'env_staging' },
      { environment: 'production', environmentId: 'env_production' },
    ],
    canVerify: true,
    canPromote: true,
    approval: 'not-required',
  });
}
if (fixtureOperations) fixtureServices.operations = fixtureOperations;
const fixtureDocument =
  fixtureScenario === 'approach'
    ? approachFixtureDocument()
    : fixtureScenario === 'experience-type'
      ? (experienceTypeFixtureDocument(fixtureParams.get('type'), fixtureParams.get('surface')) ??
        (tourFixture as LodariqDocument))
      : (tourFixture as LodariqDocument);

void mountLocalAuthoringDevFrame({
  root,
  baseDocument: fixtureDocument,
  ...(fixtureParams.get('workspace') === 'flow'
    ? { initialWorkspace: { kind: 'flowMap' as const } }
    : {}),
  ...(Object.keys(fixtureServices).length > 0 ? { services: fixtureServices } : {}),
});

function replayFixtureOperations(): AuthoringOperationsServices {
  let measurement = {
    documentId: 'doc_tour_linear',
    adaptivePolicy: { enabled: false, minimumOccurrences: 2, lookbackDays: 30 },
  };

  return {
    readMeasurement: async () => structuredClone(measurement),
    updateMeasurement: async (request) => {
      measurement = {
        ...measurement,
        ...(request.successEvent ? { successEvent: structuredClone(request.successEvent) } : {}),
        ...(request.adaptivePolicy
          ? { adaptivePolicy: structuredClone(request.adaptivePolicy) }
          : {}),
      };
      return structuredClone(measurement);
    },
    readAnalytics: async () => ({
      documentId: 'doc_tour_linear',
      environmentId: 'env_staging',
      shown: 18,
      completed: 12,
      dismissed: 2,
      funnel: [],
      adoption: [],
      formResponses: [],
      breakdown: {
        definitionVersion: 1,
        asOf: '2026-08-21T10:00:00.000Z',
        retentionDays: 90,
        retentionCutoff: '2026-05-23T10:00:00.000Z',
        releases: [
          {
            publicationId: 'pub_fixture_current',
            contentHash: `sha256-${'b'.repeat(64)}`,
            pointerGeneration: 7,
            audienceSegment: {
              id: `audseg_${'c'.repeat(64)}`,
              definitionVersion: 1,
              ruleCount: 2,
            },
            shown: 12,
            completed: 9,
            dismissed: 1,
            funnel: [],
            adoption: [],
            formResponses: [],
          },
          {
            publicationId: 'pub_fixture_previous',
            contentHash: `sha256-${'a'.repeat(64)}`,
            pointerGeneration: 6,
            audienceSegment: {
              id: `audseg_${'d'.repeat(64)}`,
              definitionVersion: 1,
              ruleCount: 1,
            },
            shown: 6,
            completed: 3,
            dismissed: 1,
            funnel: [],
            adoption: [],
            formResponses: [],
          },
        ],
        locales: [],
        audienceSegments: [
          {
            id: `audseg_${'c'.repeat(64)}`,
            definitionVersion: 1,
            ruleCount: 2,
            shown: 12,
            completed: 9,
            dismissed: 1,
            funnel: [],
            adoption: [],
            formResponses: [],
          },
          {
            id: `audseg_${'d'.repeat(64)}`,
            definitionVersion: 1,
            ruleCount: 1,
            shown: 6,
            completed: 3,
            dismissed: 1,
            funnel: [],
            adoption: [],
            formResponses: [],
          },
        ],
        retention: [
          {
            week: 1,
            exposedCohort: 18,
            exposedReturned: 11,
            baselineCohort: 20,
            baselineReturned: 8,
          },
          {
            week: 2,
            exposedCohort: 15,
            exposedReturned: 7,
            baselineCohort: 17,
            baselineReturned: 5,
          },
        ],
      },
    }),
    listSessions: async () => [
      {
        correlationId: 'fixture_scoped_session',
        startedAt: '2026-08-21T10:00:00.000Z',
        endedAt: '2026-08-21T10:00:12.000Z',
        durationMs: 12_000,
        outcome: 'completed',
        stepsReached: 1,
        unresolvedStepIds: [],
        beats: [
          { name: 'experience_shown', at: '2026-08-21T10:00:00.000Z', offsetMs: 0 },
          {
            name: 'step_shown',
            at: '2026-08-21T10:00:01.000Z',
            offsetMs: 1_000,
            stepId: 'block_step_1',
            resolved: true,
          },
          {
            name: 'experience_completed',
            at: '2026-08-21T10:00:12.000Z',
            offsetMs: 12_000,
          },
        ],
      },
    ],
    readExperiment: async () => ({ experiment: null, results: null }),
    createExperiment: async () => Promise.reject(new Error('Not used by this fixture')),
    updateExperiment: async () => Promise.reject(new Error('Not used by this fixture')),
    listComments: async () => [],
    addComment: async () => Promise.reject(new Error('Not used by this fixture')),
    replyToComment: async () => Promise.reject(new Error('Not used by this fixture')),
    resolveComment: async () => Promise.reject(new Error('Not used by this fixture')),
    listStepLocks: async () => [],
    claimStepLock: async (stepId) => ({
      lock: {
        stepId,
        holderName: 'Fixture creator',
        expiresAt: '2026-08-21T10:03:00.000Z',
      },
      acquired: true,
      canTakeover: true,
    }),
    releaseStepLock: async () => {},
    listApplications: async () => [],
    instantiateTemplate: async (templateId) => instantiateFixtureTemplate(templateId),
    readCommercialUsage: async () => commercialFixtureUsage('business', false),
    listAuditEvents: async () => fixtureAuditEvents,
    exportAuditCsv: async () => {},
    exportAnalytics: async () => {},
  };
}

function instantiateFixtureTemplate(templateId: string): CanonicalTemplateInstantiationResult {
  const template = CANONICAL_DOCUMENT_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error(`Unknown fixture template: ${templateId}`);
  const identity = template.id.replace(/-/gu, '_');
  const documentId = `doc_fixture_template_${identity}`;
  const existing = loadDocument(documentId);
  const document =
    existing ??
    instantiateCanonicalTemplate({
      templateId: template.id,
      documentId,
      workspaceId: 'wk_local_dev',
      environment: 'development',
      schemaVersion: '2.0.0',
      createBlockId: (() => {
        let sequence = 0;
        return () => {
          sequence += 1;
          return `block_fixture_template_${identity}_${sequence}`;
        };
      })(),
    });
  if (!existing) saveDocument(document);
  rememberLocalExperienceForPage(
    document.workspaceId,
    `${window.parent.location.pathname}${window.parent.location.search}`,
    document,
  );
  return {
    operationId: `op_fixture_template_${identity}`,
    templateId: template.id,
    templateVersion: template.version,
    documentId,
    title: document.title,
    type: template.type,
    targetProposals: structuredClone(template.targetProposals),
    created: !existing,
  };
}

function experimentFixtureOperations(): AuthoringOperationsServices {
  let experiment: Experiment = {
    id: 'exp_fixture_authoring',
    status: 'draft',
    varies: 'copy',
    successEventName: 'project_created',
    allocationRevision: 1,
    arms: [
      { id: 'A', label: 'Control', trafficPercent: 50, overrides: [] },
      {
        id: 'B',
        label: 'Variant',
        trafficPercent: 50,
        overrides: [{ type: 'copy', blockId: 'block_heading_1', text: 'Create a project now' }],
      },
    ],
  };
  return {
    ...replayFixtureOperations(),
    readExperiment: async () => ({
      experiment: structuredClone(experiment),
      results: {
        experimentId: experiment.id,
        environmentId: 'env_staging',
        allocationRevision: experiment.allocationRevision,
        arms: [
          { armId: 'A', exposures: 400, conversions: 40, conversionRate: 0.1 },
          { armId: 'B', exposures: 400, conversions: 120, conversionRate: 0.3 },
        ],
        leadingArmId: 'B',
        confidencePercent: 100,
      },
    }),
    createExperiment: async () => structuredClone(experiment),
    updateExperiment: async (_experimentId, request) => {
      if (request.arms) experiment = { ...experiment, arms: structuredClone(request.arms) };
      if (request.status) experiment = { ...experiment, status: request.status };
      if (request.promotedArmId) {
        experiment = {
          ...experiment,
          status: 'promoted',
          promotedArmId: request.promotedArmId,
        };
      }
      return structuredClone(experiment);
    },
  };
}

function commercialFixtureOperations(
  planId: CommercialPlanId,
  creditsExhausted: boolean,
): AuthoringOperationsServices {
  let schedules: DeploymentSchedule[] = [fixtureDeploymentSchedule()];
  return {
    ...replayFixtureOperations(),
    readCommercialUsage: async () => commercialFixtureUsage(planId, creditsExhausted),
    readDataCatalog: async () => ({
      schemaVersion: '1',
      version: 3,
      updatedAt: '2026-08-21T10:00:00.000Z',
      entries: [
        {
          id: 'catalog_fixture_plan',
          source: 'identify_trait',
          key: 'account.plan',
          environments: ['staging', 'production'],
          valueType: 'string',
          lastSeenAt: '2026-08-21T10:00:00.000Z',
        },
        {
          id: 'catalog_fixture_checkout',
          source: 'track_event',
          key: 'checkout_completed',
          environments: ['staging'],
          valueType: 'unknown',
          lastSeenAt: '2026-08-21T09:58:00.000Z',
        },
      ],
    }),
    listDeliverySchedules: async () => structuredClone(schedules),
    listDeliveryTransitionHistory: async () => [
      {
        id: 'transition_fixture_1',
        workspaceId: 'workspace_fixture',
        environmentId: 'env_production',
        documentId: 'doc_tour_linear',
        scheduleId: 'schedule_fixture_completed',
        jobId: 'job_fixture_completed',
        transition: 'start',
        outcome: 'applied',
        fromGeneration: 2,
        toGeneration: 3,
        toPublicationId: 'pub_fixture_previous',
        occurredAt: '2026-08-20T10:00:00.000Z',
      },
    ],
    createDeliverySchedule: async (request) => {
      const created: DeploymentSchedule = {
        ...fixtureDeploymentSchedule(),
        id: `schedule_fixture_${schedules.length + 1}`,
        publicationId: request.publicationId,
        startAt: request.startAt,
        ...(request.endAt ? { endAt: request.endAt } : {}),
        expectedGeneration: request.expectedGeneration,
      };
      schedules = [created, ...schedules];
      return structuredClone(created);
    },
    cancelDeliverySchedule: async (scheduleId, expectedRevision) => {
      const current = schedules.find((schedule) => schedule.id === scheduleId);
      if (!current || current.revision !== expectedRevision) throw new Error('schedule changed');
      const cancelled: DeploymentSchedule = {
        ...current,
        status: 'cancelled',
        revision: current.revision + 1,
        updatedAt: '2026-08-21T10:02:00.000Z',
      };
      schedules = schedules.map((schedule) =>
        schedule.id === cancelled.id ? cancelled : schedule,
      );
      return structuredClone(cancelled);
    },
  };
}

function fixtureDeploymentSchedule(): DeploymentSchedule {
  return {
    id: 'schedule_fixture_1',
    workspaceId: 'workspace_fixture',
    environmentId: 'env_production',
    documentId: 'doc_tour_linear',
    publicationId: 'pub_fixture_staging',
    artifactId: 'artifact_fixture_verified',
    contentHash: `sha256-${'a'.repeat(64)}`,
    startAt: '2026-08-22T08:00:00.000Z',
    endAt: '2026-08-22T12:00:00.000Z',
    expectedGeneration: 0,
    status: 'scheduled',
    revision: 1,
    createdByUserId: 'fixture_creator',
    createdAt: '2026-08-21T10:00:00.000Z',
    updatedAt: '2026-08-21T10:00:00.000Z',
  };
}

function commercialFixturePlan(value: string | null): CommercialPlanId {
  return COMMERCIAL_PLAN_IDS.find((planId) => planId === value) ?? 'business';
}

function commercialFixtureUsage(
  planId: CommercialPlanId,
  creditsExhausted: boolean,
): WorkspaceCommercialUsage {
  const limits = resolveCommercialEntitlements(planId);
  const creditsUsed = creditsExhausted ? (limits.aiCreditsPerMonth ?? 0) : 12;
  return {
    planId,
    planVersion: COMMERCIAL_PLAN_VERSION,
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
    engagedUsers: commercialUsageValue(120, limits.engagedUsersPerMonth, 'soft'),
    liveExperiences: commercialUsageValue(2, limits.liveExperiences, 'hard'),
    creatorSeats: commercialUsageValue(1, limits.creatorSeats, 'hard'),
    applications: commercialUsageValue(1, limits.applications, 'hard'),
    locales: commercialUsageValue(1, limits.locales, 'hard'),
    environments: commercialUsageValue(1, limits.environments, 'hard'),
    aiCredits: commercialUsageValue(creditsUsed, limits.aiCreditsPerMonth, 'hard'),
    themeGenerationRuns: commercialUsageValue(0, limits.themeGenerationRuns, 'hard'),
    analyticsExports: commercialUsageValue(0, limits.analyticsExportsPerMonth, 'hard'),
    assetBytes: limits.assetBytes,
    analyticsRetentionDays: limits.analyticsRetentionDays,
    versionRetentionDays: limits.versionRetentionDays,
    removeBadge: limits.removeBadge,
    features: [...limits.features],
  };
}

const fixtureAuditEvents: readonly AuthoringAuditEvent[] = [
  {
    id: 'tenevt_fixture_role_change_01',
    workspaceId: 'workspace_fixture',
    actorUserId: 'fixture_creator',
    actorName: 'Ada Stone',
    eventType: 'membership_role_changed',
    targetUserId: 'fixture_peer',
    targetName: 'Mina Chen',
    invitationId: null,
    previousRole: 'viewer',
    nextRole: 'member',
    occurredAt: '2026-08-21T10:08:00.000Z',
  },
  {
    id: 'tenevt_fixture_invitation_01',
    workspaceId: 'workspace_fixture',
    actorUserId: 'fixture_creator',
    actorName: 'Ada Stone',
    eventType: 'invitation_created',
    targetUserId: null,
    targetName: null,
    invitationId: 'invite_fixture_invitation_01',
    previousRole: null,
    nextRole: 'member',
    occurredAt: '2026-08-21T10:04:00.000Z',
  },
];

function lockFixtureOperations(): AuthoringOperationsServices {
  const base = replayFixtureOperations();
  let heldByPeer = true;
  const peerLock = {
    stepId: 'block_step_1',
    holderName: 'Mina Chen',
    expiresAt: '2026-08-21T10:03:00.000Z',
  };
  return {
    ...base,
    listSessions: async () => [],
    listStepLocks: async () => (heldByPeer ? [peerLock] : []),
    claimStepLock: async (stepId, takeover = false) => {
      if (heldByPeer && !takeover) {
        return { lock: { ...peerLock, stepId }, acquired: false, canTakeover: true };
      }
      heldByPeer = false;
      return {
        lock: {
          stepId,
          holderName: 'Fixture creator',
          expiresAt: '2026-08-21T10:06:00.000Z',
        },
        acquired: true,
        canTakeover: true,
      };
    },
    releaseStepLock: async () => {
      heldByPeer = true;
    },
  };
}

function commentFixtureOperations(): AuthoringOperationsServices {
  const base = replayFixtureOperations();
  let thread: ExperienceComment = {
    id: 'cmt_fixture_thread',
    anchor: {
      type: 'target' as const,
      stepId: 'block_step_1',
      targetId: 'target_new_project',
    },
    author: 'Mina Chen',
    body: 'Can we make the target instruction clearer on a narrow screen?',
    replies: [
      {
        id: 'cmt_fixture_reply',
        author: 'Omar Saleh',
        body: 'I checked the mobile layout. The target stays visible.',
        createdAt: '2026-08-21T10:01:00.000Z',
      },
    ],
    resolved: false,
    createdAt: '2026-08-21T10:00:00.000Z',
  };
  return {
    ...base,
    listSessions: async () => [],
    listComments: async () => [thread],
    addComment: async (anchor, body) => ({
      id: 'cmt_fixture_new',
      anchor,
      author: 'Fixture creator',
      body,
      replies: [],
      resolved: false,
      createdAt: '2026-08-21T10:02:00.000Z',
    }),
    replyToComment: async (_commentId, body) => {
      thread = {
        ...thread,
        replies: [
          ...thread.replies,
          {
            id: 'cmt_fixture_new_reply',
            author: 'Fixture creator',
            body,
            createdAt: '2026-08-21T10:02:00.000Z',
          },
        ],
      };
      return thread;
    },
    resolveComment: async (_commentId, resolved) => {
      if (resolved) {
        thread = { ...thread, resolved: true, resolvedAt: '2026-08-21T10:03:00.000Z' };
      } else {
        const { resolvedAt: _resolvedAt, ...openThread } = thread;
        thread = { ...openThread, resolved: false };
      }
      return thread;
    },
  };
}

function collaborationFixtureOperations(reconnecting: boolean): AuthoringOperationsServices {
  const base = commentFixtureOperations();
  const snapshot = async (): Promise<AuthoringCollaborationSnapshot> => ({
    selfParticipantId: `presence_${'a'.repeat(24)}`,
    generatedAt: new Date().toISOString(),
    documentUpdatedAt: '2026-08-21T10:00:01.000Z',
    draftChanged: true,
    peers: [
      {
        participantId: `presence_${'b'.repeat(24)}`,
        creatorId: 'fixture_creator',
        name: 'Fixture creator',
        stepId: 'block_step_2',
        selection: { type: 'block', blockId: 'block_heading_2' },
        lastSeenAt: new Date().toISOString(),
        sameCreator: true,
      },
      {
        participantId: `presence_${'c'.repeat(24)}`,
        creatorId: 'fixture_peer',
        name: 'Mina Chen',
        stepId: 'block_step_3',
        selection: { type: 'target', targetId: 'target_sort_recent' },
        lastSeenAt: new Date().toISOString(),
        sameCreator: false,
      },
    ],
    locks: [
      {
        stepId: 'block_step_3',
        holderName: 'Mina Chen',
        holderParticipantId: `presence_${'c'.repeat(24)}`,
        expiresAt: '2026-08-21T23:59:59.000Z',
      },
    ],
    comments: [...(await base.listComments())],
  });
  return {
    ...base,
    heartbeatCollaboration: reconnecting
      ? () => new Promise<AuthoringCollaborationSnapshot>(() => undefined)
      : snapshot,
    leaveCollaboration: async () => {},
    subscribeCollaboration: (onSnapshot, onState) => {
      if (reconnecting) {
        onState?.('reconnecting');
      } else {
        queueMicrotask(() => void snapshot().then(onSnapshot));
      }
      return () => {};
    },
  };
}
