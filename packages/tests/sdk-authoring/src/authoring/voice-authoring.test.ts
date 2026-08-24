import { describe, expect, it } from 'vitest';
import { createVoiceAuthoringProposal } from '@lodariq/sdk-authoring';

describe('voice authoring proposal', () => {
  it('creates a bounded, review-required step from a spoken command', () => {
    const proposal = createVoiceAuthoringProposal({
      locale: 'en-US',
      transcript: 'Create a step called Invite teammates. Show people where to add their team.',
      segments: [
        { text: 'Create a step called Invite teammates.', startMs: 0, endMs: 1_200 },
        { text: 'Show people where to add their team.', startMs: 1_200, endMs: 2_700 },
      ],
      target: { targetId: 'target_invite', accessibilityName: 'Invite teammates' },
    });

    expect(proposal).toMatchObject({
      locale: 'en-US',
      reviewRequired: true,
      proposedStep: {
        title: 'Invite teammates',
        body: 'Show people where to add their team.',
      },
      narrationScript: 'Show people where to add their team.',
      proposedTarget: {
        targetId: 'target_invite',
        accessibilityName: 'Invite teammates',
      },
    });
    expect(proposal?.segments).toHaveLength(2);
  });

  it('keeps only the first bounded step and never returns an empty proposal', () => {
    const proposal = createVoiceAuthoringProposal({
      locale: '',
      transcript: 'Next step explain reporting. New step should not be committed automatically.',
      segments: [],
    });

    expect(proposal).toMatchObject({
      locale: 'en-US',
      proposedStep: {
        title: 'explain reporting',
        body: 'explain reporting.',
      },
    });
  });

  it('rejects whitespace-only microphone input', () => {
    expect(
      createVoiceAuthoringProposal({ locale: 'en-US', transcript: '  ', segments: [] }),
    ).toBeNull();
  });
});
