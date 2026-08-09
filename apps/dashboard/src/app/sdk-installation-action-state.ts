import type { PublicSdkInstallationDto } from '../lib/api';

export type SdkInstallationActionState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | {
      status: 'success';
      installation: PublicSdkInstallationDto;
      warning?: string;
    };

export const initialSdkInstallationActionState: SdkInstallationActionState = {
  status: 'idle',
};
