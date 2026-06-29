import { describe, expect, it } from 'vitest';
import { CompiledDocument, validate, type TalmehDocument } from '@talmeh/schema';
import { compile, compileDocument } from '@talmeh/compiler';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';

const document = tourFixture as TalmehDocument;

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
    const mutableDocument = JSON.parse(JSON.stringify(document)) as TalmehDocument;
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
    const mutableDocument = JSON.parse(JSON.stringify(document)) as TalmehDocument;
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
    const mutableDocument = JSON.parse(JSON.stringify(document)) as TalmehDocument;
    const compiled = await compileDocument(mutableDocument);

    const heading = mutableDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.id === 'block_heading_1',
    );
    if (!heading) throw new Error('fixture heading missing');

    heading.props.level = 3;
    mutableDocument.targets[0]!.fingerprint.stableAttributes['data-talmeh-id'] = 'changed';

    const compiledHeading = compiled.steps[0]?.body.find((block) => block.id === 'block_heading_1');
    expect(compiledHeading?.props).toEqual({ level: 2 });
    expect(compiled.targets[0]?.fingerprint.stableAttributes['data-talmeh-id']).toBe('new-project');
  });

  it('strips arbitrary block props from compiled delivery JSON', async () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as TalmehDocument;
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
