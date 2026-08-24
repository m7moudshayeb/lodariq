import { canonicalJson, sha256Hex } from '@lodariq/compiler';
import type { ControlPlaneRepository } from '@lodariq/database';
import {
  ChangeAwareCopySuggestion,
  ChangeAwareCopySuggestionAuditEvent,
  createCopySuggestionFromDrift,
  validate,
  type ChangeAwareCopySuggestion as ChangeAwareCopySuggestionType,
  type ChangeAwareCopySuggestionAuditEvent as ChangeAwareCopySuggestionAuditEventType,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';

export class AuthoringCopySuggestionError extends Error {
  constructor(
    readonly code: 'document_version_not_found' | 'copy_suggestion_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'AuthoringCopySuggestionError';
  }
}

/** Persists bounded copy patches and separate append-only creator decisions. */
export class AuthoringCopySuggestions {
  constructor(private readonly repository: ControlPlaneRepository) {}

  async create(input: {
    workspaceId: string;
    environmentId: string;
    documentId: string;
    actorUserId: string;
    operationId: string;
    beforeVersionId: string;
    afterVersionId: string;
  }): Promise<ChangeAwareCopySuggestionType[]> {
    const [before, after] = await Promise.all([
      this.repository.getDocumentVersion(
        input.workspaceId,
        input.documentId,
        input.beforeVersionId,
      ),
      this.repository.getDocumentVersion(input.workspaceId, input.documentId, input.afterVersionId),
    ]);
    if (!before || !after) {
      throw new AuthoringCopySuggestionError(
        'document_version_not_found',
        'One or both document versions are unavailable',
      );
    }
    const runHash = await sha256Hex(
      canonicalJson({
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        beforeVersionId: before.id,
        afterVersionId: after.id,
      }),
    );
    const driftRunId = `copyrun_${runHash.slice(0, 32)}`;
    const checkId = `copycheck_${runHash.slice(0, 32)}`;
    const createdAt = new Date().toISOString();
    const proposals = await boundedSuggestions({
      before: before.canonical,
      after: after.canonical,
      driftRunId,
      checkId,
      createdAt,
    });
    for (const suggestion of proposals) {
      if (await this.repository.getAuthoringCopyRecord(input.workspaceId, suggestion.id)) {
        continue;
      }
      await this.repository.createAuthoringCopyRecord({
        record: {
          id: suggestion.id,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          kind: 'suggestion',
          payload: suggestion as unknown as Record<string, unknown>,
          createdByUserId: input.actorUserId,
          createdAt,
        },
      });
    }
    return this.list(input.workspaceId, input.documentId);
  }

  async list(workspaceId: string, documentId: string): Promise<ChangeAwareCopySuggestionType[]> {
    const [records, events] = await Promise.all([
      this.repository.listAuthoringCopyRecords(workspaceId, documentId, 'suggestion'),
      this.repository.listAuthoringCopyRecords(workspaceId, documentId, 'decision'),
    ]);
    const latestEvent = new Map<string, ChangeAwareCopySuggestionAuditEventType>();
    for (const record of [...events].reverse()) {
      const checked = validate(ChangeAwareCopySuggestionAuditEvent, record.payload);
      if (checked.valid) latestEvent.set(checked.value.suggestionId, checked.value);
    }
    return records
      .map((record) => validate(ChangeAwareCopySuggestion, record.payload))
      .filter((checked) => checked.valid)
      .map((checked) => {
        const suggestion = checked.value;
        const event = latestEvent.get(suggestion.id);
        if (!event) return suggestion;
        return {
          ...suggestion,
          status: event.decision,
          ...(event.decision === 'applied' ? { appliedAt: event.occurredAt } : {}),
        };
      })
      .slice(0, 500);
  }

  async decide(input: {
    workspaceId: string;
    environmentId: string;
    documentId: string;
    actorUserId: string;
    operationId: string;
    suggestionId: string;
    decision: 'applied' | 'dismissed';
  }): Promise<ChangeAwareCopySuggestionType> {
    const suggestionRecord = await this.repository.getAuthoringCopyRecord(
      input.workspaceId,
      input.suggestionId,
    );
    const checked = suggestionRecord
      ? validate(ChangeAwareCopySuggestion, suggestionRecord.payload)
      : null;
    if (
      suggestionRecord?.kind !== 'suggestion' ||
      suggestionRecord.documentId !== input.documentId ||
      suggestionRecord.environmentId !== input.environmentId ||
      !checked?.valid
    ) {
      throw new AuthoringCopySuggestionError(
        'copy_suggestion_not_found',
        'Copy suggestion not found',
      );
    }
    const existing = (await this.list(input.workspaceId, input.documentId)).find(
      (suggestion) => suggestion.id === input.suggestionId,
    );
    if (existing && existing.status !== 'pending') return existing;

    const eventHash = await sha256Hex(
      canonicalJson({
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        operationId: input.operationId,
        suggestionId: input.suggestionId,
      }),
    );
    const occurredAt = new Date().toISOString();
    const event: ChangeAwareCopySuggestionAuditEventType = {
      schemaVersion: '1',
      id: `copyevt_${eventHash.slice(0, 32)}`,
      operationId: input.operationId,
      suggestionId: input.suggestionId,
      documentId: input.documentId,
      actorUserId: input.actorUserId,
      decision: input.decision,
      occurredAt,
    };
    if (!(await this.repository.getAuthoringCopyRecord(input.workspaceId, event.id))) {
      await this.repository.createAuthoringCopyRecord({
        record: {
          id: event.id,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          kind: 'decision',
          payload: event as unknown as Record<string, unknown>,
          createdByUserId: input.actorUserId,
          createdAt: occurredAt,
        },
      });
    }
    return {
      ...checked.value,
      status: input.decision,
      ...(input.decision === 'applied' ? { appliedAt: occurredAt } : {}),
    };
  }
}

async function boundedSuggestions(input: {
  before: LodariqDocument;
  after: LodariqDocument;
  driftRunId: string;
  checkId: string;
  createdAt: string;
}): Promise<ChangeAwareCopySuggestionType[]> {
  const beforeById = new Map(flattenBlocks(input.before.blocks).map((block) => [block.id, block]));
  const suggestions: ChangeAwareCopySuggestionType[] = [];
  for (const block of flattenBlocks(input.after.blocks)) {
    const previous = beforeById.get(block.id);
    if (!previous?.content?.trim() || typeof block.content !== 'string') continue;
    if (previous.content === block.content) continue;
    const idHash = await sha256Hex(
      canonicalJson({ driftRunId: input.driftRunId, blockId: block.id, path: 'content' }),
    );
    suggestions.push(
      createCopySuggestionFromDrift({
        id: `copy_${idHash.slice(0, 32)}`,
        driftRunId: input.driftRunId,
        checkId: input.checkId,
        documentId: input.after.id,
        blockId: block.id,
        path: `document.blocks.${block.id}.content`,
        before: previous.content,
        after: block.content,
        confidence: 100,
        createdAt: input.createdAt,
      }),
    );
    if (suggestions.length === 50) break;
  }
  return suggestions;
}

function flattenBlocks(blocks: readonly LodariqBlock[]): LodariqBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}
