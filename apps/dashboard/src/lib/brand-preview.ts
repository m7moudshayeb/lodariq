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
  type CompiledDocumentV2,
  type LodariqDocument,
} from '@lodariq/schema';

export interface BrandReviewPreviewInput {
  name: string;
  draft: BrandThemeDefinition;
  activeVersion: {
    version: number;
    snapshot: BrandThemeSnapshot;
  } | null;
}

export interface BrandReviewPreviewArtifacts {
  before: CompiledDocumentV2;
  after: CompiledDocumentV2;
}

export interface BrandDraftPreviewInput {
  name: string;
  draft: BrandThemeDefinition;
  version?: number;
}

const BRAND_REVIEW_TOUR: LodariqDocument = {
  id: 'doc_brand_review_preview',
  workspaceId: 'wk_brand_review_preview',
  type: 'tour',
  status: 'draft',
  title: 'Brand review Tour preview',
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
              content: 'Find your launch queue',
              props: { level: 2 },
              children: [],
            },
            {
              id: 'paragraph_brand_review',
              type: 'paragraph',
              content: 'Review what is ready for staging without leaving the product.',
              props: {},
              children: [],
            },
            {
              id: 'back_brand_review',
              type: 'button',
              content: 'Back',
              props: { variant: 'secondary', action: { type: 'back' } },
              children: [],
            },
            {
              id: 'continue_brand_review',
              type: 'button',
              content: 'Continue',
              props: { variant: 'primary', action: { type: 'complete' } },
              children: [],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Browser-only approval preview. Real publication compilation remains an API
 * responsibility; this uses the same compiler and immutable runtime contract
 * solely to let a creator inspect a saved Brand draft before approval.
 */
export async function compileBrandReviewPreviews(
  input: BrandReviewPreviewInput,
): Promise<BrandReviewPreviewArtifacts> {
  const beforeTheme = input.activeVersion?.snapshot ?? LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1;
  const afterTheme = await createDraftPreviewSnapshot({
    name: input.name,
    draft: input.draft,
    version: (input.activeVersion?.version ?? 0) + 1,
  });

  const [before, after] = await Promise.all([
    compilePreviewDocument(beforeTheme),
    compilePreviewDocument(afterTheme),
  ]);

  return { before, after };
}

export async function compileBrandDraftPreview(
  input: BrandDraftPreviewInput,
): Promise<CompiledDocumentV2> {
  const snapshot = await createDraftPreviewSnapshot(input);
  return compilePreviewDocument(snapshot);
}

async function createDraftPreviewSnapshot({
  name,
  draft,
  version = 1,
}: BrandDraftPreviewInput): Promise<BrandThemeSnapshot> {
  const snapshot: BrandThemeSnapshot = {
    schemaVersion: BRAND_THEME_SCHEMA_VERSION,
    contractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeId: 'theme_brand_review_preview',
    themeVersionId: 'themev_brand_review_preview_draft',
    version,
    name: `${name.trim() || 'Brand theme'} draft`.slice(0, 120),
    contentHash: `sha256-${'0'.repeat(64)}`,
    definition: structuredClone(draft),
  };
  snapshot.contentHash = await computeBrandThemeContentHash(snapshot);
  return snapshot;
}

function compilePreviewDocument(theme: BrandThemeSnapshot): Promise<CompiledDocumentV2> {
  return compileDocument({
    document: structuredClone(BRAND_REVIEW_TOUR),
    theme,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
}
