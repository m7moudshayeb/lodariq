import type { EnvironmentTokenDto } from '../lib/api';

export type TokenRevokeActionState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'success'; token: EnvironmentTokenDto };

export const initialTokenRevokeActionState: TokenRevokeActionState = { status: 'idle' };
