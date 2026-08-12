import { describe, expect, it } from 'vitest';
import * as authoringCompatibility from '@lodariq/sdk-authoring/lodariq-authoring';
import * as authoringFrame from '@lodariq/sdk-authoring/authoring-frame';

const AUTHORING_FRAME_RUNTIME_EXPORTS = [
  'AUTHORING_RELEASE_RECOVERY_PREPARATION_FAILURES',
  'AUTHORING_STAGING_RELEASE_STATES',
  'AuthoringBrandDriftController',
  'AuthoringBrandDriftRequestError',
  'ReleaseHistoryPanel',
  'ReleaseRecoveryConfirmation',
  'authoringReleaseRecoveryReasonFailure',
  'brandMatchProposalForFrame',
  'brandWorkspaceStateFromTheme',
  'createAuthoringBrandDriftViewModel',
  'createDirectAuthoringHostServices',
  'createAuthoringReleaseRecoveryIntent',
  'createAuthoringReleaseRecoveryViewModel',
  'mountLocalAuthoringFrame',
  'prepareAuthoringReleaseRecoveryRequest',
  'productionArtifactForFrame',
  'releaseWorkflowFromState',
  'requestAuthoringBrandDrift',
  'requestAuthoringBrandThemeAcknowledgement',
  'verificationForFrame',
  'withAuthoringBrandDriftRuntimePreview',
] as const;

describe('authoring frame import surface', () => {
  it('preserves the compatibility entry bindings while exposing a narrower frame graph', () => {
    expect(Object.keys(authoringFrame).sort()).toEqual([...AUTHORING_FRAME_RUNTIME_EXPORTS].sort());

    for (const exportName of AUTHORING_FRAME_RUNTIME_EXPORTS) {
      expect(authoringFrame[exportName]).toBe(authoringCompatibility[exportName]);
    }
  });
});
