import {
  BrandThemeSnapshot,
  RendererContractVersion,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  isPresentationAnchor,
  isValid,
  canonicalContentLocale,
  documentLocalizationIssues,
  materializeLocalizedDocument,
  resolveDocumentLocalization,
  resolveExperienceAppearance,
  sanitizeBlockProps,
  sanitizeInlineTextRuns,
  sanitizePresentationAnchor,
  sanitizeTooltipLayoutProps,
  sanitizeTooltipStyleProps,
  sanitizeTourCompletionBehavior,
  TOUR_RENDERABLE_LEAF_BLOCK_TYPES,
  type ApplicationSummary,
  type BrandThemeSnapshot as BrandThemeSnapshotType,
  type CompiledDocumentV4,
  type CompiledStep,
  type LodariqBlock,
  type LodariqDocument,
  type RendererContractVersion as RendererContractVersionType,
} from '@lodariq/schema';
import { canonicalJson, sha256Hex } from './hash';
import { COMPILER_VERSION } from './version';

const LEAF_CONTENT_TYPES = new Set<string>(TOUR_RENDERABLE_LEAF_BLOCK_TYPES);

export interface CompileInput {
  document: LodariqDocument;
  theme: BrandThemeSnapshotType;
  rendererContractVersion: RendererContractVersionType;
  /**
   * Applications a step may hand off to. Only the ones actually referenced are
   * emitted, so the artifact never carries the whole workspace registry.
   */
  applications?: readonly ApplicationSummary[];
}

function collectBody(block: LodariqBlock, acc: CompiledStep['body']): void {
  if (LEAF_CONTENT_TYPES.has(block.type)) {
    const props = sanitizeBlockProps(block.props);
    const contentRuns = sanitizeInlineTextRuns(block.contentRuns);
    delete props.presentationAnchor;
    delete props.entrySequence;
    delete props.motion;
    delete props.responsive;
    delete props.spotlight;
    acc.push({
      id: block.id,
      type: block.type,
      ...(block.content !== undefined ? { text: block.content } : {}),
      ...(contentRuns ? { contentRuns: structuredClone(contentRuns) } : {}),
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
  const tooltipLayout = sanitizeTooltipLayoutProps(tooltip?.props.tooltipLayout);
  const tooltipStyle = sanitizeTooltipStyleProps(tooltip?.props.tooltipStyle);
  const stepProps = sanitizeBlockProps(step.props);
  const tooltipProps = tooltip ? sanitizeBlockProps(tooltip.props) : undefined;
  const entrySequence = stepProps.entrySequence;
  const lifecycle = typeof targetId === 'string' ? targetsById.get(targetId)?.lifecycle : null;

  return {
    id: step.id,
    ...(typeof targetId === 'string' ? { targetId } : {}),
    ...(typeof placement === 'string' ? { placement } : {}),
    ...(tooltipProps?.anchorAlign ? { anchorAlign: tooltipProps.anchorAlign } : {}),
    ...(tooltipProps?.anchorOffsetPx === undefined
      ? {}
      : { anchorOffsetPx: tooltipProps.anchorOffsetPx }),
    ...(tooltipProps?.anchorAutoFlip === undefined
      ? {}
      : { anchorAutoFlip: tooltipProps.anchorAutoFlip }),
    ...(stepProps.emphasis ? { emphasis: structuredClone(stepProps.emphasis) } : {}),
    ...(stepProps.showWhen ? { showWhen: structuredClone(stepProps.showWhen) } : {}),
    ...(stepProps.teaches ? { teaches: stepProps.teaches } : {}),
    ...(stepProps.handoff ? { handoff: structuredClone(stepProps.handoff) } : {}),
    ...(presentationAnchor ? { presentationAnchor } : {}),
    ...(tooltipLayout ? { tooltipLayout: structuredClone(tooltipLayout) } : {}),
    ...(tooltipStyle ? { tooltipStyle: structuredClone(tooltipStyle) } : {}),
    ...(entrySequence ? { entrySequence: structuredClone(entrySequence) } : {}),
    ...(stepProps.motion ? { motion: structuredClone(stepProps.motion) } : {}),
    ...(stepProps.responsive ? { responsive: structuredClone(stepProps.responsive) } : {}),
    ...(stepProps.spotlight ? { spotlight: structuredClone(stepProps.spotlight) } : {}),
    ...(stepProps.accessibilityName ? { accessibilityName: stepProps.accessibilityName } : {}),
    ...(lifecycle ? { lifecycle: structuredClone(lifecycle) } : {}),
    body,
  };
}

/**
 * Pure synchronous compile pass: canonical block JSON -> delivery JSON
 * (without the content hash). No DOM, no Node APIs (PRD §9.1).
 */
export function compile(input: CompileInput): Omit<CompiledDocumentV4, 'contentHash'> {
  const { document, rendererContractVersion } = input;
  if (!isValid(BrandThemeSnapshot, input.theme)) {
    throw new Error('Compiler requires a valid BrandThemeSnapshot');
  }
  if (!isValid(RendererContractVersion, rendererContractVersion)) {
    throw new Error('Compiler requires a valid renderer contract version');
  }
  assertTargetIdentityBindings(document);
  assertPresentationAnchors(document);
  assertDocumentLocalization(document);
  assertCompletionBehavior(document);
  const handoffApplications = referencedApplications(document, input.applications);

  const targetsById = new Map(document.targets.map((target) => [target.id, target]));
  const steps = compileSteps(document, targetsById);
  const localization = resolveDocumentLocalization(document);
  const completion = sanitizeTourCompletionBehavior(document.completion);
  const localeVariants = localization.variants.map((variant) => {
    const locale = canonicalContentLocale(variant.locale) ?? variant.locale;
    const localizedDocument = materializeLocalizedDocument(document, locale);
    return {
      locale,
      fallbackLocale: canonicalContentLocale(variant.fallbackLocale) ?? variant.fallbackLocale,
      title: localizedDocument.title,
      steps: compileSteps(localizedDocument, targetsById),
    };
  });

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
    appearance: structuredClone(resolveExperienceAppearance(document.appearance)),
    ...(completion ? { completion: structuredClone(completion) } : {}),
    ...(handoffApplications.length ? { applications: handoffApplications } : {}),
    targets: document.targets.map((t) => ({
      id: t.id,
      fingerprint: deliveryFingerprint(t.fingerprint, Boolean(t.identity)),
      ...(t.identity ? { identity: structuredClone(t.identity) } : {}),
    })),
    steps,
    localization: {
      defaultLocale: localization.defaultLocale,
      defaultTitle: document.title,
      variants: localeVariants,
    },
  };
}

/** A handoff naming an application the workspace does not have fails to compile. */
function referencedApplications(
  document: LodariqDocument,
  available: readonly ApplicationSummary[] | undefined,
): ApplicationSummary[] {
  const referenced = new Set(
    document.blocks
      .map((block) => block.props?.handoff?.applicationId)
      .filter((id): id is string => typeof id === 'string'),
  );
  if (!referenced.size) return [];
  const byId = new Map((available ?? []).map((application) => [application.id, application]));
  const missing = [...referenced].filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`Unknown handoff application ${missing[0]}`);
  return [...referenced].map((id) => structuredClone(byId.get(id)!));
}

function assertCompletionBehavior(document: LodariqDocument): void {
  const completion = sanitizeTourCompletionBehavior(document.completion);
  if (!completion) return;
  if (
    completion.type === 'showStep' &&
    !document.blocks.some((block) => block.type === 'tourStep' && block.id === completion.stepId)
  ) {
    throw new Error(`Completion step ${completion.stepId} does not exist`);
  }
  if (
    completion.type === 'activateTarget' &&
    !document.targets.some((target) => target.id === completion.targetId)
  ) {
    throw new Error(`Completion target ${completion.targetId} does not exist`);
  }
}

function compileSteps(
  document: LodariqDocument,
  targetsById: ReadonlyMap<string, LodariqDocument['targets'][number]>,
): CompiledStep[] {
  return document.blocks
    .filter((block) => COMPILABLE_ROOT_BLOCK_TYPES.has(block.type))
    .map((block) => compileTourStep(asStep(block), targetsById));
}

/**
 * Root blocks that become a delivered step.
 *
 * The model is type-agnostic: a tour is a sequence of surfaces and an
 * announcement, hotspot, survey or checklist is one surface. Only `tourStep`
 * used to compile, so every non-tour type authored fine and then delivered an
 * empty artifact — the experience existed everywhere except in front of a user.
 */
const COMPILABLE_ROOT_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'tourStep',
  'tooltip',
  'spotlight',
]);

/**
 * A single-surface root is compiled as a one-step sequence. The wrapper is
 * synthetic and never persisted: it exists so one renderer serves every type.
 */
function asStep(block: LodariqBlock): LodariqBlock {
  if (block.type === 'tourStep') return block;
  return { id: block.id, type: 'tourStep', props: {}, children: [block] };
}

function assertDocumentLocalization(document: LodariqDocument): void {
  const issues = documentLocalizationIssues(document);
  if (issues.length === 0) return;
  throw new Error(`Document localization is invalid: ${JSON.stringify(issues)}`);
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
    // A root tooltip is its own compiled surface, so it is its own anchor owner.
    const compiledTooltip =
      block.type === 'tourStep'
        ? (block.children.find((child) => child.type === 'tooltip') ?? null)
        : block.type === 'tooltip'
          ? block
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
export async function compileDocument(input: CompileInput): Promise<CompiledDocumentV4> {
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
