/**
 * WIRE_BE: the authenticated session supplies the real Operations boundary.
 *
 * Local development supplied none at all, so thirty methods were absent and
 * every Operations tab that reads one — Analytics, Audit, Check, Collaboration,
 * Share a demo, A/B, Copy fixes, Schedules, Audience — drew its empty state. A
 * control that is only ever disabled cannot be designed against, which is the
 * same reason `mock-assist.ts` exists.
 *
 * Everything here is derived from the document in front of the creator and from
 * a fixed seed, never from `Math.random`: a screenshot taken twice looks the
 * same twice. Nothing is persisted beyond the tab.
 */
import type {
  ApplicationSummary,
  AuthoringAuditEvent,
  AuthoringDocumentVersionSummary,
  ChangeAwareCopySuggestion,
  CreateExperimentBody,
  ExperienceAnalytics,
  ExperienceComment,
  ExperienceCommentAnchor,
  ExperienceFunnelStep,
  ExperienceMeasurementConfig,
  ExperienceSession,
  ExperienceStepLock,
  ExperienceStepLockClaimResponse,
  Experiment,
  ExperimentResults,
  LodariqBlock,
  LodariqDocument,
  UpdateExperienceMeasurementBody,
  UpdateExperimentBody,
} from '@lodariq/schema';
import type { AccessibilitySweepResult } from '@lodariq/schema/accessibility-governance';
import { ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION } from '@lodariq/schema/accessibility-governance';
import type { AuthoringOperationsServices } from '../authoring/operations/operations-services';

/** Fixed so two runs of the same document produce the same numbers. */
const SEED_EPOCH_MS = Date.UTC(2026, 0, 6, 9, 0, 0);
const LOCAL_AUTHOR = 'You (local)';
const LOCAL_COLLEAGUE = 'Sam Rivera';
const LOCAL_USER_ID = 'usr_local_dev';

export interface LocalOperationsOptions {
  /** Read at call time, so every answer follows the document being edited. */
  readonly document: () => LodariqDocument;
}

export function createLocalDevOperations(
  options: LocalOperationsOptions,
): AuthoringOperationsServices {
  const state = new LocalOperationsState(options.document);
  return {
    readMeasurement: async () => state.measurement(),
    updateMeasurement: async (request) => state.updateMeasurement(request),
    readAnalytics: async (environmentId) => state.analytics(environmentId),
    listSessions: async () => state.sessions(),
    readExperiment: async () => state.experiment(),
    createExperiment: async (request) => state.createExperiment(request),
    updateExperiment: async (experimentId, request) =>
      state.updateExperiment(experimentId, request),
    listComments: async () => state.comments(),
    addComment: async (anchor, body) => state.addComment(anchor, body),
    replyToComment: async (commentId, body) => state.replyToComment(commentId, body),
    resolveComment: async (commentId, resolved) => state.resolveComment(commentId, resolved),
    listStepLocks: async () => state.locks(),
    claimStepLock: async (stepId, takeover) => state.claimLock(stepId, takeover),
    releaseStepLock: async (stepId) => state.releaseLock(stepId),
    listApplications: async () => state.applications(),
    listAuditEvents: async () => state.auditEvents(),
    listDocumentVersions: async () => state.versions(),
    listCopySuggestions: async () => state.copySuggestions(),
    decideCopySuggestion: async (suggestionId, decision) =>
      state.decideCopySuggestion(suggestionId, decision),
    runAccessibilitySweep: async (operationId) => state.accessibilitySweep(operationId),
  };
}

class LocalOperationsState {
  private measurementConfig: ExperienceMeasurementConfig | null = null;
  private currentExperiment: Experiment | null = null;
  private commentList: ExperienceComment[] = [];
  private lockList: ExperienceStepLock[] = [];
  private suggestions: ChangeAwareCopySuggestion[] | null = null;
  private counter = 0;

  constructor(private readonly readDocument: () => LodariqDocument) {}

  private get document(): LodariqDocument {
    return this.readDocument();
  }

  private get steps(): readonly LodariqBlock[] {
    return this.document.blocks.filter((block) => block.type === 'tourStep');
  }

  /** Stable within a session and unique across it, without Math.random. */
  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_local${String(this.counter).padStart(20, '0')}`;
  }

  private at(offsetMinutes: number): string {
    return new Date(SEED_EPOCH_MS + offsetMinutes * 60_000).toISOString();
  }

  measurement(): ExperienceMeasurementConfig {
    this.measurementConfig ??= {
      documentId: this.document.id,
      adaptivePolicy: { enabled: false, minimumOccurrences: 3, lookbackDays: 30 },
    };
    return structuredClone(this.measurementConfig);
  }

  updateMeasurement(request: UpdateExperienceMeasurementBody): ExperienceMeasurementConfig {
    const current = this.measurement();
    const successEvent =
      request.successEvent === null
        ? undefined
        : request.successEvent
          ? {
              eventName: request.successEvent.eventName,
              windowDays: request.successEvent.windowDays,
              ...(request.successEvent.label ? { label: request.successEvent.label } : {}),
            }
          : current.successEvent;
    this.measurementConfig = {
      documentId: current.documentId,
      ...(successEvent ? { successEvent } : {}),
      adaptivePolicy: request.adaptivePolicy ?? current.adaptivePolicy,
    };
    return structuredClone(this.measurementConfig);
  }

  /**
   * A funnel that falls the way a real one does — every step loses a slice — so
   * the drop-off column has something to point at.
   */
  analytics(environmentId: string): ExperienceAnalytics {
    const steps = this.steps;
    const shown = 100 + steps.length * 40;
    let reached = shown;
    const funnel: ExperienceFunnelStep[] = steps.map((step, index) => {
      const entering = reached;
      reached = Math.max(1, Math.round(entering * (index === 1 ? 0.72 : 0.88)));
      return { stepId: step.id, reached: entering, completed: reached };
    });
    const completed = funnel.length ? (funnel[funnel.length - 1]?.completed ?? 0) : 0;
    return {
      documentId: this.document.id,
      environmentId,
      shown,
      completed,
      dismissed: Math.max(0, shown - completed - 12),
      funnel,
      adoption: [],
      formResponses: [],
    };
  }

  sessions(): readonly ExperienceSession[] {
    const steps = this.steps;
    if (steps.length === 0) return [];
    const outcomes = ['completed', 'dismissed', 'abandoned'] as const;
    return outcomes.map((outcome, index) => {
      const stepsReached = outcome === 'completed' ? steps.length : Math.max(1, index);
      const durationMs = 24_000 + index * 11_000;
      return {
        correlationId: `corr_local_${index + 1}`,
        startedAt: this.at(index * 17),
        endedAt: this.at(index * 17 + durationMs / 60_000),
        durationMs,
        outcome,
        stepsReached,
        unresolvedStepIds: steps.slice(stepsReached).map((step) => step.id),
        beats: steps.slice(0, stepsReached).map((step, beat) => ({
          name: 'step_shown',
          at: this.at(index * 17 + beat),
          offsetMs: beat * 4_000,
          stepId: step.id,
          resolved: true,
        })),
      };
    });
  }

  experiment(): { experiment: Experiment | null; results: ExperimentResults | null } {
    if (!this.currentExperiment) return { experiment: null, results: null };
    return {
      experiment: structuredClone(this.currentExperiment),
      results: this.resultsFor(this.currentExperiment),
    };
  }

  createExperiment(request: CreateExperimentBody): Experiment {
    this.currentExperiment = {
      id: this.nextId('exp'),
      status: 'draft',
      varies: request.varies,
      successEventName: request.successEventName,
      arms: structuredClone(request.arms),
      allocationRevision: 1,
    };
    return structuredClone(this.currentExperiment);
  }

  updateExperiment(experimentId: string, request: UpdateExperimentBody): Experiment {
    const current = this.currentExperiment;
    if (!current || current.id !== experimentId) throw new Error('No such experiment');
    const armsChanged = Boolean(request.arms);
    this.currentExperiment = {
      ...current,
      ...(request.status ? { status: request.status } : {}),
      ...(request.arms ? { arms: structuredClone(request.arms) } : {}),
      ...(request.promotedArmId ? { promotedArmId: request.promotedArmId } : {}),
      allocationRevision: current.allocationRevision + (armsChanged ? 1 : 0),
    };
    return structuredClone(this.currentExperiment);
  }

  /** B wins by a nose, which is the case the significance copy is written for. */
  private resultsFor(experiment: Experiment): ExperimentResults {
    const arms = experiment.arms.map((arm, index) => {
      const exposures = 480 + index * 24;
      const conversions = Math.round(exposures * (0.18 + index * 0.035));
      return {
        armId: arm.id,
        exposures,
        conversions,
        conversionRate: Number((conversions / exposures).toFixed(4)),
      };
    });
    const leading = arms.reduce((best, arm) =>
      arm.conversionRate > best.conversionRate ? arm : best,
    );
    return {
      experimentId: experiment.id,
      allocationRevision: experiment.allocationRevision,
      arms,
      leadingArmId: leading.armId,
      confidencePercent: 91,
    };
  }

  comments(): readonly ExperienceComment[] {
    const first = this.steps[0];
    if (!this.commentList.length && first) {
      this.commentList = [
        {
          id: this.nextId('cmt'),
          anchor: { type: 'step', stepId: first.id },
          author: LOCAL_COLLEAGUE,
          body: 'Can we say what happens after they click, rather than what to click?',
          replies: [],
          resolved: false,
          createdAt: this.at(-90),
        },
      ];
    }
    return structuredClone(this.commentList);
  }

  addComment(anchor: ExperienceCommentAnchor, body: string): ExperienceComment {
    this.comments();
    const comment: ExperienceComment = {
      id: this.nextId('cmt'),
      anchor: structuredClone(anchor),
      author: LOCAL_AUTHOR,
      body,
      replies: [],
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    this.commentList = [...this.commentList, comment];
    return structuredClone(comment);
  }

  replyToComment(commentId: string, body: string): ExperienceComment {
    const updated = this.mapComment(commentId, (comment) => ({
      ...comment,
      replies: [
        ...comment.replies,
        {
          id: this.nextId('rep'),
          author: LOCAL_AUTHOR,
          body,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    return updated;
  }

  resolveComment(commentId: string, resolved: boolean): ExperienceComment {
    return this.mapComment(commentId, (comment) => ({
      ...comment,
      resolved,
      ...(resolved ? { resolvedAt: new Date().toISOString() } : {}),
    }));
  }

  private mapComment(
    commentId: string,
    change: (comment: ExperienceComment) => ExperienceComment,
  ): ExperienceComment {
    this.comments();
    const index = this.commentList.findIndex((comment) => comment.id === commentId);
    const existing = this.commentList[index];
    if (index < 0 || !existing) throw new Error('No such comment');
    const next = change(existing);
    this.commentList = this.commentList.map((comment, at) => (at === index ? next : comment));
    return structuredClone(next);
  }

  /**
   * The second step starts held by someone else. Takeover is the only path here
   * that has any behaviour worth reviewing, and it is unreachable when every
   * lock is already yours.
   */
  locks(): readonly ExperienceStepLock[] {
    const second = this.steps[1];
    if (!this.lockList.length && second) {
      this.lockList = [
        { stepId: second.id, holderName: LOCAL_COLLEAGUE, expiresAt: this.at(24 * 60) },
      ];
    }
    return structuredClone(this.lockList);
  }

  claimLock(stepId: string, takeover?: boolean): ExperienceStepLockClaimResponse {
    this.locks();
    const held = this.lockList.find((lock) => lock.stepId === stepId);
    if (held && held.holderName !== LOCAL_AUTHOR && !takeover) {
      return { lock: structuredClone(held), acquired: false, canTakeover: true };
    }
    const lock: ExperienceStepLock = {
      stepId,
      holderName: LOCAL_AUTHOR,
      expiresAt: new Date(Date.now() + 180_000).toISOString(),
    };
    this.lockList = [...this.lockList.filter((entry) => entry.stepId !== stepId), lock];
    return { lock: structuredClone(lock), acquired: true, canTakeover: false };
  }

  releaseLock(stepId: string): void {
    this.lockList = this.lockList.filter(
      (lock) => lock.stepId !== stepId || lock.holderName !== LOCAL_AUTHOR,
    );
  }

  applications(): readonly ApplicationSummary[] {
    return [
      {
        id: 'app_local_product',
        name: 'Local product',
        originPatterns: ['http://localhost:5175'],
        isPrimary: true,
      },
      {
        id: 'app_local_admin',
        name: 'Local admin console',
        originPatterns: ['http://localhost:5176'],
        isPrimary: false,
      },
    ];
  }

  auditEvents(): readonly AuthoringAuditEvent[] {
    const workspaceId = this.document.workspaceId;
    return [
      {
        id: 'tenevt_local0000000000000001',
        workspaceId,
        actorUserId: LOCAL_USER_ID,
        actorName: LOCAL_AUTHOR,
        eventType: 'membership_role_changed',
        targetUserId: 'usr_local_colleague',
        targetName: LOCAL_COLLEAGUE,
        invitationId: null,
        previousRole: 'viewer',
        nextRole: 'member',
        occurredAt: this.at(-720),
      },
      {
        id: 'tenevt_local0000000000000002',
        workspaceId,
        actorUserId: LOCAL_USER_ID,
        actorName: LOCAL_AUTHOR,
        eventType: 'invitation_created',
        targetUserId: null,
        targetName: null,
        invitationId: 'invite_local000000000000001',
        previousRole: null,
        nextRole: 'member',
        occurredAt: this.at(-1_440),
      },
    ];
  }

  versions(): readonly AuthoringDocumentVersionSummary[] {
    return [3, 2, 1].map((version) => ({
      id: `docver_local_${version}`,
      version,
      createdAt: this.at(-version * 240),
      createdByUserId: LOCAL_USER_ID,
      hasCompiledArtifact: version < 3,
    }));
  }

  /**
   * Anchored on real copy from the document, so applying one visibly changes the
   * card rather than a row in a list.
   */
  copySuggestions(): readonly ChangeAwareCopySuggestion[] {
    if (this.suggestions) return structuredClone(this.suggestions);
    const target = this.steps
      .flatMap((step) => descendants(step))
      .find((block) => block.type === 'paragraph' && (block.content ?? '').trim().length > 0);
    if (!target) {
      this.suggestions = [];
      return [];
    }
    const before = target.content ?? '';
    this.suggestions = [
      {
        schemaVersion: '1',
        id: 'copy_local00000000000000001',
        driftRunId: 'driftrun_local_1',
        checkId: 'check_local_1',
        documentId: this.document.id,
        blockId: target.id,
        path: 'content',
        before,
        after: before.replace(/\bClick\b/gu, 'Choose').replace(/\butilise\b/giu, 'use'),
        confidence: 78,
        status: 'pending',
        createdAt: this.at(-30),
      },
    ];
    return structuredClone(this.suggestions);
  }

  decideCopySuggestion(
    suggestionId: string,
    decision: 'applied' | 'dismissed',
  ): ChangeAwareCopySuggestion {
    this.copySuggestions();
    const existing = (this.suggestions ?? []).find((entry) => entry.id === suggestionId);
    if (!existing) throw new Error('No such suggestion');
    const next: ChangeAwareCopySuggestion = {
      ...existing,
      status: decision,
      ...(decision === 'applied' ? { appliedAt: new Date().toISOString() } : {}),
    };
    this.suggestions = (this.suggestions ?? []).map((entry) =>
      entry.id === suggestionId ? next : entry,
    );
    return structuredClone(next);
  }

  /**
   * Reports the two findings a sweep can genuinely establish from the document
   * alone — an image with no accessible name, and a step whose copy runs long.
   * Nothing here invents a contrast ratio it did not measure.
   */
  accessibilitySweep(operationId: string): AccessibilitySweepResult {
    const documentId = this.document.id;
    const documentVersionId = `docver_local_${operationId.slice(-6) || '1'}`;
    const blocks = this.steps.flatMap((step) =>
      descendants(step).map((block) => ({ step, block })),
    );
    const unnamed = blocks.filter(
      ({ block }) => block.type === 'media' && !(block.props.media?.accessibilityName ?? '').trim(),
    );
    const longCopy = blocks.filter(
      ({ block }) => block.type === 'paragraph' && (block.content ?? '').length > 220,
    );
    const findings = [
      ...unnamed.map(({ step, block }) =>
        this.finding(documentId, documentVersionId, 'missing_accessible_name', 'blocker', step, block),
      ),
      ...longCopy.map(({ step, block }) =>
        this.finding(documentId, documentVersionId, 'long_copy_risk', 'warning', step, block),
      ),
    ];
    return {
      sweep: {
        schemaVersion: ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION,
        id: `a11ysweep_${operationId}`,
        status: 'completed',
        requestedByUserId: LOCAL_USER_ID,
        documentCount: 1,
        localeCount: 1,
        blockerCount: findings.filter((finding) => finding.severity === 'blocker').length,
        warningCount: findings.filter((finding) => finding.severity === 'warning').length,
        startedAt: new Date(Date.now() - 1_500).toISOString(),
        completedAt: new Date().toISOString(),
      },
      findings,
    };
  }

  private finding(
    documentId: string,
    documentVersionId: string,
    code: 'missing_accessible_name' | 'long_copy_risk',
    severity: 'blocker' | 'warning',
    step: LodariqBlock,
    block: LodariqBlock,
  ): AccessibilitySweepResult['findings'][number] {
    return {
      schemaVersion: ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION,
      id: this.nextId('a11yfind'),
      sweepId: `a11ysweep_${documentVersionId}`,
      documentId,
      documentVersionId,
      artifactId: null,
      contentHash: null,
      code,
      severity,
      status: 'open',
      locale: 'en',
      stepId: step.id,
      nodeId: block.id,
      measuredRatio: null,
      requiredRatio: null,
      revision: 1,
      resolvedByUserId: null,
      resolutionNote: null,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
    };
  }
}

function descendants(block: LodariqBlock): LodariqBlock[] {
  return [block, ...block.children.flatMap(descendants)];
}
