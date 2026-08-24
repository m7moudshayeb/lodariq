// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type {
  AuthoringOperationsServices,
} from '../../../../../packages/sdk-authoring/src/authoring/operations/operations-services';
import type { CanonicalTemplateInstantiationResult, LodariqDocument } from '@lodariq/schema';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import { createRecordToAuthorProposal } from '../../../../../packages/sdk-authoring/src/authoring/record-to-author';
import { createVoiceAuthoringProposal } from '../../../../../packages/sdk-authoring/src/authoring/voice-authoring';

describe('reviewed proposal application', () => {
  it('persists voice copy, narration, and the reviewed semantic target', () => {
    const controller = createController();
    const proposal = createVoiceAuthoringProposal({
      locale: 'en-US',
      transcript: 'Create a step called Invite teammates. Show where the invite action lives.',
      segments: [],
      target: { targetId: 'target_invite', accessibilityName: 'Invite teammates' },
    });
    if (!proposal) throw new Error('voice proposal was not created');

    controller.applyVoiceAuthoringProposal(proposal);

    const blocks = controller.getSnapshot().documentState.blocks;
    const step = blocks[blocks.length - 1];
    expect(step?.props.narration).toMatchObject({
      script: 'Show where the invite action lives.',
      localeOverride: 'en-US',
    });
    expect(targetIdOf(step)).toBe('target_invite');
    expect(stepText(step)).toContain('Show where the invite action lives.');
  });

  it('persists recorded target bindings and bounded lifecycle approaches', () => {
    const controller = createController();
    const proposal = createRecordToAuthorProposal([
      {
        kind: 'wait-for-lifecycle',
        semanticName: 'members-ready',
        boundedMs: 500,
        lifecycleKind: 'state',
      },
      {
        kind: 'target-observed',
        targetId: 'target_invite',
        accessibleName: 'Invite teammates',
        role: 'button',
      },
    ]);
    if (!proposal) throw new Error('record proposal was not created');

    controller.applyRecordToAuthorProposal(proposal);

    const snapshot = controller.getSnapshot().documentState;
    expect(targetIdOf(snapshot.blocks[snapshot.blocks.length - 1])).toBe('target_invite');
    expect(snapshot.targets[0]?.approach).toEqual({
      legs: [
        {
          act: { kind: 'observe' },
          wait: { type: 'event', eventName: 'members-ready' },
          label: 'Wait for members-ready',
        },
      ],
    });
  });

  it('creates a template as a separate control-plane draft without replacing the open document', async () => {
    const result: CanonicalTemplateInstantiationResult = {
      operationId: 'tplop_12345678901234567890',
      templateId: 'guided-tour',
      templateVersion: 1,
      documentId: 'doc_template_separate',
      title: 'Guided tour',
      type: 'tour',
      targetProposals: [],
      created: true,
    };
    const instantiateTemplate = vi.fn().mockResolvedValue(result);
    const controller = createController({ instantiateTemplate } as unknown as AuthoringOperationsServices);
    const before = structuredClone(controller.getSnapshot().documentState);

    controller.applyStarterTemplate('guided-tour');

    await vi.waitFor(() => {
      expect(controller.getSnapshot().templateInstantiation).toEqual(result);
    });
    expect(instantiateTemplate).toHaveBeenCalledWith('guided-tour');
    expect(controller.getSnapshot().documentState).toEqual(before);
  });
});

function createController(operations?: AuthoringOperationsServices): LocalAuthoringFrameController {
  const root = document.createElement('div');
  document.body.append(root);
  return new LocalAuthoringFrameController({
    root,
    baseDocument: baseDocument(),
    services: {
      loadDocument: () => null,
      saveDocument: vi.fn(),
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
      ...(operations ? { operations } : {}),
    },
    sessionId: 'session_proposal_application',
    peerWindow: window,
  });
}

function baseDocument(): LodariqDocument {
  return {
    id: 'doc_proposal_application',
    workspaceId: 'wk_proposal_application',
    type: 'tour',
    status: 'draft',
    title: 'Proposal application',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [
      {
        id: 'target_invite',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'Invite teammates',
        },
      },
    ],
    blocks: [],
  } as LodariqDocument;
}

function targetIdOf(block: LodariqDocument['blocks'][number] | undefined): string | undefined {
  return block?.children.find((child) => child.type === 'tooltip')?.props.targetId;
}

function stepText(block: LodariqDocument['blocks'][number] | undefined): string {
  const lines: string[] = [];
  const visit = (candidate: LodariqDocument['blocks'][number]): void => {
    if (candidate.content) lines.push(candidate.content);
    candidate.children.forEach(visit);
  };
  if (block) visit(block);
  return lines.join(' ');
}
