import { createHash } from 'node:crypto';
import {
  copyWorkspaceTable,
  createNeonDatabase,
  tenantScopedTableNames,
  workspaceDataDigest,
  workspaceDataRowCount,
  type LodariqDatabase,
} from '@lodariq/database';
import type {
  DataResidencyProvider,
  DataResidencyProviderOperationInput,
  DataResidencyProviderOperationResult,
} from './data-residency';

const PROVIDER_ID = 'neon-r2';

/**
 * ADR 0031 gates APAC: a location hint is not a contractual boundary, so the
 * route stays unavailable until the object provider and deployment topology
 * give one. Opt in only when that is actually true.
 */
const GATED_ROUTE_KEYS = new Set(['primary-apac']);

export interface NeonResidencyRoute {
  /** Owner-capable connection string for that region's Neon project. */
  connectionString: string;
  /** Jurisdictioned R2 bucket for that region's customer objects. */
  objectBucket?: string;
}

export interface NeonR2DataResidencyProviderOptions {
  routes: Readonly<Record<string, NeonResidencyRoute>>;
  allowGatedRoutes?: boolean;
  /** Injected for tests; production opens one pool per route on first use. */
  connect?: (connectionString: string) => LodariqDatabase;
}

/**
 * Neon + R2 residency adapter (ADR 0031).
 *
 * Orchestration over Lodariq-owned regional resources — never a generic
 * copy-any-URL capability. Returns `undefined` unless at least two routes are
 * configured, because a migration needs somewhere to come from and go to.
 */
export function createNeonR2DataResidencyProviderFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DataResidencyProvider | undefined {
  const routes = readRoutes(environment);
  if (Object.keys(routes).length < 2) return undefined;
  return createNeonR2DataResidencyProvider({
    routes,
    allowGatedRoutes: environment.LODARIQ_RESIDENCY_ALLOW_APAC?.trim() === '1',
  });
}

export function createNeonR2DataResidencyProvider(
  options: NeonR2DataResidencyProviderOptions,
): DataResidencyProvider {
  const connect = options.connect ?? createNeonDatabase;
  const pools = new Map<string, LodariqDatabase>();

  const assertRouteAvailable = (routeKey: string): NeonResidencyRoute => {
    if (GATED_ROUTE_KEYS.has(routeKey) && !options.allowGatedRoutes) {
      throw new Error(`residency_route_not_available_${routeKey}`);
    }
    const route = options.routes[routeKey];
    if (!route) throw new Error(`residency_route_not_configured_${routeKey}`);
    return route;
  };

  const routeDatabase = (routeKey: string): LodariqDatabase => {
    const route = assertRouteAvailable(routeKey);
    const existing = pools.get(routeKey);
    if (existing) return existing;
    const created = connect(route.connectionString);
    pools.set(routeKey, created);
    return created;
  };

  /*
   * Both routes are checked before either is opened, so an unavailable target
   * never leaves a connection to the source hanging behind it.
   */
  const routePair = (
    input: DataResidencyProviderOperationInput,
  ): [LodariqDatabase, LodariqDatabase] => {
    assertRouteAvailable(input.sourceRouteKey);
    assertRouteAvailable(input.targetRouteKey);
    return [routeDatabase(input.sourceRouteKey), routeDatabase(input.targetRouteKey)];
  };

  return {
    id: PROVIDER_ID,

    async copy(
      input: DataResidencyProviderOperationInput,
    ): Promise<DataResidencyProviderOperationResult> {
      const [source, target] = routePair(input);
      const workspaceId = input.migration.workspaceId;

      let recordCount = 0;
      for (const table of tenantScopedTableNames) {
        recordCount += await copyWorkspaceTable(source, target, table, workspaceId);
      }
      const [sourceDigest, targetDigest] = await Promise.all([
        workspaceDataDigest(source, workspaceId),
        workspaceDataDigest(target, workspaceId),
      ]);
      return {
        providerOperationId: operationId('copy', input),
        sourceDigest,
        targetDigest,
        recordCount,
      };
    },

    async verify(
      input: DataResidencyProviderOperationInput,
    ): Promise<DataResidencyProviderOperationResult> {
      const [source, target] = routePair(input);
      const workspaceId = input.migration.workspaceId;
      const [sourceDigest, targetDigest, recordCount] = await Promise.all([
        workspaceDataDigest(source, workspaceId),
        workspaceDataDigest(target, workspaceId),
        workspaceDataRowCount(target, workspaceId),
      ]);
      return {
        providerOperationId: operationId('verify', input),
        sourceDigest,
        targetDigest,
        recordCount,
      };
    },

    async cutover(
      input: DataResidencyProviderOperationInput,
    ): Promise<DataResidencyProviderOperationResult> {
      const [source, target] = routePair(input);
      const workspaceId = input.migration.workspaceId;

      /*
       * A final pass before the pointer moves. The source stayed writable during
       * copy and verify, so anything written in that window is only here.
       */
      let recordCount = 0;
      for (const table of tenantScopedTableNames) {
        recordCount += await copyWorkspaceTable(source, target, table, workspaceId);
      }
      const [sourceDigest, targetDigest] = await Promise.all([
        workspaceDataDigest(source, workspaceId),
        workspaceDataDigest(target, workspaceId),
      ]);
      if (sourceDigest !== targetDigest) throw new Error('residency_cutover_digest_mismatch');
      return {
        providerOperationId: operationId('cutover', input),
        sourceDigest,
        targetDigest,
        recordCount,
      };
    },
  };
}

/** Operation ids are replayed by the worker, so they must be a pure function of the input. */
function operationId(phase: string, input: DataResidencyProviderOperationInput): string {
  const digest = createHash('sha256').update(`${phase}:${input.idempotencyKey}`).digest('hex');
  return `${PROVIDER_ID}:${phase}:${digest.slice(0, 32)}`;
}

/** `LODARIQ_RESIDENCY_ROUTE_<ROUTE_KEY>`, with the objects bucket alongside it. */
function readRoutes(environment: NodeJS.ProcessEnv): Record<string, NeonResidencyRoute> {
  const routes: Record<string, NeonResidencyRoute> = {};
  const configured = environment.LODARIQ_RESIDENCY_ROUTES?.trim();
  if (!configured) return routes;
  for (const entry of configured.split(',')) {
    const routeKey = entry.trim();
    if (!routeKey) continue;
    const suffix = routeKey.replace(/[^A-Za-z0-9]/gu, '_').toUpperCase();
    const connectionString = environment[`LODARIQ_RESIDENCY_ROUTE_${suffix}`]?.trim();
    if (!connectionString) continue;
    const objectBucket = environment[`LODARIQ_RESIDENCY_OBJECTS_${suffix}`]?.trim();
    routes[routeKey] = { connectionString, ...(objectBucket ? { objectBucket } : {}) };
  }
  return routes;
}
