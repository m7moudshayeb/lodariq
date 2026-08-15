import { describe, expect, it } from 'vitest';
import type { InlineTextRun, LodariqBlock } from '@lodariq/schema';
import {
  applyInlineTextStyle,
  attachTargetToBlocks,
  blocksReferenceTarget,
  createContentBlock,
  createTourStep,
  duplicateStepChildBlock,
  hasBlock,
  insertBlockInsideTourStep,
  insertTopLevelBlock,
  moveStepChildBlock,
  moveTopLevelBlock,
  normalizeTourRootBlocks,
  reconcileInlineTextRuns,
  renumberTourSteps,
  removeStepChildBlock,
  removeTargetFromBlocks,
  replaceRichContentInsideTourStep,
  reorderStepChildBlock,
  reorderTopLevelBlock,
  setBlockAction,
  setBlockActionUrl,
  setBlockLayout,
  setBlockPresentationAnchor,
  setButtonStyle,
  setTooltipLayout,
  setTooltipStyle,
  splitInlineTextRuns,
  transformBlocks,
  updateBlockContent,
  updateBlockContentRuns,
  mergeInlineTextRuns,
} from '@lodariq/sdk-authoring';

const blocks: LodariqBlock[] = [
  {
    id: 'step_1',
    type: 'tourStep',
    props: {},
    status: 'incomplete',
    children: [
      {
        id: 'tooltip_1',
        type: 'tooltip',
        props: {},
        children: [{ id: 'copy_1', type: 'paragraph', content: 'Hello', props: {}, children: [] }],
      },
    ],
  },
  { id: 'copy_2', type: 'paragraph', content: 'Second', props: {}, children: [] },
];

describe('authoring document ops', () => {
  it('creates a canonical editable tour step with heading, body, and next button', () => {
    const step = createTourStep(2);

    expect(step).toMatchObject({
      type: 'tourStep',
      props: { index: 2 },
      status: 'incomplete',
      children: [
        {
          type: 'tooltip',
          props: { placement: 'bottom' },
          status: 'incomplete',
        },
      ],
    });
    expect(step.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'button',
    ]);
    expect(step.children[0]?.children[2]).toMatchObject({
      content: 'Continue',
      props: { variant: 'primary', action: { type: 'next' } },
    });
  });

  it('creates typed accessible callout, stat, and icon compositions', () => {
    expect(createContentBlock('callout')).toMatchObject({
      type: 'callout',
      props: {
        accessibilityName: expect.any(String),
        composition: { kind: 'callout', tone: 'info' },
      },
      status: 'ready',
    });
    expect(createContentBlock('stat')).toMatchObject({
      type: 'stat',
      props: {
        accessibilityName: expect.any(String),
        composition: { kind: 'stat', emphasis: 'strong' },
      },
      status: 'ready',
    });
    expect(createContentBlock('icon')).toMatchObject({
      type: 'icon',
      props: {
        accessibilityName: expect.any(String),
        composition: { kind: 'icon', icon: 'info' },
      },
      status: 'ready',
    });
  });

  it('updates nested content and renumbers authored tour steps', () => {
    const step = createTourStep(9);
    const headingId = step.children[0]?.children[0]?.id ?? '';
    const updated = updateBlockContent([step], headingId, 'Updated heading');

    expect(updated[0]?.children[0]?.children[0]?.content).toBe('Updated heading');
    expect(step.children[0]?.children[0]?.content).toBe('Untitled step');
    expect(
      renumberTourSteps([step, { ...step, id: 'step_2' }]).map((block) => block.props),
    ).toEqual([{ index: 0 }, { index: 1 }]);
  });

  it('styles selected text ranges without converting content to HTML or Markdown', () => {
    const content = 'Your trial ends in 3 days.';
    const start = content.indexOf('3 days');
    const contentRuns = applyInlineTextStyle(content, undefined, start, start + 6, {
      mark: 'bold',
      fontSizePx: 24,
      color: '#006b58',
      highlightColor: '#fff0a8',
      link: '/billing',
    });
    const withRuns = updateBlockContentRuns(blocks, 'copy_1', content, contentRuns);
    const paragraph = withRuns[0]?.children[0]?.children[0];

    expect(paragraph?.content).toBe(content);
    expect(paragraph?.contentRuns).toEqual([
      { text: 'Your trial ends in ' },
      {
        text: '3 days',
        marks: ['bold'],
        fontSizePx: 24,
        color: '#006b58',
        highlightColor: '#fff0a8',
        link: '/billing',
      },
      { text: '.' },
    ]);
    expect(JSON.stringify(paragraph)).not.toContain('<');
    expect(JSON.stringify(paragraph)).not.toContain('style=');
    expect(applyInlineTextStyle(content, contentRuns, start, start + 6, { clear: true })).toEqual([
      { text: content },
    ]);

    const plainUpdate = updateBlockContent(withRuns, 'copy_1', 'Plain text');
    expect(plainUpdate[0]?.children[0]?.children[0]?.contentRuns).toBeUndefined();
  });

  it('preserves nearby inline styling while rich text continues to change', () => {
    const runs: InlineTextRun[] = [
      { text: 'Your trial ends in ' },
      { text: '3 days', marks: ['bold'], color: '#006b58' },
      { text: '.' },
    ];

    expect(
      reconcileInlineTextRuns('Your trial ends in 3 days.', runs, 'Your trial ends in 30 days.'),
    ).toEqual([
      { text: 'Your trial ends in ' },
      { text: '30 days', marks: ['bold'], color: '#006b58' },
      { text: '.' },
    ]);
    expect(
      reconcileInlineTextRuns('Your trial ends in 3 days.', runs, 'Your trial ends today.'),
    ).toEqual([{ text: 'Your trial ends today.' }]);
  });

  it('preserves inline styling when rich text lines split and merge', () => {
    const content = 'Before styled after';
    const runs: InlineTextRun[] = [
      { text: 'Before ' },
      { text: 'styled', fontSizePx: 24, color: '#006b58' },
      { text: ' after' },
    ];

    expect(splitInlineTextRuns(content, runs, 13)).toEqual({
      before: [{ text: 'Before ' }, { text: 'styled', fontSizePx: 24, color: '#006b58' }],
      after: [{ text: ' after' }],
    });
    expect(mergeInlineTextRuns('Before styled', runs.slice(0, 2), ' after', runs.slice(2))).toEqual(
      runs,
    );
  });

  it('applies safe flow, action, and popup composition properties', () => {
    const step = createTourStep(0);
    const tooltip = step.children[0]!;
    const button = tooltip.children.find((block) => block.type === 'button')!;
    let next = setBlockLayout([step], button.id, {
      align: 'center',
      spacingBefore: 'relaxed',
      spacingAfter: 'tight',
      spacingAfterPx: 18,
    });
    next = setButtonStyle(next, button.id, {
      width: 'fill',
      size: 'compact',
      fillColor: '#ffffff',
      textColor: '#006b58',
      borderColor: '#006b58',
      radius: 'round',
      icon: 'arrow-right',
      iconPlacement: 'end',
    });
    next = setTooltipLayout(next, tooltip.id, {
      contentAlign: 'center',
      actionLayout: 'stack',
      actionAlign: 'stretch',
      gap: 'relaxed',
      padding: 'compact',
    });
    next = setTooltipStyle(next, tooltip.id, {
      surfaceColor: '#162033',
      textColor: '#ffffff',
      borderColor: '#006b58',
      borderWeight: 'strong',
      elevation: 'floating',
    });

    const nextTooltip = next[0]!.children[0]!;
    const nextButton = nextTooltip.children.find((block) => block.id === button.id)!;
    expect(nextTooltip.props.tooltipLayout).toEqual({
      contentAlign: 'center',
      actionLayout: 'stack',
      actionAlign: 'stretch',
      gap: 'relaxed',
      padding: 'compact',
    });
    expect(nextTooltip.props.tooltipStyle).toEqual({
      surfaceColor: '#162033',
      textColor: '#ffffff',
      borderColor: '#006b58',
      borderWeight: 'strong',
      elevation: 'floating',
    });
    expect(nextButton.props.blockLayout).toEqual({
      align: 'center',
      spacingBefore: 'relaxed',
      spacingAfter: 'tight',
      spacingAfterPx: 18,
    });
    expect(nextButton.props.buttonStyle).toMatchObject({
      width: 'fill',
      fillColor: '#ffffff',
      icon: 'arrow-right',
    });
    expect(step.children[0]?.props.tooltipLayout).toBeUndefined();
    expect(step.children[0]?.props.tooltipStyle).toBeUndefined();
    expect(setTooltipStyle(next, tooltip.id)[0]?.children[0]?.props.tooltipStyle).toBeUndefined();
  });

  it('sets and clears normalized presentation geometry on the target-bearing block', () => {
    const withTarget = structuredClone(blocks);
    withTarget[0]!.children[0]!.props.targetId = 'target_1';

    const exact = setBlockPresentationAnchor(withTarget, 'tooltip_1', {
      kind: 'region',
      xRatio: 0.2,
      yRatio: 0.25,
      widthRatio: 0.4,
      heightRatio: 0.5,
    });
    const wholeElement = setBlockPresentationAnchor(exact, 'tooltip_1');

    expect(exact[0]?.children[0]?.props.presentationAnchor).toEqual({
      kind: 'region',
      xRatio: 0.2,
      yRatio: 0.25,
      widthRatio: 0.4,
      heightRatio: 0.5,
    });
    expect(wholeElement[0]?.children[0]?.props.presentationAnchor).toBeUndefined();
    expect(withTarget[0]?.children[0]?.props.presentationAnchor).toBeUndefined();
  });

  it('finds nested blocks and transforms block types', () => {
    expect(hasBlock(blocks, 'copy_1')).toBe(true);

    const next = transformBlocks(blocks, 'copy_2', 'button');

    expect(next[1]).toMatchObject({
      id: 'copy_2',
      type: 'button',
      content: 'Second',
      status: 'incomplete',
      props: { variant: 'primary' },
    });
    expect(blocks[1]?.type).toBe('paragraph');
  });

  it('can transform a block while replacing command gesture text', () => {
    const slashBlocks = [{ ...blocks[1]!, content: '/bu' }];
    const next = transformBlocks(slashBlocks, 'copy_2', 'button', 'Continue');

    expect(next[0]).toMatchObject({
      id: 'copy_2',
      type: 'button',
      content: 'Continue',
      status: 'incomplete',
      props: { variant: 'primary' },
    });
  });

  it('sets and clears button actions without losing local draft content', () => {
    const transformed = transformBlocks(blocks, 'copy_2', 'button');
    const withAction = setBlockAction(transformed, 'copy_2', { type: 'clickTarget' });
    const withoutAction = setBlockAction(withAction, 'copy_2', null);

    expect(withAction[1]).toMatchObject({
      type: 'button',
      content: 'Second',
      status: 'ready',
      props: { variant: 'primary', action: { type: 'clickTarget' } },
    });
    expect(withoutAction[1]).toMatchObject({
      type: 'button',
      content: 'Second',
      status: 'incomplete',
      props: { variant: 'primary' },
    });
  });

  it('creates media placeholders as structured incomplete block JSON', () => {
    const media = createContentBlock('media');

    expect(media).toMatchObject({
      type: 'media',
      content: 'Media placeholder',
      props: {},
      status: 'incomplete',
      children: [],
    });
    expect(media.id).toMatch(/^block_/);
  });

  it('creates list, divider, and link blocks with production-shaped defaults', () => {
    const list = createContentBlock('list');
    const divider = createContentBlock('divider');
    const link = createContentBlock('link');

    expect(list).toMatchObject({
      type: 'list',
      content: 'First item\nSecond item',
      props: {},
      status: 'ready',
    });
    expect(divider).toMatchObject({
      type: 'divider',
      props: {},
      status: 'ready',
      children: [],
    });
    expect(divider.content).toBeUndefined();
    expect(link).toMatchObject({
      type: 'link',
      content: 'Learn more',
      props: {
        variant: 'link',
        action: { type: 'openPage', navigationBehavior: 'continue' },
      },
      status: 'incomplete',
    });
  });

  it('marks openPage actions ready only after a URL is configured', () => {
    const transformed = transformBlocks(blocks, 'copy_2', 'link');
    const withUrl = setBlockActionUrl(transformed, 'copy_2', '/settings');

    expect(transformed[1]).toMatchObject({
      type: 'link',
      status: 'incomplete',
      props: { action: { type: 'openPage', navigationBehavior: 'continue' } },
    });
    expect(withUrl[1]).toMatchObject({
      type: 'link',
      status: 'ready',
      props: {
        action: {
          type: 'openPage',
          url: '/settings',
          navigationBehavior: 'continue',
        },
      },
    });
  });

  it('preserves navigation behavior while changing an open-page destination', () => {
    const transformed = transformBlocks(blocks, 'copy_2', 'link');
    const configured = setBlockAction(transformed, 'copy_2', {
      type: 'openPage',
      url: '/settings',
      navigationBehavior: 'continue',
    });
    const changed = setBlockActionUrl(configured, 'copy_2', '/projects');

    expect(changed[1]?.props.action).toEqual({
      type: 'openPage',
      url: '/projects',
      navigationBehavior: 'continue',
    });
  });

  it('marks openPage actions with unsafe URLs invalid', () => {
    const transformed = transformBlocks(blocks, 'copy_2', 'link');
    const withHttpUrl = setBlockActionUrl(transformed, 'copy_2', 'http://example.com/settings');

    expect(withHttpUrl[1]).toMatchObject({
      type: 'link',
      status: 'invalid',
      props: {
        action: {
          type: 'openPage',
          url: 'http://example.com/settings',
          navigationBehavior: 'continue',
        },
      },
    });
  });

  it('inserts top-level blocks before and after existing blocks without reordering', () => {
    const heading = { ...createContentBlock('heading'), id: 'heading_new' };
    const media = { ...createContentBlock('media'), id: 'media_new' };
    const afterFirst = insertTopLevelBlock(blocks, 'step_1', heading, 'after');
    const beforeSecond = afterFirst
      ? insertTopLevelBlock(afterFirst, 'copy_2', media, 'before')
      : null;

    expect(beforeSecond?.map((block) => block.id)).toEqual([
      'step_1',
      'heading_new',
      'media_new',
      'copy_2',
    ]);
    expect(blocks.map((block) => block.id)).toEqual(['step_1', 'copy_2']);
  });

  it('inserts and reorders editable content inside a tour step', () => {
    const paragraph = { ...createContentBlock('paragraph', 'Nested copy'), id: 'copy_nested' };
    const button = { ...createContentBlock('button'), id: 'button_nested' };
    const withCopy = insertBlockInsideTourStep(blocks, 'step_1', paragraph, 1);
    const withButton = withCopy ? insertBlockInsideTourStep(withCopy, 'step_1', button, 2) : null;
    const moved = withButton
      ? moveStepChildBlock(withButton, 'step_1', 'button_nested', 'up')
      : null;
    const reordered = moved
      ? reorderStepChildBlock(moved, 'step_1', 'copy_1', 'copy_nested', 'after')
      : null;
    const duplicated = moved ? duplicateStepChildBlock(moved, 'step_1', 'copy_nested') : null;
    const removed = duplicated ? removeStepChildBlock(duplicated, 'step_1', 'button_nested') : null;
    const children = moved?.[0]?.children[0]?.children ?? [];
    const reorderedChildren = reordered?.[0]?.children[0]?.children ?? [];
    const duplicatedChildren = duplicated?.[0]?.children[0]?.children ?? [];
    const removedChildren = removed?.[0]?.children[0]?.children ?? [];

    expect(children.map((block) => block.id)).toEqual(['copy_1', 'button_nested', 'copy_nested']);
    expect(reorderedChildren.map((block) => block.id)).toEqual([
      'button_nested',
      'copy_nested',
      'copy_1',
    ]);
    expect(children[0]).toMatchObject({ id: 'copy_1', content: 'Hello' });
    expect(duplicatedChildren.map((block) => block.id).slice(0, 3)).toEqual([
      'copy_1',
      'button_nested',
      'copy_nested',
    ]);
    expect(duplicatedChildren[3]).toMatchObject({
      type: 'paragraph',
      content: 'Nested copy',
      props: {},
      children: [],
    });
    expect(duplicatedChildren[3]?.id).not.toBe('copy_nested');
    expect(removedChildren.map((block) => block.id)).toEqual([
      'copy_1',
      'copy_nested',
      duplicatedChildren[3]?.id,
    ]);
    expect(blocks[0]?.children[0]?.children.map((block) => block.id)).toEqual(['copy_1']);
  });

  it('replaces CTA placement as part of the ordered freeform rich-content document', () => {
    const step = createTourStep(0);
    const tooltip = step.children[0]!;
    const button = tooltip.children.find((block) => block.type === 'button')!;
    const firstRichContent = tooltip.children.find(
      (block) => block.type !== 'button' && block.type !== 'link',
    )!;
    const replacementCopy = {
      ...createContentBlock('paragraph', 'Replacement copy'),
      id: 'replacement_copy',
    };
    const replacementBefore = [button, replacementCopy];
    const replacementAfter = [replacementCopy, button];
    const buttonBefore = reorderStepChildBlock(
      [step],
      step.id,
      button.id,
      firstRichContent.id,
      'before',
    );
    const replacedBefore = buttonBefore
      ? replaceRichContentInsideTourStep(buttonBefore, step.id, replacementBefore)
      : null;
    const replacedAfter = replaceRichContentInsideTourStep([step], step.id, replacementAfter);

    expect(replacedBefore?.[0]?.children[0]?.children.map((block) => block.id)).toEqual([
      button.id,
      'replacement_copy',
    ]);
    expect(replacedAfter?.[0]?.children[0]?.children.map((block) => block.id)).toEqual([
      'replacement_copy',
      button.id,
    ]);
  });

  it('wraps loose root content as tour steps for tour authoring', () => {
    const next = normalizeTourRootBlocks([
      { ...createContentBlock('paragraph', 'Alpha'), id: 'copy_alpha' },
      createTourStep(9, 'Existing step'),
      { ...createContentBlock('heading', 'Beta'), id: 'heading_beta' },
    ]);

    expect(next.map((block) => block.type)).toEqual(['tourStep', 'tourStep', 'tourStep']);
    expect(next.map((block) => block.props.index)).toEqual([0, 1, 2]);
    expect(next[0]?.children[0]?.children[0]).toMatchObject({
      id: 'copy_alpha',
      type: 'paragraph',
      content: 'Alpha',
    });
    expect(next[2]?.children[0]?.children[0]).toMatchObject({
      id: 'heading_beta',
      type: 'heading',
      content: 'Beta',
    });
  });

  it('attaches target chips to tour step tooltips', () => {
    const next = attachTargetToBlocks(blocks, 'step_1', 'target_1', 'New project');
    const tooltip = next[0]?.children[0];

    expect(next[0]?.status).toBe('ready');
    expect(tooltip?.props.targetId).toBe('target_1');
    expect(tooltip?.children[tooltip.children.length - 1]).toMatchObject({
      type: 'targetChip',
      content: 'New project',
      props: { targetId: 'target_1' },
    });
  });

  it('drops exact-area geometry when replacing a tour step target', () => {
    const withTarget = attachTargetToBlocks(blocks, 'step_1', 'target_1', 'New project');
    const withExactArea = setBlockPresentationAnchor(withTarget, 'tooltip_1', {
      kind: 'point',
      xRatio: 0.4,
      yRatio: 0.6,
    });
    const replaced = attachTargetToBlocks(withExactArea, 'step_1', 'target_1', 'Updated project', {
      resetPresentationAnchor: true,
    });

    expect(replaced[0]?.children[0]?.props.presentationAnchor).toBeUndefined();
  });

  it('removes target chips and marks tour steps incomplete without deleting content', () => {
    const withTarget = attachTargetToBlocks(blocks, 'step_1', 'target_1', 'New project');
    const withExactArea = setBlockPresentationAnchor(withTarget, 'tooltip_1', {
      kind: 'point',
      xRatio: 0.4,
      yRatio: 0.6,
    });
    const next = removeTargetFromBlocks(withExactArea, 'step_1', 'target_1');
    const step = next[0];
    const tooltip = step?.children[0];

    expect(step).toMatchObject({ id: 'step_1', status: 'incomplete' });
    expect(tooltip).toMatchObject({ id: 'tooltip_1', status: 'incomplete', props: {} });
    expect(tooltip?.children).toEqual([
      { id: 'copy_1', type: 'paragraph', content: 'Hello', props: {}, children: [] },
    ]);
    expect(blocksReferenceTarget(withExactArea, 'target_1')).toBe(true);
    expect(blocksReferenceTarget(next, 'target_1')).toBe(false);
    expect(blocks[0]?.children[0]?.props).toEqual({});
  });

  it('moves and reorders top-level blocks without mutating input', () => {
    expect(moveTopLevelBlock(blocks, 'copy_2', 'up')?.map((block) => block.id)).toEqual([
      'copy_2',
      'step_1',
    ]);
    expect(reorderTopLevelBlock(blocks, 'copy_2', 'step_1')?.map((block) => block.id)).toEqual([
      'copy_2',
      'step_1',
    ]);
    expect(blocks.map((block) => block.id)).toEqual(['step_1', 'copy_2']);
  });
});
