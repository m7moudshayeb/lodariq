import type {
  AuthoringSaveState,
  AuthoringDeliveryCapability,
  AuthoringMediaAssetResource,
  BrandThemeSnapshot,
  LodariqDocument,
  ResolverDiagnostic,
  RuntimeLifecycleHints,
  StepBackdrop,
  TargetOutline,
  ViewportFocus,
  TargetInspectAction,
  AdaptivePolicy,
  AdaptiveBehaviorEvidence,
  AdoptionImpact,
  ExperienceAnalyticsBreakdown,
  ApplicationSummary,
  Experiment,
  ExperimentResults,
  ExperienceSession,
  ExperienceComment,
  AuthoringAuditEvent,
  WorkspaceCommercialUsage,
  WorkspaceDataCatalog,
  DeploymentSchedule,
  DeliveryTransitionHistoryEntry,
  DemoAnalyticsSummary,
  DemoArtifactReview,
  CanonicalTemplateInstantiationResult,
  AuthoringDocumentVersionSummary,
  SemanticVersionDiff,
  ChangeAwareCopySuggestion,
  RecordToAuthorProposal,
  LocaleLayoutQaReport,
} from '@lodariq/schema';
import type { AccessibilitySweepResult } from '@lodariq/schema/accessibility-governance';
import type { AuthoringReleaseFinding } from '../local-frame-types';
import type {
  AuthoringBrandMatchProposal,
  AuthoringBrandWorkspaceState,
  AuthoringReleaseWorkflowState,
} from '../local-frame-types';
import type { AiAssistState } from '../ai/assist-machine';
import type { NarrationVoice } from '../narration/narration-model';
import type { AuthoringBrandDriftControllerSnapshot } from '../brand-drift-controller';
import type {
  AuthoringReleaseRecoveryIntent,
  AuthoringReleaseRecoveryRequestIdentity,
  AuthoringReleaseRecoveryViewModel,
} from '../release-recovery-model';
import { authoringText } from '../../i18n';
import type { AuthoringDraftCheckpoint } from '../draft-checkpoints';
import type { AuthoringStepStyleRecipe } from '../step-style-recipes';
import type { AuthoringTargetHealth } from '../target-health-ledger';

export const SLASH_COMMANDS = [
  { value: 'step', label: authoringText('Step') },
  { value: 'heading', label: authoringText('Heading') },
  { value: 'paragraph', label: authoringText('Rich content') },
  { value: 'list', label: authoringText('List') },
  { value: 'divider', label: authoringText('Divider') },
  { value: 'button', label: authoringText('Button') },
  { value: 'link', label: authoringText('Link') },
  { value: 'media', label: authoringText('Media') },
  { value: 'callout', label: authoringText('Callout') },
  { value: 'stat', label: authoringText('Stat') },
  { value: 'icon', label: authoringText('Icon') },
  { value: 'formField', label: authoringText('Form field') },
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number]['value'];
export const STEP_CONTENT_COMMANDS = ['paragraph', 'button'] as const;
export type StepContentCommand = (typeof STEP_CONTENT_COMMANDS)[number];
export const STEP_CONTENT_ENTRY_COMMANDS = [
  'paragraph',
] as const satisfies readonly StepContentCommand[];

export const EDITABLE_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'list',
  'divider',
  'button',
  'link',
  'media',
  'callout',
  'stat',
  'icon',
  'formField',
] as const;
export type EditableBlockTypeValue = (typeof EDITABLE_BLOCK_TYPES)[number];

export const EDITABLE_BLOCK_FIELD_CONFIG = {
  heading: { fieldLabel: authoringText('Heading'), placeholder: authoringText('Untitled heading') },
  paragraph: {
    fieldLabel: authoringText('Body text'),
    placeholder: authoringText('Write supporting copy'),
  },
  list: {
    fieldLabel: authoringText('List items'),
    placeholder: authoringText('One item per line'),
  },
  divider: { fieldLabel: authoringText('Divider'), placeholder: '' },
  button: { fieldLabel: authoringText('Button label'), placeholder: authoringText('Button label') },
  link: { fieldLabel: authoringText('Link label'), placeholder: authoringText('Link label') },
  media: {
    fieldLabel: authoringText('Media placeholder'),
    placeholder: authoringText('Media placeholder'),
  },
  callout: {
    fieldLabel: authoringText('Callout'),
    placeholder: authoringText('Write supporting copy'),
  },
  stat: { fieldLabel: authoringText('Stat'), placeholder: authoringText('Untitled heading') },
  icon: { fieldLabel: authoringText('Icon'), placeholder: authoringText('Learn more') },
  formField: { fieldLabel: authoringText('Field label'), placeholder: authoringText('Label') },
} as const satisfies Record<EditableBlockTypeValue, { fieldLabel: string; placeholder: string }>;

export const EDITABLE_ACTION_OPTIONS = [
  { value: '', label: authoringText('Choose next action') },
  { value: 'next', label: authoringText('Go to next step') },
  { value: 'back', label: authoringText('Go back') },
  { value: 'complete', label: authoringText('Complete tour') },
  { value: 'clickTarget', label: authoringText('Click target') },
  { value: 'runSequence', label: authoringText('Run a sequence') },
  { value: 'openPage', label: authoringText('Open page') },
  { value: 'dismiss', label: authoringText('Close experience') },
] as const;
export type EditableActionType = (typeof EDITABLE_ACTION_OPTIONS)[number]['value'];

export type DocumentTarget = LodariqDocument['targets'][number];
export type TargetLifecycleScrollStrategy = NonNullable<RuntimeLifecycleHints['scrollStrategy']>;
export type TargetLifecycleControl = 'openPanel' | 'selectTab';

export const TARGET_LIFECYCLE_SCROLL_VALUES = [
  'nearest',
  'top',
  'center',
  'bottom',
  'virtualized-search',
] as const satisfies readonly TargetLifecycleScrollStrategy[];

export const TARGET_LIFECYCLE_SCROLL_OPTIONS = [
  { value: '', label: authoringText('Default scroll') },
  { value: 'nearest', label: authoringText('Nearest edge') },
  { value: 'top', label: authoringText('Scroll to top') },
  { value: 'center', label: authoringText('Scroll to center') },
  { value: 'bottom', label: authoringText('Scroll to bottom') },
  { value: 'virtualized-search', label: authoringText('Virtualized list') },
] as const satisfies ReadonlyArray<{
  value: TargetLifecycleScrollStrategy | '';
  label: string;
}>;

export interface TargetInspectionState {
  action: TargetInspectAction;
  diagnostic: ResolverDiagnostic;
}

/** A partial emphasis write, merged against the live document (§4.3). */
export interface StepEmphasisPatch {
  backdrop?: Partial<StepBackdrop> | undefined;
  targetOutline?: Partial<TargetOutline> | undefined;
  viewportFocus?: Partial<ViewportFocus> | undefined;
}

/** The on-page ring asked for §4.3's target kind. `token` makes it fire once. */
export interface TargetInspectRequest {
  stepId: string;
  section?: string;
  token: number;
}

export type FocusRevealTarget = 'content' | 'behavior' | 'placement' | 'popup';

export interface FocusRequest {
  blockId: string;
  target: 'block' | 'edit';
  caret?: 'start' | 'end' | number;
  propertyId?: string;
  reveal?: FocusRevealTarget;
  token: number;
}

/**
 * A structural change to the card, asked for from outside the card.
 *
 * On the overlay the card *is* a Lexical editor, and the editor holds the only
 * live copy of its content — it reads the document once, on mount. So a surface
 * that is not inside the editor, such as the inspector, cannot add or remove a
 * block by writing to the document: the change would be invisible until the step
 * changed, and the editor's next save would overwrite it.
 *
 * The request travels through the snapshot instead, and a plugin inside the
 * editor performs it. `token` makes it fire once.
 */
export interface CardCommandRequest {
  kind: 'add-button' | 'remove-block' | 'select-block';
  blockId?: string;
  token: number;
}

export const AUTHORING_RELEASE_VIEW_STATUSES = [
  'unavailable',
  'checking',
  'publishing',
  'ready',
  'current',
  'blocked',
  'error',
] as const;
export type AuthoringReleaseViewStatus = (typeof AUTHORING_RELEASE_VIEW_STATUSES)[number];

export const AUTHORING_RELEASE_VIEW_REASONS = [
  'local_preview',
  'not_authorized',
  'checking',
  'publishing',
  'open_in_staging',
  'no_saved_artifact',
  'ready',
  'unsaved_changes',
  'current',
  'visual_preflight_blocked',
  'publish_blocked',
  'request_failed',
] as const;
export type AuthoringReleaseViewReason = (typeof AUTHORING_RELEASE_VIEW_REASONS)[number];

export interface AuthoringReleaseViewState {
  status: AuthoringReleaseViewStatus;
  reason: AuthoringReleaseViewReason;
  expectedGeneration: number | null;
  findings: AuthoringReleaseFinding[];
}

export const AUTHORING_PANEL_MODES = [
  'edit',
  'operations',
  'appearance',
  'brand-match-review',
  'release-verification',
  'promotion-confirmation',
  'release-history',
  'release-recovery-confirmation',
] as const;
export type AuthoringPanelMode = (typeof AUTHORING_PANEL_MODES)[number];

export const AUTHORING_OPERATIONS_TABS = [
  // Author
  'flow',
  'storyboard',
  'batch',
  'templates',
  'voice',
  'record',
  'diff',
  // Look
  'appearance',
  'translation',
  'narration',
  'copy',
  // Reach
  'audience',
  'experiment',
  // Prove
  /** Pre-publish report: contrast, layout simulation, targets, alt text (§4.6). */
  'check',
  'analytics',
  // Ship
  'release',
  'review',
  'recovery',
  'collaboration',
  'audit',
  'share',
] as const;
export type AuthoringOperationsTab = (typeof AUTHORING_OPERATIONS_TABS)[number];

export interface AuthoringOperationsViewState {
  focusKey: string | null;
  scrollTop: number;
}

/** Nav grouping. Flat entries become easier to scan in five small groups. */
export const AUTHORING_OPERATIONS_GROUPS = [
  { id: 'author', tabs: ['flow', 'storyboard', 'batch', 'templates', 'voice', 'record'] },
  { id: 'look', tabs: ['appearance', 'translation', 'narration', 'copy'] },
  { id: 'reach', tabs: ['audience', 'experiment'] },
  { id: 'prove', tabs: ['check', 'analytics'] },
  {
    id: 'ship',
    tabs: ['release', 'review', 'recovery', 'diff', 'collaboration', 'audit', 'share'],
  },
] as const satisfies ReadonlyArray<{
  readonly id: string;
  readonly tabs: readonly AuthoringOperationsTab[];
}>;

export const EDITABLE_BUTTON_VARIANT_OPTIONS = [
  { value: 'primary', label: authoringText('Primary') },
  { value: 'secondary', label: authoringText('Secondary') },
  { value: 'subtle', label: authoringText('Subtle') },
  { value: 'outline', label: authoringText('Outline') },
  { value: 'link', label: authoringText('Link') },
] as const;
export type EditableButtonVariant = (typeof EDITABLE_BUTTON_VARIANT_OPTIONS)[number]['value'];

export type AuthoringPanelOperation =
  | 'loading-brand'
  | 'sampling-brand'
  | 'applying-brand'
  | 'loading-release'
  | 'verifying-release'
  | 'promoting-release'
  | 'requesting-approval'
  | 'approving-release'
  | 'loading-release-recovery'
  | 'recovering-release'
  | null;

export interface AuthoringReleaseRecoveryWorkflowState {
  available: boolean;
  environmentId: string | null;
  model: AuthoringReleaseRecoveryViewModel | null;
  intent: AuthoringReleaseRecoveryIntent | null;
  requestIdentity: AuthoringReleaseRecoveryRequestIdentity | null;
}

export interface AuthoringPanelWorkflowState {
  mode: AuthoringPanelMode;
  operationsTab: AuthoringOperationsTab;
  operationsView: AuthoringOperationsViewState;
  returnMode: AuthoringPanelMode;
  focusToken: number;
  returnFocus: 'appearance' | 'release' | null;
  focusTarget: string | null;
  operation: AuthoringPanelOperation;
  brand: AuthoringBrandWorkspaceState;
  brandProposal: AuthoringBrandMatchProposal | null;
  /** The §7.5 preview loop's state, or its idle form when assist is unavailable. */
  assist: AiAssistState;
  assistAvailable: boolean;
  brandDrift: AuthoringBrandDriftControllerSnapshot;
  release: AuthoringReleaseWorkflowState | null;
  releaseRecovery: AuthoringReleaseRecoveryWorkflowState;
  error: string | null;
  notice: string | null;
}

/** What Operations reads. Every field is optional: absent means "not measured yet". */
export interface ExperienceFunnelEntry {
  readonly stepId: string;
  readonly reached: number;
}

export interface ExperienceFormResponseSummary {
  readonly blockId: string;
  readonly label: string;
  readonly answerCount: number;
  readonly topAnswer?: string;
}

export interface ExperienceAnalyticsSnapshot {
  /** Counts are per environment; staging and production are never merged. */
  readonly environmentId: string;
  readonly shown: number;
  readonly completed: number;
  readonly dismissed: number;
  readonly funnel: readonly ExperienceFunnelEntry[];
  readonly adoption?: readonly AdoptionImpact[];
  readonly formResponses?: readonly ExperienceFormResponseSummary[];
  readonly breakdown?: ExperienceAnalyticsBreakdown;
}

export interface PresencePeer {
  readonly id: string;
  readonly name: string;
  readonly stepId: string | null;
  readonly selection?:
    | { readonly type: 'block'; readonly blockId: string }
    | { readonly type: 'target'; readonly targetId: string }
    | null;
  readonly sameCreator?: boolean;
  readonly holdsLock: boolean;
  readonly canTakeover?: boolean;
}

export type StepComment = ExperienceComment;

export interface DemoLinkSnapshot {
  readonly id?: string;
  readonly enabled: boolean;
  readonly url: string;
  readonly status?: 'active' | 'expired' | 'revoked';
  readonly expiresAt?: string;
}

export interface RecordToAuthorSnapshot {
  readonly recording: boolean;
  readonly actionCount: number;
  readonly segmentCount: number;
  readonly proposal: RecordToAuthorProposal | null;
}

export interface LocalAuthoringFrameSnapshot {
  documentState: LodariqDocument;
  /** Unmaterialized copy used by locale coverage and cross-locale QA. */
  canonicalDocumentState?: LodariqDocument;
  /** Tier 3 reach and proof. Populated from the control plane when available. */
  applications?: readonly ApplicationSummary[];
  knownEventNames?: readonly string[];
  adaptiveEvidence?: readonly AdaptiveBehaviorEvidence[];
  adaptivePolicy?: AdaptivePolicy;
  experiment?: Experiment;
  experimentResults?: ExperimentResults;
  experienceAnalytics?: ExperienceAnalyticsSnapshot;
  experienceSessions?: readonly ExperienceSession[];
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
  operationsUnavailable?: boolean;
  demoArtifactReview?: DemoArtifactReview;
  demoLink?: DemoLinkSnapshot;
  demoAnalytics?: DemoAnalyticsSummary;
  recordToAuthor?: RecordToAuthorSnapshot;
  localeLayoutQaAvailable?: boolean;
  localeLayoutQa?: {
    readonly state: 'running' | 'complete' | 'error';
    readonly report?: LocaleLayoutQaReport;
  };
  accessibilitySweepAvailable?: boolean;
  accessibilitySweep?: {
    readonly state: 'running' | 'complete' | 'error';
    readonly result?: AccessibilitySweepResult;
  };
  activeStepId?: string | null;
  /**
   * One canvas zoom for two surfaces: the mode pill's zoom rows and the
   * storyboard's own control. The control held it in local state, so the pill
   * wrote a number nothing rendered.
   */
  canvasZoomPercent: number;
  /** True while product clicks are being turned into steps (§4.4c). */
  recordingSteps: boolean;
  deliveryCapabilities: Set<AuthoringDeliveryCapability>;
  contentLocale: string;
  /** Voices this session may offer. Empty when no narration provider is configured. */
  narrationVoices?: readonly NarrationVoice[];
  translation: {
    available: boolean;
    state: 'idle' | 'translating' | 'error';
  };
  previewTheme?: BrandThemeSnapshot | null;
  /** True when the workspace theme moved past the one rendered here (§6.3). */
  themeStale: boolean;
  previewPreferences?: { prefersDark: boolean; prefersReducedMotion: boolean } | null;
  status: string;
  saveState: { state: AuthoringSaveState; label: string };
  slashText: string;
  slashOpen: boolean;
  jsonText: string;
  compiledText: string;
  metricsText: string;
  selectedBlockId: string | null;
  advancedEditorStepId: string | null;
  selectedStepIds: Set<string>;
  stepStyleClipboardAvailable: boolean;
  stepStyleRecipes: readonly AuthoringStepStyleRecipe[];
  /**
   * Which saved style a step was last given, by step id.
   *
   * WIRE_DB: the document has no `styleId` — a binding is derived by comparing
   * content hashes, so the moment a creator nudges a colour the step matches
   * nothing and the name it wore is lost. This remembers it for the session,
   * which is what lets `Update “<name>”` know what to update.
   */
  stepStyleRecipeByStep: ReadonlyMap<string, string>;
  draftCheckpoints: readonly AuthoringDraftCheckpoint[];
  mediaAssets: readonly AuthoringMediaAssetResource[];
  dragTargetBlockId: string | null;
  dragTargetPosition: 'before' | 'after' | null;
  targetDiagnostics: Map<string, TargetInspectionState>;
  targetHealth: Map<string, AuthoringTargetHealth>;
  advancedTargetIds: Set<string>;
  focusRequest: FocusRequest | null;
  cardCommandRequest: CardCommandRequest | null;
  targetInspectRequest: TargetInspectRequest | null;
  release: AuthoringReleaseViewState;
  panelWorkflow: AuthoringPanelWorkflowState;
}
