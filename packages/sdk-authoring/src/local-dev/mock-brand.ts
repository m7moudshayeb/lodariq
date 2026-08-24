/**
 * WIRE_BE: the authenticated session owns the Brand seam.
 *
 * Without it `accessibleFallbackBrandState()` answers `canEdit: false`, so
 * "Match product" and "Use this element's look" were drawn disabled in every
 * local session and the whole Product Match review — confidence, per-role
 * before/after, adopt, revert — could not be reached at all.
 *
 * The element picker is real: the host panel already owns it and answers
 * `style.sample.start`. Only persistence is stood in for, and it lives in this
 * tab: the merged draft is held in memory, `sourceId`/`sourceHash` are derived
 * from the proposal rather than issued by a server, and nothing is written.
 */
import {
  BRAND_THEME_CONTRACT_VERSION,
  BRAND_THEME_SCHEMA_VERSION,
  type AuthoringProductMatchApplyResult,
  type BrandThemeSnapshot,
  type ProductStyleProposal,
} from '@lodariq/schema';
import { mergeProductStyleTokensIntoDraft } from '@lodariq/schema/product-style-theme';
import {
  brandMatchProposalForFrame,
  brandWorkspaceStateFromTheme,
} from '../authoring/workflow-adapters';
import type { LocalAuthoringFrameServices } from '../authoring/local-frame';

export interface LocalBrandOptions {
  /** The theme the frame started with; adopted matches replace it here. */
  readonly initialTheme: BrandThemeSnapshot;
  /** True when `initialTheme` is the safe default rather than a workspace theme. */
  readonly fallbackTheme?: boolean;
  /** Supplied by the host panel when it is reachable; absent standalone. */
  readonly sampleProductStyle?: (request: {
    scope: 'page' | 'selected-target';
    targetId?: string;
  }) => Promise<ProductStyleProposal>;
}

export type LocalBrandServices = Pick<
  LocalAuthoringFrameServices,
  | 'adoptBrandPreviewTheme'
  | 'applyBrandMatch'
  | 'getBrandWorkflowState'
  | 'prepareBrandMatchProposal'
  | 'sampleBrandStyle'
>;

export function createLocalDevBrandServices(options: LocalBrandOptions): LocalBrandServices {
  let theme = structuredClone(options.initialTheme);
  let draftRevision = 0;
  const sample = options.sampleProductStyle;

  /* An adopted match is a draft, whatever the baseline was; only the untouched
     baseline needs to keep saying it is the safe default. */
  let adopted = false;
  const workspaceState = (): ReturnType<typeof brandWorkspaceStateFromTheme> => {
    const state = brandWorkspaceStateFromTheme(theme);
    if (!options.fallbackTheme || adopted) return state;
    return {
      ...state,
      status: 'fallback',
      source: {
        kind: 'accessible-fallback',
        label: state.source.label,
        detail: state.source.detail,
      },
    };
  };

  return {
    getBrandWorkflowState: async () => workspaceState(),
    prepareBrandMatchProposal: (proposal) => brandMatchProposalForFrame(proposal, theme),
    ...(sample
      ? {
          sampleBrandStyle: async (request) => {
            const proposal = await sample({
              scope:
                request.strategy === 'current-target' && request.targetId
                  ? 'selected-target'
                  : 'page',
              ...(request.targetId ? { targetId: request.targetId } : {}),
            });
            return brandMatchProposalForFrame(proposal, theme);
          },
        }
      : {}),
    applyBrandMatch: async (proposal) => {
      const evidence = structuredClone(proposal.evidence);
      const definition = mergeProductStyleTokensIntoDraft(theme.definition, evidence);
      const contentHash = await hashDefinition(definition);
      const draftChanged = contentHash !== theme.contentHash;
      if (draftChanged) draftRevision += 1;
      const previewTheme: BrandThemeSnapshot = {
        schemaVersion: BRAND_THEME_SCHEMA_VERSION,
        contractVersion: BRAND_THEME_CONTRACT_VERSION,
        themeId: theme.themeId,
        themeVersionId: `${theme.themeId}:local-draft-${Math.max(1, draftRevision)}`,
        version: theme.version,
        name: theme.name,
        contentHash,
        definition,
      };
      const persisted: AuthoringProductMatchApplyResult = {
        proposalId: evidence.proposalId,
        draftRevision: Math.max(1, draftRevision),
        draftUpdatedAt: new Date().toISOString(),
        previewTheme,
        sources: await Promise.all(
          evidence.sources.map(async (source) => ({
            sourceId: source.sourceId,
            sourceHash: await hashDefinition(source),
          })),
        ),
        draftChanged,
        replayed: !draftChanged,
      };
      return {
        brand: brandWorkspaceStateFromTheme(previewTheme, evidence),
        savedAs: draftChanged ? 'draft' : 'unchanged',
        persisted,
      };
    },
    adoptBrandPreviewTheme: (persisted) => {
      if (persisted.previewTheme.themeId !== theme.themeId) return false;
      theme = structuredClone(persisted.previewTheme);
      adopted = true;
      return true;
    },
  };
}

/** Same canonical-JSON-then-SHA-256 shape the control plane uses for a snapshot. */
async function hashDefinition(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(value)));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256-${hex}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
