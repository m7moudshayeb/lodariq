import {
  createInMemoryControlPlaneRepository,
  type ControlPlaneRepository,
  type InMemoryControlPlaneSeed,
  type WorkspaceSubscriptionRecord,
} from '@lodariq/database';
import { COMMERCIAL_PLAN_VERSION } from '@lodariq/schema';

const PERIOD_START = '2026-08-01T00:00:00.000Z';
const PERIOD_END = '2026-09-01T00:00:00.000Z';

export function createGrandfatheredInMemoryControlPlaneRepository(
  seed: InMemoryControlPlaneSeed = {},
  defaultWorkspaceIds: readonly string[] = ['wk_a'],
): ControlPlaneRepository {
  const workspaceIds = new Set(defaultWorkspaceIds);
  for (const workspace of seed.workspaces ?? []) workspaceIds.add(workspace.id);
  for (const membership of seed.workspaceMemberships ?? []) workspaceIds.add(membership.workspaceId);
  for (const environment of seed.environments ?? []) workspaceIds.add(environment.workspaceId);
  for (const document of seed.documents ?? []) workspaceIds.add(document.workspaceId);
  for (const subscription of seed.workspaceSubscriptions ?? []) {
    workspaceIds.add(subscription.workspaceId);
  }
  const subscriptions = new Map(
    (seed.workspaceSubscriptions ?? []).map((subscription) => [
      subscription.workspaceId,
      subscription,
    ]),
  );

  return createInMemoryControlPlaneRepository({
    ...seed,
    workspaceSubscriptions: [...workspaceIds].map(
      (workspaceId) => subscriptions.get(workspaceId) ?? businessSubscription(workspaceId),
    ),
  });
}

export function businessSubscription(workspaceId: string): WorkspaceSubscriptionRecord {
  return {
    workspaceId,
    planId: 'business',
    planVersion: COMMERCIAL_PLAN_VERSION,
    status: 'active',
    entitlementOverrides: {},
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
    revision: 1,
    createdAt: PERIOD_START,
    updatedAt: PERIOD_START,
  };
}
