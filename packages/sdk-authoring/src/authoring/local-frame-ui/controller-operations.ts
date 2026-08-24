import type {
  AdaptivePolicy,
  AdaptiveBehaviorEvidence,
  ChangeAwareCopySuggestion,
  CanonicalTemplateInstantiationResult,
  AuthoringDocumentVersionSummary,
  SemanticVersionDiff,
  AuthoringCollaborationSnapshot,
  AuthoringPresenceHeartbeatBody,
  AnalyticsExportKind,
  AnalyticsExportRelease,
  AudienceRule,
  ApplicationSummary,
  Experiment,
  ExperimentArm,
  ExperimentOverride,
  ExperimentResults,
  ExperienceSession,
  ExperienceAnalytics,
  ExperienceCommentAnchor,
  ExperienceStepLock,
  AuthoringAuditEvent,
  CommercialFeatureId,
  DeliveryTransitionHistoryEntry,
  DeploymentSchedule,
  DemoAnalyticsSummary,
  DemoArtifactReview,
  DemoLink,
  TriggerDefinition,
  WorkspaceDataCatalog,
  WorkspaceCommercialUsage,
  LocaleLayoutQaReport,
  LodariqBlock,
  LodariqDocument,
  RecordToAuthorProposal,
  RecordedSemanticAction,
  TargetIdentityV2,
  VoiceAuthoringProposal,
} from '@lodariq/schema';
import type { AccessibilitySweepResult } from '@lodariq/schema/accessibility-governance';
import {
  AUTHORING_COLLABORATION_STATE_TYPE,
  AUTHORING_PRESENCE_HEARTBEAT_SECONDS,
  BRIDGE_PROTOCOL_VERSION,
  EXPERIENCE_STEP_LOCK_HEARTBEAT_SECONDS,
  sanitizeStepNarration,
  applyCopySuggestion as applyCopySuggestionToDocument,
} from '@lodariq/schema';
import { authoringText } from '../../i18n';
import { attachTargetToBlocks, setBlockTeaches, updateBlockProps } from '../document-ops';
import { findContainingTourStepId } from '../preview-step-state';
import { createRecordToAuthorProposal } from '../record-to-author';
import { ControllerBridgeFeature } from './controller-bridge';
import { findBlockById } from './utils';
import type {
  DemoLinkSnapshot,
  ExperienceAnalyticsSnapshot,
  PresencePeer,
  RecordToAuthorSnapshot,
  StepComment,
} from './types';

/**
 * Tier 3 operations that act on the document as a whole rather than a selection.
 *
 * Document edits go through the same coordinated mutation path as any other
 * edit, so an operations change is as undoable as a typo fix. Everything else
 * lives outside the document — a success event or a running experiment must not
 * force a new content hash — and is fetched through the operations service.
 */
export interface OperationsState {
  applications?: readonly ApplicationSummary[];
  /** WIRE_BE: workspace event catalogue is not part of the operations contract yet. */
  knownEventNames?: readonly string[];
  /** Ephemeral creator simulation; production evidence remains server-derived. */
  adaptiveEvidence?: readonly AdaptiveBehaviorEvidence[];
  adaptivePolicy?: AdaptivePolicy;
  experiment?: Experiment;
  experimentResults?: ExperimentResults;
  experienceAnalytics?: ExperienceAnalyticsSnapshot;
  experienceSessions?: readonly ExperienceSession[];
  accessibilitySweepAvailable?: boolean;
  accessibilitySweep?: {
    readonly state: 'running' | 'complete' | 'error';
    readonly result?: AccessibilitySweepResult;
  };
  presence?: {
    readonly peers: readonly PresencePeer[];
    readonly connection?: 'connected' | 'reconnecting';
    readonly draftChanged?: boolean;
  };
  comments?: readonly StepComment[];
  auditEvents?: readonly AuthoringAuditEvent[];
  auditExportAvailable?: boolean;
  commercialUsage?: WorkspaceCommercialUsage;
  dataCatalog?: WorkspaceDataCatalog;
  templateInstantiation?: CanonicalTemplateInstantiationResult;
  documentVersions?: readonly AuthoringDocumentVersionSummary[];
  semanticVersionDiff?: SemanticVersionDiff;
  copySuggestions?: readonly ChangeAwareCopySuggestion[];
  deploymentSchedules?: readonly DeploymentSchedule[];
  deliveryTransitionHistory?: readonly DeliveryTransitionHistoryEntry[];
  demoArtifactReview?: DemoArtifactReview;
  demoLink?: DemoLinkSnapshot;
  demoAnalytics?: DemoAnalyticsSummary;
  recordToAuthor?: RecordToAuthorSnapshot;
  localeLayoutQaAvailable?: boolean;
  localeLayoutQa?: {
    readonly state: 'running' | 'complete' | 'error';
    readonly report?: LocaleLayoutQaReport;
  };
  /** Set when the boundary is absent, so surfaces explain themselves rather than look broken. */
  operationsUnavailable?: boolean;
}

export abstract class ControllerOperationsFeature extends ControllerBridgeFeature {
  /** Everything Tier 3 reads. Filled by the control plane; empty until it answers. */
  protected operationsState: OperationsState = {};

  private operationsLoaded = false;

  private commercialUsageLoaded = false;

  private heldStepLockId: string | null = null;

  private stepLockTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  private stepLockRequestVersion = 0;

  private recordedSemanticActions: RecordedSemanticAction[] = [];

  private recordLastActionAtMs = 0;

  private localeLayoutQaRequestVersion = 0;

  private accessibilitySweepRequestVersion = 0;

  private collaborationActive = false;

  private collaborationStopped = false;

  private collaborationHeartbeatTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  private collaborationHeartbeatInFlight = false;

  private collaborationHeartbeatPending = false;

  private stopCollaborationStream: (() => void) | null = null;

  private collaborationPresenceState: AuthoringPresenceHeartbeatBody = {
    stepId: null,
    selection: null,
  };

  /** Merged into the snapshot the surfaces read. */
  protected operationsSnapshot(): OperationsState {
    return {
      ...this.operationsState,
      localeLayoutQaAvailable: Boolean(this.services.runLocaleLayoutQa),
      accessibilitySweepAvailable: Boolean(this.services.operations?.runAccessibilitySweep),
    };
  }

  /** Applied when the control plane answers. */
  applyOperationsState(next: Partial<OperationsState>): void {
    this.operationsState = { ...this.operationsState, ...next };
    this.emit();
  }

  runLocaleLayoutQa(): void {
    const run = this.services.runLocaleLayoutQa;
    if (!run) {
      this.setStatus(
        authoringText('Live language layout checking is unavailable in this session.'),
      );
      return;
    }
    const expectedDocumentRevision = this.documentTransactions.currentRevision;
    const requestVersion = ++this.localeLayoutQaRequestVersion;
    this.applyOperationsState({ localeLayoutQa: { state: 'running' } });
    this.setStatus(authoringText('Checking every language in the live product layout…'));
    void run(expectedDocumentRevision)
      .then((report) => {
        if (
          requestVersion !== this.localeLayoutQaRequestVersion ||
          this.documentTransactions.currentRevision !== expectedDocumentRevision ||
          report.documentRevision !== expectedDocumentRevision
        ) {
          return;
        }
        this.applyOperationsState({ localeLayoutQa: { state: 'complete', report } });
        this.setStatus(
          report.failedCount || report.unavailableCount
            ? authoringText('Live language layouts found {count} presentations to review.', {
                count: report.failedCount + report.unavailableCount,
              })
            : authoringText('Every live language layout fits on this page.'),
        );
        this.recordMetric('locale-layout-qa.completed', {
          count: report.checkedPresentationCount,
        });
      })
      .catch(() => {
        if (requestVersion !== this.localeLayoutQaRequestVersion) return;
        this.applyOperationsState({ localeLayoutQa: { state: 'error' } });
        this.setStatus(authoringText('Live language layouts could not be checked on this page.'));
        this.recordMetric('locale-layout-qa.failed');
      });
  }

  protected invalidateLocaleLayoutQa(): void {
    this.localeLayoutQaRequestVersion += 1;
    if (!this.operationsState.localeLayoutQa) return;
    const { localeLayoutQa: _localeLayoutQa, ...remaining } = this.operationsState;
    this.operationsState = remaining;
  }

  runAccessibilitySweep(): void {
    const run = this.services.operations?.runAccessibilitySweep;
    if (!run) {
      this.setStatus(authoringText('Workspace accessibility checking is unavailable.'));
      return;
    }
    const requestVersion = ++this.accessibilitySweepRequestVersion;
    this.applyOperationsState({ accessibilitySweep: { state: 'running' } });
    this.setStatus(authoringText('Checking accessibility across the workspace…'));
    const operationId = `a11ysweepop_${globalThis.crypto.randomUUID().replace(/-/gu, '')}`;
    void run(operationId)
      .then((result) => {
        if (requestVersion !== this.accessibilitySweepRequestVersion) return;
        this.applyOperationsState({ accessibilitySweep: { state: 'complete', result } });
        this.setStatus(
          result.sweep.blockerCount > 0
            ? authoringText('Accessibility sweep found {count} blockers.', {
                count: result.sweep.blockerCount,
              })
            : authoringText('Accessibility sweep found no blockers.'),
        );
        this.recordMetric('readiness.finding', { count: result.sweep.blockerCount });
      })
      .catch(() => {
        if (requestVersion !== this.accessibilitySweepRequestVersion) return;
        this.applyOperationsState({ accessibilitySweep: { state: 'error' } });
        this.setStatus(authoringText('Workspace accessibility checking failed.'));
      });
  }

  startRecordToAuthor(): void {
    this.recordedSemanticActions = [];
    this.recordLastActionAtMs = Date.now();
    this.applyOperationsState({
      recordToAuthor: {
        recording: true,
        actionCount: 0,
        segmentCount: 0,
        proposal: null,
      },
    });
    this.setStatus(authoringText('Recording semantic flow evidence.'));
  }

  stopRecordToAuthor(): void {
    if (!this.operationsState.recordToAuthor?.recording) return;
    const proposal = createRecordToAuthorProposal(this.recordedSemanticActions);
    this.applyOperationsState({
      recordToAuthor: {
        recording: false,
        actionCount: this.recordedSemanticActions.length,
        segmentCount: proposal?.segments.length ?? 0,
        proposal,
      },
    });
    this.setStatus(
      proposal
        ? authoringText('Recorded flow is ready for review.')
        : authoringText('No semantic evidence was recorded.'),
    );
  }

  clearRecordToAuthor(): void {
    this.recordedSemanticActions = [];
    this.applyOperationsState({
      recordToAuthor: { recording: false, actionCount: 0, segmentCount: 0, proposal: null },
    });
  }

  applyRecordToAuthorProposal(proposal: RecordToAuthorProposal): void {
    if (!proposal.reviewRequired || !proposal.evidenceBound || !proposal.segments.length) {
      this.setStatus(authoringText('Review the recorded flow before adding it.'));
      return;
    }
    for (const segment of proposal.segments) {
      const stepId = this.appendStep(segment.proposedTitle);
      if (!stepId) continue;
      const richContent = this.stepContentBlocks(this.documentState.blocks, stepId).map((block) =>
        block.type === 'paragraph' ? { ...block, content: segment.proposedCopy } : block,
      );
      this.replaceStepRichContent(stepId, richContent);
      if (segment.targetId) {
        this.attachProposalTarget(stepId, segment.targetId, segment.targetLabel);
        const target = this.targetById(segment.targetId);
        if (segment.approach && target && !target.approach) {
          this.setTargetApproach(segment.targetId, segment.approach);
        }
      }
    }
    this.applyOperationsState({
      recordToAuthor: {
        recording: false,
        actionCount: proposal.actions.length,
        segmentCount: proposal.segments.length,
        proposal: null,
      },
    });
    this.setStatus(
      authoringText(
        'Reviewed recorded flow and its available semantic targets added to the draft.',
      ),
    );
    this.recordMetric('record-to-author.applied', { count: proposal.segments.length });
  }

  protected override recordSemanticTarget(identity: TargetIdentityV2): void {
    if (!this.operationsState.recordToAuthor?.recording) return;
    this.recordSemanticAction({
      kind: 'target-observed',
      targetId: identity.targetId,
      accessibleName: identity.display.authorLabel.slice(0, 500),
      role: (identity.semantics.role ?? identity.semantics.tagName ?? 'element').slice(0, 100),
    });
  }

  protected override recordSemanticLifecycle(
    routePatternId: string | undefined,
    stateId: string | undefined,
  ): void {
    if (!this.operationsState.recordToAuthor?.recording) return;
    this.recordSemanticAction({
      kind: 'wait-for-lifecycle',
      semanticName: (stateId ?? routePatternId ?? 'page lifecycle update').slice(0, 240),
      boundedMs: Math.min(30_000, Math.max(0, Date.now() - this.recordLastActionAtMs)),
      ...(stateId ? { lifecycleKind: 'state' as const } : {}),
      ...(!stateId && routePatternId ? { lifecycleKind: 'route' as const } : {}),
    });
  }

  private recordSemanticAction(action: RecordedSemanticAction): void {
    if (this.recordedSemanticActions.length >= 1_000) return;
    this.recordedSemanticActions.push(action);
    this.recordLastActionAtMs = Date.now();
    const current = this.operationsState.recordToAuthor;
    this.applyOperationsState({
      recordToAuthor: {
        recording: true,
        actionCount: this.recordedSemanticActions.length,
        segmentCount: 0,
        proposal: current?.proposal ?? null,
      },
    });
  }

  /**
   * Loaded the first time a section that needs it is opened, not when Operations
   * opens: most visits are for the flow map, and five requests for a screen the
   * creator did not ask for is not free. Once loaded it is shared, so switching
   * between the measurement sections never feels like navigation.
   */
  loadOperationsData(environmentId?: string): void {
    const operations = this.services.operations;
    if (!operations) {
      this.applyOperationsState({ operationsUnavailable: true });
      return;
    }
    if (this.operationsLoaded) return;
    this.operationsLoaded = true;
    void this.runOperations(async () => {
      const [
        measurement,
        experiment,
        comments,
        locks,
        applications,
        sessions,
        auditEvents,
        dataCatalog,
        deploymentSchedules,
        deliveryTransitionHistory,
        demoLinks,
        demoAnalytics,
        documentVersions,
        copySuggestions,
      ] = await Promise.all([
        operations.readMeasurement(),
        operations.readExperiment(),
        operations.listComments(),
        operations.listStepLocks(),
        operations.listApplications(),
        operations.listSessions?.() ?? Promise.resolve([]),
        operations.listAuditEvents?.() ?? Promise.resolve([]),
        operations.readDataCatalog?.() ?? Promise.resolve(undefined),
        operations.listDeliverySchedules?.() ?? Promise.resolve([]),
        operations.listDeliveryTransitionHistory?.() ?? Promise.resolve([]),
        operations.readDemoLinks?.() ?? Promise.resolve([]),
        operations.readDemoAnalytics?.() ?? Promise.resolve(undefined),
        operations.listDocumentVersions?.() ?? Promise.resolve([]),
        operations.listCopySuggestions?.() ?? Promise.resolve([]),
      ]);
      const analytics = await operations.readAnalytics(environmentId ?? 'session');
      this.applyOperationsState({
        adaptivePolicy: measurement.adaptivePolicy,
        ...(experiment.experiment ? { experiment: experiment.experiment } : {}),
        ...(experiment.results ? { experimentResults: experiment.results } : {}),
        comments,
        ...(this.operationsState.presence
          ? {}
          : { presence: { peers: peersFromStepLocks(locks, this.heldStepLockId) } }),
        applications,
        experienceSessions: sessions,
        auditEvents,
        auditExportAvailable: Boolean(operations.exportAuditCsv),
        ...(dataCatalog ? { dataCatalog } : {}),
        knownEventNames:
          dataCatalog?.entries
            .filter((entry) => entry.source === 'track_event')
            .map((entry) => entry.key) ?? [],
        deploymentSchedules,
        deliveryTransitionHistory,
        ...(demoLinks[0] ? { demoLink: toDemoLinkSnapshot(demoLinks[0]) } : {}),
        ...(demoAnalytics ? { demoAnalytics } : {}),
        documentVersions,
        copySuggestions,
        experienceAnalytics: toAnalyticsSnapshot(analytics),
      });
    });
  }

  compareDocumentVersions(beforeVersionId: string, afterVersionId: string): void {
    const compare = this.services.operations?.compareDocumentVersions;
    if (!compare || beforeVersionId === afterVersionId) return;
    void this.runOperations(async () => {
      const semanticVersionDiff = await compare(beforeVersionId, afterVersionId);
      this.applyOperationsState({ semanticVersionDiff });
      this.setStatus(
        semanticVersionDiff.requiresReview
          ? authoringText('{count} semantic version changes are ready for review.', {
              count: semanticVersionDiff.entries.length,
            })
          : authoringText('Those persisted versions are semantically identical.'),
      );
    });
  }

  generateCopySuggestions(beforeVersionId: string, afterVersionId: string): void {
    const create = this.services.operations?.createCopySuggestions;
    if (!create || beforeVersionId === afterVersionId) return;
    void this.runOperations(async () => {
      const copySuggestions = await create(beforeVersionId, afterVersionId);
      this.applyOperationsState({ copySuggestions });
      this.setStatus(
        copySuggestions.length
          ? authoringText('{count} persisted copy suggestions are ready for review.', {
              count: copySuggestions.length,
            })
          : authoringText('Those versions contain no bounded copy changes.'),
      );
    });
  }

  loadCommercialUsage(): void {
    const read = this.services.operations?.readCommercialUsage;
    if (!read || this.commercialUsageLoaded) return;
    this.commercialUsageLoaded = true;
    void read()
      .then((commercialUsage) => {
        this.applyOperationsState({ commercialUsage });
        this.syncStepLockForSelection(this.selectedBlockId);
        this.startCollaborationTransport();
      })
      .catch(() => {
        this.commercialUsageLoaded = false;
      });
  }

  protected refreshCommercialUsage(): void {
    this.commercialUsageLoaded = false;
    this.loadCommercialUsage();
  }

  exportAuditCsv(): void {
    const exportAuditCsv = this.services.operations?.exportAuditCsv;
    if (!exportAuditCsv) return;
    void this.runOperations(async () => {
      await exportAuditCsv();
      this.setStatus(authoringText('Audit log exported.'));
    });
  }

  setStepTeaches(blockId: string, eventName: string | undefined): void {
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `teaches:${blockId}`,
      operations: [eventName ? { op: 'setTeaches', eventName } : { op: 'setTeaches' }],
      reduce: (document) => ({
        ...document,
        blocks: setBlockTeaches(document.blocks, blockId, eventName),
      }),
      status: eventName
        ? authoringText('Step now teaches “{event}”', { event: eventName })
        : authoringText('Step teaches nothing measurable'),
    });
  }

  setDeliveryTrigger(trigger: TriggerDefinition): void {
    this.commitCoordinatedMutation({
      blockId: this.documentState.id,
      coalescingKey: 'delivery-trigger',
      operations: [
        {
          op: 'replaceDocument',
          document: { ...structuredClone(this.documentState), trigger },
        },
      ],
      reduce: (document) => ({ ...document, trigger: structuredClone(trigger) }),
      scope: 'behavior',
      status: authoringText('Start condition updated.'),
    });
  }

  addAudienceRule(rule: AudienceRule): void {
    this.commitCoordinatedMutation({
      blockId: this.documentState.id,
      coalescingKey: 'audience-rules',
      operations: [
        {
          op: 'replaceDocument',
          document: {
            ...structuredClone(this.documentState),
            audience: {
              ...structuredClone(this.documentState.audience),
              rules: [...(this.documentState.audience.rules ?? []), rule],
            },
          },
        },
      ],
      reduce: (document) => ({
        ...document,
        audience: {
          ...document.audience,
          rules: [...(document.audience.rules ?? []), structuredClone(rule)],
        },
      }),
      scope: 'behavior',
      status: authoringText('Audience rule added.'),
    });
  }

  removeAudienceRule(index: number): void {
    this.commitCoordinatedMutation({
      blockId: this.documentState.id,
      coalescingKey: 'audience-rules',
      operations: [
        {
          op: 'replaceDocument',
          document: {
            ...structuredClone(this.documentState),
            audience: {
              ...structuredClone(this.documentState.audience),
              rules: (this.documentState.audience.rules ?? []).filter(
                (_rule, ruleIndex) => ruleIndex !== index,
              ),
            },
          },
        },
      ],
      reduce: (document) => ({
        ...document,
        audience: {
          ...document.audience,
          rules: (document.audience.rules ?? []).filter((_rule, ruleIndex) => ruleIndex !== index),
        },
      }),
      scope: 'behavior',
      status: authoringText('Audience rule removed.'),
    });
  }

  createDeliverySchedule(startAt: string, endAt?: string): void {
    const createSchedule = this.services.operations?.createDeliverySchedule;
    const staging = this.releaseWorkflow?.staging;
    const production = this.releaseWorkflow?.production;
    const productionEnvironment = this.releaseWorkflow?.environments?.find(
      (environment) => environment.environment === 'production',
    );
    if (!createSchedule || !staging?.publicationId || !productionEnvironment) {
      this.setStatus(authoringText('Publish and verify staging before scheduling production.'));
      return;
    }
    void this.runOperations(async () => {
      const schedule = await createSchedule({
        environmentId: productionEnvironment.environmentId,
        publicationId: staging.publicationId!,
        startAt,
        ...(endAt ? { endAt } : {}),
        expectedGeneration: production?.generation ?? 0,
        idempotencyKey: `schedule_${globalThis.crypto.randomUUID().replace(/-/gu, '')}`,
      });
      this.applyOperationsState({
        deploymentSchedules: [schedule, ...(this.operationsState.deploymentSchedules ?? [])],
      });
      this.setStatus(authoringText('Production release scheduled.'));
    });
  }

  cancelDeliverySchedule(scheduleId: string, expectedRevision: number): void {
    const cancelSchedule = this.services.operations?.cancelDeliverySchedule;
    if (!cancelSchedule) return;
    void this.runOperations(async () => {
      const schedule = await cancelSchedule(scheduleId, expectedRevision);
      this.applyOperationsState({
        deploymentSchedules: (this.operationsState.deploymentSchedules ?? []).map((candidate) =>
          candidate.id === schedule.id ? schedule : candidate,
        ),
      });
      this.setStatus(authoringText('Scheduled release cancelled.'));
    });
  }

  setAdaptiveEnabled(enabled: boolean): void {
    const policy: AdaptivePolicy = {
      enabled,
      minimumOccurrences: this.operationsState.adaptivePolicy?.minimumOccurrences ?? 2,
      lookbackDays: this.operationsState.adaptivePolicy?.lookbackDays ?? 30,
    };
    // Optimistic: the toggle is instant, and the service reconciles it.
    this.applyOperationsState({ adaptivePolicy: policy });
    this.setStatus(
      enabled
        ? authoringText('Adaptive on. Steps a visitor has already demonstrated are skipped.')
        : authoringText('Adaptive off. Everyone sees every step.'),
    );
    const operations = this.services.operations;
    if (!operations) return;
    void this.runOperations(async () => {
      const saved = await operations.updateMeasurement({ adaptivePolicy: policy });
      this.applyOperationsState({ adaptivePolicy: saved.adaptivePolicy });
    });
  }

  setAdaptiveBehaviourDemonstrated(eventName: string, demonstrated: boolean): void {
    const evidence = (this.operationsState.adaptiveEvidence ?? []).filter(
      (entry) => entry.eventName !== eventName,
    );
    if (demonstrated) {
      evidence.push({
        eventName,
        occurrences: this.operationsState.adaptivePolicy?.minimumOccurrences ?? 2,
        lastObservedAt: new Date().toISOString(),
      });
    }
    this.applyOperationsState({ adaptiveEvidence: evidence });
    this.setStatus(
      demonstrated
        ? authoringText('Preview visitor now demonstrates {eventName}.', { eventName })
        : authoringText('Preview evidence cleared for {eventName}.', { eventName }),
    );
  }

  previewAdaptiveTour(): void {
    const policy = this.operationsState.adaptivePolicy ?? {
      enabled: false,
      minimumOccurrences: 2,
      lookbackDays: 30,
    };
    this.previewFlowSimulation({
      adaptive: {
        policy,
        evaluatedAt: new Date().toISOString(),
        evidence: [...(this.operationsState.adaptiveEvidence ?? [])],
      },
    });
  }

  createExperiment(varies: Experiment['varies'] = 'copy'): void {
    const operations = this.services.operations;
    if (!operations) return;
    const initialOverride = createInitialExperimentOverride(
      this.documentState,
      this.selectedBlockId,
      varies,
      this.operationsState.knownEventNames?.[0] ?? 'experience_completed',
    );
    if (!initialOverride) {
      this.setStatus(authoringText('Select compatible content before creating this experiment.'));
      return;
    }
    const arms: ExperimentArm[] = [
      { id: 'A', label: authoringText('Control'), trafficPercent: 50, overrides: [] },
      {
        id: 'B',
        label: authoringText('Variant'),
        trafficPercent: 50,
        overrides: [initialOverride],
      },
    ];
    void this.runOperations(async () => {
      const experiment = await operations.createExperiment({
        varies,
        successEventName: this.operationsState.knownEventNames?.[0] ?? 'experience_completed',
        arms,
      });
      this.applyOperationsState({ experiment });
      this.setStatus(authoringText('Experiment created as a draft.'));
    });
  }

  setExperimentStatus(status: Experiment['status']): void {
    const experiment = this.operationsState.experiment;
    const operations = this.services.operations;
    if (!experiment || !operations) return;
    void this.runOperations(async () => {
      const next = await operations.updateExperiment(experiment.id, { status });
      this.applyOperationsState({ experiment: next });
      this.setStatus(
        status === 'running'
          ? authoringText('Experiment started. Release the draft to deliver it.')
          : authoringText('Experiment stopped.'),
      );
    });
  }

  setExperimentArmLabel(armId: ExperimentArm['id'], label: string): void {
    if (!label) return;
    this.updateDraftExperimentArms((arm) => (arm.id === armId ? { ...arm, label } : arm));
  }

  setExperimentArmOverride(armId: ExperimentArm['id'], override: ExperimentOverride): void {
    this.updateDraftExperimentArms((arm) =>
      arm.id === armId ? { ...arm, overrides: [structuredClone(override)] } : arm,
    );
  }

  /** Traffic always sums to 100: moving one arm moves the other. */
  setExperimentArmTraffic(armId: ExperimentArm['id'], trafficPercent: number): void {
    const experiment = this.operationsState.experiment;
    const operations = this.services.operations;
    if (!experiment || experiment.arms.length !== 2 || !operations) return;
    const arms = experiment.arms.map((arm) => ({
      ...arm,
      trafficPercent: arm.id === armId ? trafficPercent : 100 - trafficPercent,
    }));
    this.applyOperationsState({ experiment: { ...experiment, arms } });
    void this.runOperations(async () => {
      const next = await operations.updateExperiment(experiment.id, { arms });
      this.applyOperationsState({ experiment: next });
    });
  }

  promoteExperimentWinner(): void {
    const experiment = this.operationsState.experiment;
    const leading = this.operationsState.experimentResults?.leadingArmId;
    const operations = this.services.operations;
    if (!experiment || !leading || !operations) return;
    void this.runOperations(async () => {
      const winner = experiment.arms.find((arm) => arm.id === leading);
      if (!winner) return;
      const overrides = winner.overrides ?? [];
      if (overrides.length > 0) {
        const nextDocument = applyExperimentOverridesToDocument(this.documentState, overrides);
        this.commitCoordinatedMutation({
          blockId: this.documentState.id,
          coalescingKey: `experiment-winner:${experiment.id}`,
          operations: [{ op: 'replaceDocument', document: structuredClone(nextDocument) }],
          reduce: (document) => applyExperimentOverridesToDocument(document, overrides),
          scope: 'behavior',
          status: authoringText('Winning arm applied to the draft.'),
        });
      }
      const next = await operations.updateExperiment(experiment.id, { promotedArmId: leading });
      this.applyOperationsState({ experiment: next });
      this.setStatus(
        authoringText('Arm {id} applied. Review and release the draft when ready.', {
          id: leading,
        }),
      );
    });
  }

  private updateDraftExperimentArms(update: (arm: ExperimentArm) => ExperimentArm): void {
    const experiment = this.operationsState.experiment;
    const operations = this.services.operations;
    if (!experiment || experiment.status !== 'draft' || !operations) return;
    const arms = experiment.arms.map(update);
    this.applyOperationsState({ experiment: { ...experiment, arms } });
    void this.runOperations(async () => {
      const next = await operations.updateExperiment(experiment.id, { arms });
      this.applyOperationsState({ experiment: next });
    });
  }

  declareSuccessEvent(eventName: string): void {
    const operations = this.services.operations;
    if (!eventName || !operations) return;
    void this.runOperations(async () => {
      await operations.updateMeasurement({ successEvent: { eventName, windowDays: 30 } });
      this.setStatus(
        authoringText('“{event}” declared. Impact appears once both cohorts clear the floor.', {
          event: eventName,
        }),
      );
      const environmentId = this.operationsState.experienceAnalytics?.environmentId;
      if (environmentId) {
        this.applyOperationsState({
          experienceAnalytics: toAnalyticsSnapshot(await operations.readAnalytics(environmentId)),
        });
      }
    });
  }

  exportAnalytics(kind: AnalyticsExportKind, release?: AnalyticsExportRelease): void {
    const operations = this.services.operations;
    const feature = kind === 'summary-csv' ? 'analytics-csv' : 'raw-event-export';
    const usage = this.operationsState.commercialUsage;
    const quotaReached = Boolean(
      usage &&
      usage.analyticsExports.limit !== null &&
      usage.analyticsExports.used >= usage.analyticsExports.limit,
    );
    if (!operations?.exportAnalytics || !this.supportsCommercialFeature(feature) || quotaReached) {
      return;
    }
    void this.runOperations(async () => {
      await operations.exportAnalytics!(kind, release);
      this.setStatus(authoringText('Analytics export downloaded.'));
    });
  }

  applyStarterTemplate(templateId: string): void {
    const instantiateTemplate = this.services.operations?.instantiateTemplate;
    if (!instantiateTemplate) {
      this.setStatus(authoringText('Template creation is unavailable in this authoring session.'));
      return;
    }
    void this.runOperations(async () => {
      this.setStatus(authoringText('Creating a separate template draft…'));
      const result = await instantiateTemplate(templateId);
      this.applyOperationsState({ templateInstantiation: result });
      this.setStatus(
        authoringText(
          result.created
            ? '“{title}” was created as a separate draft. Review its target proposals before publishing.'
            : '“{title}” already exists for this request. No duplicate was created.',
          { title: result.title },
        ),
      );
      this.recordMetric('template.instantiated', { count: result.targetProposals.length });
    });
  }

  applyVoiceAuthoringProposal(proposal: VoiceAuthoringProposal): void {
    if (!proposal.reviewRequired) {
      this.setStatus(authoringText('Review the voice proposal before adding it.'));
      return;
    }
    const title = proposal.proposedStep.title.trim();
    const body = proposal.proposedStep.body.trim();
    const narrationScript = proposal.narrationScript.trim();
    if (!title || !body || !narrationScript || !proposal.transcript.trim()) {
      this.setStatus(
        authoringText('A reviewed voice proposal needs a title, copy, and transcript.'),
      );
      return;
    }

    const stepId = this.appendStep(title);
    if (!stepId) return;
    const richContent = this.stepContentBlocks(this.documentState.blocks, stepId).map((block) =>
      block.type === 'paragraph' ? { ...block, content: body } : block,
    );
    this.replaceStepRichContent(stepId, richContent);
    this.applyProposalNarration(stepId, narrationScript, proposal.locale);
    const targetAttached = proposal.proposedTarget
      ? this.attachProposalTarget(
          stepId,
          proposal.proposedTarget.targetId,
          proposal.proposedTarget.accessibilityName,
        )
      : false;
    this.setStatus(
      targetAttached
        ? authoringText('Reviewed voice step, narration, and target added to the draft.')
        : authoringText('Reviewed voice step and narration added to the draft.'),
    );
    this.recordMetric('voice-proposal.applied', { stepId });
  }

  private attachProposalTarget(stepId: string, targetId: string, proposedLabel?: string): boolean {
    const target = this.targetById(targetId);
    if (!target) return false;
    const label =
      target.identity?.display.authorLabel ??
      target.fingerprint.accessibleName ??
      proposedLabel?.trim() ??
      targetId;
    this.recordChange();
    this.documentState = this.normalizeDocument({
      ...this.documentState,
      blocks: attachTargetToBlocks(this.documentState.blocks, stepId, targetId, label),
    });
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(stepId, [
      {
        op: 'attachTarget',
        targetId,
        fingerprint: structuredClone(target.fingerprint),
        ...(target.identity ? { identity: structuredClone(target.identity) } : {}),
        ...(target.selection ? { selection: structuredClone(target.selection) } : {}),
      },
    ]);
    return true;
  }

  private applyProposalNarration(stepId: string, script: string, locale: string): boolean {
    const step = findBlockById(this.documentState.blocks, stepId);
    const narration = sanitizeStepNarration({ script, localeOverride: locale });
    if (!step || !narration) return false;
    this.recordChange();
    this.documentState = this.normalizeDocument({
      ...this.documentState,
      blocks: updateBlockProps(this.documentState.blocks, stepId, {
        ...step.props,
        narration,
      }),
    });
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(stepId, [
      { op: 'replaceDocument', document: structuredClone(this.documentState) },
    ]);
    return true;
  }

  applyCopySuggestion(suggestion: ChangeAwareCopySuggestion): void {
    let nextDocument: LodariqDocument;
    try {
      nextDocument = applyCopySuggestionToDocument(this.documentState, suggestion);
    } catch {
      this.setStatus(authoringText('This copy suggestion no longer matches the draft.'));
      return;
    }
    const decide = this.services.operations?.decideCopySuggestion;
    if (!decide) {
      this.setStatus(authoringText('Copy suggestion review is unavailable in this session.'));
      return;
    }
    void this.runOperations(async () => {
      const reviewed = await decide(suggestion.id, 'applied');
      this.commitCoordinatedMutation({
        blockId: suggestion.blockId,
        coalescingKey: `copy-suggestion:${suggestion.id}`,
        operations: [{ op: 'replaceDocument', document: structuredClone(nextDocument) }],
        reduce: () => structuredClone(nextDocument),
        scope: 'content',
        status: authoringText('Copy suggestion applied and its review decision recorded.'),
      });
      this.replaceCopySuggestion(reviewed);
      this.recordMetric('copy-suggestion.applied', { blockId: suggestion.blockId });
    });
  }

  dismissCopySuggestion(suggestionId: string): void {
    const decide = this.services.operations?.decideCopySuggestion;
    if (!decide) return;
    void this.runOperations(async () => {
      this.replaceCopySuggestion(await decide(suggestionId, 'dismissed'));
      this.setStatus(authoringText('Copy suggestion dismissed and recorded.'));
    });
  }

  private replaceCopySuggestion(suggestion: ChangeAwareCopySuggestion): void {
    this.applyOperationsState({
      copySuggestions: (this.operationsState.copySuggestions ?? []).map((candidate) =>
        candidate.id === suggestion.id ? suggestion : candidate,
      ),
    });
  }

  addComment(anchor: ExperienceCommentAnchor, body: string): void {
    const operations = this.services.operations;
    if (!operations || !this.supportsCommercialFeature('comments')) return;
    void this.runOperations(async () => {
      const comment = await operations.addComment(anchor, body);
      this.applyOperationsState({
        comments: [...(this.operationsState.comments ?? []), comment],
      });
    });
  }

  replyToComment(commentId: string, body: string): void {
    const operations = this.services.operations;
    if (!operations || !this.supportsCommercialFeature('comments')) return;
    void this.runOperations(async () => {
      const comment = await operations.replyToComment(commentId, body);
      this.replaceComment(comment);
    });
  }

  resolveComment(commentId: string, resolved: boolean): void {
    const operations = this.services.operations;
    if (!operations || !this.supportsCommercialFeature('comments')) return;
    this.applyOperationsState({
      comments: (this.operationsState.comments ?? []).map((comment) =>
        comment.id === commentId ? { ...comment, resolved } : comment,
      ),
    });
    void this.runOperations(async () => {
      this.replaceComment(await operations.resolveComment(commentId, resolved));
    });
  }

  private replaceComment(comment: StepComment): void {
    this.applyOperationsState({
      comments: (this.operationsState.comments ?? []).map((candidate) =>
        candidate.id === comment.id ? comment : candidate,
      ),
    });
  }

  protected override syncStepLockForSelection(blockId: string | null): void {
    if (this.services.operations?.readCommercialUsage && !this.operationsState.commercialUsage) {
      this.loadCommercialUsage();
      return;
    }
    if (!this.supportsCommercialFeature('step-locks')) {
      this.releaseStepLockLease();
      return;
    }
    const stepId = blockId
      ? findContainingTourStepId(this.documentState.blocks, blockId)
      : undefined;
    if (stepId === this.heldStepLockId) return;
    this.releaseStepLockLease();
    if (stepId) this.claimStepLock(stepId, false, false);
  }

  protected override startCollaborationTransport(): void {
    const operations = this.services.operations;
    if (
      !operations?.heartbeatCollaboration ||
      this.collaborationActive ||
      this.collaborationStopped
    ) {
      return;
    }
    if (operations.readCommercialUsage && !this.operationsState.commercialUsage) {
      this.loadCommercialUsage();
      return;
    }
    if (!this.supportsCommercialFeature('presence')) return;
    this.collaborationActive = true;
    this.stopCollaborationStream =
      operations.subscribeCollaboration?.(
        (snapshot) => this.applyCollaborationSnapshot(snapshot),
        (connection) => this.applyCollaborationConnection(connection),
      ) ?? null;
    this.syncCollaborationPresence();
    this.scheduleCollaborationHeartbeat(0);
  }

  protected override stopCollaborationTransport(): void {
    this.collaborationStopped = true;
    this.collaborationActive = false;
    if (this.collaborationHeartbeatTimer) {
      globalThis.clearTimeout(this.collaborationHeartbeatTimer);
    }
    this.collaborationHeartbeatTimer = null;
    this.collaborationHeartbeatPending = false;
    this.stopCollaborationStream?.();
    this.stopCollaborationStream = null;
    void this.services.operations?.leaveCollaboration?.().catch(() => {});
  }

  protected override syncCollaborationPresence(): void {
    if (!this.collaborationActive) return;
    const blockId = this.selectedBlockId;
    const stepId = blockId
      ? (findContainingTourStepId(this.documentState.blocks, blockId) ?? null)
      : null;
    const next: AuthoringPresenceHeartbeatBody = {
      stepId,
      selection: blockId ? { type: 'block', blockId } : null,
    };
    if (JSON.stringify(next) === JSON.stringify(this.collaborationPresenceState)) return;
    this.collaborationPresenceState = next;
    this.scheduleCollaborationHeartbeat(150);
  }

  private scheduleCollaborationHeartbeat(delayMs: number): void {
    if (!this.collaborationActive) return;
    if (this.collaborationHeartbeatTimer) {
      globalThis.clearTimeout(this.collaborationHeartbeatTimer);
    }
    this.collaborationHeartbeatTimer = globalThis.setTimeout(() => {
      this.collaborationHeartbeatTimer = null;
      void this.sendCollaborationHeartbeat();
    }, delayMs);
  }

  private async sendCollaborationHeartbeat(): Promise<void> {
    const heartbeat = this.services.operations?.heartbeatCollaboration;
    if (!heartbeat || !this.collaborationActive) return;
    if (this.collaborationHeartbeatInFlight) {
      this.collaborationHeartbeatPending = true;
      return;
    }
    this.collaborationHeartbeatInFlight = true;
    try {
      const snapshot = await heartbeat(this.collaborationPresenceState);
      if (!this.collaborationActive) return;
      this.applyCollaborationSnapshot(snapshot);
      this.applyCollaborationConnection('connected');
    } catch {
      if (this.collaborationActive) this.applyCollaborationConnection('reconnecting');
    } finally {
      this.collaborationHeartbeatInFlight = false;
      if (!this.collaborationActive) {
        void this.services.operations?.leaveCollaboration?.().catch(() => {});
      } else {
        const pending = this.collaborationHeartbeatPending;
        this.collaborationHeartbeatPending = false;
        const intervalMs = AUTHORING_PRESENCE_HEARTBEAT_SECONDS * 1_000;
        const jitter = Math.floor(Math.random() * (intervalMs / 5 + 1)) - intervalMs / 10;
        this.scheduleCollaborationHeartbeat(pending ? 0 : intervalMs + jitter);
      }
    }
  }

  private applyCollaborationConnection(connection: 'connected' | 'reconnecting'): void {
    const current = this.operationsState.presence;
    if (current?.connection === connection) return;
    this.applyOperationsState({
      presence: {
        peers: current?.peers ?? [],
        connection,
        ...(current?.draftChanged ? { draftChanged: true } : {}),
      },
    });
  }

  private applyCollaborationSnapshot(snapshot: AuthoringCollaborationSnapshot): void {
    const existing = this.operationsState.presence?.peers ?? [];
    const peers = peersFromCollaborationSnapshot(snapshot, existing);
    this.applyOperationsState({
      comments: snapshot.comments,
      presence: {
        peers,
        connection: 'connected',
        draftChanged: snapshot.draftChanged,
      },
    });
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: `presence_${snapshot.generatedAt}`,
      type: AUTHORING_COLLABORATION_STATE_TYPE,
      selfParticipantId: snapshot.selfParticipantId,
      peers: snapshot.peers,
      locks: snapshot.locks,
      draftChanged: snapshot.draftChanged,
    });
  }

  protected override releaseStepLockLease(): void {
    this.stepLockRequestVersion += 1;
    if (this.stepLockTimer) globalThis.clearTimeout(this.stepLockTimer);
    this.stepLockTimer = null;
    const stepId = this.heldStepLockId;
    this.heldStepLockId = null;
    if (stepId && this.services.operations?.releaseStepLock) {
      void this.services.operations.releaseStepLock(stepId).catch(() => {});
    }
  }

  requestStepLock(stepId: string): void {
    if (!this.supportsCommercialFeature('step-locks')) return;
    this.claimStepLock(stepId, false, true);
  }

  takeOverStepLock(stepId: string): void {
    if (!this.supportsCommercialFeature('step-locks')) return;
    this.claimStepLock(stepId, true, true);
  }

  protected supportsCommercialFeature(feature: CommercialFeatureId): boolean {
    const usage = this.operationsState.commercialUsage;
    return !usage || usage.features.includes(feature);
  }

  private claimStepLock(stepId: string, takeover: boolean, activateOnSuccess: boolean): void {
    const operations = this.services.operations;
    if (!operations) return;
    const requestVersion = ++this.stepLockRequestVersion;
    void this.runOperations(async () => {
      const result = await operations.claimStepLock(stepId, takeover);
      if (requestVersion !== this.stepLockRequestVersion) {
        if (result.acquired) void operations.releaseStepLock?.(stepId);
        return;
      }
      if (result.acquired) {
        this.heldStepLockId = stepId;
        this.scheduleStepLockHeartbeat(stepId, requestVersion);
        if (activateOnSuccess) this.activateTourStep(stepId);
      } else {
        this.heldStepLockId = null;
      }
      await this.refreshStepLocks(
        result.acquired ? undefined : { ...result.lock, canTakeover: result.canTakeover },
      );
      this.setStatus(
        result.acquired
          ? authoringText('This step is locked to your editing session.')
          : authoringText('{holder} has this step until {expires}.', {
              holder: result.lock.holderName,
              expires: result.lock.expiresAt,
            }),
      );
    });
  }

  private scheduleStepLockHeartbeat(stepId: string, requestVersion: number): void {
    if (this.stepLockTimer) globalThis.clearTimeout(this.stepLockTimer);
    this.stepLockTimer = globalThis.setTimeout(() => {
      if (this.heldStepLockId !== stepId || requestVersion !== this.stepLockRequestVersion) return;
      this.claimStepLock(stepId, false, false);
    }, EXPERIENCE_STEP_LOCK_HEARTBEAT_SECONDS * 1_000);
  }

  private async refreshStepLocks(contested?: {
    stepId: string;
    holderName: string;
    canTakeover: boolean;
  }): Promise<void> {
    const operations = this.services.operations;
    if (!operations) return;
    const locks = await operations.listStepLocks();
    const retainedPeers = (this.operationsState.presence?.peers ?? []).filter(
      (peer) =>
        !peer.holdsLock ||
        !locks.some((lock) => lock.stepId === peer.stepId && lock.holderName === peer.name),
    );
    this.applyOperationsState({
      presence: {
        peers: [...retainedPeers, ...peersFromStepLocks(locks, this.heldStepLockId, contested)],
        ...(this.operationsState.presence?.connection
          ? { connection: this.operationsState.presence.connection }
          : {}),
        ...(this.operationsState.presence?.draftChanged ? { draftChanged: true } : {}),
      },
    });
  }

  reviewDemoArtifact(): void {
    const review = this.services.operations?.reviewDemoArtifact;
    const staging = this.releaseWorkflow?.staging;
    if (!review || !staging?.publicationId || !staging.contentHash) {
      this.setStatus(authoringText('Publish to staging before reviewing a demo artifact.'));
      return;
    }
    void this.runOperations(async () => {
      const demoArtifactReview = await review({
        publicationId: staging.publicationId!,
        contentHash: staging.contentHash,
      });
      this.applyOperationsState({ demoArtifactReview });
      this.setStatus(
        authoringText(
          'The structured artifact passed review. Product targets, lifecycle actions, links, and customer audience rules were removed.',
        ),
      );
    });
  }

  setDemoLinkEnabled(enabled: boolean): void {
    const operations = this.services.operations;
    if (!operations) return;
    const current = this.operationsState.demoLink;
    if (!enabled) {
      if (!current?.id || !operations.revokeDemoLink) return;
      void this.runOperations(async () => {
        const revoked = await operations.revokeDemoLink!(current.id!);
        this.applyOperationsState({ demoLink: toDemoLinkSnapshot(revoked) });
        this.setStatus(authoringText('Demo link revoked.'));
      });
      return;
    }
    const staging = this.releaseWorkflow?.staging;
    if (!operations.createDemoLink || !staging?.publicationId || !staging.contentHash) {
      this.setStatus(authoringText('Publish to staging before creating a shareable demo link.'));
      return;
    }
    const review = this.operationsState.demoArtifactReview;
    if (
      !review?.approved ||
      review.publicationId !== staging.publicationId ||
      review.sourceContentHash !== staging.contentHash
    ) {
      this.setStatus(authoringText('Review the current staging artifact before sharing it.'));
      return;
    }
    void this.runOperations(async () => {
      const created = await operations.createDemoLink!({
        schemaVersion: '1',
        operationId: `demoop_${globalThis.crypto.randomUUID().replace(/-/gu, '')}`,
        publicationId: staging.publicationId!,
        contentHash: staging.contentHash,
        expiresInSeconds: 86_400,
        reviewHash: review.reviewHash,
      });
      this.applyOperationsState({ demoLink: toDemoLinkSnapshot(created) });
      this.setStatus(authoringText('Shareable demo link created.'));
    });
  }

  /** One place where an operations failure becomes a status line instead of a crash. */
  private async runOperations(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.setStatus(
        authoringText('Operations is unavailable right now: {reason}', {
          reason: error instanceof Error ? error.message : authoringText('unknown error'),
        }),
      );
    }
  }
}

function peersFromStepLocks(
  locks: readonly ExperienceStepLock[],
  heldStepLockId: string | null,
  contested?: {
    stepId: string;
    holderName: string;
    canTakeover: boolean;
  },
): PresencePeer[] {
  return locks
    .filter((lock) => lock.stepId !== heldStepLockId)
    .map((lock) => ({
      // One lock per step, so the step identifies the holder without naming them.
      id: `lock:${lock.stepId}`,
      name: lock.holderName,
      stepId: lock.stepId,
      holdsLock: true,
      ...(contested?.stepId === lock.stepId && contested.canTakeover ? { canTakeover: true } : {}),
    }));
}

function peersFromCollaborationSnapshot(
  snapshot: AuthoringCollaborationSnapshot,
  existing: readonly PresencePeer[],
): PresencePeer[] {
  const takeoverByStep = new Map(
    existing
      .filter((peer) => peer.canTakeover && peer.stepId)
      .map((peer) => [peer.stepId!, true] as const),
  );
  const peers: PresencePeer[] = snapshot.peers.map((peer) => {
    const lock = snapshot.locks.find(
      (candidate) => candidate.holderParticipantId === peer.participantId,
    );
    const stepId = peer.stepId ?? lock?.stepId ?? null;
    return {
      id: peer.participantId,
      name: peer.name,
      stepId,
      selection: peer.selection,
      sameCreator: peer.sameCreator,
      holdsLock: Boolean(lock),
      ...(stepId && takeoverByStep.has(stepId) ? { canTakeover: true } : {}),
    };
  });
  const knownParticipants = new Set(snapshot.peers.map((peer) => peer.participantId));
  for (const lock of snapshot.locks) {
    if (
      lock.holderParticipantId === snapshot.selfParticipantId ||
      (lock.holderParticipantId && knownParticipants.has(lock.holderParticipantId))
    ) {
      continue;
    }
    peers.push({
      // One lock per step, so the step is the key when the holder has no
      // live presence session to be addressed by.
      id: lock.holderParticipantId ?? `lock:${lock.stepId}`,
      name: lock.holderName,
      stepId: lock.stepId,
      holdsLock: true,
      ...(takeoverByStep.has(lock.stepId) ? { canTakeover: true } : {}),
    });
  }
  return peers;
}

function createInitialExperimentOverride(
  document: LodariqDocument,
  selectedBlockId: string | null,
  varies: Experiment['varies'],
  eventName: string,
): ExperimentOverride | null {
  const blocks = flattenBlocks(document.blocks);
  const selected = selectedBlockId ? findBlockById(document.blocks, selectedBlockId) : null;
  if (varies === 'copy') {
    const block =
      selected?.content !== undefined
        ? selected
        : blocks.find((candidate) => candidate.content !== undefined);
    return block ? { type: 'copy', blockId: block.id, text: block.content ?? '' } : null;
  }
  if (varies === 'media') {
    const block =
      selected?.type === 'media'
        ? selected
        : blocks.find((candidate) => candidate.type === 'media' && candidate.props.media);
    if (!block?.props.media) return null;
    return {
      type: 'media',
      blockId: block.id,
      media: {
        ...structuredClone(block.props.media),
        fit: block.props.media.fit === 'cover' ? 'contain' : 'cover',
      },
    };
  }

  const stepId = selectedBlockId
    ? findContainingTourStepId(document.blocks, selectedBlockId)
    : document.blocks.find((block) => block.type === 'tourStep')?.id;
  if (!stepId) return null;
  const step = findBlockById(document.blocks, stepId);
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  if (varies === 'placement') {
    const placement = tooltip?.props.placement;
    return {
      type: 'placement',
      stepId,
      placement: placement === 'top' ? 'bottom' : 'top',
    };
  }
  if (varies === 'style') {
    return {
      type: 'style',
      stepId,
      tooltipStyle: {
        ...structuredClone(tooltip?.props.tooltipStyle ?? {}),
        elevation: tooltip?.props.tooltipStyle?.elevation === 'floating' ? 'resting' : 'floating',
      },
    };
  }
  return {
    type: 'condition',
    blockId: selected?.id ?? stepId,
    showWhen: selected?.props.showWhen ?? { source: 'namedEvent', eventName },
  };
}

function flattenBlocks(blocks: readonly LodariqBlock[]): LodariqBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}

function applyExperimentOverridesToDocument(
  document: LodariqDocument,
  overrides: readonly ExperimentOverride[],
): LodariqDocument {
  return overrides.reduce(
    (current, override) => ({
      ...current,
      blocks: applyExperimentOverrideToBlocks(current.blocks, override),
    }),
    structuredClone(document),
  );
}

function applyExperimentOverrideToBlocks(
  blocks: readonly LodariqBlock[],
  override: ExperimentOverride,
): LodariqBlock[] {
  return blocks.map((block) => {
    let next: LodariqBlock = {
      ...block,
      children: applyExperimentOverrideToBlocks(block.children, override),
    };
    if (
      (override.type === 'placement' || override.type === 'style') &&
      override.stepId === block.id
    ) {
      next = {
        ...next,
        children: next.children.map((child) => applyExperimentStepOverride(child, override)),
      };
    } else if ('blockId' in override && override.blockId === block.id) {
      if (override.type === 'copy') {
        next = { ...next, content: override.text, contentRuns: undefined };
      } else if (override.type === 'condition') {
        next = { ...next, props: { ...next.props, showWhen: structuredClone(override.showWhen) } };
      } else if (override.type === 'media') {
        next = { ...next, props: { ...next.props, media: structuredClone(override.media) } };
      }
    }
    return next;
  });
}

function applyExperimentStepOverride(
  block: LodariqBlock,
  override: Extract<ExperimentOverride, { type: 'placement' | 'style' }>,
): LodariqBlock {
  if (block.type !== 'tooltip') return block;
  if (override.type === 'placement') {
    return { ...block, props: { ...block.props, placement: override.placement } };
  }
  return {
    ...block,
    props: { ...block.props, tooltipStyle: structuredClone(override.tooltipStyle) },
  };
}

function toAnalyticsSnapshot(analytics: ExperienceAnalytics): ExperienceAnalyticsSnapshot {
  return {
    environmentId: analytics.environmentId,
    shown: analytics.shown,
    completed: analytics.completed,
    dismissed: analytics.dismissed,
    funnel: analytics.funnel.map((entry) => ({ stepId: entry.stepId, reached: entry.reached })),
    adoption: analytics.adoption.map((impact) => ({ ...impact })),
    formResponses: analytics.formResponses.map((response) => ({
      ...response,
      topAnswer: response.topAnswer ?? undefined,
    })),
    ...(analytics.breakdown ? { breakdown: structuredClone(analytics.breakdown) } : {}),
  };
}

function toDemoLinkSnapshot(link: DemoLink): DemoLinkSnapshot {
  return {
    id: link.id,
    enabled: link.status === 'active',
    url: link.url,
    status: link.status,
    expiresAt: link.expiresAt,
  };
}
