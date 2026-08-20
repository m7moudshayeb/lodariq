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
  createAuthLifecycleMaintenanceFromEnvironment,
  createPasswordHashAdmissionGateFromEnvironment,
  readWebAuthnConfiguration,
  readOidcConfiguration,
  readEnterpriseOidcConfiguration,
  type AuthEmailRuntime,
  type AuthLifecycleMaintenance,
  type AuthProvider,
  type EmailVerificationDeliveryCapability,
  type PasswordHashAdmissionGateLike,
  type WebAuthnConfiguration,
  type OidcConfiguration,
  type EnterpriseOidcConfiguration,
} from './auth';
import { noopObservability, type ObservabilitySink } from './observability';
import { registerAuthRoutes } from './routes/auth';
import { registerAccountManagementRoutes } from './routes/account-management';
import { registerTenantAdministrationRoutes } from './routes/tenant-administration';
import { registerAssuranceRoutes } from './routes/assurance';
import { registerOidcRoutes } from './routes/oidc';
import {
  registerEnterpriseIdentityRoutes,
  type EnterpriseDomainVerificationCapability,
} from './routes/enterprise-identity';
import { registerControlPlaneRoutes } from './routes/control-plane';
import {
  createDeepLAuthoringTranslationProvider,
  type AuthoringTranslationProvider,
} from './authoring-translation';

export interface CreateApiAppOptions {
  repository?: ControlPlaneRepository;
  authProvider?: AuthProvider;
  logger?: boolean;
  defaultWorkspaceId?: string;
  defaultUserId?: string;
  publicApiBaseUrl?: string;
  loaderSrc?: string;
  publicLoaderSrc?: string;
  publicLoaderIntegrity?: string;
  creatorLoaderSrc?: string;
  creatorModule?: CreatorModuleDescriptor;
  authoringIframeSrc?: string;
  observability?: ObservabilitySink;
  emailVerificationDelivery?: EmailVerificationDeliveryCapability;
  authEmailRuntime?: AuthEmailRuntime | null;
  authLifecycleMaintenance?: AuthLifecycleMaintenance | null;
  passwordHashAdmissionGate?: PasswordHashAdmissionGateLike;
  authClock?: () => Date;
  authoringTranslationProvider?: AuthoringTranslationProvider | null;
  webAuthnConfiguration?: WebAuthnConfiguration | null;
  oidcConfiguration?: OidcConfiguration | null;
  enterpriseDomainVerification?: EnterpriseDomainVerificationCapability;
  enterpriseOidcConfiguration?: EnterpriseOidcConfiguration | null;
}

export function createApiApp(options: CreateApiAppOptions = {}): FastifyInstance {
  const publicApiBaseUrl =
    options.publicApiBaseUrl ?? process.env.LODARIQ_PUBLIC_API_BASE_URL ?? 'https://api.lodariq.io';
  const loaderSrc = options.loaderSrc ?? process.env.LODARIQ_LOADER_SRC;
  const publicLoaderSrc = options.publicLoaderSrc ?? process.env.LODARIQ_PUBLIC_LOADER_SRC;
  const publicLoaderIntegrity =
    options.publicLoaderIntegrity ?? process.env.LODARIQ_PUBLIC_LOADER_INTEGRITY;
  const creatorLoaderSrc =
    options.creatorLoaderSrc ??
    process.env.LODARIQ_CREATOR_LOADER_SRC ??
    loaderSrc?.replace(/lodariq-loader\.js(?:\?.*)?$/, 'lodariq-creator.js');
  const creatorModule =
    options.creatorModule ?? readCreatorModuleDescriptorFromEnvironment(process.env);
  const authoringIframeSrc =
    options.authoringIframeSrc ??
    process.env.LODARIQ_AUTHORING_IFRAME_SRC ??
    'https://editor.lodariq.io/authoring.html';
  const defaultWorkspaceId =
    options.defaultWorkspaceId ?? process.env.LODARIQ_DEV_WORKSPACE_ID ?? 'wk_local_dev';
  const defaultUserId =
    options.defaultUserId ?? process.env.LODARIQ_DEV_USER_ID ?? 'user_local_dev';
  const ownsRepository = options.repository === undefined;
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
  const passwordHashAdmissionGate =
    options.passwordHashAdmissionGate ?? createPasswordHashAdmissionGateFromEnvironment();
  const authoringTranslationProvider =
    options.authoringTranslationProvider === null
      ? undefined
      : (options.authoringTranslationProvider ?? createDeepLAuthoringTranslationProvider());
  const webAuthnConfiguration =
    options.webAuthnConfiguration === undefined
      ? readWebAuthnConfiguration(process.env)
      : options.webAuthnConfiguration;
  const oidcConfiguration =
    options.oidcConfiguration === undefined
      ? readOidcConfiguration(process.env)
      : options.oidcConfiguration;
  const enterpriseOidcConfiguration =
    options.enterpriseOidcConfiguration === undefined
      ? readEnterpriseOidcConfiguration(process.env)
      : options.enterpriseOidcConfiguration;

  const fastify = Fastify({
    logger: options.logger
      ? {
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers.x-lodariq-auth-client-source',
              'req.headers.x-lodariq-domain-verification',
              'req.headers.x-lodariq-break-glass-request-id',
              'res.headers.set-cookie',
              'password',
              '*.password',
              '*.token',
              '*.resetToken',
              '*.verificationToken',
              '*.invitationToken',
              '*.state',
              '*.code',
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

  const observability: ObservabilitySink =
    options.observability ??
    (options.logger
      ? {
          emit(event) {
            fastify.log.info({ observability: event }, event.name);
          },
        }
      : noopObservability);
  let authEmailRuntime = options.authEmailRuntime;
  if (authEmailRuntime === undefined) {
    authEmailRuntime = options.emailVerificationDelivery
      ? null
      : createAuthEmailRuntimeFromEnvironment(repository, process.env, observability);
  }
  const emailVerificationDelivery =
    options.emailVerificationDelivery ?? authEmailRuntime?.deliveryCapability;
  let authLifecycleMaintenance = options.authLifecycleMaintenance;
  if (authLifecycleMaintenance === undefined) {
    authLifecycleMaintenance = ownsRepository
      ? createAuthLifecycleMaintenanceFromEnvironment(repository, observability)
      : null;
  }

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
        observability,
        clock: options.authClock,
      });
      registerAccountManagementRoutes(authApi, {
        repository,
        observability,
        emailVerificationDelivery,
        passwordHashAdmissionGate,
        clock: options.authClock,
      });
      registerTenantAdministrationRoutes(authApi, {
        repository,
        observability,
        emailVerificationDelivery,
        clock: options.authClock,
      });
      registerAssuranceRoutes(authApi, {
        repository,
        observability,
        configuration: webAuthnConfiguration,
        passwordHashAdmissionGate,
        clock: options.authClock,
      });
      registerOidcRoutes(authApi, {
        repository,
        observability,
        configuration: oidcConfiguration,
        clock: options.authClock,
      });
      registerEnterpriseIdentityRoutes(authApi, {
        repository,
        observability,
        domainVerification: options.enterpriseDomainVerification,
        oidcConfiguration: enterpriseOidcConfiguration,
        clock: options.authClock,
      });
    });
    registerControlPlaneRoutes(controlPlane, {
      repository,
      authProvider,
      publicApiBaseUrl,
      loaderSrc,
      publicLoaderSrc,
      publicLoaderIntegrity,
      creatorLoaderSrc,
      creatorModule,
      authoringIframeSrc,
      observability,
      authoringTranslationProvider,
    });
  });

  const activeAuthEmailRuntime = authEmailRuntime ?? null;
  if (activeAuthEmailRuntime) {
    fastify.addHook('onReady', () => {
      activeAuthEmailRuntime.worker.start();
    });
  }
  if (authLifecycleMaintenance) {
    fastify.addHook('onReady', () => {
      authLifecycleMaintenance.start();
    });
  }
  if (activeAuthEmailRuntime || authLifecycleMaintenance || ownsRepository) {
    fastify.addHook('onClose', async () => {
      if (activeAuthEmailRuntime) await activeAuthEmailRuntime.worker.stop();
      if (authLifecycleMaintenance) await authLifecycleMaintenance.stop();
      if (ownsRepository) await repository.close?.();
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
