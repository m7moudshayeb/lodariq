import type { GovernanceChangeEvent } from '@lodariq/schema/governance-change-history';

export function governanceChangeHistoryCsv(events: readonly GovernanceChangeEvent[]): string {
  const rows: readonly (readonly unknown[])[] = [
    [
      'occurred_at',
      'category',
      'action',
      'actor_user_id',
      'document_id',
      'environment_id',
      'resource_id',
      'details_json',
      'event_id',
      'schema_version',
    ],
    ...events.map((event) => [
      event.occurredAt,
      event.category,
      event.action,
      event.actorUserId,
      event.documentId,
      event.environmentId,
      event.resourceId,
      JSON.stringify(event.details),
      event.id,
      event.schemaVersion,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\t\r ]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
