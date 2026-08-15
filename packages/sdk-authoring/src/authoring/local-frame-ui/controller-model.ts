import {
  BASIC_VISUAL_PREFLIGHT_ISSUE_CODES,
  type BlockActionProps,
  type BridgeMessage,
  type LodariqBlock,
  type PreviewPatchOperation,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type RuntimeLifecycleHints,
  type TargetInspectAction,
  type TargetRequiredAction,
} from '@lodariq/schema';
import { authoringText } from '../../i18n';
import type { EditableBlockType } from '../document-ops';
import type {
  AuthoringBrandWorkspaceState,
  AuthoringExactArtifactPromotionRequest,
  AuthoringReleaseArtifactState,
  AuthoringReleaseWorkflowState,
  AuthoringStagingPublicationResult,
  AuthoringStagingPublicationRequest,
  AuthoringStagingReleaseState,
  LocalAuthoringFrameOptions,
} from '../local-frame-types';
import type {
  AuthoringReleaseRecoveryIntent,
  AuthoringReleaseRecoveryRequestIdentity,
} from '../release-recovery-model';
import {
  TARGET_LIFECYCLE_SCROLL_VALUES,
  type AuthoringReleaseViewState,
  type EditableActionType,
  type TargetLifecycleScrollStrategy,
} from './types';

export function releaseRecoveryRequestMatchesConfirmation(
  request: ReleaseRecoveryRequest,
  intent: AuthoringReleaseRecoveryIntent,
  identity: AuthoringReleaseRecoveryRequestIdentity,
): boolean {
  if (request.action !== intent.action) return false;
  if (request.idempotencyKey !== identity.idempotencyKey) return false;
  if (request.correlationId !== identity.correlationId) return false;
  if (request.expectedGeneration !== intent.guard.expectedGeneration) return false;
  if (request.expectedActivePublicationId !== intent.guard.expectedActivePublicationId) {
    return false;
  }
  if (request.action === 'rollback' && intent.action === 'rollback') {
    return intent.targets.some((target) => target.publicationId === request.targetPublicationId);
  }
  return request.action === 'unpublish' && intent.action === 'unpublish';
}

export function releaseRecoveryResultFeedback(result: ReleaseRecoveryResult): {
  kind: 'error' | 'notice';
  message: string;
} {
  if (!result.ok) return { kind: 'error', message: authoringText(result.message) };
  if (result.action === 'rollback') {
    return {
      kind: 'notice',
      message: authoringText('Rolled back to {publication} at generation {generation}.', {
        publication: result.targetPublicationId,
        generation: result.generation,
      }),
    };
  }
  return {
    kind: 'notice',
    message: authoringText('Delivery is inactive at generation {generation}.', {
      generation: result.generation,
    }),
  };
}

export function initialReleaseView(
  hasReleaseServices: boolean,
  unavailableReason: LocalAuthoringFrameOptions['services']['releaseUnavailableReason'],
): AuthoringReleaseViewState {
  if (hasReleaseServices) {
    return {
      status: 'checking',
      reason: 'checking',
      expectedGeneration: null,
      findings: [],
    };
  }
  return {
    status: 'unavailable',
    reason: unavailableReason === 'not-authorized' ? 'not_authorized' : 'local_preview',
    expectedGeneration: null,
    findings: [],
  };
}

export function accessibleFallbackBrandState(): AuthoringBrandWorkspaceState {
  return {
    themeName: authoringText('Lodariq accessible fallback'),
    status: 'fallback',
    source: {
      kind: 'accessible-fallback',
      label: authoringText('Accessible fallback'),
      detail: authoringText(
        'Safe semantic defaults are active until a workspace Brand theme is approved.',
      ),
    },
    canEdit: false,
    canApprove: false,
  };
}

export function exactArtifactPromotionRequest(
  workflow: AuthoringReleaseWorkflowState,
): AuthoringExactArtifactPromotionRequest {
  const staging = workflow.staging;
  if (!staging) throw new Error('A staging artifact is required for promotion');
  return {
    ...(staging.publicationId ? { sourcePublicationId: staging.publicationId } : {}),
    ...(workflow.production?.environmentId
      ? { productionEnvironmentId: workflow.production.environmentId }
      : {}),
    ...(typeof workflow.production?.generation === 'number'
      ? { expectedGeneration: workflow.production.generation }
      : {}),
    artifactId: staging.artifactId,
    contentHash: staging.contentHash,
    ...(workflow.production?.artifactId
      ? { expectedProductionArtifactId: workflow.production.artifactId }
      : {}),
  };
}

export function releaseWorkflowAfterStagingPublication(
  current: AuthoringReleaseWorkflowState | null,
  request: AuthoringStagingPublicationRequest,
  canVerify: boolean,
  canPromote: boolean,
): AuthoringReleaseWorkflowState {
  const production: AuthoringReleaseArtifactState | null = current?.production
    ? structuredClone(current.production)
    : null;
  const approval =
    current && current.approval !== 'not-required'
      ? ('required' as const)
      : ('not-required' as const);
  return {
    draft: {
      ...(current?.draft.version ? { version: current.draft.version } : {}),
      contentHash: request.expectedContentHash,
      dirty: false,
    },
    staging: {
      ...(current?.staging?.version ? { version: current.staging.version } : {}),
      artifactId: request.expectedArtifactId,
      contentHash: request.expectedContentHash,
      verification: { state: 'not-run', checks: [] },
    },
    production,
    ...(current?.rendererVersion ? { rendererVersion: current.rendererVersion } : {}),
    ...(current?.theme ? { theme: structuredClone(current.theme) } : {}),
    ...(current?.changes ? { changes: structuredClone(current.changes) } : {}),
    ...(current?.environments ? { environments: structuredClone(current.environments) } : {}),
    canVerify,
    canPromote,
    canApprove: current?.canApprove ?? false,
    approval,
  };
}

export function releaseHistoryEntryFocusTarget(
  workflow: AuthoringReleaseWorkflowState | null,
  environmentId: string,
): string | null {
  let environment = workflow?.environments?.find(
    (candidate) => candidate.environmentId === environmentId,
  )?.environment;
  if (!environment && workflow?.staging?.environmentId === environmentId) {
    environment = 'staging';
  }
  if (!environment && workflow?.production?.environmentId === environmentId) {
    environment = 'production';
  }
  return environment ? `release-history-${environment}` : null;
}

export function releaseEnvironmentReferencesFromRemote(
  remote: AuthoringStagingReleaseState,
  current: AuthoringReleaseWorkflowState | null,
): AuthoringReleaseWorkflowState['environments'] {
  const pipeline = remote.pipeline;
  if (!pipeline) {
    return current?.environments ? structuredClone(current.environments) : undefined;
  }
  const staging = {
    environment: 'staging' as const,
    environmentId: pipeline.staging.environmentId,
  };
  if (pipeline.production.environmentId === pipeline.staging.environmentId) return [staging];
  return [
    staging,
    {
      environment: 'production',
      environmentId: pipeline.production.environmentId,
    },
  ];
}

export function releaseViewFromRemote(
  remote: AuthoringStagingReleaseState,
): AuthoringReleaseViewState {
  const expectedGeneration = remote.expectedGeneration;
  const findings = structuredClone(remote.findings);
  if (!remote.available || remote.state === 'open_in_staging') {
    return {
      status: 'blocked',
      reason: 'open_in_staging',
      expectedGeneration,
      findings,
    };
  }
  if (findings.some((finding) => finding.severity === 'blocker')) {
    return {
      status: 'blocked',
      reason: releaseBlockerReason(findings),
      expectedGeneration,
      findings,
    };
  }
  if (remote.state === 'current') {
    return {
      status: 'current',
      reason: 'current',
      expectedGeneration,
      findings,
    };
  }
  return {
    status: 'ready',
    reason: remote.state === 'no_saved_artifact' ? 'no_saved_artifact' : 'ready',
    expectedGeneration,
    findings,
  };
}

export function releaseViewFromPublicationFailure(
  result: Extract<AuthoringStagingPublicationResult, { ok: false }>,
): AuthoringReleaseViewState {
  if (BLOCKING_RELEASE_ERROR_CODES.has(result.code)) {
    return {
      status: 'blocked',
      reason:
        result.code === 'visual_preflight_blocked' ? 'visual_preflight_blocked' : 'publish_blocked',
      expectedGeneration: result.actualGeneration ?? result.expectedGeneration ?? null,
      findings: structuredClone(result.findings),
    };
  }
  return {
    ...requestFailedReleaseView(result.actualGeneration ?? result.expectedGeneration ?? null),
    findings: structuredClone(result.findings),
  };
}

export function requestFailedReleaseView(
  expectedGeneration: number | null,
): AuthoringReleaseViewState {
  return {
    status: 'error',
    reason: 'request_failed',
    expectedGeneration,
    findings: [],
  };
}

const BLOCKING_RELEASE_ERROR_CODES = new Set([
  'publish_blocked',
  'visual_preflight_blocked',
  'staging_authoring_session_required',
  'theme_migration_required',
  'theme_review_required',
]);

const VISUAL_PREFLIGHT_ISSUE_CODES = new Set<string>(BASIC_VISUAL_PREFLIGHT_ISSUE_CODES);

function releaseBlockerReason(
  findings: AuthoringStagingReleaseState['findings'],
): 'publish_blocked' | 'visual_preflight_blocked' {
  const blockers = findings.filter((finding) => finding.severity === 'blocker');
  return blockers.length > 0 &&
    blockers.every((finding) => VISUAL_PREFLIGHT_ISSUE_CODES.has(finding.code))
    ? 'visual_preflight_blocked'
    : 'publish_blocked';
}
export const RELEASE_ERRORS_REQUIRING_NEW_GUARD = new Set([
  'deployment_changed',
  'idempotency_conflict',
  'reviewed_artifact_changed',
]);

type ConcreteEditableActionType = Exclude<EditableActionType, ''>;
type EditableActionFactory = (currentAction: BlockActionProps | undefined) => BlockActionProps;

const EDITABLE_ACTION_FACTORIES: Readonly<
  Record<ConcreteEditableActionType, EditableActionFactory>
> = {
  next: () => ({ type: 'next' }),
  back: () => ({ type: 'back' }),
  complete: () => ({ type: 'complete' }),
  clickTarget: () => ({ type: 'clickTarget' }),
  runSequence: () => ({
    type: 'runSequence',
    sequence: {
      trigger: { type: 'manual' },
      waitFor: [],
      transition: { type: 'next' },
      timeoutMs: 3_000,
      onTimeout: 'stay',
    },
  }),
  openPage: (currentAction) => {
    const url = currentOpenPageUrl(currentAction);
    const navigationBehavior =
      currentAction?.type === 'openPage' ? currentAction.navigationBehavior : 'continue';
    return {
      type: 'openPage',
      ...(url ? { url } : {}),
      ...(navigationBehavior ? { navigationBehavior } : {}),
    };
  },
  dismiss: () => ({ type: 'dismiss' }),
};

const TARGET_INSPECT_ACTIONS: Readonly<Record<string, TargetInspectAction>> = {
  'target-view': 'view',
  'target-test': 'test',
  'target-health': 'health',
};
export function createNextAction(
  actionType: EditableActionType,
  currentAction: BlockActionProps | undefined,
): BlockActionProps | null {
  if (actionType === '') return null;
  return EDITABLE_ACTION_FACTORIES[actionType](currentAction);
}

function currentOpenPageUrl(currentAction: BlockActionProps | undefined): string {
  if (currentAction?.type !== 'openPage') return '';
  return currentAction.url?.trim() ?? '';
}

export function previewPatchForAction(
  actionType: EditableActionType,
  action: BlockActionProps | null,
): PreviewPatchOperation[] {
  if (actionType === '' || !action) return [{ op: 'setAction' }];
  return [{ op: 'setAction', action }];
}

export function targetInspectActionForButtonAction(action: string): TargetInspectAction {
  return TARGET_INSPECT_ACTIONS[action] ?? 'health';
}

export function targetInspectionPendingStatus(action: TargetInspectAction): string {
  if (action === 'view') return authoringText('Highlighting placement');
  return authoringText('Verifying placement');
}

export function presentationAnchorMessageMatchesPending(
  message: Extract<
    BridgeMessage,
    { type: 'presentation.anchor.pick.canceled' | 'presentation.anchor.pick.result' }
  >,
  pending: {
    blockId: string;
    targetId: string;
    requestCorrelationId: string;
  } | null,
): boolean {
  return Boolean(
    pending &&
    pending.requestCorrelationId === message.requestCorrelationId &&
    pending.blockId === message.blockId &&
    pending.targetId === message.targetId,
  );
}

export function isTargetLifecycleScrollStrategy(
  value: string,
): value is TargetLifecycleScrollStrategy {
  return TARGET_LIFECYCLE_SCROLL_VALUES.some((strategy) => strategy === value);
}

export function normalizeTargetLifecycle(
  lifecycle: RuntimeLifecycleHints,
): RuntimeLifecycleHints | undefined {
  const next = { ...lifecycle };
  if (typeof next.waitForText === 'string') {
    const trimmed = next.waitForText.trim();
    if (trimmed) {
      next.waitForText = trimmed;
    } else {
      delete next.waitForText;
      delete next.waitForTextLocale;
    }
  }
  if (!next.waitForText) delete next.waitForTextLocale;
  if (!next.scrollStrategy) delete next.scrollStrategy;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function firstBlockIdForTarget(blocks: LodariqBlock[], targetId: string): string | null {
  for (const block of blocks) {
    if (block.props.targetId === targetId) return block.id;
    const childBlockId = firstBlockIdForTarget(block.children, targetId);
    if (childBlockId) return childBlockId;
  }
  return null;
}

export function blockContainsId(block: LodariqBlock, blockId: string): boolean {
  return block.id === blockId || block.children.some((child) => blockContainsId(child, blockId));
}

export function firstTargetIdInBlock(block: LodariqBlock): string | null {
  if (typeof block.props.targetId === 'string' && block.props.targetId) return block.props.targetId;
  for (const child of block.children) {
    const targetId = firstTargetIdInBlock(child);
    if (targetId) return targetId;
  }
  return null;
}

export function requiredTargetActionForBlock(block: LodariqBlock | null): TargetRequiredAction {
  if (!block) return 'anchor';
  if (block.props.action?.type === 'clickTarget') return 'observe-click';
  return block.children.some((child) => requiredTargetActionForBlock(child) === 'observe-click')
    ? 'observe-click'
    : 'anchor';
}

export function slashCommandDefaultContent(type: EditableBlockType): string {
  if (type === 'button') return authoringText('Continue');
  if (type === 'media') return authoringText('Media placeholder');
  if (type === 'callout') return authoringText('Write supporting copy');
  if (type === 'stat') return authoringText('Untitled heading');
  if (type === 'icon') return authoringText('Learn more');
  if (type === 'formField') return authoringText('Label');
  return '';
}

export function insertedStepContentDefault(type: EditableBlockType): string {
  if (type === 'button') return authoringText('Continue');
  if (type === 'media') return authoringText('Media placeholder');
  if (type === 'callout') return authoringText('Write supporting copy');
  if (type === 'stat') return authoringText('Untitled heading');
  if (type === 'icon') return authoringText('Learn more');
  if (type === 'formField') return authoringText('Label');
  return '';
}
