// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blocksFromSafePasteData } from '@lodariq/sdk-authoring/editor';

describe('safe editor paste (PRD §16.1)', () => {
  it('turns pasted HTML into plain paragraph blocks', () => {
    const blocks = blocksFromSafePasteData({
      getData: (type) =>
        type === 'text/html'
          ? '<p onclick="alert(1)">Safe <strong>copy</strong><script>alert(1)</script></p>'
          : '',
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'paragraph',
      content: 'Safe copy',
      props: {},
      status: 'ready',
    });
    expect(JSON.stringify(blocks)).not.toContain('onclick');
    expect(JSON.stringify(blocks)).not.toContain('<strong>');
    expect(JSON.stringify(blocks)).not.toContain('<script>');
  });
});
