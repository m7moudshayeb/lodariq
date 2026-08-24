import { AUTHORING_BOOTSTRAP_GRANT_HEADER, AUTHORING_SESSION_HEADER } from '@lodariq/schema';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  IDEMPOTENCY_KEY_HEADER,
  PUBLIC_SDK_INSTALLATION_HEADER,
  RELEASE_CORRELATION_ID_HEADER,
  SDK_DELIVERY_RETRY_ATTEMPT_HEADER,
} from '../support';

/** The verbs the API can serve at all. A path is asked which of these it has. */
const SDK_CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * A preflight carries no credential — only `Origin` and the method the page
 * wants — so it cannot be answered against the tenant's own allow-list the way
 * the real request is. Echoing the origin here grants nothing on its own:
 * `access-control-allow-credentials` is never set, so no cookie rides along,
 * and the *response* to the real request only carries an allow-origin header
 * for an allow-listed origin, so it stays unreadable either way.
 *
 * What the echo did do is approve verbs the path does not serve. So the
 * advertised method list is read from the router rather than being a constant:
 * a preflight for a read-only path no longer comes back saying DELETE is fine.
 */
export function setSdkPreflightCorsHeaders(request: FastifyRequest, reply: FastifyReply): void {
  const origin = request.headers.origin;
  const methods = servedMethods(request);
  if (origin) {
    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'Origin');
  }
  setSdkCorsPolicyHeaders(reply, methods);
}

function servedMethods(request: FastifyRequest): string {
  const path = request.url.split('?')[0] ?? request.url;
  const served = SDK_CORS_METHODS.filter((method) => {
    try {
      return Boolean(request.server.findRoute({ method, url: path }));
    } catch {
      return false;
    }
  });
  return [...served, 'OPTIONS'].join(',');
}

export function setAllowedSdkCorsHeaders(origin: string, reply: FastifyReply): void {
  reply.header('access-control-allow-origin', origin);
  reply.header('vary', 'Origin');
  setSdkCorsPolicyHeaders(reply);
}

export function setSdkCorsPolicyHeaders(
  reply: FastifyReply,
  methods = 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
): void {
  reply.header('access-control-allow-methods', methods);
  reply.header(
    'access-control-allow-headers',
    `authorization,content-type,${AUTHORING_SESSION_HEADER},${PUBLIC_SDK_INSTALLATION_HEADER},${AUTHORING_BOOTSTRAP_GRANT_HEADER},${IDEMPOTENCY_KEY_HEADER},${RELEASE_CORRELATION_ID_HEADER},${SDK_DELIVERY_RETRY_ATTEMPT_HEADER}`,
  );
  reply.header('access-control-max-age', '600');
}
