import { describe, expect, it } from 'vitest';
import {
  publishReadinessIssueLabel,
  validateTourPublishReadiness,
  type LodariqBlock,
  type LodariqDocument,
  type PublishReadinessIssueCode,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { createTargetIdentityV2 } from '../../fixtures/target-identity-v2';

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

  it('keeps rich text, action styling, and popup composition on supported block types', () => {
    const document = cloneFixture();
    const body = tooltipBody(document);
    const paragraph = body.find((block) => block.type === 'paragraph')!;
    const button = body.find((block) => block.type === 'button')!;
    button.contentRuns = [{ text: button.content ?? '' }];
    paragraph.props.buttonStyle = { width: 'fill' };
    paragraph.props.tooltipLayout = { contentAlign: 'center' };

    const invalidBlockIds = validateTourPublishReadiness(document)
      .filter((issue) => issue.code === 'invalid_block')
      .map((issue) => issue.blockId);

    expect(invalidBlockIds).toContain(button.id);
    expect(invalidBlockIds.filter((blockId) => blockId === paragraph.id)).toHaveLength(2);
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

  it('labels readiness blockers for creator-facing surfaces', () => {
    expect(publishReadinessIssueLabel('missing_step_target')).toBe('Missing target');
    expect(publishReadinessIssueLabel('button_missing_action')).toBe('Incomplete button action');
    expect(publishReadinessIssueLabel('open_page_unsafe_url')).toBe('Unsafe URL');
    expect(publishReadinessIssueLabel('invalid_presentation_anchor')).toBe(
      'Invalid presentation area',
    );
  });

  it('accepts exact presentation geometry inside the selected element', () => {
    const document = cloneFixture();
    tooltip(document).props.presentationAnchor = {
      kind: 'region',
      xRatio: 0.2,
      yRatio: 0.3,
      widthRatio: 0.4,
      heightRatio: 0.5,
    };

    expect(issueCodes(document)).not.toContain('invalid_presentation_anchor');
  });

  it('blocks exact presentation geometry that extends outside the selected element', () => {
    const document = cloneFixture();
    Object.assign(tooltip(document).props, {
      presentationAnchor: {
        kind: 'region',
        xRatio: 0.8,
        yRatio: 0.7,
        widthRatio: 0.3,
        heightRatio: 0.4,
      },
    });

    expect(issueCodes(document)).toContain('invalid_presentation_anchor');
  });

  it('blocks presentation geometry placed on body content instead of the step tooltip', () => {
    const document = cloneFixture();
    const heading = tooltip(document).children.find((block) => block.type === 'heading');
    if (!heading) throw new Error('fixture heading missing');
    heading.props.presentationAnchor = { kind: 'point', xRatio: 0.5, yRatio: 0.5 };

    expect(issueCodes(document)).toContain('invalid_presentation_anchor');
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

  it('distinguishes unverified targets from observed drift', () => {
    const document = cloneFixture();
    const unverified = validateTourPublishReadiness(document, {
      requireVerifiedTargets: true,
    });
    const drifted = validateTourPublishReadiness(document, {
      requireVerifiedTargets: true,
      targetDiagnostics: {
        target_new_project: {
          state: 'needs_review',
          confidence: 68,
          candidateCount: 1,
          reasonCode: 'evidence_drift',
        },
      },
    });

    expect(unverified.map((issue) => issue.code)).toContain('target_unverified');
    expect(drifted.map((issue) => issue.code)).toContain('target_needs_review');
    expect(drifted.map((issue) => issue.code)).not.toContain('target_unverified');
  });

  it('blocks weak V2 capture evidence even without a live diagnostic payload', () => {
    const document = cloneFixture();
    const target = document.targets[0]!;
    target.identity = createTargetIdentityV2(target.id);
    target.identity.captureEvidence.quality = 'weak';
    target.identity.captureEvidence.uniqueCandidateCount = 2;
    target.identity.captureEvidence.runnerUpMargin = 0;

    expect(issueCodes(document)).toContain('target_needs_review');
  });

  it('blocks incomplete action and media placeholders', () => {
    const document = cloneFixture();
    const body = tooltipBody(document);
    body.splice(2, 0, linkBlock(''), mediaBlock());

    expect(issueCodes(document)).toEqual(
      expect.arrayContaining(['open_page_missing_url', 'incomplete_media']),
    );
  });

  it('blocks openPage URLs outside the Phase 1 navigation policy', () => {
    const document = cloneFixture();
    tooltipBody(document).splice(2, 0, linkBlock('http://example.com/settings'));

    const issues = validateTourPublishReadiness(document);

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'open_page_unsafe_url',
        blockId: 'block_link_test',
      }),
    );
  });

  it('accepts safe openPage URL forms', () => {
    for (const url of ['https://example.com/settings', 'mailto:support@example.com', '/settings']) {
      const document = cloneFixture();
      tooltipBody(document).splice(2, 0, linkBlock(url));

      expect(issueCodes(document)).not.toContain('open_page_unsafe_url');
    }
  });

  it('blocks lifecycle hints that cannot be resolved semantically', () => {
    const document = cloneFixture();
    document.targets[0]!.lifecycle = {
      openPanel: {
        tagName: 'button',
        stableAttributes: {},
        diagnosticCoordinates: { x: 10, y: 20 },
      },
    };

    expect(issueCodes(document)).toContain('unresolved_lifecycle_hint');
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
