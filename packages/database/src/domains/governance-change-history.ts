import {
  GOVERNANCE_CHANGE_HISTORY_VERSION,
  type GovernanceChangeCategory,
  type GovernanceChangeEvent,
  type GovernanceChangeHistoryQuery,
} from '@lodariq/schema/governance-change-history';

export interface ListGovernanceChangeHistoryInput {
  workspaceId: string;
  query: GovernanceChangeHistoryQuery;
}

export interface GovernanceChangeHistoryRepository {
  listGovernanceChangeHistory(
    input: ListGovernanceChangeHistoryInput,
  ): Promise<GovernanceChangeEvent[]>;
}

export function governanceChangeEvent(input: {
  source: string;
  sourceId: string;
  category: GovernanceChangeCategory;
  action: string;
  actorUserId?: string | null;
  documentId?: string | null;
  environmentId?: string | null;
  resourceId: string;
  occurredAt: string;
  details?: GovernanceChangeEvent['details'];
}): GovernanceChangeEvent {
  return {
    schemaVersion: GOVERNANCE_CHANGE_HISTORY_VERSION,
    id: `change:${input.source}:${input.sourceId}`,
    category: input.category,
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    documentId: input.documentId ?? null,
    environmentId: input.environmentId ?? null,
    resourceId: input.resourceId,
    occurredAt: input.occurredAt,
    details: normalizeGovernanceChangeDetails(input.details),
  };
}

function normalizeGovernanceChangeDetails(
  details: GovernanceChangeEvent['details'] | undefined,
): GovernanceChangeEvent['details'] {
  return Object.fromEntries(
    Object.entries(details ?? {}).filter((entry) => entry[1] !== undefined),
  ) as GovernanceChangeEvent['details'];
}

export function applyGovernanceChangeHistoryQuery(
  events: readonly GovernanceChangeEvent[],
  query: GovernanceChangeHistoryQuery,
): GovernanceChangeEvent[] {
  const from = query.from ? Date.parse(query.from) : null;
  const to = query.to ? Date.parse(query.to) : null;
  if (from !== null && to !== null && from > to) {
    throw new Error('Governance change history range is invalid');
  }
  return events
    .filter((event) => {
      if (query.category && event.category !== query.category) return false;
      if (query.documentId && event.documentId !== query.documentId) return false;
      const occurredAt = Date.parse(event.occurredAt);
      if (from !== null && occurredAt < from) return false;
      return to === null || occurredAt <= to;
    })
    .sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id),
    )
    .slice(0, query.limit ?? 1_000)
    .map((event) => structuredClone(event));
}
