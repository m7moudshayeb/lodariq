import { describe, expect, it } from 'vitest';
import { CompiledDocument, validate, type LodariqDocument } from '@lodariq/schema';
import { compile, compileDocument } from '@lodariq/compiler';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const document = tourFixture as LodariqDocument;

describe('compile', () => {
  it('produces one step per tourStep block with body + target binding', () => {
    const compiled = compile(document);
    expect(compiled.steps).toHaveLength(1);
    const [step] = compiled.steps;
    expect(step?.targetId).toBe('target_new_project');
    expect(step?.placement).toBe('bottom');
    expect(step?.body.map((b) => b.type)).toEqual(['heading', 'paragraph', 'button']);
    expect(step?.body.find((block) => block.type === 'button')?.props).toEqual({
      variant: 'primary',
      action: { type: 'next' },
    });
  });

  it('copies target lifecycle hints onto compiled steps', () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    mutableDocument.targets[0]!.lifecycle = {
      waitForText: 'Projects loaded',
      scrollStrategy: 'bottom',
    };

    const compiled = compile(mutableDocument);
    mutableDocument.targets[0]!.lifecycle.waitForText = 'Changed later';

    expect(compiled.steps[0]?.lifecycle).toEqual({
      waitForText: 'Projects loaded',
      scrollStrategy: 'bottom',
    });
  });

  it('preserves user-action gated button actions in delivery JSON', () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    const button = mutableDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.type === 'button',
    );
    if (!button) throw new Error('fixture button missing');
    button.props.action = { type: 'clickTarget' };

    const compiled = compile(mutableDocument);

    expect(compiled.steps[0]?.body.find((block) => block.type === 'button')?.props.action).toEqual({
      type: 'clickTarget',
    });
  });

  it('keeps list, divider, link, and openPage actions in delivery JSON', () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    mutableDocument.blocks[0]?.children[0]?.children.splice(
      2,
      0,
      {
        id: 'block_list_1',
        type: 'list',
        content: 'One\nTwo',
        props: {},
        status: 'ready',
        children: [],
      },
      {
        id: 'block_divider_1',
        type: 'divider',
        props: {},
        status: 'ready',
        children: [],
      },
      {
        id: 'block_link_1',
        type: 'link',
        content: 'Open settings',
        props: { action: { type: 'openPage', url: '/settings' } },
        status: 'ready',
        children: [],
      },
    );

    const compiled = compile(mutableDocument);

    expect(compiled.steps[0]?.body.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'divider',
      'link',
      'button',
    ]);
    expect(compiled.steps[0]?.body.find((block) => block.type === 'link')?.props.action).toEqual({
      type: 'openPage',
      url: '/settings',
    });
  });

  it('keeps placeholder media as structured delivery body content', () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    mutableDocument.blocks[0]?.children[0]?.children.splice(2, 0, {
      id: 'block_media_placeholder',
      type: 'media',
      content: 'Media placeholder',
      props: {},
      status: 'incomplete',
      children: [],
    });

    const compiled = compile(mutableDocument);

    expect(compiled.steps[0]?.body.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'media',
      'button',
    ]);
    expect(compiled.steps[0]?.body.find((block) => block.type === 'media')).toEqual({
      id: 'block_media_placeholder',
      type: 'media',
      text: 'Media placeholder',
      props: {},
    });
  });

  it('content-addresses the artifact and validates against the schema', async () => {
    const compiled = await compileDocument(document);
    expect(compiled.contentHash).toMatch(/^sha256-[0-9a-f]{64}$/);
    const result = validate(CompiledDocument, compiled);
    if (!result.valid) {
      throw new Error(JSON.stringify(result.errors, null, 2));
    }
    expect(result.valid).toBe(true);
  });

  it('is deterministic: same input yields the same content hash', async () => {
    const a = await compileDocument(document);
    const b = await compileDocument(document);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it('clones mutable source props and target fingerprints into the compiled artifact', async () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    const compiled = await compileDocument(mutableDocument);

    const heading = mutableDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.id === 'block_heading_1',
    );
    if (!heading) throw new Error('fixture heading missing');

    heading.props.level = 3;
    mutableDocument.targets[0]!.fingerprint.stableAttributes['data-lodariq-id'] = 'changed';

    const compiledHeading = compiled.steps[0]?.body.find((block) => block.id === 'block_heading_1');
    expect(compiledHeading?.props).toEqual({ level: 2 });
    expect(compiled.targets[0]?.fingerprint.stableAttributes['data-lodariq-id']).toBe('new-project');
  });

  it('strips arbitrary block props from compiled delivery JSON', async () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    const heading = mutableDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.id === 'block_heading_1',
    );
    if (!heading) throw new Error('fixture heading missing');
    Object.assign(heading.props, {
      level: 2,
      style: 'background:url(javascript:alert(1))',
      html: '<script>alert(1)</script>',
      onclick: 'alert(1)',
    });

    const compiled = await compileDocument(mutableDocument);
    const compiledHeading = compiled.steps[0]?.body.find((block) => block.id === 'block_heading_1');

    expect(compiledHeading?.props).toEqual({ level: 2 });
  });
});
