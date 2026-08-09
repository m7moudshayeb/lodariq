import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, LodariqDocument, sanitizeBlockProps, validate } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

describe('canonical tour fixture', () => {
  it('validates against the LodariqDocument schema (PRD §16.0 acceptance)', () => {
    const result = validate(LodariqDocument, tourFixture);
    if (!result.valid) {
      throw new Error(`fixture invalid:\n${JSON.stringify(result.errors, null, 2)}`);
    }
    expect(result.valid).toBe(true);
  });

  it('is stamped with the current schema version', () => {
    expect(tourFixture.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects a document missing required fields', () => {
    const broken = { ...tourFixture, blocks: undefined };
    const result = validate(LodariqDocument, broken);
    expect(result.valid).toBe(false);
  });

  it('rejects arbitrary CSS, JavaScript, and raw HTML props', () => {
    const broken = JSON.parse(JSON.stringify(tourFixture));
    broken.blocks[0].children[0].children[0].props = {
      level: 2,
      style: 'color: red',
      onclick: 'alert(1)',
      html: '<script>alert(1)</script>',
    };

    const result = validate(LodariqDocument, broken);

    expect(result.valid).toBe(false);
  });

  it.each([
    ['document', (document: Record<string, unknown>) => (document['rawHtml'] = '<b>unsafe</b>')],
    [
      'block',
      (document: Record<string, unknown>) => {
        const blocks = document['blocks'] as Array<Record<string, unknown>>;
        blocks[0]!['rawHtml'] = '<b>unsafe</b>';
      },
    ],
    [
      'target',
      (document: Record<string, unknown>) => {
        const targets = document['targets'] as Array<Record<string, unknown>>;
        targets[0]!['rawHtml'] = '<b>unsafe</b>';
      },
    ],
    [
      'target fingerprint',
      (document: Record<string, unknown>) => {
        const targets = document['targets'] as Array<Record<string, unknown>>;
        const fingerprint = targets[0]!['fingerprint'] as Record<string, unknown>;
        fingerprint['rawHtml'] = '<b>unsafe</b>';
      },
    ],
    [
      'trigger',
      (document: Record<string, unknown>) => {
        document['trigger'] = { type: 'manual', rawHtml: '<b>unsafe</b>' };
      },
    ],
    [
      'audience',
      (document: Record<string, unknown>) => {
        const audience = document['audience'] as Record<string, unknown>;
        audience['rawHtml'] = '<b>unsafe</b>';
      },
    ],
  ])('rejects unknown %s fields in canonical JSON', (_location, mutate) => {
    const document = JSON.parse(JSON.stringify(tourFixture)) as Record<string, unknown>;
    mutate(document);

    expect(validate(LodariqDocument, document).valid).toBe(false);
  });

  it('accepts only explicitly sourced, bounded audience rules', () => {
    const document = JSON.parse(JSON.stringify(tourFixture));
    document.audience.rules = [
      {
        source: 'identify',
        key: 'plan',
        operator: 'equals',
        value: 'pro',
      },
    ];

    expect(validate(LodariqDocument, document).valid).toBe(true);

    document.audience.rules[0].rawHtml = '<b>unsafe</b>';
    expect(validate(LodariqDocument, document).valid).toBe(false);
  });

  it('accepts typed product-click button actions without code-like payloads', () => {
    const document = JSON.parse(JSON.stringify(tourFixture));
    document.blocks[0].children[0].children[2].props.action = { type: 'clickTarget' };

    const result = validate(LodariqDocument, document);

    expect(result.valid).toBe(true);
  });

  it('accepts only bounded, allowlisted structured text styles', () => {
    const document = JSON.parse(JSON.stringify(tourFixture));
    document.blocks[0].children[0].children[0].props.textStyle = {
      align: 'center',
      fontSizePx: 24,
      color: '#0A4F43',
      fontWeight: 700,
      fontStyle: 'italic',
    };

    expect(validate(LodariqDocument, document).valid).toBe(true);
    expect(
      sanitizeBlockProps({
        textStyle: {
          align: 'justify',
          fontSizePx: 200,
          color: 'url(javascript:alert(1))',
          fontWeight: 900,
          fontStyle: 'oblique',
        },
      }),
    ).toEqual({});
    expect(sanitizeBlockProps(document.blocks[0].children[0].children[0].props)).toMatchObject({
      textStyle: {
        align: 'center',
        fontSizePx: 24,
        color: '#0a4f43',
        fontWeight: 700,
        fontStyle: 'italic',
      },
    });
  });
});
