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
  if (block.props.action?.type === 'next') labels.push('Goes to next step');
  if (block.props.action?.type === 'dismiss') labels.push('Closes experience');
  if (block.props.action?.type === 'clickTarget') labels.push('Waits for placement');
  if (block.type === 'button' && !block.props.action) labels.push('Choose next action');
  if (block.type === 'media') labels.push('Add media later');
  return labels;
}

export function targetHealthTitle(state: ResolverDiagnostic['state']): string {
  if (state === 'found') return 'Ready';
  if (state === 'ambiguous') return 'Review placement';
  return 'Needs attention';
}

export function targetHealthDetails(inspection: TargetInspectionState): string {
  return targetInspectFallbackMessage(inspection);
}

export function targetSupportDetails(inspection: TargetInspectionState): string {
  const diagnostic = inspection.diagnostic;
  const method = diagnostic.resolutionMethod
    ? ` ${humanResolutionMethod(diagnostic.resolutionMethod)}.`
    : '';
  return `Match strength ${diagnostic.confidence}%. Places found ${diagnostic.candidateCount}.${method}`;
}

export function targetInspectFallbackMessage(inspection: TargetInspectionState): string {
  if (inspection.diagnostic.state === 'found') {
    if (inspection.action === 'view') return 'Placement is highlighted.';
    if (inspection.action === 'test') return 'Placement is ready.';
    return 'Placement is easy to find.';
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
    if (action === 'test') return 'Placement is ready.';
    return 'Placement is ready.';
  }
  if (diagnostic.state === 'ambiguous') {
    return 'Pick a more specific placement.';
  }
  return 'Placement needs attention.';
}

export function humanResolutionMethod(method: string): string {
  switch (method) {
    case 'lodariq_id':
      return 'Uses Lodariq marker';
    case 'stable_attribute':
      return 'Uses stable page marker';
    case 'role_and_name':
      return 'Uses page label';
    case 'label':
      return 'Uses label';
    case 'ancestor_landmark':
      return 'Uses page area';
    case 'relative_position':
      return 'Uses nearby position';
    case 'scoped_css':
      return 'Uses support rule';
    default:
      return 'Uses page context';
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
      return 'Step';
    case 'paragraph':
      return 'Text';
    case 'targetChip':
      return 'Placement';
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
