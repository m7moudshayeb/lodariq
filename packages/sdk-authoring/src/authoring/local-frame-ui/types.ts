import type { ResolverDiagnostic, LodariqDocument, TargetInspectAction } from '@lodariq/schema';

export const SLASH_COMMANDS = [
  { value: 'step', label: 'Step' },
  { value: 'heading', label: 'Heading' },
  { value: 'paragraph', label: 'Text' },
  { value: 'button', label: 'Button' },
  { value: 'media', label: 'Media' },
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number]['value'];
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
