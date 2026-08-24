import type { ControlPlaneRepository, ExperienceStepLockRecord } from '@lodariq/database';
import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';

export function changedAuthoringStepIds(current: LodariqDocument, next: LodariqDocument): string[] {
  const currentSteps = tourSteps(current);
  const nextSteps = tourSteps(next);
  const currentById = new Map(currentSteps.map((step) => [step.id, step]));
  const nextById = new Map(nextSteps.map((step) => [step.id, step]));
  const changed = new Set<string>();

  for (const stepId of new Set([...currentById.keys(), ...nextById.keys()])) {
    if (json(currentById.get(stepId)) !== json(nextById.get(stepId))) changed.add(stepId);
  }

  const currentOrder = currentSteps.map((step) => step.id);
  const nextOrder = nextSteps.map((step) => step.id);
  for (const stepId of new Set([...currentOrder, ...nextOrder])) {
    if (currentOrder.indexOf(stepId) !== nextOrder.indexOf(stepId)) changed.add(stepId);
  }

  addLocalizedBlockChanges(current, next, currentById, nextById, changed);
  addTargetChanges(current, next, currentSteps, nextSteps, changed);
  return [...changed];
}

export async function findAuthoringStepLockConflict(
  repository: ControlPlaneRepository,
  current: LodariqDocument,
  next: LodariqDocument,
  sessionId: string,
): Promise<ExperienceStepLockRecord | null> {
  const scope = { workspaceId: current.workspaceId, documentId: current.id };
  for (const stepId of changedAuthoringStepIds(current, next)) {
    const lock = await repository.findExperienceStepLock(scope, stepId);
    if (lock && lock.sessionId !== sessionId) return lock;
  }
  return null;
}

function tourSteps(document: LodariqDocument): LodariqBlock[] {
  const rootTypes =
    document.type === 'tour' ? new Set(['tourStep']) : new Set(['tooltip', 'spotlight']);
  return document.blocks.filter((block) => rootTypes.has(block.type));
}

function addLocalizedBlockChanges(
  current: LodariqDocument,
  next: LodariqDocument,
  currentSteps: ReadonlyMap<string, LodariqBlock>,
  nextSteps: ReadonlyMap<string, LodariqBlock>,
  changed: Set<string>,
): void {
  const currentEntries = localizedBlocks(current);
  const nextEntries = localizedBlocks(next);
  const blockToStep = new Map<string, string>();
  for (const step of [...currentSteps.values(), ...nextSteps.values()]) {
    indexStepBlocks(step, step.id, blockToStep);
  }
  for (const key of new Set([...currentEntries.keys(), ...nextEntries.keys()])) {
    if (json(currentEntries.get(key)) === json(nextEntries.get(key))) continue;
    const blockId = key.slice(key.indexOf(':') + 1);
    const stepId = blockToStep.get(blockId);
    if (stepId) changed.add(stepId);
  }
}

function addTargetChanges(
  current: LodariqDocument,
  next: LodariqDocument,
  currentSteps: readonly LodariqBlock[],
  nextSteps: readonly LodariqBlock[],
  changed: Set<string>,
): void {
  const currentTargets = new Map(current.targets.map((target) => [target.id, target]));
  const nextTargets = new Map(next.targets.map((target) => [target.id, target]));
  const changedTargets = new Set<string>();
  for (const targetId of new Set([...currentTargets.keys(), ...nextTargets.keys()])) {
    if (json(currentTargets.get(targetId)) !== json(nextTargets.get(targetId))) {
      changedTargets.add(targetId);
    }
  }
  const currentOverrides = targetOverrides(current);
  const nextOverrides = targetOverrides(next);
  if (json(currentOverrides) !== json(nextOverrides)) {
    for (const overrides of [currentOverrides, nextOverrides]) {
      for (const override of overrides) {
        changedTargets.add(override.targetId);
        changedTargets.add(override.replacementTargetId);
      }
    }
  }
  if (changedTargets.size === 0) return;
  for (const step of [...currentSteps, ...nextSteps]) {
    const targetIds = new Set<string>();
    collectTargetIds(step, targetIds);
    if ([...targetIds].some((targetId) => changedTargets.has(targetId))) changed.add(step.id);
  }
}

function localizedBlocks(document: LodariqDocument): Map<string, unknown> {
  const entries = new Map<string, unknown>();
  for (const variant of document.localization?.variants ?? []) {
    for (const block of variant.blocks) entries.set(`${variant.locale}:${block.blockId}`, block);
  }
  return entries;
}

function targetOverrides(document: LodariqDocument): Array<{
  locale: string;
  targetId: string;
  replacementTargetId: string;
}> {
  return (document.localization?.variants ?? []).flatMap((variant) =>
    (variant.targetOverrides ?? []).map((override) => ({ locale: variant.locale, ...override })),
  );
}

function indexStepBlocks(block: LodariqBlock, stepId: string, result: Map<string, string>): void {
  result.set(block.id, stepId);
  if ('children' in block && Array.isArray(block.children)) {
    for (const child of block.children) indexStepBlocks(child, stepId, result);
  }
}

function collectTargetIds(value: unknown, result: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectTargetIds(item, result);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'targetId' && typeof child === 'string') result.add(child);
    collectTargetIds(child, result);
  }
}

function json(value: unknown): string {
  return JSON.stringify(value) ?? '';
}
