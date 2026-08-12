import type {
  WorkspaceThemeDetailDto,
  WorkspaceThemeDto,
  WorkspaceThemeVersionDto,
} from '../lib/api';

export type BrandSystemActionState =
  | {
      status: 'success';
      message: string;
      theme?: WorkspaceThemeDto;
      detail?: WorkspaceThemeDetailDto;
      approvedVersion?: WorkspaceThemeVersionDto;
      acknowledgedDocumentId?: string;
    }
  | { status: 'error'; error: string };
