import { createClerkAuthProvider } from './clerk-auth';
import { createHeaderAuthProvider } from './header-auth';
import type { AuthProvider } from './types';

export interface CreateAuthProviderOptions {
  mode?: 'clerk' | 'headers';
  defaultWorkspaceId?: string;
  defaultUserId?: string;
}

export function createAuthProviderFromEnvironment(
  options: CreateAuthProviderOptions = {},
): AuthProvider {
  const mode = readAuthMode(options.mode ?? process.env.LODARIQ_AUTH_MODE);

  if (mode === 'clerk') return createClerkAuthProvider();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Header auth mode is not allowed in production; configure Clerk auth instead');
  }

  return createHeaderAuthProvider({
    defaultWorkspaceId: options.defaultWorkspaceId,
    defaultUserId: options.defaultUserId,
  });
}

function readAuthMode(value: string | undefined): 'clerk' | 'headers' {
  const mode = value?.trim();
  if (!mode) return process.env.NODE_ENV === 'production' ? 'clerk' : 'headers';
  if (mode === 'clerk' || mode === 'headers') return mode;
  throw new Error(`Invalid LODARIQ_AUTH_MODE "${mode}"; expected "clerk" or "headers"`);
}
