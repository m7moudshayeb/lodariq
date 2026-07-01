import {
  sanitizeBlockProps,
  type CompiledDocument,
  type CompiledStep,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';
import { canonicalJson, sha256Hex } from './hash';
import { COMPILER_VERSION } from './version';

/** Block types that carry render-ready leaf content into compiled steps. */
const LEAF_CONTENT_TYPES = new Set([
  'heading',
  'paragraph',
  'list',
  'divider',
  'button',
  'link',
  'media',
]);

function collectBody(block: LodariqBlock, acc: CompiledStep['body']): void {
  if (LEAF_CONTENT_TYPES.has(block.type)) {
    acc.push({
      id: block.id,
      type: block.type,
      ...(block.content !== undefined ? { text: block.content } : {}),
      props: sanitizeBlockProps(block.props),
    });
  }
  for (const child of block.children) collectBody(child, acc);
}

function compileTourStep(
  step: LodariqBlock,
  targetsById: ReadonlyMap<string, LodariqDocument['targets'][number]>,
): CompiledStep {
  const body: CompiledStep['body'] = [];
  for (const child of step.children) collectBody(child, body);

  // The tooltip child (if any) carries the target binding + placement.
  const tooltip = step.children.find((c) => c.type === 'tooltip');
  const targetId = tooltip?.props.targetId;
  const placement = tooltip?.props.placement;
  const lifecycle = typeof targetId === 'string' ? targetsById.get(targetId)?.lifecycle : null;

  return {
    id: step.id,
    ...(typeof targetId === 'string' ? { targetId } : {}),
    ...(typeof placement === 'string' ? { placement } : {}),
    ...(lifecycle ? { lifecycle: structuredClone(lifecycle) } : {}),
    body,
  };
}

/**
 * Pure synchronous compile pass: canonical block JSON -> delivery JSON
 * (without the content hash). No DOM, no Node APIs (PRD §9.1).
 */
export function compile(document: LodariqDocument): Omit<CompiledDocument, 'contentHash'> {
  const targetsById = new Map(document.targets.map((target) => [target.id, target]));
  const steps = document.blocks
    .filter((b) => b.type === 'tourStep')
    .map((step) => compileTourStep(step, targetsById));

  return {
    documentId: document.id,
    type: document.type,
    schemaVersion: document.schemaVersion,
    compilerVersion: COMPILER_VERSION,
    targets: document.targets.map((t) => ({
      id: t.id,
      fingerprint: structuredClone(t.fingerprint),
    })),
    steps,
  };
}

/**
 * Compile and content-address the document (PRD §11.3).
 * Server-side for real publications; browser-side for local-dev preview only.
 */
export async function compileDocument(document: LodariqDocument): Promise<CompiledDocument> {
  const compiled = compile(document);
  const contentHash = `sha256-${await sha256Hex(canonicalJson(compiled))}`;
  return { ...compiled, contentHash };
}
