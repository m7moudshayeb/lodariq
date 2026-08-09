import {
  BrandThemeSnapshot,
  DEFAULT_EXPERIENCE_APPEARANCE,
  RendererContractVersion,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  isPresentationAnchor,
  isValid,
  sanitizeBlockProps,
  sanitizePresentationAnchor,
  type BrandThemeSnapshot as BrandThemeSnapshotType,
  type CompiledDocumentV2,
  type CompiledStep,
  type LodariqBlock,
  type LodariqDocument,
  type RendererContractVersion as RendererContractVersionType,
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

export interface CompileInput {
  document: LodariqDocument;
  theme: BrandThemeSnapshotType;
  rendererContractVersion: RendererContractVersionType;
}

function collectBody(block: LodariqBlock, acc: CompiledStep['body']): void {
  if (LEAF_CONTENT_TYPES.has(block.type)) {
    const props = sanitizeBlockProps(block.props);
    delete props.presentationAnchor;
    acc.push({
      id: block.id,
      type: block.type,
      ...(block.content !== undefined ? { text: block.content } : {}),
      props,
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
  const presentationAnchor = sanitizePresentationAnchor(tooltip?.props.presentationAnchor);
  const lifecycle = typeof targetId === 'string' ? targetsById.get(targetId)?.lifecycle : null;

  return {
    id: step.id,
    ...(typeof targetId === 'string' ? { targetId } : {}),
    ...(typeof placement === 'string' ? { placement } : {}),
    ...(presentationAnchor ? { presentationAnchor } : {}),
    ...(lifecycle ? { lifecycle: structuredClone(lifecycle) } : {}),
    body,
  };
}

/**
 * Pure synchronous compile pass: canonical block JSON -> delivery JSON
 * (without the content hash). No DOM, no Node APIs (PRD §9.1).
 */
export function compile(input: CompileInput): Omit<CompiledDocumentV2, 'contentHash'> {
  const { document, rendererContractVersion } = input;
  if (!isValid(BrandThemeSnapshot, input.theme)) {
    throw new Error('Compiler requires a valid BrandThemeSnapshot');
  }
  if (!isValid(RendererContractVersion, rendererContractVersion)) {
    throw new Error('Compiler requires a valid renderer contract version');
  }
  assertTargetIdentityBindings(document);
  assertPresentationAnchors(document);

  const targetsById = new Map(document.targets.map((target) => [target.id, target]));
  const steps = document.blocks
    .filter((b) => b.type === 'tourStep')
    .map((step) => compileTourStep(step, targetsById));

  return {
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    documentId: document.id,
    type: document.type,
    schemaVersion: document.schemaVersion,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion,
    trigger: structuredClone(document.trigger),
    audience: structuredClone(document.audience),
    theme: structuredClone(input.theme),
    appearance: structuredClone(document.appearance ?? DEFAULT_EXPERIENCE_APPEARANCE),
    targets: document.targets.map((t) => ({
      id: t.id,
      fingerprint: deliveryFingerprint(t.fingerprint, Boolean(t.identity)),
      ...(t.identity ? { identity: structuredClone(t.identity) } : {}),
    })),
    steps,
  };
}

function deliveryFingerprint(
  fingerprint: LodariqDocument['targets'][number]['fingerprint'],
  selectorFree: boolean,
): LodariqDocument['targets'][number]['fingerprint'] {
  const delivery = structuredClone(fingerprint);
  delete delivery.diagnosticCoordinates;
  if (selectorFree) delete delivery.scopedCss;
  return delivery;
}

function assertTargetIdentityBindings(document: LodariqDocument): void {
  for (const target of document.targets) {
    if (target.identity && target.identity.targetId !== target.id) {
      throw new Error(`Target identity ${target.identity.targetId} is not bound to ${target.id}`);
    }
  }
}

function assertPresentationAnchors(document: LodariqDocument): void {
  for (const block of document.blocks) {
    const compiledTooltip =
      block.type === 'tourStep'
        ? (block.children.find((child) => child.type === 'tooltip') ?? null)
        : null;
    assertBlockPresentationAnchor(block, null, compiledTooltip);
  }
}

function assertBlockPresentationAnchor(
  block: LodariqBlock,
  parent: LodariqBlock | null,
  compiledTooltip: LodariqBlock | null,
): void {
  const presentationAnchor = block.props.presentationAnchor;
  if (presentationAnchor !== undefined) {
    const hasTargetBinding =
      typeof block.props.targetId === 'string' && block.props.targetId.trim().length > 0;
    if (
      block !== compiledTooltip ||
      block.type !== 'tooltip' ||
      parent?.type !== 'tourStep' ||
      !hasTargetBinding
    ) {
      throw new Error(
        `Presentation anchor on ${block.id} must belong to the target-bearing tour tooltip ` +
          'selected for compilation',
      );
    }
    if (!isPresentationAnchor(presentationAnchor)) {
      throw new Error(`Presentation anchor on ${block.id} is outside its owner bounds`);
    }
  }
  for (const child of block.children) {
    assertBlockPresentationAnchor(child, block, compiledTooltip);
  }
}

/**
 * Compile and content-address the document (PRD §11.3).
 * Server-side for real publications; browser-side for local-dev preview only.
 */
export async function compileDocument(input: CompileInput): Promise<CompiledDocumentV2> {
  const compiled = compile(input);
  const [themeContentHash, artifactHash] = await Promise.all([
    computeBrandThemeContentHash(compiled.theme),
    sha256Hex(canonicalJson(compiled)),
  ]);
  if (themeContentHash !== compiled.theme.contentHash) {
    throw new Error('BrandThemeSnapshot contentHash does not match its immutable content');
  }
  const contentHash = `sha256-${artifactHash}`;
  return { ...compiled, contentHash };
}

/** Hash every immutable theme field except the self-referential contentHash. */
export async function computeBrandThemeContentHash(theme: BrandThemeSnapshotType): Promise<string> {
  const content = structuredClone(theme) as Partial<BrandThemeSnapshotType>;
  delete content.contentHash;
  return `sha256-${await sha256Hex(canonicalJson(content))}`;
}
