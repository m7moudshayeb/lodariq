import Fastify, { type FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import {
  createControlPlaneRepositoryFromEnvironment,
  type ControlPlaneRepository,
} from '@lodariq/database';
import { createAuthProviderFromEnvironment, type AuthProvider } from './auth';
import { registerControlPlaneRoutes } from './routes/control-plane';

export interface CreateApiAppOptions {
  repository?: ControlPlaneRepository;
  authProvider?: AuthProvider;
  logger?: boolean;
  defaultWorkspaceId?: string;
  defaultUserId?: string;
  publicApiBaseUrl?: string;
  loaderSrc?: string;
  creatorLoaderSrc?: string;
  authoringIframeSrc?: string;
}

export function createApiApp(options: CreateApiAppOptions = {}): FastifyInstance {
  const publicApiBaseUrl =
    options.publicApiBaseUrl ??
    process.env.LODARIQ_PUBLIC_API_BASE_URL ??
    'https://api.lodariq.com';
  const loaderSrc = options.loaderSrc ?? process.env.LODARIQ_LOADER_SRC;
  const creatorLoaderSrc =
    options.creatorLoaderSrc ??
    process.env.LODARIQ_CREATOR_LOADER_SRC ??
    loaderSrc?.replace(/lodariq-loader\.js(?:\?.*)?$/, 'lodariq-creator.js');
  const authoringIframeSrc =
    options.authoringIframeSrc ??
    process.env.LODARIQ_AUTHORING_IFRAME_SRC ??
    'https://editor.lodariq.com/authoring.html';
  const defaultWorkspaceId =
    options.defaultWorkspaceId ?? process.env.LODARIQ_DEV_WORKSPACE_ID ?? 'wk_local_dev';
  const defaultUserId =
    options.defaultUserId ?? process.env.LODARIQ_DEV_USER_ID ?? 'user_local_dev';
  const repository =
    options.repository ??
    createControlPlaneRepositoryFromEnvironment({
      defaultWorkspaceId,
      allowInMemoryFallback: process.env.NODE_ENV !== 'production',
    });
  const authProvider =
    options.authProvider ??
    createAuthProviderFromEnvironment({
      defaultWorkspaceId: process.env.NODE_ENV === 'production' ? undefined : defaultWorkspaceId,
      defaultUserId: process.env.NODE_ENV === 'production' ? undefined : defaultUserId,
    });

  const fastify = Fastify({
    logger: options.logger ?? false,
    ajv: {
      customOptions: {
        allErrors: true,
        removeAdditional: false,
      },
    },
  });

  void fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Lodariq Control API',
        description:
          'Phase 1 control-plane API for canonical documents, environment tokens, SDK bootstrap, publication, and event ingestion.',
        version: '0.1.0',
      },
      servers: [{ url: publicApiBaseUrl }],
      tags: [
        { name: 'documents', description: 'Workspace-scoped canonical documents' },
        { name: 'environments', description: 'Workspace environments and SDK tokens' },
        { name: 'sdk', description: 'Token-authenticated SDK runtime endpoints' },
        { name: 'events', description: 'Batched event ingestion' },
        { name: 'debug', description: 'Internal diagnostics' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
          },
          devWorkspaceHeaders: {
            type: 'apiKey',
            in: 'header',
            name: 'x-lodariq-workspace-id',
            description: 'Development-only fallback; disabled in production.',
          },
        },
      },
    },
  });

  void fastify.register(async (controlPlane) => {
    controlPlane.get('/openapi.json', { schema: { hide: true } }, async () =>
      controlPlane.swagger(),
    );

    registerControlPlaneRoutes(controlPlane, {
      repository,
      authProvider,
      publicApiBaseUrl,
      loaderSrc,
      creatorLoaderSrc,
      authoringIframeSrc,
    });
  });

  return fastify;
}
