import { randomUUID } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { compileDocument } from '@lodariq/compiler';
import {
  AnalyticsEvent,
  CompiledDocument,
  LodariqDocument,
  SdkBootstrapRequest,
  SdkInstallContext,
  firstPublishBlocker,
  validate,
  type CompiledDocument as CompiledDocumentType,
  type SdkBootstrapRequest as SdkBootstrapRequestType,
  type SdkInstallContext as SdkInstallContextType,
} from '@lodariq/schema';
import {
  createAuthoringSessionToken,
  createEnvironmentClientToken,
  getEnvironmentTokenPrefix,
  hashAuthoringSessionToken,
  hashEnvironmentToken,
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
  type EnvironmentTokenRecord,
  type PersistedCompiledArtifact,
  type PersistedDocument,
  type PersistedPublication,
  type ResolvedEnvironmentToken,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthError, type AuthContext, type AuthProvider, type AuthRole } from '../auth';
import { renderSdkInstallationSnippet } from '../snippets';

const DocumentParams = Type.Object(
  {
    documentId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const EnvironmentTokenParams = Type.Object(
  {
    tokenId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const CreateEnvironmentTokenBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    authoringDocumentId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

const CreateAuthoringSessionBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1 }),
    documentId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const PublishDocumentBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const IngestEventsBody = Type.Object(
  {
    events: Type.Array(AnalyticsEvent, { minItems: 1, maxItems: 100 }),
  },
  { additionalProperties: false },
);

const SdkAuthoringDocumentBody = Type.Object(
  {
    document: Type.Unknown(),
  },
  { additionalProperties: false },
);

interface RegisterControlPlaneRoutesOptions {
  repository: ControlPlaneRepository;
  authProvider: AuthProvider;
  publicApiBaseUrl: string;
  loaderSrc?: string;
  creatorLoaderSrc?: string;
  authoringIframeSrc: string;
}

const AUTHORING_SESSION_HEADER = 'x-lodariq-authoring-session';
const AUTHORING_SESSION_TTL_MS = 15 * 60 * 1000;

export function registerControlPlaneRoutes(
  fastify: FastifyInstance,
  options: RegisterControlPlaneRoutesOptions,
): void {
  fastify.get('/healthz', async () => ({ ok: true }));

  for (const path of [
    '/v1/sdk/bootstrap',
    '/v1/sdk/current-document',
    '/v1/sdk/events',
    '/v1/sdk/authoring/document',
  ]) {
    fastify.options(path, async (request, reply) => {
      setSdkPreflightCorsHeaders(request, reply);
      return reply.code(204).send();
    });
  }

  fastify.post(
    '/v1/sdk/bootstrap',
    { schema: { body: SdkBootstrapRequest } },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireSdkOrigin(token, request, reply)) return;

      const body = request.body as SdkBootstrapRequestType;
      if (body.environment !== token.environment) {
        return reply.code(403).send({
          error: 'environment_mismatch',
          message: 'SDK token is not valid for the requested environment',
        });
      }

      const publication = await options.repository.getCurrentPublication(
        token.workspaceId,
        token.environmentId,
      );
      if (!publication) {
        return reply.code(404).send({
          error: 'artifact_not_found',
          message: 'No published tour artifact is available for this environment',
        });
      }

      const authoringSession = await authenticateAuthoringSession(
        options.repository,
        token,
        publication.artifact,
        request,
        reply,
      );
      if (authoringSession === false) return;

      return createSdkInstallContext(
        options.publicApiBaseUrl,
        token,
        publication,
        authoringSession,
      );
    },
  );

  fastify.get('/v1/sdk/current-document', async (request, reply) => {
    const token = await authenticateEnvironmentToken(options.repository, request, reply);
    if (!token) return;
    if (!requireSdkOrigin(token, request, reply)) return;

    const artifact = await options.repository.getCurrentPublishedArtifact(
      token.workspaceId,
      token.environmentId,
    );
    if (!artifact) {
      return reply.code(404).send({
        error: 'artifact_not_found',
        message: 'No published tour artifact is available for this environment',
      });
    }

    return artifact.compiled;
  });

  fastify.post('/v1/sdk/events', { schema: { body: IngestEventsBody } }, async (request, reply) => {
    const token = await authenticateEnvironmentToken(options.repository, request, reply);
    if (!token) return;
    if (!requireSdkOrigin(token, request, reply)) return;

    const body = request.body as { events: AnalyticsEvent[] };
    const accepted = await options.repository.ingestEvents({
      workspaceId: token.workspaceId,
      events: sanitizeAnalyticsEvents(body.events),
    });
    return reply.code(202).send({ accepted });
  });

  fastify.get('/v1/sdk/authoring/document', async (request, reply) => {
    const token = await authenticateEnvironmentToken(options.repository, request, reply);
    if (!token) return;
    if (!requireSdkOrigin(token, request, reply)) return;

    const authoringSession = await authenticateAuthoringSessionForToken(
      options.repository,
      token,
      request,
      reply,
    );
    if (!authoringSession) return;

    const record = await options.repository.getDocument(
      token.workspaceId,
      authoringSession.documentId,
    );
    if (!record) {
      return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
    }

    return { document: record.document };
  });

  fastify.post(
    '/v1/sdk/authoring/document',
    { schema: { body: SdkAuthoringDocumentBody } },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireSdkOrigin(token, request, reply)) return;

      const body = request.body as { document: unknown };
      const canonical = validate(LodariqDocument, body.document);
      if (!canonical.valid) {
        return reply.code(400).send({
          error: 'invalid_document',
          message: 'Request body must contain canonical Lodariq block JSON',
          issues: canonical.errors,
        });
      }

      const document = canonical.value;
      if (document.workspaceId !== token.workspaceId) {
        return reply.code(403).send({
          error: 'workspace_mismatch',
          message: 'Document workspaceId must match the SDK token workspace',
        });
      }

      const authoringSession = await authenticateAuthoringSession(
        options.repository,
        token,
        { documentId: document.id },
        request,
        reply,
      );
      if (authoringSession === false) return;
      if (!authoringSession) {
        return reply.code(401).send({
          error: 'authoring_session_required',
          message: 'A valid authoring session is required to save from the SDK',
        });
      }

      const compiled = await compileAndValidate(document);
      const saved = await options.repository.saveDocument({
        workspaceId: token.workspaceId,
        actorUserId: authoringSession.createdByUserId,
        document,
        artifact: compiled,
      });

      return reply.code(200).send({
        document: {
          id: saved.document.id,
          workspaceId: saved.document.workspaceId,
          title: saved.document.title,
          updatedAt: saved.updatedAt,
          latestContentHash: saved.latestArtifact?.contentHash,
        },
        artifact: saved.latestArtifact
          ? {
              id: saved.latestArtifact.id,
              contentHash: saved.latestArtifact.contentHash,
              compilerVersion: saved.latestArtifact.compilerVersion,
              createdAt: saved.latestArtifact.createdAt,
            }
          : null,
      });
    },
  );

  fastify.get('/v1/documents', async (request, reply) => {
    const auth = await authenticate(options.authProvider, request, reply);
    if (!auth) return;
    return { documents: await options.repository.listDocuments(auth.workspaceId) };
  });

  fastify.get(
    '/v1/documents/:documentId',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const record = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      return record;
    },
  );

  fastify.post('/v1/documents', { schema: { body: Type.Unknown() } }, async (request, reply) => {
    const auth = await authenticate(options.authProvider, request, reply);
    if (!auth) return;
    if (!requireRole(auth, 'member', reply)) return;
    const canonical = validate(LodariqDocument, request.body);
    if (!canonical.valid) {
      return reply.code(400).send({
        error: 'invalid_document',
        message: 'Request body must be canonical Lodariq block JSON',
        issues: canonical.errors,
      });
    }
    const document = canonical.value;
    if (document.workspaceId !== auth.workspaceId) {
      return reply.code(403).send({
        error: 'workspace_mismatch',
        message: 'Document workspaceId must match the authenticated workspace',
      });
    }

    const compiled = await compileAndValidate(document);
    const saved = await options.repository.saveDocument({
      workspaceId: auth.workspaceId,
      actorUserId: auth.userId,
      document,
      artifact: compiled,
    });

    return reply.code(201).send(saved);
  });

  fastify.post(
    '/v1/documents/:documentId/compile',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const record = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });

      const compiled = await compileAndValidate(record.document);
      const saved = await options.repository.saveDocument({
        workspaceId: auth.workspaceId,
        actorUserId: auth.userId,
        document: record.document,
        artifact: compiled,
      });

      return { artifact: saved.latestArtifact };
    },
  );

  fastify.post(
    '/v1/documents/:documentId/publish',
    { schema: { params: DocumentParams, body: PublishDocumentBody } },
    async (request, reply) => {
      const auth = await authenticate(options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const body = request.body as { environmentId: string };
      const [record, environment] = await Promise.all([
        options.repository.getDocument(auth.workspaceId, documentId),
        findEnvironment(options.repository, auth.workspaceId, body.environmentId),
      ]);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      if (!environment)
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });

      const publishBlocker = firstPublishBlocker(record.document);
      if (publishBlocker) {
        return reply.code(409).send({
          error: 'publish_blocked',
          message: publishBlocker,
        });
      }

      const artifact = await ensureCurrentCompiledArtifact(options.repository, auth, record);
      const publication = await options.repository.publishCompiledArtifact({
        workspaceId: auth.workspaceId,
        correlationId: createCorrelationId('publish'),
        environmentId: environment.id,
        artifact,
        actorUserId: auth.userId,
      });

      return reply.code(201).send({ publication: toPublicationResponse(publication) });
    },
  );

  fastify.get(
    '/v1/debug/documents/:documentId',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const record = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      const versions = await options.repository.listDocumentVersions(auth.workspaceId, documentId);
      return {
        canonical: record.document,
        latestArtifact: record.latestArtifact ?? null,
        versions,
      };
    },
  );

  fastify.get('/v1/environments', async (request, reply) => {
    const auth = await authenticate(options.authProvider, request, reply);
    if (!auth) return;
    return { environments: await options.repository.listEnvironments(auth.workspaceId) };
  });

  fastify.get('/v1/environment-tokens', async (request, reply) => {
    const auth = await authenticate(options.authProvider, request, reply);
    if (!auth) return;
    if (!requireRole(auth, 'member', reply)) return;
    const tokens = await options.repository.listEnvironmentTokens(auth.workspaceId);
    return { tokens: tokens.map(toTokenResponse) };
  });

  fastify.post(
    '/v1/environment-tokens',
    { schema: { body: CreateEnvironmentTokenBody } },
    async (request, reply) => {
      const auth = await authenticate(options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const body = request.body as {
        environmentId: string;
        name: string;
        authoringDocumentId?: string;
      };
      const authoringDocumentId = body.authoringDocumentId;
      const environment = (await options.repository.listEnvironments(auth.workspaceId)).find(
        (candidate) => candidate.id === body.environmentId,
      );
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (authoringDocumentId && environment.kind === 'production') {
        return reply.code(403).send({
          error: 'production_authoring_forbidden',
          message: 'Production environments cannot create authoring sessions',
        });
      }
      const authoringDocument = authoringDocumentId
        ? await options.repository.getDocument(auth.workspaceId, authoringDocumentId)
        : null;
      if (authoringDocumentId && !authoringDocument) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      const publishBlocker = authoringDocument
        ? firstPublishBlocker(authoringDocument.document)
        : null;
      if (publishBlocker) {
        return reply.code(409).send({
          error: 'publish_blocked',
          message: publishBlocker,
        });
      }
      const publication = authoringDocument
        ? await publishCurrentDocument(options.repository, auth, environment, authoringDocument)
        : null;

      const clientToken = createEnvironmentClientToken(environment.kind);
      const token = await options.repository.createEnvironmentToken({
        workspaceId: auth.workspaceId,
        environmentId: environment.id,
        name: body.name,
        tokenHash: hashEnvironmentToken(clientToken),
        tokenPrefix: getEnvironmentTokenPrefix(clientToken),
        clientToken,
        actorUserId: auth.userId,
      });

      let authoringSessionPayload = {};
      if (authoringDocumentId) {
        const authoringSessionToken = createAuthoringSessionToken();
        const authoringSession = await options.repository.createAuthoringSession({
          workspaceId: auth.workspaceId,
          environmentId: environment.id,
          documentId: authoringDocumentId,
          correlationId: createCorrelationId('authoring'),
          tokenHash: hashAuthoringSessionToken(authoringSessionToken),
          iframeSrc: options.authoringIframeSrc,
          expiresAt: new Date(Date.now() + AUTHORING_SESSION_TTL_MS).toISOString(),
          actorUserId: auth.userId,
        });
        authoringSessionPayload = {
          authoringSession: toAuthoringSessionResponse(authoringSession),
          authoringSessionToken,
          bootstrapHeaderName: AUTHORING_SESSION_HEADER,
          ...(publication ? { publication: toPublicationResponse(publication) } : {}),
          authoringSdkSnippet: renderSdkInstallationSnippet({
            clientToken,
            environment: environment.kind,
            apiBaseUrl: options.publicApiBaseUrl,
            loaderSrc: options.loaderSrc,
            creatorLoaderSrc: options.creatorLoaderSrc,
            authoringSessionToken,
          }),
        };
      }

      return reply.code(201).send({
        token: toTokenResponse(token),
        clientToken,
        sdkSnippet: renderSdkInstallationSnippet({
          clientToken,
          environment: environment.kind,
          apiBaseUrl: options.publicApiBaseUrl,
          loaderSrc: options.loaderSrc,
        }),
        ...authoringSessionPayload,
      });
    },
  );

  fastify.post(
    '/v1/environment-tokens/:tokenId/revoke',
    { schema: { params: EnvironmentTokenParams } },
    async (request, reply) => {
      const auth = await authenticate(options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;

      const { tokenId } = request.params as { tokenId: string };
      const token = await options.repository.revokeEnvironmentToken(
        auth.workspaceId,
        tokenId,
        auth.userId,
      );
      if (!token) {
        return reply.code(404).send({ error: 'not_found', message: 'Token not found' });
      }

      return { token: toTokenResponse(token) };
    },
  );

  fastify.post(
    '/v1/authoring/sessions',
    { schema: { body: CreateAuthoringSessionBody } },
    async (request, reply) => {
      const auth = await authenticate(options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;

      const body = request.body as { environmentId: string; documentId: string };
      const [environment, document] = await Promise.all([
        options.repository
          .listEnvironments(auth.workspaceId)
          .then((items) => items.find((candidate) => candidate.id === body.environmentId)),
        options.repository.getDocument(auth.workspaceId, body.documentId),
      ]);

      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      if (environment.kind === 'production') {
        return reply.code(403).send({
          error: 'production_authoring_forbidden',
          message: 'Production environments cannot create authoring sessions',
        });
      }

      const sessionToken = createAuthoringSessionToken();
      const session = await options.repository.createAuthoringSession({
        workspaceId: auth.workspaceId,
        environmentId: environment.id,
        documentId: body.documentId,
        correlationId: createCorrelationId('authoring'),
        tokenHash: hashAuthoringSessionToken(sessionToken),
        iframeSrc: options.authoringIframeSrc,
        expiresAt: new Date(Date.now() + AUTHORING_SESSION_TTL_MS).toISOString(),
        actorUserId: auth.userId,
      });

      return reply.code(201).send({
        authoringSession: toAuthoringSessionResponse(session),
        authoringSessionToken: sessionToken,
        bootstrapHeaderName: AUTHORING_SESSION_HEADER,
      });
    },
  );

  fastify.post('/v1/events', { schema: { body: IngestEventsBody } }, async (request, reply) => {
    const auth = await authenticate(options.authProvider, request, reply);
    if (!auth) return;
    const body = request.body as { events: AnalyticsEvent[] };
    const accepted = await options.repository.ingestEvents({
      workspaceId: auth.workspaceId,
      events: sanitizeAnalyticsEvents(body.events),
    });
    return reply.code(202).send({ accepted });
  });
}

async function findEnvironment(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
): Promise<WorkspaceEnvironment | null> {
  return (
    (await repository.listEnvironments(workspaceId)).find(
      (environment) => environment.id === environmentId,
    ) ?? null
  );
}

async function publishCurrentDocument(
  repository: ControlPlaneRepository,
  auth: AuthContext,
  environment: WorkspaceEnvironment,
  record: PersistedDocument,
): Promise<PersistedPublication> {
  const artifact = await ensureCurrentCompiledArtifact(repository, auth, record);
  return repository.publishCompiledArtifact({
    workspaceId: auth.workspaceId,
    correlationId: createCorrelationId('publish'),
    environmentId: environment.id,
    artifact,
    actorUserId: auth.userId,
  });
}

async function ensureCurrentCompiledArtifact(
  repository: ControlPlaneRepository,
  auth: AuthContext,
  record: PersistedDocument,
): Promise<PersistedCompiledArtifact> {
  const compiled = await compileAndValidate(record.document);
  if (record.latestArtifact?.contentHash === compiled.contentHash) return record.latestArtifact;

  const saved = await repository.saveDocument({
    workspaceId: auth.workspaceId,
    actorUserId: auth.userId,
    document: record.document,
    artifact: compiled,
  });
  if (!saved.latestArtifact) {
    throw new Error('failed to persist compiled artifact for publication');
  }
  return saved.latestArtifact;
}

async function authenticateAuthoringSession(
  repository: ControlPlaneRepository,
  environmentToken: ResolvedEnvironmentToken,
  artifact: { documentId: string },
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthoringSessionRecord | null | false> {
  const sessionToken = readHeader(request, AUTHORING_SESSION_HEADER);
  if (!sessionToken) return null;

  const session = await repository.resolveAuthoringSession(
    environmentToken.workspaceId,
    hashAuthoringSessionToken(sessionToken),
  );
  if (!session) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Authoring session is invalid, expired, or revoked',
    });
    return false;
  }

  const matchesEnvironment =
    session.workspaceId === environmentToken.workspaceId &&
    session.environmentId === environmentToken.environmentId &&
    session.environment === environmentToken.environment &&
    session.documentId === artifact.documentId &&
    environmentToken.environment !== 'production';

  if (!matchesEnvironment) {
    await reply.code(403).send({
      error: 'authoring_session_mismatch',
      message: 'Authoring session does not match the SDK environment or document',
    });
    return false;
  }

  return session;
}

async function authenticateAuthoringSessionForToken(
  repository: ControlPlaneRepository,
  environmentToken: ResolvedEnvironmentToken,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthoringSessionRecord | null> {
  const sessionToken = readHeader(request, AUTHORING_SESSION_HEADER);
  if (!sessionToken) {
    await reply.code(401).send({
      error: 'authoring_session_required',
      message: 'A valid authoring session is required for SDK authoring',
    });
    return null;
  }

  const session = await repository.resolveAuthoringSession(
    environmentToken.workspaceId,
    hashAuthoringSessionToken(sessionToken),
  );
  if (!session) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Authoring session is invalid, expired, or revoked',
    });
    return null;
  }

  const matchesToken =
    session.workspaceId === environmentToken.workspaceId &&
    session.environmentId === environmentToken.environmentId &&
    session.environment === environmentToken.environment &&
    environmentToken.environment !== 'production';

  if (!matchesToken) {
    await reply.code(403).send({
      error: 'authoring_session_mismatch',
      message: 'Authoring session does not match the SDK environment',
    });
    return null;
  }

  return session;
}

async function authenticateEnvironmentToken(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ResolvedEnvironmentToken | null> {
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Environment token bearer authorization is required',
    });
    return null;
  }

  const token = await repository.resolveEnvironmentToken(hashEnvironmentToken(bearerToken));
  if (!token) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Environment token is invalid or revoked',
    });
    return null;
  }

  return token;
}

function readBearerToken(request: FastifyRequest): string | null {
  const raw = request.headers.authorization;
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  const token = match?.[1]?.trim();
  return token || null;
}

function readHeader(request: FastifyRequest, name: string): string | null {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireSdkOrigin(
  token: ResolvedEnvironmentToken,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;

  if (token.originAllowlist.includes(origin)) {
    setAllowedSdkCorsHeaders(origin, reply);
    return true;
  }

  void reply.code(403).send({
    error: 'origin_forbidden',
    message: 'Origin is not allowed for this Lodariq environment token',
  });
  return false;
}

function setSdkPreflightCorsHeaders(request: FastifyRequest, reply: FastifyReply): void {
  const origin = request.headers.origin;
  if (origin) {
    setAllowedSdkCorsHeaders(origin, reply);
  } else {
    setSdkCorsPolicyHeaders(reply);
  }
}

function setAllowedSdkCorsHeaders(origin: string, reply: FastifyReply): void {
  reply.header('access-control-allow-origin', origin);
  reply.header('vary', 'Origin');
  setSdkCorsPolicyHeaders(reply);
}

function setSdkCorsPolicyHeaders(reply: FastifyReply): void {
  reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
  reply.header(
    'access-control-allow-headers',
    `authorization,content-type,${AUTHORING_SESSION_HEADER}`,
  );
  reply.header('access-control-max-age', '600');
}

function createSdkInstallContext(
  publicApiBaseUrl: string,
  token: ResolvedEnvironmentToken,
  publication: PersistedPublication,
  authoringSession: AuthoringSessionRecord | null = null,
): SdkInstallContextType {
  const context = {
    workspaceId: token.workspaceId,
    environment: token.environment,
    correlationId: publication.correlationId,
    manifest: {
      documentId: publication.documentId,
      currentVersion: publication.contentHash,
    },
    currentDocumentUrl: new URL('/v1/sdk/current-document', publicApiBaseUrl).toString(),
    ingestUrl: new URL('/v1/sdk/events', publicApiBaseUrl).toString(),
    authoring: authoringSession
      ? {
          enabled: true,
          iframeSrc: authoringSession.iframeSrc,
          sessionId: authoringSession.id,
          correlationId: authoringSession.correlationId,
          expiresAt: authoringSession.expiresAt,
          documentUrl: new URL('/v1/sdk/authoring/document', publicApiBaseUrl).toString(),
          saveDocumentUrl: new URL('/v1/sdk/authoring/document', publicApiBaseUrl).toString(),
        }
      : { enabled: false },
  };
  const validation = validate(SdkInstallContext, context);
  if (!validation.valid) {
    throw new Error(
      `SDK install context failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

function createCorrelationId(scope: 'authoring' | 'publish'): string {
  return `corr_${scope}_${randomUUID()}`;
}

function requireRole(auth: AuthContext, minimumRole: AuthRole, reply: FastifyReply): boolean {
  if (roleRank(auth.role) >= roleRank(minimumRole)) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: `Workspace role ${minimumRole} or higher is required`,
  });
  return false;
}

function roleRank(role: AuthRole): number {
  switch (role) {
    case 'owner':
      return 3;
    case 'admin':
      return 2;
    case 'member':
      return 1;
    case 'viewer':
      return 0;
  }
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
    .replace(/lod_(?:development|staging|production|authoring)_[a-zA-Z0-9_-]+/g, 'lod_<redacted>')
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
  return /(authorization|bearer|cookie|jwt|password|secret|session|token|api[-_]?key)/i.test(key);
}

async function authenticate(
  authProvider: AuthProvider,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  try {
    return await authProvider.authenticate(request);
  } catch (error) {
    if (error instanceof AuthError) {
      await reply.code(error.statusCode).send({ error: 'unauthorized', message: error.message });
      return null;
    }
    throw error;
  }
}

async function compileAndValidate(document: LodariqDocument): Promise<CompiledDocumentType> {
  const compiled = await compileDocument(document);
  const result = validate(CompiledDocument, compiled);
  if (!result.valid) {
    throw new Error(`Compiled artifact failed schema validation: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

function toTokenResponse(
  token: EnvironmentTokenRecord,
): Omit<EnvironmentTokenRecord, 'clientToken'> {
  return {
    id: token.id,
    workspaceId: token.workspaceId,
    environmentId: token.environmentId,
    environment: token.environment,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    createdAt: token.createdAt,
    revokedAt: token.revokedAt,
  };
}

function toPublicationResponse(publication: PersistedPublication): Omit<
  PersistedPublication,
  'artifact'
> & {
  artifact: Omit<PersistedCompiledArtifact, 'compiled'>;
} {
  return {
    id: publication.id,
    workspaceId: publication.workspaceId,
    correlationId: publication.correlationId,
    environmentId: publication.environmentId,
    environment: publication.environment,
    documentId: publication.documentId,
    documentVersionId: publication.documentVersionId,
    compiledArtifactId: publication.compiledArtifactId,
    contentHash: publication.contentHash,
    publishedByUserId: publication.publishedByUserId,
    publishedAt: publication.publishedAt,
    artifact: {
      id: publication.artifact.id,
      workspaceId: publication.artifact.workspaceId,
      documentId: publication.artifact.documentId,
      documentVersionId: publication.artifact.documentVersionId,
      contentHash: publication.artifact.contentHash,
      compilerVersion: publication.artifact.compilerVersion,
      createdAt: publication.artifact.createdAt,
    },
  };
}

function toAuthoringSessionResponse(
  session: AuthoringSessionRecord,
): Omit<AuthoringSessionRecord, 'tokenHash'> {
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    environmentId: session.environmentId,
    environment: session.environment,
    documentId: session.documentId,
    correlationId: session.correlationId,
    iframeSrc: session.iframeSrc,
    createdByUserId: session.createdByUserId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
  };
}
