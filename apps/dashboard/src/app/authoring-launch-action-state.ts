import type { AuthoringSessionDto, EnvironmentTokenDto } from '../lib/api';

export interface AuthoringLaunchActionState {
  status: 'idle' | 'success' | 'error';
  error?: string;
  sdkSnippet?: string;
  token?: EnvironmentTokenDto;
  authoringSession?: AuthoringSessionDto;
  bootstrapHeaderName?: string;
}

export const initialAuthoringLaunchActionState: AuthoringLaunchActionState = {
  status: 'idle',
};
