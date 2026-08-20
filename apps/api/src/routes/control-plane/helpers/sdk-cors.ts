import { AUTHORING_BOOTSTRAP_GRANT_HEADER, AUTHORING_SESSION_HEADER } from '@lodariq/schema';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  IDEMPOTENCY_KEY_HEADER,
  PUBLIC_SDK_INSTALLATION_HEADER,
  RELEASE_CORRELATION_ID_HEADER,
  SDK_DELIVERY_RETRY_ATTEMPT_HEADER,
} from '../support';

export function setSdkPreflightCorsHeaders(request: FastifyRequest, reply: FastifyReply): void {
  const origin = request.headers.origin;
  if (origin) {
    setAllowedSdkCorsHeaders(origin, reply);
  } else {
    setSdkCorsPolicyHeaders(reply);
  }
}

export function setAllowedSdkCorsHeaders(origin: string, reply: FastifyReply): void {
  reply.header('access-control-allow-origin', origin);
  reply.header('vary', 'Origin');
  setSdkCorsPolicyHeaders(reply);
}

export function setSdkCorsPolicyHeaders(reply: FastifyReply): void {
  reply.header('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  reply.header(
    'access-control-allow-headers',
    `authorization,content-type,${AUTHORING_SESSION_HEADER},${PUBLIC_SDK_INSTALLATION_HEADER},${AUTHORING_BOOTSTRAP_GRANT_HEADER},${IDEMPOTENCY_KEY_HEADER},${RELEASE_CORRELATION_ID_HEADER},${SDK_DELIVERY_RETRY_ATTEMPT_HEADER}`,
  );
  reply.header('access-control-max-age', '600');
}
