import type { ControlPlaneRepository } from '@lodariq/database';
import {
  AuthEmailOutboxWorker,
  createResendAuthEmailSender,
  readAuthEmailDeliveryEnvironment,
} from './auth-email-outbox';
import type { EmailVerificationDeliveryCapability } from './email-verification';
import type { ObservabilitySink } from '../observability';

export interface AuthEmailRuntime {
  deliveryCapability: EmailVerificationDeliveryCapability;
  worker: AuthEmailWorkerLifecycle;
}

export interface AuthEmailWorkerLifecycle {
  start(): void;
  stop(): Promise<void>;
}

export function createAuthEmailRuntimeFromEnvironment(
  repository: ControlPlaneRepository,
  environment: NodeJS.ProcessEnv = process.env,
  observability?: ObservabilitySink,
): AuthEmailRuntime | null {
  const configuredMode = environment.LODARIQ_EMAIL_DELIVERY_MODE?.trim();
  if (!configuredMode || configuredMode === 'disabled') return null;

  const config = readAuthEmailDeliveryEnvironment(environment);
  if (config.mode === 'disabled') return null;
  return {
    deliveryCapability: {
      kind: 'email-verification-dispatcher-v1',
      secret: config.tokenKeys[config.activeTokenKeyId]!,
      keyId: config.activeTokenKeyId,
    },
    worker: new AuthEmailOutboxWorker({
      queue: repository,
      sender: createResendAuthEmailSender({
        apiKey: config.apiKey,
        from: config.from,
      }),
      appBaseUrl: config.appBaseUrl,
      tokenKeys: config.tokenKeys,
      observability,
    }),
  };
}
