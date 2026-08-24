import { describe, expect, it } from 'vitest';
import { createRecordToAuthorProposal } from '@lodariq/sdk-authoring';

describe('record to author proposal', () => {
  it('segments semantic evidence into review-required draft steps', () => {
    const proposal = createRecordToAuthorProposal([
      {
        kind: 'target-observed',
        targetId: 'target_invite',
        accessibleName: 'Invite teammates',
        role: 'button',
      },
      {
        kind: 'wait-for-lifecycle',
        semanticName: 'workspace-members',
        boundedMs: 1_200,
        lifecycleKind: 'state',
      },
    ]);

    expect(proposal).toMatchObject({
      evidenceBound: true,
      reviewRequired: true,
      segments: [
        {
          proposedTitle: 'Invite teammates',
          proposedCopy: 'Guide the user through Invite teammates.',
          actionIndexes: [0, 1],
          targetId: 'target_invite',
          targetLabel: 'Invite teammates',
          approach: {
            legs: [
              {
                act: { kind: 'observe' },
                wait: { type: 'event', eventName: 'workspace-members' },
                label: 'Wait for workspace-members',
              },
            ],
          },
        },
      ],
    });
  });

  it('starts a new proposed step for each observed target and retains route approaches', () => {
    const proposal = createRecordToAuthorProposal([
      {
        kind: 'wait-for-lifecycle',
        semanticName: 'projects-route',
        boundedMs: 200,
        lifecycleKind: 'route',
      },
      {
        kind: 'target-observed',
        targetId: 'target_projects',
        accessibleName: 'Projects',
        role: 'link',
      },
      {
        kind: 'target-observed',
        targetId: 'target_create',
        accessibleName: 'Create project',
        role: 'button',
      },
    ]);

    expect(proposal?.segments).toHaveLength(2);
    expect(proposal?.segments[0]).toMatchObject({
      targetId: 'target_projects',
      actionIndexes: [0, 1],
      approach: {
        legs: [{ act: { kind: 'navigate', routePatternId: 'projects-route' } }],
      },
    });
    expect(proposal?.segments[1]).toMatchObject({
      targetId: 'target_create',
      actionIndexes: [2],
    });
  });

  it('fails closed when a session recorded no semantic actions', () => {
    expect(createRecordToAuthorProposal([])).toBeNull();
  });
});
