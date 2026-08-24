import { describe, expect, it } from 'vitest';
import {
  collectTourMediaAssetIds,
  resolveMediaPresentationForLocale,
  validateTourPublishReadiness,
  type LodariqBlock,
  type LodariqDocument,
  type MediaPresentation,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

describe('locale-specific media', () => {
  it('resolves exact, language, and explicit fallback variants without mutation', () => {
    const media: MediaPresentation = {
      kind: 'image',
      assetId: 'asset_base',
      accessibilityName: 'Base product screen',
      fallbackLocale: 'de-DE',
      localeVariants: [
        { locale: 'de-DE', assetId: 'asset_de', accessibilityName: 'Deutsche Produktansicht' },
        { locale: 'fr-FR', assetId: 'asset_fr', accessibilityName: 'Écran du produit' },
      ],
    };

    expect(resolveMediaPresentationForLocale(media, 'fr-FR').assetId).toBe('asset_fr');
    expect(resolveMediaPresentationForLocale(media, 'fr-CA').assetId).toBe('asset_fr');
    expect(resolveMediaPresentationForLocale(media, 'ja-JP').assetId).toBe('asset_de');
    expect(resolveMediaPresentationForLocale(media, undefined)).toEqual(media);
    expect(media.assetId).toBe('asset_base');
  });

  it('includes every approved variant in publication ownership and validation', () => {
    const document = documentWithLocalizedVideo();
    expect(collectTourMediaAssetIds(document)).toEqual(
      expect.arrayContaining([
        'asset_video_en',
        'asset_captions_en',
        'asset_poster',
        'asset_video_fr',
        'asset_captions_fr',
      ]),
    );

    const validMediaAssets = new Map([
      ['asset_video_en', 'video'],
      ['asset_captions_en', 'captions'],
      ['asset_poster', 'image'],
      ['asset_video_fr', 'video'],
      ['asset_captions_fr', 'captions'],
    ] as const);
    expect(
      validateTourPublishReadiness(document, {
        requireValidMediaAssets: true,
        validMediaAssets,
      }).filter((issue) => issue.blockId === 'block_localized_video'),
    ).toEqual([]);

    validMediaAssets.delete('asset_captions_fr');
    expect(
      validateTourPublishReadiness(document, {
        requireValidMediaAssets: true,
        validMediaAssets,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockId: 'block_localized_video',
          code: 'media_asset_invalid',
        }),
      ]),
    );
  });

  it('fails publication when localized video captions or fallback variants are incomplete', () => {
    const document = documentWithLocalizedVideo();
    const media = localizedMediaBlock(document).props.media;
    if (!media || media.kind !== 'video' || !media.localeVariants?.[0]) {
      throw new Error('localized video fixture is malformed');
    }
    delete media.localeVariants[0].captionsAssetId;
    media.fallbackLocale = 'de-DE';

    expect(
      validateTourPublishReadiness(document).filter(
        (issue) => issue.blockId === 'block_localized_video',
      ),
    ).toEqual([
      expect.objectContaining({
        code: 'incomplete_media',
        message: expect.stringMatching(/fr-FR/),
      }),
      expect.objectContaining({
        code: 'incomplete_media',
        message: expect.stringMatching(/fallback/),
      }),
    ]);
  });
});

function documentWithLocalizedVideo(): LodariqDocument {
  const document = structuredClone(tourFixture) as LodariqDocument;
  const tooltip = document.blocks[0]?.children.find((block) => block.type === 'tooltip');
  if (!tooltip) throw new Error('tour fixture has no tooltip');
  tooltip.children.push({
    id: 'block_localized_video',
    type: 'media',
    props: {
      media: {
        kind: 'video',
        assetId: 'asset_video_en',
        captionsAssetId: 'asset_captions_en',
        posterAssetId: 'asset_poster',
        accessibilityName: 'English product walkthrough',
        fallbackLocale: 'fr-FR',
        localeVariants: [
          {
            locale: 'fr-FR',
            assetId: 'asset_video_fr',
            captionsAssetId: 'asset_captions_fr',
            accessibilityName: 'French product walkthrough',
          },
        ],
      },
    },
    status: 'ready',
    children: [],
  });
  return document;
}

function localizedMediaBlock(document: LodariqDocument): LodariqBlock {
  const block = document.blocks[0]?.children
    .find((candidate) => candidate.type === 'tooltip')
    ?.children.find((candidate) => candidate.id === 'block_localized_video');
  if (!block) throw new Error('localized media block is missing');
  return block;
}
