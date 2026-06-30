import { createDefaultControlPlaneEnvironments } from './seed';
import { createDrizzleControlPlaneRepository } from './drizzle-repository';
import { createNeonDatabase } from './neon';
import {
  createInMemoryControlPlaneRepository,
  type ControlPlaneRepository,
  type WorkspaceEnvironment,
} from './repository';

export interface CreateControlPlaneRepositoryFromEnvironmentOptions {
  env?: NodeJS.ProcessEnv;
  defaultWorkspaceId?: string;
  defaultEnvironments?: WorkspaceEnvironment[];
  allowInMemoryFallback?: boolean;
}

export function createControlPlaneRepositoryFromEnvironment(
  options: CreateControlPlaneRepositoryFromEnvironmentOptions = {},
): ControlPlaneRepository {
  const env = options.env ?? process.env;
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl?.trim()) {
    return createDrizzleControlPlaneRepository(createNeonDatabase(databaseUrl));
  }

  const allowFallback = options.allowInMemoryFallback ?? env.NODE_ENV !== 'production';
  if (!allowFallback) {
    throw new Error('DATABASE_URL is required for the Lodariq API in production');
  }

  const defaultWorkspaceId = options.defaultWorkspaceId ?? 'wk_local_dev';
  return createInMemoryControlPlaneRepository({
    environments:
      options.defaultEnvironments ?? createDefaultControlPlaneEnvironments(defaultWorkspaceId),
  });
}
