export interface DirectAuthoringHostServiceOptions {
  peerWindow: Window;
  allowedOrigins: string[];
  targetOrigin: string;
  sessionId: string;
  workspaceId: string;
  documentId: string;
  publishToStaging: boolean;
  readReleaseRecovery?: boolean;
  rollbackRelease?: boolean;
  unpublishRelease?: boolean;
  sampleProductStyle?: boolean;
  saveStyleSource?: boolean;
  checkBrandDrift?: boolean;
  acknowledgeBrandTheme?: boolean;
  verifyBrowserPublication?: boolean;
  localeLayoutQa?: boolean;
  submitStagingVerification?: boolean;
  promoteProduction?: boolean;
  approveProduction?: boolean;
}
