import type { LodariqDocument, PreviewPatchOperation } from '@lodariq/schema';

export const AUTHORING_TRANSACTION_COALESCE_WINDOW_MS = 750;

export type AuthoringTransactionScope =
  'appearance' | 'content' | 'structure' | 'target' | 'behavior';

export interface AuthoringDocumentTransaction {
  transactionId: string;
  baseRevision: number;
  revision: number;
  scope: AuthoringTransactionScope;
  coalescingKey?: string;
  operations: PreviewPatchOperation[];
}

export interface StageAuthoringTransactionInput {
  document: LodariqDocument;
  scope: AuthoringTransactionScope;
  operations: PreviewPatchOperation[];
  reduce: (document: LodariqDocument) => LodariqDocument;
  coalescingKey?: string;
  now?: number;
}

export interface StagedAuthoringTransaction {
  document: LodariqDocument;
  transaction: AuthoringDocumentTransaction;
  /** Present once for a new gesture, so undo records one coherent snapshot. */
  undoDocument?: LodariqDocument;
  coalesced: boolean;
}

export type AuthoringTransactionSaveState =
  | { state: 'saved'; revision: number }
  | { state: 'saving'; revision: number }
  | { state: 'retry'; revision: number }
  | { state: 'conflict'; revision: number };

interface OpenAuthoringTransaction extends AuthoringDocumentTransaction {
  lastUpdatedAt: number;
}

/**
 * Authoring-only revision and gesture coordinator. The caller supplies typed
 * reducers, while this class owns transaction grouping, last-operation
 * coalescing, optimistic revision order, and stale acknowledgement handling.
 */
export class DocumentTransactionCoordinator {
  private revision = 0;
  private persistedRevision = 0;
  private openTransaction: OpenAuthoringTransaction | null = null;
  private optimisticDocument: LodariqDocument;
  private saveStateValue: AuthoringTransactionSaveState = { state: 'saved', revision: 0 };

  constructor(
    initialDocument: LodariqDocument,
    private readonly createTransactionId: () => string = defaultTransactionId,
    private readonly coalesceWindowMs = AUTHORING_TRANSACTION_COALESCE_WINDOW_MS,
  ) {
    this.optimisticDocument = structuredClone(initialDocument);
  }

  get currentRevision(): number {
    return this.revision;
  }

  get document(): LodariqDocument {
    return structuredClone(this.optimisticDocument);
  }

  get saveState(): AuthoringTransactionSaveState {
    return { ...this.saveStateValue };
  }

  stage(input: StageAuthoringTransactionInput): StagedAuthoringTransaction {
    const now = input.now ?? Date.now();
    const canCoalesce = this.canCoalesce(input.scope, input.coalescingKey, now);
    const undoDocument = canCoalesce ? undefined : structuredClone(input.document);
    const nextDocument = input.reduce(structuredClone(input.document));
    const revision = this.revision + 1;
    this.revision = revision;

    const operations = canCoalesce
      ? coalescePreviewOperations(this.openTransaction?.operations ?? [], input.operations)
      : structuredClone(input.operations);
    const transaction: OpenAuthoringTransaction = {
      transactionId: canCoalesce ? this.openTransaction!.transactionId : this.createTransactionId(),
      baseRevision: canCoalesce ? this.openTransaction!.baseRevision : revision - 1,
      revision,
      scope: input.scope,
      ...(input.coalescingKey ? { coalescingKey: input.coalescingKey } : {}),
      operations,
      lastUpdatedAt: now,
    };
    this.openTransaction = transaction;
    this.optimisticDocument = structuredClone(nextDocument);
    this.saveStateValue = { state: 'saving', revision };
    return {
      document: nextDocument,
      transaction: publicTransaction(transaction),
      ...(undoDocument ? { undoDocument } : {}),
      coalesced: canCoalesce,
    };
  }

  /** Adopt normalization of the same optimistic revision without closing it. */
  adoptOptimisticDocument(document: LodariqDocument): void {
    this.optimisticDocument = structuredClone(document);
  }

  /** A semantic boundary ends the current undo/coalescing gesture. */
  flush(): AuthoringDocumentTransaction | null {
    const transaction = this.openTransaction;
    this.openTransaction = null;
    return transaction ? publicTransaction(transaction) : null;
  }

  markPersisted(revision: number): void {
    if (!Number.isInteger(revision) || revision < 0 || revision > this.revision) return;
    this.persistedRevision = Math.max(this.persistedRevision, revision);
    if (this.persistedRevision === this.revision) {
      this.saveStateValue = { state: 'saved', revision: this.revision };
    }
  }

  markRetry(revision: number): void {
    if (revision !== this.revision) return;
    this.saveStateValue = { state: 'retry', revision };
  }

  /** Stale acknowledgements never replace the optimistic document. */
  acknowledge(revision: number): 'applied' | 'stale' | 'future' {
    if (revision > this.revision) return 'future';
    this.markPersisted(revision);
    return revision === this.revision ? 'applied' : 'stale';
  }

  markConflict(authoritativeDocument: LodariqDocument, authoritativeRevision: number): void {
    this.flush();
    this.optimisticDocument = structuredClone(authoritativeDocument);
    this.revision = Math.max(this.revision, authoritativeRevision);
    this.persistedRevision = authoritativeRevision;
    this.saveStateValue = { state: 'conflict', revision: this.revision };
  }

  private canCoalesce(
    scope: AuthoringTransactionScope,
    coalescingKey: string | undefined,
    now: number,
  ): boolean {
    const open = this.openTransaction;
    return Boolean(
      open &&
      coalescingKey &&
      open.scope === scope &&
      open.coalescingKey === coalescingKey &&
      now - open.lastUpdatedAt <= this.coalesceWindowMs,
    );
  }
}

function publicTransaction(transaction: OpenAuthoringTransaction): AuthoringDocumentTransaction {
  return {
    transactionId: transaction.transactionId,
    baseRevision: transaction.baseRevision,
    revision: transaction.revision,
    scope: transaction.scope,
    ...(transaction.coalescingKey ? { coalescingKey: transaction.coalescingKey } : {}),
    operations: structuredClone(transaction.operations),
  };
}

function coalescePreviewOperations(
  current: PreviewPatchOperation[],
  incoming: PreviewPatchOperation[],
): PreviewPatchOperation[] {
  const next = structuredClone(current);
  for (const operation of incoming) {
    const key = coalescingOperationKey(operation);
    const existingIndex = next.findIndex((candidate) => coalescingOperationKey(candidate) === key);
    if (existingIndex >= 0) next.splice(existingIndex, 1);
    next.push(structuredClone(operation));
  }
  return next;
}

function coalescingOperationKey(operation: PreviewPatchOperation): string {
  if ('targetId' in operation && typeof operation.targetId === 'string') {
    return `${operation.op}:${operation.targetId}`;
  }
  return operation.op;
}

function defaultTransactionId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `authoring_txn_${random}`;
}
