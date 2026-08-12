import {
  AnalyticsAggregateResponse,
  AnalyticsEnvironmentQuery,
  type AnalyticsEnvironmentQuery as AnalyticsEnvironmentQueryType,
  type AnalyticsEvent,
} from '@lodariq/schema';
import type { ControlPlaneRepository } from '@lodariq/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { createObservabilityEvent } from '../observability';
import { authenticate, emitObservability } from './control-plane-access';
import { IngestEventsBody } from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';

export function registerControlPlaneAnalyticsRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.post('/v1/events', { schema: { body: IngestEventsBody } }, async (request, reply) => {
    const auth = await authenticate(options.repository, options.authProvider, request, reply);
    if (!auth) return;
    const body = request.body as { events: AnalyticsEvent[] };
    const accepted = await options.repository.ingestEvents({
      workspaceId: auth.workspaceId,
      events: sanitizeAnalyticsEvents(body.events),
    });
    emitObservability(
      options.observability,
      createObservabilityEvent({
        name: 'sdk.events.ingested',
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        attributes: { accepted },
      }),
    );
    return reply.code(202).send({ accepted });
  });

  fastify.get(
    '/v1/analytics/events',
    { schema: { querystring: AnalyticsEnvironmentQuery } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const query = request.query as AnalyticsEnvironmentQueryType;
      if (
        !(await requireAnalyticsEnvironment(options.repository, auth.workspaceId, query, reply))
      ) {
        return;
      }
      const events = await options.repository.listAnalyticsEvents({
        workspaceId: auth.workspaceId,
        query,
      });
      return reply.send({ events });
    },
  );

  fastify.get(
    '/v1/analytics/aggregate',
    {
      schema: {
        querystring: AnalyticsEnvironmentQuery,
        response: { 200: AnalyticsAggregateResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const query = request.query as AnalyticsEnvironmentQueryType;
      if (
        !(await requireAnalyticsEnvironment(options.repository, auth.workspaceId, query, reply))
      ) {
        return;
      }
      const aggregates = await options.repository.aggregateAnalyticsEvents({
        workspaceId: auth.workspaceId,
        query,
      });
      return reply.send({ aggregates });
    },
  );
}

async function requireAnalyticsEnvironment(
  repository: ControlPlaneRepository,
  workspaceId: string,
  query: AnalyticsEnvironmentQueryType,
  reply: FastifyReply,
): Promise<boolean> {
  const environments = await repository.listEnvironments(workspaceId);
  if (environments.some((environment) => environment.id === query.environmentId)) return true;
  await reply.code(404).send({
    error: 'not_found',
    message: 'Analytics environment not found',
  });
  return false;
}

function sanitizeAnalyticsEvents(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return events.map((event) => ({
    ...event,
    name: sanitizeEventString(event.name),
    ...(event.documentId ? { documentId: sanitizeEventString(event.documentId) } : {}),
    ...(event.stepId ? { stepId: sanitizeEventString(event.stepId) } : {}),
    ...(event.correlationId ? { correlationId: sanitizeEventString(event.correlationId) } : {}),
    ...(event.props ? { props: sanitizeEventValue(event.props) as Record<string, unknown> } : {}),
  }));
}

function sanitizeEventValue(value: unknown, key = ''): unknown {
  if (isSensitiveEventKey(key)) return '<redacted>';
  if (typeof value === 'string') return sanitizeEventString(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeEventValue(item));

  const next: Record<string, unknown> = {};
  for (const [itemKey, itemValue] of Object.entries(value)) {
    next[itemKey] = sanitizeEventValue(itemValue, itemKey);
  }
  return next;
}

function sanitizeEventString(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/g, sanitizeEventUrl)
    .replace(/\bBearer\s+[\w.-]+/gi, 'Bearer <redacted>')
    .replace(
      /lod_(?:development|staging|production|authoring|activation|authorization|bootstrap)_[a-zA-Z0-9_-]+/g,
      'lod_<redacted>',
    )
    .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '<email>')
    .slice(0, 500);
}

function sanitizeEventUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.length > 120 ? `${url.pathname.slice(0, 120)}...` : url.pathname;
    return `${url.origin}${path}`;
  } catch {
    return '<url>';
  }
}

function isSensitiveEventKey(key: string): boolean {
  return /(authorization|bearer|bootstrap|cookie|grant|jwt|password|secret|session|token|api[-_]?key)/i.test(
    key,
  );
}
