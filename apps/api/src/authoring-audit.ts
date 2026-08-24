import type { ControlPlaneRepository, TenantAuditEventRecord } from '@lodariq/database';
import type { AuthoringAuditEvent } from '@lodariq/schema';

export async function listAuthoringAuditEvents(
  repository: ControlPlaneRepository,
  workspaceId: string,
  actorUserId: string,
): Promise<AuthoringAuditEvent[] | null> {
  const result = await repository.listTenantAuditEvents(workspaceId, actorUserId);
  if (result.status !== 'ok') return null;
  const userIds = new Set<string>();
  for (const event of result.value) {
    userIds.add(event.actorUserId);
    if (event.targetUserId) userIds.add(event.targetUserId);
  }
  const users = new Map(
    await Promise.all(
      [...userIds].map(
        async (userId) => [userId, await repository.getIdentityUser(userId)] as const,
      ),
    ),
  );
  return [...result.value]
    .sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id),
    )
    .map((event) => enrichAuditEvent(event, users));
}

export function authoringAuditCsv(events: readonly AuthoringAuditEvent[]): string {
  const rows: readonly (readonly unknown[])[] = [
    [
      'occurred_at',
      'event_type',
      'actor_user_id',
      'actor_name',
      'target_user_id',
      'target_name',
      'invitation_id',
      'previous_role',
      'next_role',
      'environment_id',
      'resource_id',
      'event_id',
    ],
    ...events.map((event) => [
      event.occurredAt,
      event.eventType,
      event.actorUserId,
      event.actorName,
      event.targetUserId,
      event.targetName,
      event.invitationId,
      event.previousRole,
      event.nextRole,
      event.environmentId,
      event.resourceId,
      event.id,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function enrichAuditEvent(
  event: TenantAuditEventRecord,
  users: ReadonlyMap<string, Awaited<ReturnType<ControlPlaneRepository['getIdentityUser']>>>,
): AuthoringAuditEvent {
  return {
    ...event,
    actorName: users.get(event.actorUserId)?.name ?? null,
    targetName: event.targetUserId ? (users.get(event.targetUserId)?.name ?? null) : null,
  };
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\t\r ]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
