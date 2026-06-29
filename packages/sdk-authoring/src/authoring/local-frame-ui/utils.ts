import type {
  ResolverDiagnostic,
  LodariqBlock,
  LodariqDocument,
  TargetInspectAction,
} from '@lodariq/schema';
import {
  SLASH_COMMANDS,
  type DocumentTarget,
  type SlashCommand,
  type TargetInspectionState,
} from './types';

export function targetById(
  documentState: LodariqDocument,
  targetId: string,
): DocumentTarget | undefined {
  return documentState.targets.find((item) => item.id === targetId);
}

export function targetLabelOf(documentState: LodariqDocument, targetId: string): string {
  const target = targetById(documentState, targetId);
  return (
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
  return (
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'button' ||
    block.type === 'media'
  );
}

export function propertyChipLabels(block: LodariqBlock): string[] {
  const labels: string[] = [];
  if (typeof block.props.index === 'number') labels.push(`Step ${block.props.index + 1}`);
  if (block.props.level) labels.push(`Heading level ${block.props.level}`);
  if (block.props.placement) labels.push(`Placement: ${block.props.placement}`);
  if (block.props.variant) labels.push(`${capitalize(block.props.variant)} button`);
  if (block.props.action?.type === 'next') labels.push('Continues tour');
  if (block.props.action?.type === 'dismiss') labels.push('Dismisses tour');
  if (block.props.action?.type === 'clickTarget') labels.push('Waits for target click');
  if (block.type === 'button' && !block.props.action) labels.push('Needs purpose');
  if (block.type === 'media') labels.push('Placeholder media');
  return labels;
}

export function targetHealthTitle(state: ResolverDiagnostic['state']): string {
  if (state === 'found') return 'Healthy';
  if (state === 'ambiguous') return 'Ambiguous';
  return 'Missing';
}

export function targetHealthDetails(inspection: TargetInspectionState): string {
  const diagnostic = inspection.diagnostic;
  const message = diagnostic.message ?? targetInspectFallbackMessage(inspection);
  const method = diagnostic.resolutionMethod
    ? ` ${humanResolutionMethod(diagnostic.resolutionMethod)}`
    : '';
  return `${message}. Confidence ${diagnostic.confidence}%. Candidates ${diagnostic.candidateCount}.${method}`;
}

export function targetInspectFallbackMessage(inspection: TargetInspectionState): string {
  if (inspection.diagnostic.state === 'found') {
    if (inspection.action === 'view') return 'Target found and highlighted';
    if (inspection.action === 'test') return 'Target test passed';
    return 'Target found';
  }
  if (inspection.diagnostic.state === 'ambiguous') return 'Multiple matching elements found';
  return 'Target not found on the current page';
}

export function targetInspectionStatus(
  action: TargetInspectAction,
  diagnostic: ResolverDiagnostic,
): string {
  if (diagnostic.state === 'found') {
    if (action === 'view') return diagnostic.message ?? 'Target found and highlighted';
    if (action === 'test') return diagnostic.message ?? 'Target test passed';
    return diagnostic.message ?? 'Target is healthy';
  }
  if (diagnostic.state === 'ambiguous') return diagnostic.message ?? 'Target is ambiguous';
  return diagnostic.message ?? 'Target is missing';
}

export function humanResolutionMethod(method: string): string {
  switch (method) {
    case 'lodariq_id':
      return 'Found by Lodariq ID';
    case 'stable_attribute':
      return 'Found by stable attribute';
    case 'role_and_name':
      return 'Found by role and label';
    case 'label':
      return 'Found by label';
    case 'ancestor_landmark':
      return 'Found by landmark';
    case 'relative_position':
      return 'Found by relative position';
    case 'scoped_css':
      return 'Found by scoped CSS';
    default:
      return 'Found by semantic match';
  }
}

export function slashCommandType(text: string): SlashCommand | null {
  return slashCommandValue(text.slice(1).toLowerCase());
}

export function slashCommandValue(value: string | undefined): SlashCommand | null {
  return SLASH_COMMANDS.some((command) => command.value === value) ? (value as SlashCommand) : null;
}

export function blockTypeLabel(type: string): string {
  switch (type) {
    case 'tourStep':
      return 'Tour step';
    case 'targetChip':
      return 'Target';
    case 'validationBadge':
      return 'Validation';
    default:
      return capitalize(type);
  }
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
