import { describe, expect, it } from 'vitest';
import {
  validateTourPublishReadiness,
  type LodariqBlock,
  type LodariqDocument,
  type PublishReadinessIssueCode,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const fixture = tourFixture as LodariqDocument;

describe('tour publish readiness', () => {
  it('accepts the canonical linear tour fixture', () => {
    expect(validateTourPublishReadiness(cloneFixture())).toEqual([]);
  });

  it('accepts list, divider, and link blocks when required action config is complete', () => {
    const document = cloneFixture();
    const body = tooltipBody(document);
    body.splice(2, 0, listBlock(), dividerBlock(), linkBlock('/settings'));

    expect(validateTourPublishReadiness(document)).toEqual([]);
  });

  it('blocks steps without a semantic target', () => {
    const document = cloneFixture();
    delete tooltip(document).props.targetId;

    expect(issueCodes(document)).toContain('missing_step_target');
  });

  it('blocks references to targets that are not in the document target list', () => {
    const document = cloneFixture();
    tooltip(document).props.targetId = 'target_missing';

    expect(issueCodes(document)).toContain('broken_target_reference');
  });

  it('blocks unresolved target diagnostics from local authoring review', () => {
    const document = cloneFixture();
    const issues = validateTourPublishReadiness(document, {
      targetDiagnostics: new Map([
        [
          'target_new_project',
          {
            action: 'test',
            diagnostic: {
              state: 'missing',
              confidence: 0,
              candidateCount: 0,
            },
          },
        ],
      ]),
    });

    expect(issues.map((issue) => issue.code)).toContain('target_unresolved');
  });

  it('blocks incomplete action and media placeholders', () => {
    const document = cloneFixture();
    const body = tooltipBody(document);
    body.splice(2, 0, linkBlock(''), mediaBlock());

    expect(issueCodes(document)).toEqual(
      expect.arrayContaining(['open_page_missing_url', 'incomplete_media']),
    );
  });
});

function cloneFixture(): LodariqDocument {
  return structuredClone(fixture);
}

function issueCodes(document: LodariqDocument): PublishReadinessIssueCode[] {
  return validateTourPublishReadiness(document).map((issue) => issue.code);
}

function tooltip(document: LodariqDocument): LodariqBlock {
  const block = document.blocks[0]?.children.find((child) => child.type === 'tooltip');
  if (!block) throw new Error('fixture tooltip missing');
  return block;
}

function tooltipBody(document: LodariqDocument): LodariqBlock[] {
  return tooltip(document).children;
}

function listBlock(): LodariqBlock {
  return {
    id: 'block_list_test',
    type: 'list',
    content: 'First item\nSecond item',
    props: {},
    status: 'ready',
    children: [],
  };
}

function dividerBlock(): LodariqBlock {
  return {
    id: 'block_divider_test',
    type: 'divider',
    props: {},
    status: 'ready',
    children: [],
  };
}

function linkBlock(url: string): LodariqBlock {
  return {
    id: 'block_link_test',
    type: 'link',
    content: 'Open settings',
    props: { action: url ? { type: 'openPage', url } : { type: 'openPage' } },
    status: url ? 'ready' : 'incomplete',
    children: [],
  };
}

function mediaBlock(): LodariqBlock {
  return {
    id: 'block_media_test',
    type: 'media',
    content: 'Media placeholder',
    props: {},
    status: 'incomplete',
    children: [],
  };
}
