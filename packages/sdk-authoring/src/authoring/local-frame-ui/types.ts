import type { ResolverDiagnostic, LodariqDocument, TargetInspectAction } from '@lodariq/schema';

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
} as const satisfies Record<
  EditableBlockTypeValue,
  { fieldLabel: string; placeholder: string }
>;

export const EDITABLE_ACTION_OPTIONS = [
  { value: '', label: 'Choose next action' },
  { value: 'next', label: 'Go to next step' },
  { value: 'back', label: 'Go back' },
  { value: 'complete', label: 'Complete tour' },
  { value: 'clickTarget', label: 'Wait for placement' },
  { value: 'openPage', label: 'Open page' },
  { value: 'dismiss', label: 'Close experience' },
] as const;
export type EditableActionType = (typeof EDITABLE_ACTION_OPTIONS)[number]['value'];

export type DocumentTarget = LodariqDocument['targets'][number];

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

export interface LocalAuthoringFrameSnapshot {
  documentState: LodariqDocument;
  status: string;
  slashText: string;
  slashOpen: boolean;
  jsonText: string;
  compiledText: string;
  metricsText: string;
  selectedBlockId: string | null;
  dragTargetBlockId: string | null;
  dragTargetPosition: 'before' | 'after' | null;
  targetDiagnostics: Map<string, TargetInspectionState>;
  advancedTargetIds: Set<string>;
  focusRequest: FocusRequest | null;
}
