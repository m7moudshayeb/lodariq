import { and, asc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { isSafeWebhookEndpointUrl, type WebhookEventType } from '@lodariq/schema';
import type {
  CompleteWebhookDeliveryInput,
  CreateWebhookEndpointInput,
  DisableWebhookEndpointInput,
  EnqueueWebhookEventInput,
  FailWebhookDeliveryInput,
  GovernanceMutationResult,
  LeasedWebhookDelivery,
  ReplayWebhookDeliveryInput,
  WebhookDeliveryRecord,
  WebhookEndpointRecord,
  WebhookEventRecord,
} from '../domains/governance';
import type { TenantReadResult } from '../domains/tenant-administration';
import { runWithWebhookWorkerScope } from '../scoped-transaction';
import {
  governanceAuditEvents,
  webhookDeliveries,
  webhookEndpoints,
  webhookEvents,
} from '../schema';
import { WEBHOOK_DELIVERY_PAGE_LIMIT, WEBHOOK_DELIVERY_PAGE_MAX } from '../domains/governance';
import { toIsoString } from './helpers';
import { isUniqueConstraintViolation } from './helpers/theme';
import {
  canManageGovernance,
  governanceMembershipRole,
  DrizzleRepositoryGovernance,
} from './governance';

export class DrizzleRepositoryWebhooks extends DrizzleRepositoryGovernance {
  async listWebhookEndpoints(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<WebhookEndpointRecord[]>> {
    return this.actorScoped(workspaceId, actorUserId, async (tx) => {
      if (!canManageGovernance(await governanceMembershipRole(tx, workspaceId, actorUserId))) {
        return { status: 'forbidden' };
      }
      const rows = await tx
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.workspaceId, workspaceId))
        .orderBy(webhookEndpoints.createdAt, webhookEndpoints.id);
      return { status: 'ok', value: rows.map(endpointRecord) };
    });
  }

  async createWebhookEndpoint(
    input: CreateWebhookEndpointInput,
  ): Promise<GovernanceMutationResult<WebhookEndpointRecord>> {
    if (!isSafeWebhookEndpointUrl(input.endpoint.url)) return { status: 'invalid_capabilities' };
    try {
      return await this.actorScoped(input.endpoint.workspaceId, input.actorUserId, async (tx) => {
        if (
          !canManageGovernance(
            await governanceMembershipRole(tx, input.endpoint.workspaceId, input.actorUserId),
          )
        ) {
          return { status: 'forbidden' };
        }
        const [created] = await tx
          .insert(webhookEndpoints)
          .values({
            id: input.endpoint.id,
            workspaceId: input.endpoint.workspaceId,
            url: input.endpoint.url,
            eventTypes: [...input.endpoint.eventTypes],
            secretVersion: input.endpoint.secretVersion,
            enabled: input.endpoint.enabled,
            createdByUserId: input.endpoint.createdByUserId,
            createdAt: new Date(input.endpoint.createdAt),
            updatedAt: new Date(input.endpoint.updatedAt),
          })
          .returning();
        if (!created) return { status: 'conflict' };
        await appendWebhookAudit(tx, input.auditEventId, {
          workspaceId: input.endpoint.workspaceId,
          actorUserId: input.actorUserId,
          eventType: 'webhook_endpoint_created',
          resourceId: input.endpoint.id,
          occurredAt: input.endpoint.createdAt,
        });
        return { status: 'completed', value: endpointRecord(created) };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async disableWebhookEndpoint(
    input: DisableWebhookEndpointInput,
  ): Promise<GovernanceMutationResult<WebhookEndpointRecord>> {
    return this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
      if (
        !canManageGovernance(
          await governanceMembershipRole(tx, input.workspaceId, input.actorUserId),
        )
      ) {
        return { status: 'forbidden' };
      }
      const [updated] = await tx
        .update(webhookEndpoints)
        .set({ enabled: false, updatedAt: new Date(input.occurredAt) })
        .where(
          and(
            eq(webhookEndpoints.workspaceId, input.workspaceId),
            eq(webhookEndpoints.id, input.endpointId),
          ),
        )
        .returning();
      if (!updated) return { status: 'not_found' };
      await tx
        .update(webhookDeliveries)
        .set({
          status: 'dead',
          lastErrorCode: 'endpoint_disabled',
          updatedAt: new Date(input.occurredAt),
        })
        .where(
          and(
            eq(webhookDeliveries.workspaceId, input.workspaceId),
            eq(webhookDeliveries.endpointId, input.endpointId),
            eq(webhookDeliveries.status, 'pending'),
          ),
        );
      await appendWebhookAudit(tx, input.auditEventId, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        eventType: 'webhook_endpoint_disabled',
        resourceId: input.endpointId,
        occurredAt: input.occurredAt,
      });
      return { status: 'completed', value: endpointRecord(updated) };
    });
  }

  async pruneWebhookDeliveries(before: string, limit: number): Promise<number> {
    const cutoff = new Date(before);
    if (!Number.isFinite(cutoff.getTime())) throw new Error('prune cutoff is invalid');
    const bounded = Math.max(1, Math.min(limit, 5_000));
    return runWithWebhookWorkerScope(this.database, async (tx) => {
      /*
       * Bounded per call and driven by the worker's own tick, so a first sweep
       * of a long-neglected table is many small deletes rather than one that
       * locks the table and blocks delivery.
       */
      const doomed = await tx
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .where(
          and(
            inArray(webhookDeliveries.status, ['succeeded', 'dead']),
            lte(webhookDeliveries.updatedAt, cutoff),
          ),
        )
        .limit(bounded);
      if (doomed.length === 0) return 0;
      await tx.delete(webhookDeliveries).where(
        inArray(
          webhookDeliveries.id,
          doomed.map((row) => row.id),
        ),
      );
      return doomed.length;
    });
  }

  async enqueueWebhookEvent(input: EnqueueWebhookEventInput): Promise<WebhookDeliveryRecord[]> {
    return this.scoped(input.event.workspaceId, async (tx) => {
      const [created] = await tx
        .insert(webhookEvents)
        .values({
          id: input.event.id,
          workspaceId: input.event.workspaceId,
          schemaVersion: input.event.schemaVersion,
          eventType: input.event.type,
          occurredAt: new Date(input.event.occurredAt),
          payload: structuredClone(input.event.data),
          createdAt: new Date(input.event.occurredAt),
        })
        .onConflictDoNothing({ target: webhookEvents.id })
        .returning();
      if (!created) {
        const existing = await tx
          .select()
          .from(webhookDeliveries)
          .where(
            and(
              eq(webhookDeliveries.workspaceId, input.event.workspaceId),
              eq(webhookDeliveries.eventId, input.event.id),
            ),
          );
        return existing.map(deliveryRecord);
      }
      const endpoints = await tx
        .select()
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.workspaceId, input.event.workspaceId),
            eq(webhookEndpoints.enabled, true),
            sql`${webhookEndpoints.eventTypes} ? ${input.event.type}`,
          ),
        );
      if (endpoints.length === 0) return [];
      const rows = await tx
        .insert(webhookDeliveries)
        .values(
          endpoints.map((endpoint) => ({
            id: input.deliveryIdForEndpoint(endpoint.id),
            workspaceId: input.event.workspaceId,
            endpointId: endpoint.id,
            eventId: input.event.id,
            status: 'pending',
            attempts: 0,
            availableAt: new Date(input.event.occurredAt),
            leaseOwner: null,
            leasedUntil: null,
            lastResponseStatus: null,
            lastErrorCode: null,
            deliveredAt: null,
            createdAt: new Date(input.event.occurredAt),
            updatedAt: new Date(input.event.occurredAt),
          })),
        )
        .returning();
      return rows.map(deliveryRecord);
    });
  }

  async leaseWebhookDeliveries(
    workerId: string,
    nowValue: string,
    leaseExpiresAtValue: string,
    limit: number,
  ): Promise<LeasedWebhookDelivery[]> {
    const now = new Date(nowValue);
    const leaseExpiresAt = new Date(leaseExpiresAtValue);
    return runWithWebhookWorkerScope(this.database, async (tx) => {
      const rows = await tx
        .select()
        .from(webhookDeliveries)
        .where(
          and(
            lte(webhookDeliveries.availableAt, now),
            or(
              eq(webhookDeliveries.status, 'pending'),
              and(
                eq(webhookDeliveries.status, 'delivering'),
                lte(webhookDeliveries.leasedUntil, now),
              ),
            ),
          ),
        )
        .orderBy(
          asc(webhookDeliveries.availableAt),
          asc(webhookDeliveries.createdAt),
          asc(webhookDeliveries.id),
        )
        .limit(Math.max(1, Math.min(limit, 100)))
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];
      /*
       * Batched. This used to issue three queries per row — an endpoint select,
       * an event select and an update — for up to a hundred rows, all while
       * holding `for update` locks on every one of them. The lock window was
       * three hundred round trips wide, and every other worker waited it out.
       */
      const [endpoints, events] = await Promise.all([
        tx
          .select()
          .from(webhookEndpoints)
          .where(inArray(webhookEndpoints.id, [...new Set(rows.map((row) => row.endpointId))])),
        tx
          .select()
          .from(webhookEvents)
          .where(inArray(webhookEvents.id, [...new Set(rows.map((row) => row.eventId))])),
      ]);
      const endpointById = new Map(
        endpoints
          .filter((endpoint) => endpoint.enabled)
          .map((endpoint) => [`${endpoint.workspaceId}:${endpoint.id}`, endpoint]),
      );
      const eventById = new Map(events.map((event) => [`${event.workspaceId}:${event.id}`, event]));
      const routable: typeof rows = [];
      const noEndpoint: typeof rows = [];
      const noEvent: typeof rows = [];
      for (const row of rows) {
        const endpoint = endpointById.get(`${row.workspaceId}:${row.endpointId}`);
        const event = eventById.get(`${row.workspaceId}:${row.eventId}`);
        if (!endpoint) noEndpoint.push(row);
        else if (!event) noEvent.push(row);
        else routable.push(row);
      }

      /*
       * Nothing left to deliver to, so the row is finished rather than skipped.
       * Skipping made it a poison row: disabling an endpoint only marks its
       * *pending* deliveries dead, so one already `delivering` came back to
       * pending, found no enabled endpoint on every subsequent lease, and was
       * passed over forever — while still sorting first by `available_at` and
       * consuming a slot in every batch.
       */
      for (const [doomed, errorCode] of [
        [noEndpoint, 'endpoint_unavailable'],
        [noEvent, 'event_unavailable'],
      ] as const) {
        if (doomed.length === 0) continue;
        await tx
          .update(webhookDeliveries)
          .set({
            status: 'dead',
            leaseOwner: null,
            leasedUntil: null,
            lastErrorCode: errorCode,
            updatedAt: now,
          })
          .where(
            inArray(
              webhookDeliveries.id,
              doomed.map((row) => row.id),
            ),
          );
      }
      if (routable.length === 0) return [];

      const leasedRows = await tx
        .update(webhookDeliveries)
        .set({
          status: 'delivering',
          attempts: sql`least(8, ${webhookDeliveries.attempts} + 1)`,
          leaseOwner: workerId,
          leasedUntil: leaseExpiresAt,
          updatedAt: now,
        })
        .where(
          inArray(
            webhookDeliveries.id,
            routable.map((row) => row.id),
          ),
        )
        .returning();

      const result: LeasedWebhookDelivery[] = [];
      for (const leased of leasedRows) {
        const endpoint = endpointById.get(`${leased.workspaceId}:${leased.endpointId}`);
        const event = eventById.get(`${leased.workspaceId}:${leased.eventId}`);
        if (!endpoint || !event) continue;
        result.push({
          delivery: deliveryRecord(leased),
          endpoint: endpointRecord(endpoint),
          event: eventRecord(event),
          leaseOwner: workerId,
        });
      }
      return result;
    });
  }

  async completeWebhookDelivery(input: CompleteWebhookDeliveryInput): Promise<boolean> {
    return runWithWebhookWorkerScope(this.database, async (tx) => {
      const [updated] = await tx
        .update(webhookDeliveries)
        .set({
          status: 'succeeded',
          lastResponseStatus: input.responseStatus,
          lastErrorCode: null,
          deliveredAt: new Date(input.completedAt),
          leaseOwner: null,
          leasedUntil: null,
          updatedAt: new Date(input.completedAt),
        })
        .where(
          and(
            eq(webhookDeliveries.workspaceId, input.workspaceId),
            eq(webhookDeliveries.id, input.deliveryId),
            eq(webhookDeliveries.status, 'delivering'),
            eq(webhookDeliveries.leaseOwner, input.leaseOwner),
          ),
        )
        .returning({ id: webhookDeliveries.id });
      return Boolean(updated);
    });
  }

  async failWebhookDelivery(
    input: FailWebhookDeliveryInput,
  ): Promise<WebhookDeliveryRecord | null> {
    return runWithWebhookWorkerScope(this.database, async (tx) => {
      const [current] = await tx
        .select()
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.workspaceId, input.workspaceId),
            eq(webhookDeliveries.id, input.deliveryId),
            eq(webhookDeliveries.status, 'delivering'),
            eq(webhookDeliveries.leaseOwner, input.leaseOwner),
          ),
        )
        .limit(1)
        .for('update');
      if (!current) return null;
      const dead = current.attempts >= 8;
      const [updated] = await tx
        .update(webhookDeliveries)
        .set({
          status: dead ? 'dead' : 'pending',
          availableAt: dead ? current.availableAt : new Date(input.nextAvailableAt),
          lastResponseStatus: input.responseStatus,
          lastErrorCode: input.errorCode,
          leaseOwner: null,
          leasedUntil: null,
          updatedAt: new Date(input.failedAt),
        })
        .where(eq(webhookDeliveries.id, current.id))
        .returning();
      return updated ? deliveryRecord(updated) : null;
    });
  }

  async listWebhookDeliveries(
    workspaceId: string,
    actorUserId: string,
    page?: { limit?: number; before?: string },
  ): Promise<TenantReadResult<WebhookDeliveryRecord[]>> {
    return this.actorScoped(workspaceId, actorUserId, async (tx) => {
      if (!canManageGovernance(await governanceMembershipRole(tx, workspaceId, actorUserId))) {
        return { status: 'forbidden' };
      }
      const limit = Math.max(
        1,
        Math.min(page?.limit ?? WEBHOOK_DELIVERY_PAGE_LIMIT, WEBHOOK_DELIVERY_PAGE_MAX),
      );
      // Keyset on the same (created_at desc, id desc) the index orders by, so
      // page N costs what page 1 does.
      const before = page?.before?.trim();
      const rows = await tx
        .select()
        .from(webhookDeliveries)
        .where(
          before
            ? and(eq(webhookDeliveries.workspaceId, workspaceId), lt(webhookDeliveries.id, before))
            : eq(webhookDeliveries.workspaceId, workspaceId),
        )
        .orderBy(sql`${webhookDeliveries.createdAt} desc`, sql`${webhookDeliveries.id} desc`)
        .limit(limit);
      return { status: 'ok', value: rows.map(deliveryRecord) };
    });
  }

  async replayWebhookDelivery(
    input: ReplayWebhookDeliveryInput,
  ): Promise<GovernanceMutationResult> {
    return this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
      if (
        !canManageGovernance(
          await governanceMembershipRole(tx, input.workspaceId, input.actorUserId),
        )
      ) {
        return { status: 'forbidden' };
      }
      const [updated] = await tx
        .update(webhookDeliveries)
        .set({
          status: 'pending',
          attempts: 0,
          availableAt: new Date(input.replayedAt),
          leaseOwner: null,
          leasedUntil: null,
          lastResponseStatus: null,
          lastErrorCode: null,
          deliveredAt: null,
          updatedAt: new Date(input.replayedAt),
        })
        .where(
          and(
            eq(webhookDeliveries.workspaceId, input.workspaceId),
            eq(webhookDeliveries.id, input.deliveryId),
            eq(webhookDeliveries.status, 'dead'),
          ),
        )
        .returning();
      if (!updated) return { status: 'conflict' };
      await appendWebhookAudit(tx, input.auditEventId, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        eventType: 'webhook_delivery_replayed',
        resourceId: input.deliveryId,
        occurredAt: input.replayedAt,
      });
      return { status: 'completed', value: undefined as never };
    });
  }
}

function endpointRecord(row: typeof webhookEndpoints.$inferSelect): WebhookEndpointRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    url: row.url,
    eventTypes: [...row.eventTypes],
    secretVersion: row.secretVersion,
    enabled: row.enabled,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function eventRecord(row: typeof webhookEvents.$inferSelect): WebhookEventRecord {
  return {
    schemaVersion: '1',
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.eventType as WebhookEventType,
    occurredAt: toIsoString(row.occurredAt),
    data: structuredClone(row.payload),
  };
}

function deliveryRecord(row: typeof webhookDeliveries.$inferSelect): WebhookDeliveryRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    endpointId: row.endpointId,
    eventId: row.eventId,
    status: row.status as WebhookDeliveryRecord['status'],
    attempts: row.attempts,
    availableAt: toIsoString(row.availableAt),
    lastResponseStatus: row.lastResponseStatus,
    lastErrorCode: row.lastErrorCode,
    deliveredAt: row.deliveredAt ? toIsoString(row.deliveredAt) : null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

async function appendWebhookAudit(
  tx: Parameters<typeof governanceMembershipRole>[0],
  id: string,
  input: {
    workspaceId: string;
    actorUserId: string;
    eventType:
      'webhook_endpoint_created' | 'webhook_endpoint_disabled' | 'webhook_delivery_replayed';
    resourceId: string;
    occurredAt: string;
  },
): Promise<void> {
  await tx.insert(governanceAuditEvents).values({
    id,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    targetUserId: null,
    environmentId: null,
    resourceId: input.resourceId,
    occurredAt: new Date(input.occurredAt),
  });
}
