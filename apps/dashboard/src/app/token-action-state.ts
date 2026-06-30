import type { EnvironmentTokenDto } from '../lib/api';

export interface TokenActionState {
  status: 'idle' | 'success' | 'error';
  error?: string;
  sdkSnippet?: string;
  token?: EnvironmentTokenDto;
}

export const initialTokenActionState: TokenActionState = {
  status: 'idle',
};
