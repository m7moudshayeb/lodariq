import {
  GovernanceChangeHistory,
  GovernanceChangeHistoryQuery,
  type GovernanceChangeHistoryQuery as ChangeHistoryQuery,
} from '@lodariq/schema/governance-change-history';
import { assertCommercialFeature } from '@lodariq/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthContext } from '../auth';
import { governanceChangeHistoryCsv } from '../governance-change-history';
import {
  authenticate,
  requireRecentControlPlaneAuthentication,
  requireWorkspaceGovernanceCapability,
} from './control-plane-access';
import { ApiErrorResponse } from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';

export function registerControlPlaneChangeHistoryRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/governance/change-history',
    {
      schema: {
        querystring: GovernanceChangeHistoryQuery,
        response: { 200: GovernanceChangeHistory, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !(await requireChangeHistoryAccess(options, auth, reply))) return;
      const events = await options.repository.listGovernanceChangeHistory({
        workspaceId: auth.workspaceId,
        query: request.query as ChangeHistoryQuery,
      });
      return { schemaVersion: '2026-08-22.1', events };
    },
  );

  fastify.get(
    '/v1/governance/change-history.csv',
    { schema: { querystring: GovernanceChangeHistoryQuery } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (
        !auth ||
        !requireRecentControlPlaneAuthentication(auth, reply) ||
        !(await requireChangeHistoryAccess(options, auth, reply))
      ) {
        return;
      }
      const events = await options.repository.listGovernanceChangeHistory({
        workspaceId: auth.workspaceId,
        query: request.query as ChangeHistoryQuery,
      });
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', 'attachment; filename="lodariq-change-history.csv"');
      return reply.send(governanceChangeHistoryCsv(events));
    },
  );
}

async function requireChangeHistoryAccess(
  options: ControlPlaneRouteOptions,
  auth: AuthContext,
  reply: FastifyReply,
): Promise<boolean> {
  const entitlements = await options.repository.readWorkspaceEntitlementSnapshot(auth.workspaceId);
  assertCommercialFeature(entitlements.entitlements, 'change-history-export');
  return requireWorkspaceGovernanceCapability(options.repository, auth, 'audit:export', reply);
}
