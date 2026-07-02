export type DocumentDebugActionState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | {
      status: 'success';
      documentId: string;
      canonicalJson: string;
      compiledJson: string;
      latestContentHash: string;
      compilerVersion: string;
      versionCount: number;
      latestVersionLabel: string;
      publishReadinessIssues: DashboardPublishReadinessIssue[];
    };

export const initialDocumentDebugActionState: DocumentDebugActionState = { status: 'idle' };

export interface DashboardPublishReadinessIssue {
  code: string;
  blockId?: string;
  targetId?: string;
  label: string;
  message: string;
}
