import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import {
  COMMERCIAL_PLAN_VERSION,
  resolveCommercialEntitlements,
  type CommercialPlanId,
} from '@lodariq/schema';
import type { WorkspaceEntitlementSnapshotRecord } from '../domains/commercial-entitlements';
import type { LodariqDatabase } from '../neon';
import { effectiveEntitlementSnapshots, workspaceSubscriptions } from '../schema';
import type { LodariqTransaction } from './types';

export class DrizzleRepositoryState {
  constructor(protected readonly database: LodariqDatabase) {}

  protected async resolveWorkspaceEntitlements(
    tx: LodariqTransaction,
    workspaceId: string,
  ): Promise<WorkspaceEntitlementSnapshotRecord> {
    let [subscription] = await tx
      .select()
      .from(workspaceSubscriptions)
      .where(eq(workspaceSubscriptions.workspaceId, workspaceId))
      .limit(1)
      .for('update');

    if (!subscription) {
      const now = new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      [subscription] = await tx
        .insert(workspaceSubscriptions)
        .values({
          workspaceId,
          planId: 'free',
          planVersion: COMMERCIAL_PLAN_VERSION,
          status: 'active',
          entitlementOverrides: {},
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: workspaceSubscriptions.workspaceId })
        .returning();
      if (!subscription) {
        [subscription] = await tx
          .select()
          .from(workspaceSubscriptions)
          .where(eq(workspaceSubscriptions.workspaceId, workspaceId))
          .limit(1)
          .for('update');
      }
    }
    if (!subscription) throw new Error('Unable to resolve workspace subscription');

    const [existing] = await tx
      .select()
      .from(effectiveEntitlementSnapshots)
      .where(
        and(
          eq(effectiveEntitlementSnapshots.workspaceId, workspaceId),
          eq(effectiveEntitlementSnapshots.subscriptionRevision, subscription.revision),
        ),
      )
      .orderBy(desc(effectiveEntitlementSnapshots.effectiveFrom))
      .limit(1);
    if (existing) return entitlementSnapshotRecord(existing);

    const entitlements = resolveCommercialEntitlements(
      subscription.planId as CommercialPlanId,
      subscription.entitlementOverrides,
    );
    const now = new Date();
    const [created] = await tx
      .insert(effectiveEntitlementSnapshots)
      .values({
        id: `entsnap_${randomUUID()}`,
        workspaceId,
        subscriptionRevision: subscription.revision,
        planId: subscription.planId,
        planVersion: subscription.planVersion,
        entitlements,
        entitlementHash: entitlementHash(entitlements),
        reason: subscription.revision === 1 ? 'workspace_created' : 'plan_changed',
        changeActorId: 'system:repository',
        effectiveFrom: now,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [
          effectiveEntitlementSnapshots.workspaceId,
          effectiveEntitlementSnapshots.subscriptionRevision,
        ],
      })
      .returning();
    if (created) return entitlementSnapshotRecord(created);

    const [concurrent] = await tx
      .select()
      .from(effectiveEntitlementSnapshots)
      .where(
        and(
          eq(effectiveEntitlementSnapshots.workspaceId, workspaceId),
          eq(effectiveEntitlementSnapshots.subscriptionRevision, subscription.revision),
        ),
      )
      .limit(1);
    if (!concurrent) throw new Error('Unable to resolve effective entitlement snapshot');
    return entitlementSnapshotRecord(concurrent);
  }
}

export function entitlementHash(value: unknown): string {
  return `sha256-${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function entitlementSnapshotRecord(
  row: typeof effectiveEntitlementSnapshots.$inferSelect,
): WorkspaceEntitlementSnapshotRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    subscriptionRevision: row.subscriptionRevision,
    planId: row.planId,
    planVersion: row.planVersion,
    entitlements: structuredClone(row.entitlements),
    entitlementHash: row.entitlementHash,
    reason: row.reason as WorkspaceEntitlementSnapshotRecord['reason'],
    changeActorId: row.changeActorId,
    effectiveFrom: row.effectiveFrom.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
