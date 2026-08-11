import type {
  AuthoringSaveState,
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

export const SLASH_COMMANDS = [
  { value: 'step', label: 'Step' },
  { value: 'heading', label: 'Heading' },
  { value: 'paragraph', label: 'Text' },
  { value: 'list', label: 'List' },
  { value: 'divider', label: 'Divider' },
  { value: 'button', label: 'Button' },
  { value: 'link', label: 'Link' },
  { value: 'media', label: 'Media' },
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number]['value'];
export const STEP_CONTENT_COMMANDS = [
  'heading',
  'paragraph',
  'list',
  'divider',
  'button',
  'link',
  'media',
] as const;
export type StepContentCommand = (typeof STEP_CONTENT_COMMANDS)[number];

export const EDITABLE_BLOCK_TYPES = STEP_CONTENT_COMMANDS;
export type EditableBlockTypeValue = (typeof EDITABLE_BLOCK_TYPES)[number];

export const EDITABLE_BLOCK_FIELD_CONFIG = {
  heading: { fieldLabel: 'Heading', placeholder: 'Untitled heading' },
  paragraph: { fieldLabel: 'Body text', placeholder: 'Write supporting copy' },
  list: { fieldLabel: 'List items', placeholder: 'One item per line' },
  divider: { fieldLabel: 'Divider', placeholder: '' },
  button: { fieldLabel: 'Button label', placeholder: 'Button label' },
  link: { fieldLabel: 'Link label', placeholder: 'Link label' },
  media: { fieldLabel: 'Media placeholder', placeholder: 'Media placeholder' },
} as const satisfies Record<EditableBlockTypeValue, { fieldLabel: string; placeholder: string }>;

export const EDITABLE_ACTION_OPTIONS = [
  { value: '', label: 'Choose next action' },
  { value: 'next', label: 'Go to next step' },
  { value: 'back', label: 'Go back' },
  { value: 'complete', label: 'Complete tour' },
  { value: 'clickTarget', label: 'Click target' },
  { value: 'openPage', label: 'Open page' },
  { value: 'dismiss', label: 'Close experience' },
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
  { value: '', label: 'Default scroll' },
  { value: 'nearest', label: 'Nearest edge' },
  { value: 'top', label: 'Scroll to top' },
  { value: 'center', label: 'Scroll to center' },
  { value: 'bottom', label: 'Scroll to bottom' },
  { value: 'virtualized-search', label: 'Virtualized list' },
] as const satisfies ReadonlyArray<{
  value: TargetLifecycleScrollStrategy | '';
  label: string;
}>;

export interface TargetInspectionState {
  action: TargetInspectAction;
  diagnostic: ResolverDiagnostic;
}

export interface FocusRequest {
  blockId: string;
  target: 'block' | 'edit';
  caret?: 'start' | 'end' | number;
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
  'appearance',
  'brand-match-review',
  'release-verification',
  'promotion-confirmation',
  'release-history',
  'release-recovery-confirmation',
] as const;
export type AuthoringPanelMode = (typeof AUTHORING_PANEL_MODES)[number];

export const EDITABLE_BUTTON_VARIANT_OPTIONS = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'outline', label: 'Outline' },
  { value: 'link', label: 'Link' },
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
  dragTargetBlockId: string | null;
  dragTargetPosition: 'before' | 'after' | null;
  targetDiagnostics: Map<string, TargetInspectionState>;
  advancedTargetIds: Set<string>;
  focusRequest: FocusRequest | null;
  release: AuthoringReleaseViewState;
  panelWorkflow: AuthoringPanelWorkflowState;
}
