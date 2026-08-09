import Fastify, { type FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import {
  createControlPlaneRepositoryFromEnvironment,
  type ControlPlaneRepository,
} from '@lodariq/database';
import {
  AUTH_PASSWORD_FORMAT,
  FASTIFY_REFERENCE_SCHEMA_REGISTRY,
  isAuthPassword,
  type CreatorModuleDescriptor,
} from '@lodariq/schema';
import {
  createAuthProviderFromEnvironment,
  createAuthEmailRuntimeFromEnvironment,
  createPasswordHashAdmissionGateFromEnvironment,
  type AuthEmailRuntime,
  type AuthProvider,
  type EmailVerificationDeliveryCapability,
  type PasswordHashAdmissionGateLike,
} from './auth';
import { noopObservability, type ObservabilitySink } from './observability';
import { registerAuthRoutes } from './routes/auth';
import { registerControlPlaneRoutes } from './routes/control-plane';

export interface CreateApiAppOptions {
  repository?: ControlPlaneRepository;
  authProvider?: AuthProvider;
  logger?: boolean;
  defaultWorkspaceId?: string;
  defaultUserId?: string;
  publicApiBaseUrl?: string;
  loaderSrc?: string;
  publicLoaderSrc?: string;
  creatorLoaderSrc?: string;
  creatorModule?: CreatorModuleDescriptor;
  authoringIframeSrc?: string;
  observability?: ObservabilitySink;
  emailVerificationDelivery?: EmailVerificationDeliveryCapability;
  authEmailRuntime?: AuthEmailRuntime | null;
  passwordHashAdmissionGate?: PasswordHashAdmissionGateLike;
}

export function createApiApp(options: CreateApiAppOptions = {}): FastifyInstance {
  const publicApiBaseUrl =
    options.publicApiBaseUrl ??
    process.env.LODARIQ_PUBLIC_API_BASE_URL ??
    'https://api.lodariq.com';
  const loaderSrc = options.loaderSrc ?? process.env.LODARIQ_LOADER_SRC;
  const publicLoaderSrc = options.publicLoaderSrc ?? process.env.LODARIQ_PUBLIC_LOADER_SRC;
  const creatorLoaderSrc =
    options.creatorLoaderSrc ??
    process.env.LODARIQ_CREATOR_LOADER_SRC ??
    loaderSrc?.replace(/lodariq-loader\.js(?:\?.*)?$/, 'lodariq-creator.js');
  const creatorModule =
    options.creatorModule ?? readCreatorModuleDescriptorFromEnvironment(process.env);
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
      defaultUserId,
      allowInMemoryFallback: process.env.NODE_ENV !== 'production',
    });
  const authProvider =
    options.authProvider ??
    createAuthProviderFromEnvironment({
      repository,
      defaultWorkspaceId: process.env.NODE_ENV === 'production' ? undefined : defaultWorkspaceId,
      defaultUserId: process.env.NODE_ENV === 'production' ? undefined : defaultUserId,
    });
  let authEmailRuntime = options.authEmailRuntime;
  if (authEmailRuntime === undefined) {
    authEmailRuntime = options.emailVerificationDelivery
      ? null
      : createAuthEmailRuntimeFromEnvironment(repository);
  }
  const emailVerificationDelivery =
    options.emailVerificationDelivery ?? authEmailRuntime?.deliveryCapability;
  const passwordHashAdmissionGate =
    options.passwordHashAdmissionGate ?? createPasswordHashAdmissionGateFromEnvironment();

  const fastify = Fastify({
    logger: options.logger
      ? {
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers.x-lodariq-auth-client-source',
              'res.headers.set-cookie',
              'password',
              '*.password',
              '*.token',
              '*.resetToken',
              '*.verificationToken',
            ],
            censor: '[REDACTED]',
          },
        }
      : false,
    ajv: {
      customOptions: {
        allErrors: false,
        removeAdditional: false,
      },
      onCreate(ajv) {
        ajv.addFormat(AUTH_PASSWORD_FORMAT, isAuthPassword);
      },
    },
  });

  for (const schema of FASTIFY_REFERENCE_SCHEMA_REGISTRY) {
    fastify.addSchema(schema);
  }

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

    void controlPlane.register(async (authApi) => {
      registerAuthRoutes(authApi, {
        repository,
        emailVerificationDelivery,
        passwordHashAdmissionGate,
      });
    });
    registerControlPlaneRoutes(controlPlane, {
      repository,
      authProvider,
      publicApiBaseUrl,
      loaderSrc,
      publicLoaderSrc,
      creatorLoaderSrc,
      creatorModule,
      authoringIframeSrc,
      observability: options.observability ?? noopObservability,
    });
  });

  if (authEmailRuntime) {
    const activeAuthEmailRuntime = authEmailRuntime;
    fastify.addHook('onReady', () => {
      activeAuthEmailRuntime.worker.start();
    });
    fastify.addHook('onClose', async () => {
      await activeAuthEmailRuntime.worker.stop();
    });
  }

  return fastify;
}

function readCreatorModuleDescriptorFromEnvironment(
  environment: NodeJS.ProcessEnv,
): CreatorModuleDescriptor | undefined {
  const url = environment.LODARIQ_CREATOR_MODULE_URL?.trim();
  const version = environment.LODARIQ_CREATOR_MODULE_VERSION?.trim();
  const integrity = environment.LODARIQ_CREATOR_MODULE_INTEGRITY?.trim();

  if (!url && !version && !integrity) return undefined;
  return {
    url: url ?? '',
    version: version ?? '',
    integrity: integrity ?? '',
  };
}
