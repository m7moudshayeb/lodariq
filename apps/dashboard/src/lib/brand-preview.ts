import { compileDocument, computeBrandThemeContentHash } from '@lodariq/compiler';
import {
  BRAND_THEME_CONTRACT_VERSION,
  BRAND_THEME_SCHEMA_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  SCHEMA_VERSION,
  type BrandThemeDefinition,
  type BrandThemeSnapshot,
  type NewCompiledDocument,
  type LodariqDocument,
} from '@lodariq/schema';

export interface BrandReviewPreviewInput {
  name: string;
  draft: BrandThemeDefinition;
  activeVersion: {
    version: number;
    snapshot: BrandThemeSnapshot;
  } | null;
  copy?: BrandPreviewCopy;
}

export interface BrandReviewPreviewArtifacts {
  before: NewCompiledDocument;
  after: NewCompiledDocument;
}

export interface BrandDraftPreviewInput {
  name: string;
  draft: BrandThemeDefinition;
  version?: number;
  copy?: BrandPreviewCopy;
}

export interface BrandPreviewCopy {
  title: string;
  heading: string;
  paragraph: string;
  back: string;
  continue: string;
  fallbackThemeName: string;
  draftSuffix: string;
}

const DEFAULT_BRAND_PREVIEW_COPY: BrandPreviewCopy = {
  title: 'Brand review Tour preview',
  heading: 'Find your launch queue',
  paragraph: 'Review what is ready for staging without leaving the product.',
  back: 'Back',
  continue: 'Continue',
  fallbackThemeName: 'Brand theme',
  draftSuffix: 'draft',
};

function brandReviewTour(copy: BrandPreviewCopy): LodariqDocument {
  return {
    id: 'doc_brand_review_preview',
    workspaceId: 'wk_brand_review_preview',
    type: 'tour',
    status: 'draft',
    title: copy.title,
    schemaVersion: SCHEMA_VERSION,
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    appearance: { ...DEFAULT_EXPERIENCE_APPEARANCE, colorMode: 'light' },
    targets: [],
    blocks: [
      {
        id: 'step_brand_review',
        type: 'tourStep',
        props: { index: 0 },
        children: [
          {
            id: 'tooltip_brand_review',
            type: 'tooltip',
            props: {},
            children: [
              {
                id: 'heading_brand_review',
                type: 'heading',
                content: copy.heading,
                props: { level: 2 },
                children: [],
              },
              {
                id: 'paragraph_brand_review',
                type: 'paragraph',
                content: copy.paragraph,
                props: {},
                children: [],
              },
              {
                id: 'back_brand_review',
                type: 'button',
                content: copy.back,
                props: { variant: 'secondary', action: { type: 'back' } },
                children: [],
              },
              {
                id: 'continue_brand_review',
                type: 'button',
                content: copy.continue,
                props: { variant: 'primary', action: { type: 'complete' } },
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Browser-only approval preview. Real publication compilation remains an API
 * responsibility; this uses the same compiler and immutable runtime contract
 * solely to let a creator inspect a saved Brand draft before approval.
 */
export async function compileBrandReviewPreviews(
  input: BrandReviewPreviewInput,
): Promise<BrandReviewPreviewArtifacts> {
  const copy = input.copy ?? DEFAULT_BRAND_PREVIEW_COPY;
  const beforeTheme = input.activeVersion?.snapshot ?? LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1;
  const afterTheme = await createDraftPreviewSnapshot({
    name: input.name,
    draft: input.draft,
    version: (input.activeVersion?.version ?? 0) + 1,
    copy,
  });

  const [before, after] = await Promise.all([
    compilePreviewDocument(beforeTheme, copy),
    compilePreviewDocument(afterTheme, copy),
  ]);

  return { before, after };
}

export async function compileBrandDraftPreview(
  input: BrandDraftPreviewInput,
): Promise<NewCompiledDocument> {
  const copy = input.copy ?? DEFAULT_BRAND_PREVIEW_COPY;
  const snapshot = await createDraftPreviewSnapshot(input);
  return compilePreviewDocument(snapshot, copy);
}

async function createDraftPreviewSnapshot({
  name,
  draft,
  version = 1,
  copy = DEFAULT_BRAND_PREVIEW_COPY,
}: BrandDraftPreviewInput): Promise<BrandThemeSnapshot> {
  const snapshot: BrandThemeSnapshot = {
    schemaVersion: BRAND_THEME_SCHEMA_VERSION,
    contractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeId: 'theme_brand_review_preview',
    themeVersionId: 'themev_brand_review_preview_draft',
    version,
    name: `${name.trim() || copy.fallbackThemeName} ${copy.draftSuffix}`.slice(0, 120),
    contentHash: `sha256-${'0'.repeat(64)}`,
    definition: structuredClone(draft),
  };
  snapshot.contentHash = await computeBrandThemeContentHash(snapshot);
  return snapshot;
}

function compilePreviewDocument(
  theme: BrandThemeSnapshot,
  copy: BrandPreviewCopy,
): Promise<NewCompiledDocument> {
  return compileDocument({
    document: brandReviewTour(copy),
    theme,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
}
