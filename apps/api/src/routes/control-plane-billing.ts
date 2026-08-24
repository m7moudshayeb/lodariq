import { Type } from '@sinclair/typebox';
import {
  BillingOverview,
  BillingProviderEventResult,
  BillingRedirectSession,
  CreateBillingCheckoutSessionRequest,
  CreateBillingPortalSessionRequest,
  type CreateBillingCheckoutSessionRequest as CheckoutBody,
  type CreateBillingPortalSessionRequest as PortalBody,
  BillingMeterBatch,
} from '@lodariq/schema/commercial-billing';
import { BillingProviderEventConflictError } from '@lodariq/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate, requireRecentControlPlaneAuthentication } from './control-plane-access';
import { ApiErrorResponse } from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';
import { deploymentOriginsForApiBaseUrl } from './control-plane/helpers';
import { BillingProviderVerificationError } from '../commercial-billing';

/** Keyed by request, so the buffer is collected with it. */
const rawBillingPayloads = new WeakMap<object, Uint8Array>();

const BillingProviderParams = Type.Object(
  { provider: Type.String({ pattern: '^[a-z][a-z0-9-]{0,79}$' }) },
  { additionalProperties: false },
);

export function registerControlPlaneBillingRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/billing/overview',
    { schema: { response: { 200: BillingOverview, 403: ApiErrorResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireBillingAdministrator(auth.role, reply)) return;
      return options.repository.readWorkspaceBillingOverview(auth.workspaceId);
    },
  );

  /*
   * The way back from a reconciliation mismatch.
   *
   * A single disagreement between what was reported and what the provider
   * echoed sets the batch's attempt count to the maximum, and the claim query
   * requires it to be below the maximum — so the batch left the queue for good,
   * with no alert and nothing an operator could do about it. Usage stops being
   * metered and nobody finds out until the invoice is wrong.
   */
  fastify.post(
    '/v1/billing/meter-batches/:batchId/resets',
    {
      schema: {
        params: Type.Object(
          { batchId: Type.String({ minLength: 1, maxLength: 128 }) },
          { additionalProperties: false },
        ),
        response: { 200: BillingMeterBatch, 403: ApiErrorResponse, 404: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireBillingAdministrator(auth.role, reply)) return;
      if (!requireRecentControlPlaneAuthentication(auth, reply)) return;
      const { batchId } = request.params as { batchId: string };
      const batch = await options.repository.resetBillingMeterBatch({
        workspaceId: auth.workspaceId,
        batchId,
        actorUserId: auth.userId,
        resetAt: new Date().toISOString(),
      });
      if (!batch) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'No failed meter batch with that id',
        });
      }
      return reply.send(batch);
    },
  );

  fastify.post(
    '/v1/billing/checkout-sessions',
    {
      schema: {
        body: CreateBillingCheckoutSessionRequest,
        response: {
          201: BillingRedirectSession,
          400: ApiErrorResponse,
          403: ApiErrorResponse,
          409: ApiErrorResponse,
          503: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (
        !auth ||
        !requireBillingAdministrator(auth.role, reply) ||
        !requireRecentControlPlaneAuthentication(auth, reply)
      ) {
        return;
      }
      if (!options.billingProvider) return providerUnavailable(reply);
      const body = request.body as CheckoutBody;
      if (!isAllowedBillingReturnUrl(body.returnUrl, options.publicApiBaseUrl)) {
        return reply.code(400).send({
          error: 'invalid_return_url',
          message: 'Billing sessions may return only to the Lodariq dashboard',
        });
      }
      const overview = await options.repository.readWorkspaceBillingOverview(auth.workspaceId);
      if (overview.subscription.revision !== body.expectedSubscriptionRevision) {
        return reply.code(409).send({
          error: 'subscription_conflict',
          message: 'The workspace subscription changed; refresh before continuing',
        });
      }
      const session = await options.billingProvider.createCheckoutSession({
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        planId: body.planId,
        expectedSubscriptionRevision: body.expectedSubscriptionRevision,
        returnUrl: body.returnUrl,
      });
      return reply.code(201).send(session);
    },
  );

  fastify.post(
    '/v1/billing/portal-sessions',
    {
      schema: {
        body: CreateBillingPortalSessionRequest,
        response: {
          201: BillingRedirectSession,
          400: ApiErrorResponse,
          403: ApiErrorResponse,
          503: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (
        !auth ||
        !requireBillingAdministrator(auth.role, reply) ||
        !requireRecentControlPlaneAuthentication(auth, reply)
      ) {
        return;
      }
      if (!options.billingProvider) return providerUnavailable(reply);
      const body = request.body as PortalBody;
      if (!isAllowedBillingReturnUrl(body.returnUrl, options.publicApiBaseUrl)) {
        return reply.code(400).send({
          error: 'invalid_return_url',
          message: 'Billing sessions may return only to the Lodariq dashboard',
        });
      }
      const session = await options.billingProvider.createPortalSession({
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        returnUrl: body.returnUrl,
      });
      return reply.code(201).send(session);
    },
  );

  /*
   * Its own encapsulation scope, for one reason: the content-type parser below
   * has to replace the JSON parser, and a parser added to the shared instance
   * would replace it for every control-plane route. Only this endpoint needs
   * the bytes.
   */
  void fastify.register(async (providerEvents) => {
    /*
     * The provider signs bytes, so the bytes have to survive. Fastify's JSON
     * parser hands the route a parsed object and throws the original away,
     * which leaves an adapter re-serializing to check an HMAC — and a
     * re-serialized body differs from the signed one in key order and
     * whitespace. This keeps both: the parsed payload for the adapter's own
     * reading, and the exact buffer for the digest.
     */
    providerEvents.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (request, body, done) => {
        const raw = body as Buffer;
        rawBillingPayloads.set(request, raw);
        if (raw.length === 0) {
          done(null, undefined);
          return;
        }
        try {
          done(null, JSON.parse(raw.toString('utf8')) as unknown);
        } catch (error) {
          const failure = error as Error & { statusCode?: number };
          failure.statusCode = 400;
          done(failure, undefined);
        }
      },
    );

    providerEvents.post(
    '/v1/billing/provider-events/:provider',
    {
      schema: {
        params: BillingProviderParams,
        body: Type.Unknown(),
        response: {
          200: BillingProviderEventResult,
          400: ApiErrorResponse,
          409: ApiErrorResponse,
          503: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { provider } = request.params as { provider: string };
      if (!options.billingProvider || provider !== options.billingProvider.id) {
        return providerUnavailable(reply);
      }
      let event;
      try {
        event = await options.billingProvider.verifyWebhook({
          provider,
          headers: request.headers,
          payload: request.body,
          rawPayload: rawBillingPayloads.get(request) ?? new Uint8Array(),
          receivedAt: new Date().toISOString(),
        });
        if (event.provider !== provider) throw new BillingProviderVerificationError();
      } catch {
        /*
         * Only a failed signature is the sender's fault. The ingest below used
         * to sit inside this same try, so a database outage answered the
         * provider 400 — which every provider reads as "malformed, do not
         * retry", and the billing event was dropped for good.
         */
        return reply.code(400).send({
          error: 'billing_provider_verification_failed',
          message: 'Billing provider event could not be verified',
        });
      }
      try {
        const result = await options.repository.ingestBillingProviderEvent(event);
        return { accepted: true, duplicate: result.status === 'duplicate' };
      } catch (error) {
        if (error instanceof BillingProviderEventConflictError) {
          return reply.code(409).send({
            error: error.code,
            message: 'The provider event conflicts with a previously accepted event',
          });
        }
        // Anything else is ours, so it answers 5xx and the provider retries.
        throw error;
      }
      },
    );
  });
}

function requireBillingAdministrator(role: string, reply: FastifyReply): boolean {
  if (role === 'admin' || role === 'owner') return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: 'Workspace billing requires an admin or owner role',
  });
  return false;
}

function providerUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    error: 'billing_provider_unavailable',
    message: 'Workspace billing is not configured for this deployment',
  });
}

function isAllowedBillingReturnUrl(value: string, publicApiBaseUrl: string): boolean {
  try {
    const url = new URL(value);
    const dashboardOrigin = deploymentOriginsForApiBaseUrl(publicApiBaseUrl).app;
    if (url.origin === dashboardOrigin && !url.username && !url.password) return true;
    return (
      process.env.NODE_ENV !== 'production' &&
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
