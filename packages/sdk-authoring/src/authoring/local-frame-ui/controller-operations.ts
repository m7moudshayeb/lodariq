import type {
  AdaptivePolicy,
  ApplicationSummary,
  Experiment,
  ExperimentArm,
  ExperimentResults,
} from '@lodariq/schema';
import { authoringText } from '../../i18n';
import { setBlockTeaches } from '../document-ops';
import { ControllerBridgeFeature } from './controller-bridge';
import type {
  DemoCaptureSnapshot,
  DemoLinkSnapshot,
  ExperienceAnalyticsSnapshot,
  PresencePeer,
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
  /** WIRE_RUNTIME: published delivery does not report demonstrated behaviours yet. */
  demonstratedBehaviours?: readonly string[];
  adaptivePolicy?: AdaptivePolicy;
  experiment?: Experiment;
  experimentResults?: ExperimentResults;
  experienceAnalytics?: ExperienceAnalyticsSnapshot;
  presence?: { readonly peers: readonly PresencePeer[] };
  comments?: readonly StepComment[];
  demoCapture?: DemoCaptureSnapshot;
  demoLink?: DemoLinkSnapshot;
  /** Set when the boundary is absent, so surfaces explain themselves rather than look broken. */
  operationsUnavailable?: boolean;
}

export abstract class ControllerOperationsFeature extends ControllerBridgeFeature {
  /** Everything Tier 3 reads. Filled by the control plane; empty until it answers. */
  protected operationsState: OperationsState = {};

  private operationsLoaded = false;

  /** Merged into the snapshot the surfaces read. */
  protected operationsSnapshot(): OperationsState {
    return this.operationsState;
  }

  /** Applied when the control plane answers. */
  applyOperationsState(next: Partial<OperationsState>): void {
    this.operationsState = { ...this.operationsState, ...next };
    this.emit();
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
      const [measurement, experiment, comments, locks, applications] = await Promise.all([
        operations.readMeasurement(),
        operations.readExperiment(),
        operations.listComments(),
        operations.listStepLocks(),
        operations.listApplications(),
      ]);
      const analytics = environmentId ? await operations.readAnalytics(environmentId) : undefined;
      this.applyOperationsState({
        adaptivePolicy: measurement.adaptivePolicy,
        ...(experiment.experiment ? { experiment: experiment.experiment } : {}),
        ...(experiment.results ? { experimentResults: experiment.results } : {}),
        comments: comments.map((comment) => ({
          id: comment.id,
          stepId: comment.stepId,
          author: comment.author,
          body: comment.body,
          resolved: comment.resolved,
        })),
        presence: {
          peers: locks.map((lock) => ({
            id: lock.holderUserId,
            name: lock.holderName,
            stepId: lock.stepId,
            holdsLock: true,
          })),
        },
        applications,
        ...(analytics ? { experienceAnalytics: toAnalyticsSnapshot(analytics) } : {}),
      });
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

  createExperiment(): void {
    const operations = this.services.operations;
    if (!operations) return;
    const arms: ExperimentArm[] = [
      { id: 'A', label: authoringText('Control'), trafficPercent: 50 },
      { id: 'B', label: authoringText('Variant'), trafficPercent: 50 },
    ];
    void this.runOperations(async () => {
      const experiment = await operations.createExperiment({
        varies: 'copy',
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
    });
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
      const next = await operations.updateExperiment(experiment.id, { promotedArmId: leading });
      this.applyOperationsState({ experiment: next });
      this.setStatus(
        authoringText('Arm {id} promoted. The other arm is archived with its results.', {
          id: leading,
        }),
      );
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

  exportAnalyticsCsv(): void {
    const operations = this.services.operations;
    const environmentId = this.operationsState.experienceAnalytics?.environmentId;
    if (!operations?.exportAnalyticsCsv || !environmentId) return;
    void this.runOperations(() => operations.exportAnalyticsCsv!(environmentId));
  }

  applyStarterTemplate(templateId: string, targetNames: readonly string[]): void {
    // WIRE_IFRAME: templates need semantic target discovery and picker fallback
    // from the host before they can build a document through the mutation path.
    this.setStatus(
      authoringText('Starter “{template}” needs {count} targets picked on the page.', {
        template: templateId,
        count: targetNames.length,
      }),
    );
  }

  addComment(stepId: string, body: string): void {
    const operations = this.services.operations;
    if (!operations) return;
    void this.runOperations(async () => {
      const comment = await operations.addComment(stepId, body);
      this.applyOperationsState({
        comments: [
          ...(this.operationsState.comments ?? []),
          {
            id: comment.id,
            stepId: comment.stepId,
            author: comment.author,
            body: comment.body,
            resolved: comment.resolved,
          },
        ],
      });
    });
  }

  resolveComment(commentId: string, resolved: boolean): void {
    const operations = this.services.operations;
    if (!operations) return;
    this.applyOperationsState({
      comments: (this.operationsState.comments ?? []).map((comment) =>
        comment.id === commentId ? { ...comment, resolved } : comment,
      ),
    });
    void this.runOperations(async () => {
      await operations.resolveComment(commentId, resolved);
    });
  }

  requestStepLock(stepId: string): void {
    const operations = this.services.operations;
    if (!operations) return;
    void this.runOperations(async () => {
      const lock = await operations.claimStepLock(stepId);
      const locks = await operations.listStepLocks();
      this.applyOperationsState({
        presence: {
          peers: locks.map((entry) => ({
            id: entry.holderUserId,
            name: entry.holderName,
            stepId: entry.stepId,
            holdsLock: true,
          })),
        },
      });
      this.setStatus(
        authoringText('{holder} has this step until {expires}.', {
          holder: lock.holderName,
          expires: lock.expiresAt,
        }),
      );
    });
  }

  captureDemoSurface(): void {
    // WIRE_IFRAME: host-page capture does not have a bridge operation yet.
    this.setStatus(authoringText('Walk the flow once to capture it.'));
  }

  openDemoRedaction(): void {
    // WIRE_IFRAME: the frame has no captured host surface to redact yet.
    this.setStatus(authoringText('Review what will be published before sharing it.'));
  }

  setDemoLinkEnabled(enabled: boolean): void {
    // WIRE_BE: public demo link issuance and persistence are not in Operations yet.
    const capture = this.operationsState.demoCapture;
    if (enabled && (!capture || capture.unreviewedRegions > 0)) {
      this.setStatus(authoringText('Review what will be published before sharing it.'));
      return;
    }
    this.applyOperationsState({
      ...(this.operationsState.demoLink
        ? { demoLink: { ...this.operationsState.demoLink, enabled } }
        : {}),
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

function toAnalyticsSnapshot(analytics: {
  environmentId: string;
  shown: number;
  completed: number;
  dismissed: number;
  funnel: ReadonlyArray<{ stepId: string; reached: number }>;
  adoption: ReadonlyArray<{
    eventName: string;
    windowDays: number;
    baselineRate: number;
    treatedRate: number;
    baselineCount: number;
    treatedCount: number;
    confidencePercent: number | null;
  }>;
  formResponses: ReadonlyArray<{
    blockId: string;
    label: string;
    answerCount: number;
    topAnswer: string | null;
  }>;
}): ExperienceAnalyticsSnapshot {
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
  };
}
