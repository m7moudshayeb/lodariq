import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  LodariqDocument,
  sanitizeBlockProps,
  sanitizeInlineTextRuns,
  validate,
} from '@lodariq/schema';
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

  it('accepts only explicit open-page navigation behavior', () => {
    const document = JSON.parse(JSON.stringify(tourFixture));
    const action = document.blocks[0].children[0].children[2].props.action;
    document.blocks[0].children[0].children[2].props.action = {
      ...action,
      type: 'openPage',
      url: '/settings',
      navigationBehavior: 'continue',
    };

    expect(validate(LodariqDocument, document).valid).toBe(true);

    document.blocks[0].children[0].children[2].props.action.navigationBehavior = 'reload';
    expect(validate(LodariqDocument, document).valid).toBe(false);
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
    document.blocks[0].children[0].children[0].props.textStyle.fontSizePx = 20;
    expect(validate(LodariqDocument, document).valid).toBe(true);
    document.blocks[0].children[0].children[0].props.textStyle.fontSizePx = 97;
    expect(validate(LodariqDocument, document).valid).toBe(false);
    document.blocks[0].children[0].children[0].props.textStyle.fontSizePx = 24;
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
    expect(sanitizeBlockProps({ tooltipLayout: { radius: 'round', showArrow: false } })).toEqual({
      tooltipLayout: { radius: 'round', showArrow: false },
    });
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

  it('accepts safe rich-text runs and flow-based popup/action styling', () => {
    const document = JSON.parse(JSON.stringify(tourFixture));
    const tooltip = document.blocks[0].children[0];
    const heading = tooltip.children[0];
    const button = tooltip.children[2];
    heading.content = 'Launch in 3 days';
    heading.contentRuns = [
      { text: 'Launch in ' },
      {
        text: '3 days',
        marks: ['bold', 'underline'],
        fontSizePx: 24,
        color: '#006b58',
        highlightColor: '#fff1a8',
        animation: {
          recipe: 'lift',
          durationMs: 450,
          easing: 'emphasized',
          reducedMotion: 'none',
        },
      },
    ];
    heading.props.blockLayout = { spacingAfter: 'tight', spacingAfterPx: 18 };
    button.props.variant = 'outline';
    button.props.blockLayout = { align: 'center', spacingBefore: 'relaxed' };
    button.props.buttonStyle = {
      width: 'hug',
      widthPx: 232,
      size: 'compact',
      fillColor: '#ffffff',
      textColor: '#006b58',
      borderColor: '#006b58',
      radius: 'round',
      icon: 'arrow-right',
      iconPlacement: 'end',
    };
    tooltip.props.tooltipLayout = {
      widthPx: 480,
      heightPx: 320,
      contentAlign: 'center',
      actionLayout: 'stack',
      actionAlign: 'stretch',
      gap: 'relaxed',
      padding: 'compact',
    };
    tooltip.props.tooltipStyle = {
      surfaceColor: '#162033',
      textColor: '#ffffff',
      borderColor: '#006b58',
      borderWeight: 'strong',
      elevation: 'floating',
    };

    expect(validate(LodariqDocument, document).valid).toBe(true);
    expect(sanitizeInlineTextRuns(heading.contentRuns)).toEqual(heading.contentRuns);
    heading.contentRuns[1].fontSizePx = 20;
    expect(validate(LodariqDocument, document).valid).toBe(true);
    heading.contentRuns[1].fontSizePx = 97;
    expect(validate(LodariqDocument, document).valid).toBe(false);
    heading.contentRuns[1].fontSizePx = 24;
    heading.contentRuns[1].animation.durationMs = 5_000;
    expect(validate(LodariqDocument, document).valid).toBe(false);
    heading.contentRuns[1].animation.durationMs = 450;
    heading.props.blockLayout.spacingAfterPx = 17;
    expect(validate(LodariqDocument, document).valid).toBe(true);
    heading.props.blockLayout.spacingAfterPx = 97;
    expect(validate(LodariqDocument, document).valid).toBe(false);
    heading.props.blockLayout.spacingAfterPx = 18;
    button.props.buttonStyle.widthPx = 82;
    expect(validate(LodariqDocument, document).valid).toBe(false);
    button.props.buttonStyle.widthPx = 232;
    tooltip.props.tooltipLayout.widthPx = 482;
    expect(validate(LodariqDocument, document).valid).toBe(false);
    tooltip.props.tooltipLayout.widthPx = 480;
    tooltip.props.tooltipLayout.heightPx = 322;
    expect(validate(LodariqDocument, document).valid).toBe(false);
    tooltip.props.tooltipLayout.heightPx = 320;
    tooltip.props.tooltipStyle.surfaceColor = 'linear-gradient(red, blue)';
    expect(validate(LodariqDocument, document).valid).toBe(false);
    tooltip.props.tooltipStyle.surfaceColor = '#162033';
    tooltip.props.tooltipStyle.elevation = 'drop-shadow(0 0 4px red)';
    expect(validate(LodariqDocument, document).valid).toBe(false);
    tooltip.props.tooltipStyle.elevation = 'floating';
    expect(validate(LodariqDocument, document).valid).toBe(true);
    expect(
      sanitizeInlineTextRuns([
        {
          text: 'Safe',
          marks: ['blink'],
          fontSizePx: 20,
          color: 'red',
          link: 'javascript:alert(1)',
        },
      ]),
    ).toEqual([{ text: 'Safe', fontSizePx: 20 }]);
    expect(
      sanitizeBlockProps({
        tooltipStyle: {
          surfaceColor: '#ABCDEF',
          textColor: 'red',
          borderColor: '#006B58',
          borderWeight: '12px',
          elevation: 'floating',
          rawCss: 'filter: blur(4px)',
        },
      }),
    ).toEqual({
      tooltipStyle: {
        surfaceColor: '#abcdef',
        borderColor: '#006b58',
        elevation: 'floating',
      },
    });
    expect(
      sanitizeBlockProps({
        formField: {
          control: 'radio',
          name: 'plan',
          required: true,
          fillColor: '#12715b',
          labelColor: 'red',
          borderColor: '#006B58',
          size: 'compact',
          radius: 'round',
          options: [
            { id: 'option_a', label: 'Starter' },
            { id: 'option_b', label: 'Growth' },
            { id: '1bad', label: 'Skip' },
          ],
          onChange: 'alert(1)',
        },
      }),
    ).toEqual({
      formField: {
        control: 'radio',
        name: 'plan',
        required: true,
        fillColor: '#12715b',
        borderColor: '#006B58',
        size: 'compact',
        radius: 'round',
        options: [
          { id: 'option_a', label: 'Starter' },
          { id: 'option_b', label: 'Growth' },
        ],
      },
    });
  });

  it('rejects arbitrary layout and action style values', () => {
    const document = JSON.parse(JSON.stringify(tourFixture));
    document.blocks[0].children[0].children[2].props.buttonStyle = {
      position: 'absolute',
      fillColor: 'url(javascript:alert(1))',
    };

    expect(validate(LodariqDocument, document).valid).toBe(false);
    expect(
      sanitizeBlockProps({
        blockLayout: { align: 'pixel-perfect', spacingAfter: '42px' },
        buttonStyle: { position: 'absolute', fillColor: 'red' },
        tooltipLayout: { actionLayout: 'freeform', padding: '80px' },
      }),
    ).toEqual({});
  });
});
