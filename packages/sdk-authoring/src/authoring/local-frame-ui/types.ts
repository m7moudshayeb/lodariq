import type {
  AuthoringSaveState,
  AuthoringDeliveryCapability,
  AuthoringMediaAssetResource,
  BrandThemeSnapshot,
  LodariqDocument,
  ResolverDiagnostic,
  RuntimeLifecycleHints,
  TargetInspectAction,
} from '@lodariq/schema';
import type { AuthoringReleaseFinding } from '../local-frame-types';
import type {
  AuthoringBrandMatchProposal,
  AuthoringBrandWorkspaceState,
  AuthoringReleaseWorkflowState,
} from '../local-frame-types';
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

export type FocusRevealTarget = 'content' | 'behavior' | 'placement' | 'popup';

export interface FocusRequest {
  blockId: string;
  target: 'block' | 'edit';
  caret?: 'start' | 'end' | number;
  propertyId?: string;
  reveal?: FocusRevealTarget;
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
  'flow',
  'translation',
  'batch',
  'appearance',
  'release',
  'review',
  'recovery',
] as const;
export type AuthoringOperationsTab = (typeof AUTHORING_OPERATIONS_TABS)[number];

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
  returnMode: AuthoringPanelMode;
  focusToken: number;
  returnFocus: 'appearance' | 'release' | null;
  focusTarget: string | null;
  operation: AuthoringPanelOperation;
  brand: AuthoringBrandWorkspaceState;
  brandProposal: AuthoringBrandMatchProposal | null;
  brandDrift: AuthoringBrandDriftControllerSnapshot;
  release: AuthoringReleaseWorkflowState | null;
  releaseRecovery: AuthoringReleaseRecoveryWorkflowState;
  error: string | null;
  notice: string | null;
}

export interface LocalAuthoringFrameSnapshot {
  documentState: LodariqDocument;
  deliveryCapabilities: Set<AuthoringDeliveryCapability>;
  contentLocale: string;
  translation: {
    available: boolean;
    state: 'idle' | 'translating' | 'error';
  };
  previewTheme?: BrandThemeSnapshot | null;
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
  draftCheckpoints: readonly AuthoringDraftCheckpoint[];
  mediaAssets: readonly AuthoringMediaAssetResource[];
  dragTargetBlockId: string | null;
  dragTargetPosition: 'before' | 'after' | null;
  targetDiagnostics: Map<string, TargetInspectionState>;
  targetHealth: Map<string, AuthoringTargetHealth>;
  advancedTargetIds: Set<string>;
  focusRequest: FocusRequest | null;
  release: AuthoringReleaseViewState;
  panelWorkflow: AuthoringPanelWorkflowState;
}
