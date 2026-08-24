import { describe, expect, it } from 'vitest';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { compileDocument } from '@lodariq/compiler';
import { resolveCompiledDocumentLocale } from '../../../../packages/sdk-runtime/src/document-localization';

describe('compiled locale media delivery', () => {
  it('pins one validated media choice per locale and runtime selects that compiled branch', async () => {
    const document = localizedMediaDocument();
    const mediaAssets = new Map([
      ['asset_image_en', asset('image', 'image/png')],
      ['asset_image_fr', asset('image', 'image/png')],
    ] as const);
    const compiled = await compileDocument({
      document,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      mediaAssets,
    });

    const baseMedia = mediaFrom(compiled.steps);
    expect(baseMedia).toMatchObject({
      assetId: 'asset_image_en',
      accessibilityName: 'English dashboard',
    });
    expect(baseMedia).not.toHaveProperty('localeVariants');
    expect(baseMedia).not.toHaveProperty('fallbackLocale');

    const french = resolveCompiledDocumentLocale(compiled, 'fr-CA');
    expect(french.locale).toBe('fr-FR');
    expect(mediaFrom(french.document.steps)).toMatchObject({
      assetId: 'asset_image_fr',
      accessibilityName: 'Tableau de bord français',
    });
  });

  it('fails compilation when the selected locale asset is not owned and validated', async () => {
    const document = localizedMediaDocument();
    const mediaAssets = new Map([['asset_image_en', asset('image', 'image/png')]] as const);
    await expect(
      compileDocument({
        document,
        theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
        mediaAssets,
      }),
    ).rejects.toThrow(/asset_image_fr/);
  });
});

function localizedMediaDocument(): LodariqDocument {
  const document = structuredClone(tourFixture) as LodariqDocument;
  const tooltip = document.blocks[0]?.children.find((block) => block.type === 'tooltip');
  if (!tooltip) throw new Error('tour fixture has no tooltip');
  tooltip.children.push({
    id: 'block_locale_image',
    type: 'media',
    props: {
      media: {
        kind: 'image',
        assetId: 'asset_image_en',
        accessibilityName: 'English dashboard',
        localeVariants: [
          {
            locale: 'fr-FR',
            assetId: 'asset_image_fr',
            accessibilityName: 'Tableau de bord français',
          },
        ],
      },
    },
    status: 'ready',
    children: [],
  });
  document.localization = {
    defaultLocale: 'en',
    variants: [{ locale: 'fr-FR', fallbackLocale: 'en', blocks: [] }],
  };
  return document;
}

function asset(
  kind: 'image',
  contentType: string,
): {
  kind: 'image';
  contentHash: string;
  contentType: string;
} {
  return {
    kind,
    contentHash: `sha256-${'1'.repeat(64)}`,
    contentType,
  };
}

function mediaFrom(steps: LodariqDocumentLikeSteps): Record<string, unknown> {
  const props = steps[0]?.body.find((block) => block.id === 'block_locale_image')?.props as
    | { media?: unknown }
    | undefined;
  const media = props?.media;
  if (!media) throw new Error('compiled localized media is missing');
  return media as unknown as Record<string, unknown>;
}

type LodariqDocumentLikeSteps = readonly {
  body: readonly { id: string; props: object }[];
}[];
