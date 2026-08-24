import { describe, expect, it } from 'vitest';
import { compile } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  validateTourPublishReadiness,
  type DeliverableExperienceType,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';
import { createExperienceDraft } from '@lodariq/sdk-authoring/creator-experiences';

const TYPES: readonly DeliverableExperienceType[] = [
  'tour',
  'announcement',
  'hotspot',
  'survey',
  'checklist',
];

describe('authoring → compiler → release experience parity', () => {
  it.each(TYPES)('compiles and release-checks %s through the shared pipeline', (type) => {
    const document = authoredDocument(type);
    const compiled = compile({
      document,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });

    expect(compiled.type).toBe(type);
    expect(compiled.experience?.type).toBe(type);
    expect(compiled.steps.length).toBeGreaterThan(0);
    expect(
      validateTourPublishReadiness(document).filter(
        (issue) =>
          issue.code === 'unsupported_document_type' || issue.code === 'unsupported_tour_block',
      ),
    ).toEqual([]);
  });

  it('compiles announcement and checklist drop forms into closed renderer surfaces', () => {
    const announcement = authoredDocument('announcement');
    announcement.surfaceForm = 'banner';
    const checklist = authoredDocument('checklist');
    checklist.surfaceForm = 'drawer';

    expect(compileInput(announcement).experience).toMatchObject({
      type: 'announcement',
      surface: 'banner',
      frequency: 'session',
    });
    expect(compileInput(checklist).experience).toMatchObject({
      type: 'checklist',
      surface: 'drawer',
      showProgress: true,
      itemBlockIds: expect.arrayContaining([expect.stringMatching(/^block_/u)]),
    });
  });

  it('fails closed on knowledge and invalid cross-type surfaces', () => {
    const knowledge = authoredDocument('announcement');
    knowledge.type = 'knowledge';
    expect(() => compileInput(knowledge)).toThrow(/Unsupported delivery experience type/u);

    const announcement = authoredDocument('announcement');
    announcement.surfaceForm = 'drawer';
    expect(() => compileInput(announcement)).toThrow(/Announcement surface/u);
    expect(validateTourPublishReadiness(announcement)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_experience_configuration' }),
      ]),
    );

    const survey = authoredDocument('survey');
    survey.experience = { type: 'tour' };
    expect(() => compileInput(survey)).toThrow(/Invalid survey experience behavior/u);

    const checklist = authoredDocument('checklist');
    checklist.blocks[0]!.type = 'spotlight';
    expect(() => compileInput(checklist)).toThrow(/Unsupported checklist root block/u);
  });
});

function compileInput(document: LodariqDocument) {
  return compile({
    document,
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
}

function authoredDocument(type: DeliverableExperienceType): LodariqDocument {
  const document = createExperienceDraft({
    documentId: `doc_${type}`,
    workspaceId: 'wk_parity',
    environment: 'staging',
    schemaVersion: '2.0.0',
    type,
  });
  if (document.blocks.length === 0) {
    document.blocks = [tourStep()];
  }
  if (type === 'tour' || type === 'hotspot') bindTarget(document);
  return document;
}

function tourStep(): LodariqBlock {
  return {
    id: 'block_tour_step',
    type: 'tourStep',
    props: { index: 0 },
    status: 'ready',
    children: [
      {
        id: 'block_tour_tooltip',
        type: 'tooltip',
        props: { placement: 'bottom' },
        status: 'ready',
        children: [
          {
            id: 'block_tour_heading',
            type: 'heading',
            content: 'Welcome',
            props: { level: 2 },
            status: 'ready',
            children: [],
          },
          {
            id: 'block_tour_action',
            type: 'button',
            content: 'Done',
            props: { action: { type: 'complete' } },
            status: 'ready',
            children: [],
          },
        ],
      },
    ],
  };
}

function bindTarget(document: LodariqDocument): void {
  const targetId = `target_${document.type}`;
  document.targets = [
    {
      id: targetId,
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'Open',
        stableAttributes: { 'data-testid': 'open' },
      },
    },
  ];
  document.blocks = document.blocks.map((root) => bindRootTarget(root, targetId));
}

function bindRootTarget(root: LodariqBlock, targetId: string): LodariqBlock {
  if (root.type === 'tooltip') {
    return { ...root, status: 'ready', props: { ...root.props, targetId } };
  }
  return {
    ...root,
    status: 'ready',
    children: root.children.map((child) =>
      child.type === 'tooltip'
        ? { ...child, status: 'ready', props: { ...child.props, targetId } }
        : child,
    ),
  };
}
