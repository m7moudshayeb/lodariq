import { describe, expect, it } from 'vitest';
import {
  documentLocalizationIssues,
  materializeLocalizedDocument,
  validate,
  DocumentLocaleVariant,
  type LodariqDocument,
} from '@lodariq/schema';

const TARGET_A = 'target_shared';
const TARGET_B = 'target_de';

function document(overrides?: readonly { targetId: string; replacementTargetId: string }[]): LodariqDocument {
  return {
    id: 'doc_locale_targets',
    workspaceId: 'wk_locale_targets',
    type: 'tour',
    status: 'draft',
    title: 'Locale targets',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [
      {
        id: TARGET_A,
        fingerprint: { tagName: 'button', accessibleName: 'Continue', stableAttributes: {} },
      },
      {
        id: TARGET_B,
        fingerprint: { tagName: 'button', accessibleName: 'Weiter', stableAttributes: {} },
      },
    ],
    blocks: [
      {
        id: 'step_1',
        type: 'tourStep',
        props: { index: 0, targetId: TARGET_A },
        status: 'ready',
        children: [
          {
            id: 'tooltip_1',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: TARGET_A },
            status: 'ready',
            children: [
              {
                id: 'body_1',
                type: 'paragraph',
                props: {},
                status: 'ready',
                content: 'Click here',
                children: [],
              },
            ],
          },
        ],
      },
    ],
    localization: {
      defaultLocale: 'en',
      variants: [
        {
          locale: 'de',
          fallbackLocale: 'en',
          blocks: [{ blockId: 'body_1', content: 'Hier klicken' }],
          ...(overrides ? { targetOverrides: [...overrides] } : {}),
        },
      ],
    },
  };
}

describe('per-locale target overrides (§7.6)', () => {
  it('shares targets across locales by default', () => {
    const german = materializeLocalizedDocument(document(), 'de');
    expect(german.blocks[0]?.props.targetId).toBe(TARGET_A);
    expect(german.blocks[0]?.children[0]?.props.targetId).toBe(TARGET_A);
    // Only the text varies.
    expect(german.blocks[0]?.children[0]?.children[0]?.content).toBe('Hier klicken');
  });

  it('resolves an override when the locale is materialized, so publish gets it free', () => {
    const source = document([{ targetId: TARGET_A, replacementTargetId: TARGET_B }]);
    const german = materializeLocalizedDocument(source, 'de');
    expect(german.blocks[0]?.props.targetId).toBe(TARGET_B);
    expect(german.blocks[0]?.children[0]?.props.targetId).toBe(TARGET_B);
    // The canonical document is untouched, and other locales still share it.
    expect(source.blocks[0]?.props.targetId).toBe(TARGET_A);
    expect(materializeLocalizedDocument(source, 'en').blocks[0]?.props.targetId).toBe(TARGET_A);
  });

  it('validates against the variant contract', () => {
    const variant = document([{ targetId: TARGET_A, replacementTargetId: TARGET_B }]).localization
      ?.variants[0];
    expect(validate(DocumentLocaleVariant, variant).valid).toBe(true);
  });

  it('rejects an override that points at a target the document does not have', () => {
    const issues = documentLocalizationIssues(
      document([{ targetId: TARGET_A, replacementTargetId: 'target_missing' }]),
    );
    expect(issues).toEqual([
      { code: 'unknown_target_override', locale: 'de', targetId: TARGET_A },
    ]);
  });

  it('rejects an override onto itself and a duplicate override for one target', () => {
    expect(
      documentLocalizationIssues(document([{ targetId: TARGET_A, replacementTargetId: TARGET_A }])),
    ).toEqual([{ code: 'self_target_override', locale: 'de', targetId: TARGET_A }]);

    const duplicated = documentLocalizationIssues(
      document([
        { targetId: TARGET_A, replacementTargetId: TARGET_B },
        { targetId: TARGET_A, replacementTargetId: TARGET_B },
      ]),
    );
    expect(duplicated).toEqual([
      { code: 'duplicate_target_override', locale: 'de', targetId: TARGET_A },
    ]);
  });

  it('accepts a document with no overrides at all', () => {
    expect(documentLocalizationIssues(document())).toEqual([]);
  });
});
