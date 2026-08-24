import { describe, expect, it, vi } from 'vitest';
import {
  createDeepLAuthoringTranslationProvider,
  translateMissingAuthoringCopy,
  type AuthoringTranslationProvider,
} from '@lodariq/api';
import type { LodariqDocument } from '@lodariq/schema';

const document: LodariqDocument = {
  id: 'doc_translation',
  workspaceId: 'wk_translation',
  type: 'tour',
  status: 'draft',
  title: 'Welcome tour',
  trigger: { type: 'manual' },
  audience: { environments: ['development'] },
  schemaVersion: '1.0.0',
  targets: [],
  localization: {
    defaultLocale: 'en',
    variants: [
      {
        locale: 'fr',
        fallbackLocale: 'en',
        blocks: [{ blockId: 'button_1', content: 'Continuer' }],
      },
    ],
  },
  blocks: [
    {
      id: 'step_1',
      type: 'tourStep',
      props: { index: 0 },
      status: 'ready',
      children: [
        {
          id: 'tooltip_1',
          type: 'tooltip',
          props: { placement: 'bottom' },
          status: 'ready',
          children: [
            {
              id: 'heading_1',
              type: 'heading',
              content: 'Create your first project',
              contentRuns: [
                { text: 'Create your ', marks: ['bold'] },
                { text: 'first project', marks: ['italic'] },
              ],
              props: { level: 2 },
              status: 'ready',
              children: [],
            },
            {
              id: 'button_1',
              type: 'button',
              content: 'Continue',
              props: { variant: 'primary', action: { type: 'next' } },
              status: 'ready',
              children: [],
            },
          ],
        },
      ],
    },
  ],
};

describe('authoring auto-translation', () => {
  it('translates only missing copy and retains rich-text metadata', async () => {
    const translateTexts = vi.fn(async ({ texts }: { texts: readonly string[] }) => ({
      texts: texts.map((text) => `FR:${text}`),
      usage: {
        provider: 'test-translator',
        usageUnit: 'characters' as const,
        inputUnits: texts.reduce((total, text) => total + text.length, 0),
        outputUnits: texts.reduce((total, text) => total + text.length + 3, 0),
        providerCostMicros: 0,
      },
    }));
    const result = await translateMissingAuthoringCopy(document, 'fr', {
      translateTexts,
    } as AuthoringTranslationProvider);

    expect(translateTexts).toHaveBeenCalledOnce();
    expect(translateTexts.mock.calls[0]?.[0].texts).toEqual([
      'Welcome tour',
      'Create your',
      'first project',
    ]);
    expect(result).toMatchObject({
      sourceLocale: 'en',
      targetLocale: 'fr',
      translatedTitle: true,
      translatedBlockCount: 1,
      providerUsage: { provider: 'test-translator', usageUnit: 'characters' },
    });
    const variant = result.document.localization?.variants.find((item) => item.locale === 'fr');
    expect(variant?.title).toBe('FR:Welcome tour');
    expect(variant?.blocks.find((block) => block.blockId === 'button_1')?.content).toBe(
      'Continuer',
    );
    expect(variant?.blocks.find((block) => block.blockId === 'heading_1')).toEqual({
      blockId: 'heading_1',
      content: 'FR:Create your FR:first project',
      contentRuns: [
        { text: 'FR:Create your ', marks: ['bold'] },
        { text: 'FR:first project', marks: ['italic'] },
      ],
    });
  });

  it('does not call the provider when all selected-locale copy exists', async () => {
    const complete = structuredClone(document);
    const variant = complete.localization!.variants[0]!;
    variant.title = 'Visite de bienvenue';
    variant.blocks.push({ blockId: 'heading_1', content: 'Créez votre premier projet' });
    const translateTexts = vi.fn();

    const result = await translateMissingAuthoringCopy(complete, 'fr', { translateTexts });

    expect(translateTexts).not.toHaveBeenCalled();
    expect(result.translatedBlockCount).toBe(0);
    expect(result.translatedTitle).toBe(false);
  });

  it('keeps the DeepL Developer key server-side', async () => {
    const fetchMock = vi.fn(
      async (_input: URL | RequestInfo, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            translations: [{ text: '<lq>Bonjour <x id="0"></x></lq>' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const provider = createDeepLAuthoringTranslationProvider(
      { LODARIQ_DEEPL_API_KEY: 'test-secret' } as NodeJS.ProcessEnv,
      fetchMock,
    );
    if (!provider) throw new Error('provider was not configured');

    await expect(
      provider.translateTexts({
        sourceLocale: 'en',
        targetLocale: 'fr',
        texts: ['Hello {name}'],
        context: 'Product guidance',
      }),
    ).resolves.toEqual({
      texts: ['Bonjour {name}'],
      usage: {
        provider: 'deepl',
        usageUnit: 'characters',
        inputUnits: 12,
        outputUnits: 14,
        providerCostMicros: 0,
      },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    if (!init) throw new Error('DeepL request options missing');
    expect(String(url)).toBe('https://api.deepl.com/v2/translate');
    expect(new Headers(init.headers).get('authorization')).toBe('DeepL-Auth-Key test-secret');
    expect(String(init.body)).not.toContain('test-secret');
    expect(JSON.parse(String(init.body))).toMatchObject({
      text: ['<lq>Hello <x id="0"></x></lq>'],
      tag_handling: 'xml',
      ignore_tags: ['x'],
    });
  });
});
