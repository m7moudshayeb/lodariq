import type { CompiledDocument } from '@lodariq/schema';
import type { TargetResolutionContext } from '../resolver';
import type { AuthoringTargetOverride, TourTargetResolutionDiagnostic } from '../renderers/tour';

export interface TourPlaybackOptions {
  /** BCP 47 locale used to select customer-authored experience copy. */
  locale?: string;
  initialStepId?: string;
  initialStepIndex?: number;
  targetResolutionContext?: TargetResolutionContext;
  onTargetResolution?: (
    step: CompiledDocument['steps'][number],
    result: TourTargetResolutionDiagnostic,
  ) => void;
}

export interface AuthoringPreviewPlaybackOptions extends TourPlaybackOptions {
  /** Opaque creator-session owner; never persisted or emitted as analytics. */
  ownerId: string;
  /** Enables real tour navigation controls for an explicit full preview. */
  interactive?: boolean;
  /** Exact live selection for immediate creator preview; never serialized. */
  authoringTargetOverride?: AuthoringTargetOverride;
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
      authoringTargetOverride?: AuthoringTargetOverride;
      onBeforeStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
      onComplete?: () => void;
      onDismiss?: () => void;
      onSkip?: () => void;
      onStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
    },
  ) => TourPlayerLike;
}
