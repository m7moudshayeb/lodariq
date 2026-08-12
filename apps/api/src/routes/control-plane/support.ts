import {
  AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
  AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS,
  PUBLIC_SDK_BOOTSTRAP_GRANT_MAX_TTL_MS,
  type AuthoringSessionRecord,
  type PersistedCompiledArtifact,
  type PersistedPublication,
} from '@lodariq/database';

export const PUBLIC_SDK_INSTALLATION_HEADER = 'x-lodariq-installation-id';

export const SDK_DELIVERY_RETRY_ATTEMPT_HEADER = 'x-lodariq-retry-attempt';

export const SDK_DELIVERY_MAX_OBSERVED_DURATION_MS = 60_000;

export const AUTHORING_SESSION_TTL_MS = 15 * 60 * 1000;

export const AUTHORING_AUTHORIZATION_REQUEST_TTL_MS = Math.min(
  110 * 1000,
  AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS,
);

export const AUTHORING_AUTHORIZATION_CODE_TTL_MS = Math.max(
  AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
  Math.min(75 * 1000, AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS),
);

export const AUTHORING_ACTIVATION_GRANT_TTL_MS = Math.min(
  2 * 60 * 1000,
  AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS,
);

export const PUBLIC_SDK_BOOTSTRAP_GRANT_TTL_MS = Math.min(
  2 * 60 * 1000,
  PUBLIC_SDK_BOOTSTRAP_GRANT_MAX_TTL_MS,
);

export const CREATOR_MODULE_CONTENT_ADDRESS_PATTERN = /\/sha256-[0-9a-f]{64}(?:\/|$)/u;

export const DOCUMENT_SPECIFIC_DELIVERY_REQUIRED_ERROR = 'document_specific_delivery_required';

export const DOCUMENT_RELEASE_MIGRATION_REQUIRED_ERROR = 'document_release_migration_required';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export const RELEASE_CORRELATION_ID_HEADER = 'x-lodariq-correlation-id';

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u;

export const RELEASE_CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/u;

export type CompiledArtifactResponse = Omit<PersistedCompiledArtifact, 'compiled'>;

export type PublicationResponse = Omit<PersistedPublication, 'artifact'> & {
  artifact: CompiledArtifactResponse;
};

export type AuthoringSessionResponse = Omit<AuthoringSessionRecord, 'tokenHash'>;
