import { describe, expect, it } from 'vitest';
import * as authoringCompatibility from '@lodariq/sdk-authoring/lodariq-authoring';
import * as authoringFrame from '@lodariq/sdk-authoring/authoring-frame';

const AUTHORING_FRAME_RUNTIME_EXPORTS = [
  'AUTHORING_STAGING_RELEASE_STATES',
  'brandMatchProposalForFrame',
  'brandWorkspaceStateFromTheme',
  'createDirectAuthoringHostServices',
  'mountLocalAuthoringFrame',
  'productionArtifactForFrame',
  'releaseWorkflowFromState',
  'verificationForFrame',
] as const;

describe('authoring frame import surface', () => {
  it('preserves the compatibility entry bindings while exposing a narrower frame graph', () => {
    expect(Object.keys(authoringFrame).sort()).toEqual([...AUTHORING_FRAME_RUNTIME_EXPORTS].sort());

    for (const exportName of AUTHORING_FRAME_RUNTIME_EXPORTS) {
      expect(authoringFrame[exportName]).toBe(authoringCompatibility[exportName]);
    }
  });
});
