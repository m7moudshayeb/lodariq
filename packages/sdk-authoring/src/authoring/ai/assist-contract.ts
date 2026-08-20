/**
 * The provider-agnostic AI assist contract (§7.4, §7.5, §7.6).
 *
 * Every request is anchored to a selection, a step, or an explicit batch — there
 * is no unanchored chat surface, because "an unanchored chat box is where scope
 * discipline goes to die" (§7.8).
 *
 * Two guardrails are encoded here rather than left to a provider's good
 * behaviour, both from §7.4:
 *
 * 1. A proposal may create content. It may **never** mutate theme tokens or named
 *    styles — see `FORBIDDEN_ASSIST_PATHS`.
 * 2. A proposal is a *preview*. Applying it is a separate, explicit step, so the
 *    loop is preview → accept / reject / refine / undo, never apply-then-explain.
 */

/** Scribe's proven verb set, and deliberately no more (§7.4). */
export const AI_REWRITE_VERBS = [
  'shorter',
  'clearer',
  'more-formal',
  'friendlier',
  'fix-grammar',
] as const;
export type AiRewriteVerb = (typeof AI_REWRITE_VERBS)[number];

export type AiAssistScope = 'selection' | 'step' | 'batch';

export type AiAssistRequest =
  | { kind: 'rewrite'; scope: 'selection'; verb: AiRewriteVerb; text: string }
  | { kind: 'draft-step'; scope: 'step'; stepId: string; target: AiTargetContext }
  | { kind: 'command'; scope: AiAssistScope; prompt: string; stepIds: readonly string[] }
  | { kind: 'translate'; scope: 'batch'; locale: string; stepIds: readonly string[] };

/**
 * What a step draft is generated from: the accessible tree, not a screenshot.
 * Smaller, cheaper, more accurate, and it never ships page pixels anywhere. It
 * also nudges accessibility — a target with a poor accessible name drafts badly
 * (§7.4).
 */
export interface AiTargetContext {
  readonly accessibleName: string;
  readonly role: string;
  /** Immediate surrounding text, already bounded by the caller. */
  readonly nearbyText?: string;
}

/** One field-level change. `path` is a document path, never a CSS selector. */
export interface AiAssistEdit {
  readonly path: string;
  readonly before: string;
  readonly after: string;
  /**
   * Present for translation drafts. A localized edit writes a locale variant, so
   * drafts land in the builder for refinement and never touch the default copy
   * (§7.6, ADR-0018).
   */
  readonly locale?: string;
}

const BLOCK_CONTENT_PREFIX = 'block:';
const BLOCK_CONTENT_SUFFIX = '/content';

/** The only writable path shape: one block's content. */
export function blockContentPath(blockId: string): string {
  return `${BLOCK_CONTENT_PREFIX}${blockId}${BLOCK_CONTENT_SUFFIX}`;
}

export function parseBlockContentPath(path: string): string | null {
  if (!path.startsWith(BLOCK_CONTENT_PREFIX) || !path.endsWith(BLOCK_CONTENT_SUFFIX)) return null;
  const blockId = path.slice(BLOCK_CONTENT_PREFIX.length, -BLOCK_CONTENT_SUFFIX.length);
  return blockId.length > 0 ? blockId : null;
}

export interface AiAssistProposal {
  readonly proposalId: string;
  /** One line a creator can accept or reject without reading the diff. */
  readonly summary: string;
  readonly edits: readonly AiAssistEdit[];
}

/**
 * Path prefixes the assist layer may never write. Webflow's AI Assistant has the
 * best-designed constraints in this space and this is the load-bearing one: new
 * content yes, mutating the design system no.
 */
export const FORBIDDEN_ASSIST_PATHS = [
  'theme',
  'themeBinding',
  'appearance',
  'brand',
  'styleRecipes',
] as const;

export function isForbiddenAssistPath(path: string): boolean {
  const [root] = path.split(/[.[]/u);
  return FORBIDDEN_ASSIST_PATHS.includes(root as (typeof FORBIDDEN_ASSIST_PATHS)[number]);
}

/** Drops edits that would mutate the design system, keeping the rest usable. */
export function withoutForbiddenEdits(proposal: AiAssistProposal): AiAssistProposal {
  const edits = proposal.edits.filter((edit) => !isForbiddenAssistPath(edit.path));
  return edits.length === proposal.edits.length ? proposal : { ...proposal, edits };
}

/**
 * Batch scope needs an explicit confirm because it touches more than one object;
 * a single-step edit does not (§7.5).
 */
export function requiresExplicitConfirm(request: AiAssistRequest): boolean {
  return request.scope === 'batch' || (request.kind === 'command' && request.stepIds.length > 1);
}
