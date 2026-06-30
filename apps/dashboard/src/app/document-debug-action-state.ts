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
    };

export const initialDocumentDebugActionState: DocumentDebugActionState = { status: 'idle' };
