import type { LodariqDocument } from '@lodariq/schema';

export interface AuthoringDraftCheckpoint {
  id: string;
  name: string;
  createdAt: string;
  document: LodariqDocument;
}

export interface AuthoringDraftCheckpointComparison {
  changedBlocks: number;
  changedTargets: number;
  documentSettingsChanged: boolean;
}

/** Draft-only named snapshots. They never carry or mutate environment pointers. */
export class AuthoringDraftCheckpointStore {
  private readonly checkpoints = new Map<string, AuthoringDraftCheckpoint>();

  save(name: string, document: LodariqDocument, now = new Date()): AuthoringDraftCheckpoint {
    const boundedName = name.trim().slice(0, 80);
    if (!boundedName) throw new Error('Checkpoint name is required');
    const createdAt = now.toISOString();
    const id = `checkpoint-${hash(`${boundedName}:${createdAt}:${document.id}`)}`;
    const checkpoint = { id, name: boundedName, createdAt, document: structuredClone(document) };
    this.checkpoints.set(id, checkpoint);
    return structuredClone(checkpoint);
  }

  list(): readonly AuthoringDraftCheckpoint[] {
    return [...this.checkpoints.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((checkpoint) => structuredClone(checkpoint));
  }

  restore(id: string): LodariqDocument | null {
    const checkpoint = this.checkpoints.get(id);
    return checkpoint ? structuredClone(checkpoint.document) : null;
  }

  compare(id: string, document: LodariqDocument): AuthoringDraftCheckpointComparison | null {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint || checkpoint.document.id !== document.id) return null;
    return compareDraftDocuments(checkpoint.document, document);
  }

  delete(id: string): boolean {
    return this.checkpoints.delete(id);
  }
}

export function compareDraftDocuments(
  checkpoint: LodariqDocument,
  current: LodariqDocument,
): AuthoringDraftCheckpointComparison {
  return {
    changedBlocks: changedEntries(checkpoint.blocks, current.blocks),
    changedTargets: changedEntries(checkpoint.targets, current.targets),
    documentSettingsChanged:
      documentSettingsFingerprint(checkpoint) !== documentSettingsFingerprint(current),
  };
}

function changedEntries(
  before: readonly { id: string }[],
  after: readonly { id: string }[],
): number {
  const beforeById = new Map(before.map((entry) => [entry.id, JSON.stringify(entry)]));
  const afterById = new Map(after.map((entry) => [entry.id, JSON.stringify(entry)]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  return [...ids].filter((id) => beforeById.get(id) !== afterById.get(id)).length;
}

function documentSettingsFingerprint(document: LodariqDocument): string {
  return JSON.stringify({
    title: document.title,
    trigger: document.trigger,
    audience: document.audience,
    appearance: document.appearance,
    completion: document.completion,
    localization: document.localization,
  });
}

function hash(value: string): string {
  let result = 2_166_136_261;
  for (const byte of new TextEncoder().encode(value)) {
    result ^= byte;
    result = Math.imul(result, 16_777_619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}
