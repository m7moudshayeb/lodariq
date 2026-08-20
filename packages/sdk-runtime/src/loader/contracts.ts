import type {
  AuthoringAccessibilityPreviewMode,
  CompiledDocument,
  JourneyHandoff,
} from '@lodariq/schema';
import type { SubmittedFormResponse } from '../runtime';
import type { TargetResolutionContext } from '../resolver';
import type { AuthoringTargetOverride, TourTargetResolutionDiagnostic } from '../renderers/tour';
import type {
  ChoreographyRecoveryUpdate,
  ChoreographyStageUpdate,
} from '../renderers/tour-choreography';
import type { ProtectedSurfaceRect } from '../renderers/protected-surface';
import type { TourFlowConditionContext } from '../renderers/tour-flow';

export interface TourPlaybackOptions {
  /** BCP 47 locale used to select customer-authored experience copy. */
  locale?: string;
  initialStepId?: string;
  initialStepIndex?: number;
  targetResolutionContext?: TargetResolutionContext;
  /** Resolves a server-approved asset reference without embedding raw source URLs in documents. */
  resolveMediaAsset?: (
    assetId: string,
    kind: 'image' | 'video' | 'captions',
  ) => string | null | Promise<string | null>;
  onTargetResolution?: (
    step: CompiledDocument['steps'][number],
    result: TourTargetResolutionDiagnostic,
  ) => void;
  onChoreographyStageChange?: (
    step: CompiledDocument['steps'][number],
    update: ChoreographyStageUpdate,
  ) => void;
  onChoreographyRecovery?: (
    step: CompiledDocument['steps'][number],
    update: ChoreographyRecoveryUpdate,
  ) => void;
  flowConditionContext?: Pick<TourFlowConditionContext, 'identifyTraits' | 'documentState'>;
  onBranchChoice?: (
    step: CompiledDocument['steps'][number],
    ruleIndex: number | null,
    destination: string,
  ) => void;
  /** Answers given on the step being left. Customer content, sent separately. */
  onFormResponses?: (responses: readonly SubmittedFormResponse[]) => void;
  onJourneyHandoff?: (
    step: CompiledDocument['steps'][number],
    handoff: JourneyHandoff,
    destination: string,
  ) => void;
}

export interface AuthoringPreviewPlaybackOptions extends TourPlaybackOptions {
  /** Opaque creator-session owner; never persisted or emitted as analytics. */
  ownerId: string;
  /** Enables real tour navigation controls for an explicit full preview. */
  interactive?: boolean;
  accessibilityMode?: AuthoringAccessibilityPreviewMode;
  /** Exact live selection for immediate creator preview; never serialized. */
  authoringTargetOverride?: AuthoringTargetOverride;
  onStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
  onComplete?: () => void;
  onDismiss?: () => void;
  onSkip?: () => void;
  getAuthoringProtectedSurfaces?: () => readonly ProtectedSurfaceRect[];
  onAuthoringSurfaceChange?: (rect: ProtectedSurfaceRect | null) => void;
}

export interface TourPlayerLike {
  readonly contentLocale?: string;
  start: () => void;
  stop: () => void;
  waitUntilReady: () => Promise<void>;
}

export interface TourRendererModule {
  TourPlayer: new (
    document: CompiledDocument,
    options?: TourPlaybackOptions & {
      authoringPreviewOwnerId?: string;
      authoringPreviewInteractive?: boolean;
      authoringAccessibilityMode?: AuthoringAccessibilityPreviewMode;
      authoringTargetOverride?: AuthoringTargetOverride;
      onBeforeStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
      onComplete?: () => void;
      onDismiss?: () => void;
      onSkip?: () => void;
      onStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
      onChoreographyStageChange?: (
        step: CompiledDocument['steps'][number],
        update: ChoreographyStageUpdate,
      ) => void;
      onChoreographyRecovery?: (
        step: CompiledDocument['steps'][number],
        update: ChoreographyRecoveryUpdate,
      ) => void;
      getAuthoringProtectedSurfaces?: () => readonly ProtectedSurfaceRect[];
      onAuthoringSurfaceChange?: (rect: ProtectedSurfaceRect | null) => void;
    },
  ) => TourPlayerLike;
}
