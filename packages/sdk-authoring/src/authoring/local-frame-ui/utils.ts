import type {
  ResolverDiagnostic,
  LodariqBlock,
  LodariqDocument,
  TargetInspectAction,
} from '@lodariq/schema';
import {
  EDITABLE_ACTION_OPTIONS,
  EDITABLE_BLOCK_TYPES,
  SLASH_COMMANDS,
  STEP_CONTENT_COMMANDS,
  type DocumentTarget,
  type EditableActionType,
  type EditableBlockTypeValue,
  type SlashCommand,
  type StepContentCommand,
  type TargetInspectionState,
} from './types';

const EDITABLE_BLOCK_TYPE_SET = new Set<string>(EDITABLE_BLOCK_TYPES);
const STEP_CONTENT_COMMAND_SET = new Set<string>(STEP_CONTENT_COMMANDS);
const STEP_COMMAND_ALIASES: Readonly<Record<string, StepContentCommand>> = {
  text: 'paragraph',
  title: 'heading',
};
const SLASH_COMMAND_LABELS = Object.fromEntries(
  SLASH_COMMANDS.map((command) => [command.value, command.label]),
) as Readonly<Record<SlashCommand, string>>;

const PROPERTY_CHIP_FACTORIES: Readonly<Record<string, (block: LodariqBlock) => string | null>> = {
  index: (block: LodariqBlock) =>
    typeof block.props.index === 'number' ? `Step ${block.props.index + 1}` : null,
  level: (block: LodariqBlock) => (block.props.level ? `Heading level ${block.props.level}` : null),
  placement: (block: LodariqBlock) =>
    block.props.placement ? `Placement: ${block.props.placement}` : null,
  variant: (block: LodariqBlock) =>
    block.props.variant ? `${capitalize(block.props.variant)} button` : null,
};

const ACTION_CHIP_LABELS: Readonly<Record<string, string>> = {
  next: 'Goes to next step',
  back: 'Goes to previous step',
  complete: 'Completes tour',
  dismiss: 'Closes experience',
  clickTarget: 'Clicks target',
  openPage: 'Opens page',
};

const MISSING_ACTION_CHIP_LABELS: Readonly<Record<string, string>> = {
  button: 'Choose next action',
  link: 'Choose next action',
};

const STATIC_BLOCK_CHIP_LABELS: Readonly<Record<string, string>> = {
  media: 'Add media later',
};

const RESOLUTION_METHOD_LABELS: Readonly<Record<string, string>> = {
  lodariq_id: 'Uses Lodariq marker',
  stable_attribute: 'Uses stable page marker',
  role_and_name: 'Uses page label',
  label: 'Uses label',
  ancestor_landmark: 'Uses page area',
  relative_position: 'Uses nearby position',
  scoped_css: 'Uses support rule',
  registry_contract: 'Uses an app-provided target contract',
  configured_attribute: 'Uses existing page attributes',
  semantic_attribute: 'Uses semantic element attributes',
  element_semantics: 'Uses the element type and role',
  ancestor_context: 'Uses the surrounding page region',
  relationship_context: 'Uses nearby structural relationships',
  visual_topology: 'Uses normalized rendered layout',
  localized_text: 'Uses text from the current locale',
};

const DEFAULT_RESOLUTION_METHOD_LABEL = 'Uses page context';

const TARGET_EVIDENCE_FAMILY_LABELS: Readonly<Record<string, string>> = {
  'registry-contract': 'app contract',
  'configured-attribute': 'existing attributes',
  'semantic-attribute': 'element semantics',
  'element-semantics': 'control type',
  'ancestor-context': 'page region',
  'relationship-context': 'nearby structure',
  'visual-topology': 'rendered layout',
  'localized-text': 'current-locale text',
};

const BLOCK_TYPE_LABELS: Readonly<Record<string, string>> = {
  tourStep: 'Step',
  paragraph: 'Text',
  list: 'List',
  divider: 'Divider',
  link: 'Link',
  targetChip: 'Placement',
  validationBadge: 'Validation',
};

export function targetById(
  documentState: LodariqDocument,
  targetId: string,
): DocumentTarget | undefined {
  return documentState.targets.find((item) => item.id === targetId);
}

export function targetLabelOf(documentState: LodariqDocument, targetId: string): string {
  const target = targetById(documentState, targetId);
  return (
    target?.identity?.display.authorLabel ??
    target?.fingerprint.accessibleName ??
    target?.fingerprint.stableAttributes['data-lodariq-id'] ??
    targetId
  );
}

export function targetIdOf(block: LodariqBlock): string | null {
  if (block.props.targetId) return block.props.targetId;
  for (const child of block.children) {
    const targetId = targetIdOf(child);
    if (targetId) return targetId;
  }
  return null;
}

export function blockStatus(block: LodariqBlock): 'ready' | 'incomplete' | 'invalid' {
  if (block.status === 'invalid') return 'invalid';
  if (block.children.some((child) => blockStatus(child) === 'invalid')) return 'invalid';
  if (block.status === 'incomplete') return 'incomplete';
  if (!block.id || !block.type) return 'invalid';
  return 'ready';
}

export function blockKicker(block: LodariqBlock): string {
  if (block.type === 'tourStep' && typeof block.props.index === 'number') {
    return `Step ${block.props.index + 1}`;
  }
  return blockTypeLabel(block.type);
}

export function blockDisplayTitle(block: LodariqBlock): string {
  if (block.type === 'tourStep') {
    const heading = firstHeadingText(block);
    if (heading) return heading;
  }
  const text = blockText(block).trim();
  if (text) return text;
  return blockKicker(block);
}

export function firstHeadingText(block: LodariqBlock): string {
  if (block.type === 'heading' && block.content?.trim()) return block.content.trim();
  for (const child of block.children) {
    const text = firstHeadingText(child);
    if (text) return text;
  }
  return '';
}

export function blockText(block: LodariqBlock): string {
  if (block.type === 'targetChip' || block.type === 'validationBadge') return '';
  return [block.content, ...block.children.map(blockText)].filter(Boolean).join(' ');
}

export function isEditableContentBlock(block: LodariqBlock): boolean {
  return isEditableBlockType(block.type);
}

export function propertyChipLabels(block: LodariqBlock): string[] {
  return [
    ...Object.values(PROPERTY_CHIP_FACTORIES).map((labelForBlock) => labelForBlock(block)),
    block.props.action ? (ACTION_CHIP_LABELS[block.props.action.type] ?? null) : null,
    block.props.action ? null : (MISSING_ACTION_CHIP_LABELS[block.type] ?? null),
    STATIC_BLOCK_CHIP_LABELS[block.type] ?? null,
  ].filter(isPresent);
}

export function targetHealthTitle(
  diagnosticOrState: ResolverDiagnostic | ResolverDiagnostic['state'],
): string {
  const state = typeof diagnosticOrState === 'string' ? diagnosticOrState : diagnosticOrState.state;
  if (state === 'found') return 'Verified';
  if (state === 'needs_review') {
    return targetDiagnosticIsDrift(diagnosticOrState) ? 'Drift detected' : 'Needs verification';
  }
  if (state === 'ambiguous') return 'Ambiguous';
  return 'Missing';
}

export function targetHealthDetails(inspection: TargetInspectionState): string {
  return targetInspectFallbackMessage(inspection);
}

export function targetSupportDetails(inspection: TargetInspectionState): string {
  const diagnostic = inspection.diagnostic;
  const evidence = diagnostic.evidenceFamilies
    ?.map((family) => TARGET_EVIDENCE_FAMILY_LABELS[family] ?? family)
    .join(', ');
  const method = diagnostic.resolutionMethod
    ? ` ${humanResolutionMethod(diagnostic.resolutionMethod)}.`
    : '';
  const candidateLabel = diagnostic.candidateCount === 1 ? 'candidate' : 'candidates';
  const evidenceDetails = evidence ? ` Evidence observed: ${evidence}.` : '';
  return `${diagnostic.candidateCount} ${candidateLabel} observed.${evidenceDetails}${method}`;
}

export function targetInspectFallbackMessage(inspection: TargetInspectionState): string {
  if (inspection.diagnostic.state === 'found') {
    if (inspection.action === 'view') return 'Placement is highlighted.';
    if (inspection.action === 'test') return 'Placement check passed on this page state.';
    return 'Verified on this page state.';
  }
  if (inspection.diagnostic.state === 'needs_review') {
    return targetDiagnosticIsDrift(inspection.diagnostic)
      ? 'The element was found, but its saved evidence has drifted. Verify it or choose it again.'
      : 'This placement does not yet have enough reliable evidence. Verify it or choose it again.';
  }
  if (inspection.diagnostic.state === 'ambiguous') {
    return 'More than one place matches. Pick the exact place again.';
  }
  return 'We could not find this placement. Choose it again or open the page state where it appears.';
}

export function targetInspectionStatus(
  action: TargetInspectAction,
  diagnostic: ResolverDiagnostic,
): string {
  if (diagnostic.state === 'found') {
    if (action === 'view') return 'Placement highlighted.';
    if (action === 'test') return 'Placement check passed.';
    return 'Placement verified.';
  }
  if (diagnostic.state === 'needs_review') {
    return targetDiagnosticIsDrift(diagnostic)
      ? 'Placement drift detected.'
      : 'Placement needs verification.';
  }
  if (diagnostic.state === 'ambiguous') {
    return 'Pick a more specific placement.';
  }
  return 'Placement needs attention.';
}

export function targetDiagnosticIsDrift(
  diagnosticOrState: ResolverDiagnostic | ResolverDiagnostic['state'],
): boolean {
  if (typeof diagnosticOrState === 'string') return false;
  return (
    diagnosticOrState.reasonCode === 'evidence_drift' ||
    diagnosticOrState.reasonCode === 'resolved_with_drift'
  );
}

export function humanResolutionMethod(method: string): string {
  return RESOLUTION_METHOD_LABELS[method] ?? DEFAULT_RESOLUTION_METHOD_LABEL;
}

export function slashCommandType(text: string): SlashCommand | null {
  return slashCommandValue(text.slice(1).toLowerCase());
}

export function slashCommandValue(value: string | undefined): SlashCommand | null {
  return SLASH_COMMANDS.some((command) => command.value === value) ? (value as SlashCommand) : null;
}

export function slashCommandLabel(command: SlashCommand): string {
  return SLASH_COMMAND_LABELS[command];
}

export function editableActionValue(value: string): EditableActionType | null {
  return EDITABLE_ACTION_OPTIONS.some((item) => item.value === value)
    ? (value as EditableActionType)
    : null;
}

export function editableBlockTypeValue(value: string): EditableBlockTypeValue | null {
  return isEditableBlockType(value) ? value : null;
}

export function stepContentCommandFromQuery(value: string): StepContentCommand | null {
  const normalized = value.replace(/^\//, '').trim().toLowerCase();
  if (!normalized) return null;
  const exactAlias = STEP_COMMAND_ALIASES[normalized];
  if (exactAlias) return exactAlias;
  if (STEP_CONTENT_COMMAND_SET.has(normalized)) return normalized as StepContentCommand;
  const aliasMatch = Object.entries(STEP_COMMAND_ALIASES).find(([alias]) =>
    alias.startsWith(normalized),
  );
  if (aliasMatch) return aliasMatch[1];
  return (
    STEP_CONTENT_COMMANDS.find((command) =>
      [command, blockTypeLabel(command)].some((candidate) =>
        candidate.toLowerCase().includes(normalized),
      ),
    ) ?? null
  );
}

export function isEditableBlockType(type: string): type is EditableBlockTypeValue {
  return EDITABLE_BLOCK_TYPE_SET.has(type);
}

export function blockTypeLabel(type: string): string {
  return BLOCK_TYPE_LABELS[type] ?? capitalize(type);
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function findBlockById(blocks: LodariqBlock[], blockId: string): LodariqBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const child = findBlockById(block.children, blockId);
    if (child) return child;
  }
  return null;
}

export function closestButton(target: EventTarget | null): HTMLButtonElement | null {
  if (target instanceof Element) return target.closest('button');
  if (target instanceof Node) return target.parentElement?.closest('button') ?? null;
  return null;
}

export function closestBlockId(target: EventTarget | null): string | null {
  if (target instanceof Element) {
    return target.closest<HTMLElement>('.block')?.dataset['blockId'] ?? null;
  }
  if (target instanceof Node) {
    return target.parentElement?.closest<HTMLElement>('.block')?.dataset['blockId'] ?? null;
  }
  return null;
}

export function isEditableControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isPresent<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
