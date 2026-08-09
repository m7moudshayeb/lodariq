import type { ControlPlaneRepository } from '@lodariq/database';
import { createHeaderAuthProvider } from './header-auth';
import { createLodariqAuthProvider } from './lodariq-auth';
import type { AuthProvider } from './types';

export interface CreateAuthProviderOptions {
  mode?: 'lodariq' | 'headers';
  repository?: ControlPlaneRepository;
  defaultWorkspaceId?: string;
  defaultUserId?: string;
}

export function createAuthProviderFromEnvironment(
  options: CreateAuthProviderOptions = {},
): AuthProvider {
  const mode = readAuthMode(options.mode ?? process.env.LODARIQ_AUTH_MODE);

  if (mode === 'lodariq') {
    if (!options.repository) throw new Error('Lodariq auth requires an identity repository');
    return createLodariqAuthProvider(options.repository);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Header auth mode is not allowed in production; configure Lodariq auth instead',
    );
  }

  return createHeaderAuthProvider({
    defaultWorkspaceId: options.defaultWorkspaceId,
    defaultUserId: options.defaultUserId,
  });
}

function readAuthMode(value: string | undefined): 'lodariq' | 'headers' {
  const mode = value?.trim();
  if (!mode) return 'lodariq';
  if (mode === 'lodariq' || mode === 'headers') return mode;
  throw new Error(`Invalid LODARIQ_AUTH_MODE "${mode}"; expected "lodariq" or "headers"`);
}
