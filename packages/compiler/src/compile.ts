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
  resolveMediaPresentationForLocale,
  resolveExperienceAppearance,
  sanitizeBlockProps,
  sanitizeInlineTextRuns,
  sanitizePresentationAnchor,
  sanitizeTooltipLayoutProps,
  sanitizeTooltipStyleProps,
  sanitizeTourCompletionBehavior,
  sanitizeTargetApproach,
  sanitizeExperiment,
  sanitizeExperienceBehavior,
  isDeliverableExperienceType,
  isExperienceBehaviorForType,
  TOUR_RENDERABLE_LEAF_BLOCK_TYPES,
  type ApplicationSummary,
  type AuthoringMediaAssetKind,
  type BrandThemeSnapshot as BrandThemeSnapshotType,
  type CompiledDocumentV5,
  type CompiledTargetApproach,
  type CompiledExperiment,
  type CompiledExperienceBehavior,
  type CompiledStep,
  type Experiment,
  type ExperimentOverride,
  type LodariqBlock,
  type LodariqDocument,
  type MediaPresentation,
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
  showLodariqBadge?: boolean;
  experiment?: Experiment;
  /** Server-resolved immutable media metadata. Browser preview may omit it. */
  mediaAssets?: ReadonlyMap<
    string,
    { kind: AuthoringMediaAssetKind; contentHash: string; contentType: string }
  >;
}

function collectBody(
  block: LodariqBlock,
  acc: CompiledStep['body'],
  contentLocale: string,
  mediaAssets?: CompileInput['mediaAssets'],
): void {
  if (LEAF_CONTENT_TYPES.has(block.type)) {
    const props = sanitizeBlockProps(block.props);
    const contentRuns = sanitizeInlineTextRuns(block.contentRuns);
    delete props.presentationAnchor;
    delete props.narration;
    delete props.entrySequence;
    delete props.motion;
    delete props.responsive;
    delete props.spotlight;
    if (props.media) {
      props.media = deliveryMediaPresentation(props.media, contentLocale, mediaAssets);
    }
    acc.push({
      id: block.id,
      type: block.type,
      ...(block.content !== undefined ? { text: block.content } : {}),
      ...(contentRuns ? { contentRuns: structuredClone(contentRuns) } : {}),
      props,
    });
  }
  for (const child of block.children) collectBody(child, acc, contentLocale, mediaAssets);
}

function compileTourStep(
  step: LodariqBlock,
  targetsById: ReadonlyMap<string, LodariqDocument['targets'][number]>,
  contentLocale: string,
  mediaAssets?: CompileInput['mediaAssets'],
): CompiledStep {
  const body: CompiledStep['body'] = [];
  for (const child of step.children) collectBody(child, body, contentLocale, mediaAssets);

  // The tooltip child (if any) carries the target binding + placement.
  const tooltip = step.children.find((c) => c.type === 'tooltip' || c.type === 'spotlight');
  const targetId = tooltip?.props.targetId;
  const placement = tooltip?.props.placement;
  const presentationAnchor = sanitizePresentationAnchor(tooltip?.props.presentationAnchor);
  const tooltipLayout = sanitizeTooltipLayoutProps(tooltip?.props.tooltipLayout);
  const tooltipStyle = sanitizeTooltipStyleProps(tooltip?.props.tooltipStyle);
  const stepProps = sanitizeBlockProps(step.props);
  const tooltipProps = tooltip ? sanitizeBlockProps(tooltip.props) : undefined;
  const entrySequence = stepProps.entrySequence;
  const narration = stepProps.narration;
  const resolvedNarrationAsset = narration?.audio
    ? mediaAssets?.get(narration.audio.assetId)
    : undefined;
  const narrationAsset = resolvedNarrationAsset ?? narration?.audio;
  if (
    narration?.audio &&
    mediaAssets &&
    (!resolvedNarrationAsset || resolvedNarrationAsset.kind !== 'audio')
  ) {
    throw new Error(`Narration audio ${narration.audio.assetId} is unavailable`);
  }
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
    ...(narration?.audio && narrationAsset
      ? {
          narration: {
            script: narration.script,
            startOffsetMs: narration.startOffsetMs ?? 0,
            advanceOnEnd: narration.advanceOnEnd ?? false,
            audio: {
              ...structuredClone(narration.audio),
              contentHash: narrationAsset.contentHash,
              contentType: narrationAsset.contentType as typeof narration.audio.contentType,
            },
          },
        }
      : {}),
    ...(lifecycle ? { lifecycle: structuredClone(lifecycle) } : {}),
    body,
  };
}

/**
 * Pure synchronous compile pass: canonical block JSON -> delivery JSON
 * (without the content hash). No DOM, no Node APIs (PRD §9.1).
 */
export function compile(input: CompileInput): Omit<CompiledDocumentV5, 'contentHash'> {
  const { document, rendererContractVersion } = input;
  if (!isDeliverableExperienceType(document.type)) {
    throw new Error(`Unsupported delivery experience type: ${document.type}`);
  }
  if (
    document.experience !== undefined &&
    !isExperienceBehaviorForType(document.type, document.experience)
  ) {
    throw new Error(`Invalid ${document.type} experience behavior`);
  }
  if (!isValid(BrandThemeSnapshot, input.theme)) {
    throw new Error('Compiler requires a valid BrandThemeSnapshot');
  }
  if (!isValid(RendererContractVersion, rendererContractVersion)) {
    throw new Error('Compiler requires a valid renderer contract version');
  }
  assertTargetIdentityBindings(document);
  assertTargetApproaches(document);
  assertExperienceHasRenderableRoot(document);
  assertPresentationAnchors(document);
  assertDocumentLocalization(document);
  assertCompletionBehavior(document);
  const handoffApplications = referencedApplications(document, input.applications);

  const targetsById = new Map(document.targets.map((target) => [target.id, target]));
  const localization = resolveDocumentLocalization(document);
  let steps = compileSteps(document, targetsById, localization.defaultLocale, input.mediaAssets);
  const completion = sanitizeTourCompletionBehavior(document.completion);
  let localeVariants = localization.variants.map((variant) => {
    const locale = canonicalContentLocale(variant.locale) ?? variant.locale;
    const localizedDocument = materializeLocalizedDocument(document, locale);
    return {
      locale,
      fallbackLocale: canonicalContentLocale(variant.fallbackLocale) ?? variant.fallbackLocale,
      title: localizedDocument.title,
      steps: compileSteps(localizedDocument, targetsById, locale, input.mediaAssets),
    };
  });
  const experiment = compileExperiment(document, input.experiment);
  const promotedArm =
    input.experiment?.status === 'promoted'
      ? input.experiment.arms.find((arm) => arm.id === input.experiment?.promotedArmId)
      : undefined;
  if (promotedArm) {
    const overrides = promotedArm.overrides ?? [];
    steps = applyExperimentOverrides(
      steps,
      overrides,
      localization.defaultLocale,
      input.mediaAssets,
    );
    localeVariants = localeVariants.map((variant) => ({
      ...variant,
      steps: applyExperimentOverrides(variant.steps, overrides, variant.locale, input.mediaAssets),
    }));
  }

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
    experience: compileExperienceBehavior(document),
    ...(completion ? { completion: structuredClone(completion) } : {}),
    ...(handoffApplications.length ? { applications: handoffApplications } : {}),
    ...(input.showLodariqBadge ? { showLodariqBadge: true } : {}),
    ...(experiment ? { experiment } : {}),
    targets: document.targets.map((target) => {
      const approach = compileTargetApproach(target.approach);
      return {
        id: target.id,
        fingerprint: deliveryFingerprint(target.fingerprint, Boolean(target.identity)),
        ...(target.identity ? { identity: structuredClone(target.identity) } : {}),
        // The publish gate requires an explicit look-alike answer. Preserve it
        // in the immutable artifact so delivery follows the approved policy.
        ...(target.selection ? { selection: structuredClone(target.selection) } : {}),
        ...(approach ? { approach } : {}),
      };
    }),
    steps,
    localization: {
      defaultLocale: localization.defaultLocale,
      defaultTitle: document.title,
      variants: localeVariants,
    },
  };
}

function compileExperienceBehavior(document: LodariqDocument): CompiledExperienceBehavior {
  if (!isDeliverableExperienceType(document.type)) {
    throw new Error(`Unsupported delivery experience type: ${document.type}`);
  }
  const behavior = sanitizeExperienceBehavior(document.type, document.experience);
  if (behavior.type === 'tour') return { type: 'tour', surface: 'popup' };
  if (behavior.type === 'announcement') {
    const surface = document.surfaceForm ?? 'modal';
    if (surface !== 'modal' && surface !== 'banner' && surface !== 'slideIn') {
      throw new Error(`Announcement surface ${surface} is not supported`);
    }
    return { ...behavior, surface };
  }
  if (behavior.type === 'hotspot') return { ...behavior, surface: 'hotspot' };
  if (behavior.type === 'survey') {
    return {
      ...behavior,
      surface: 'modal',
      questionBlockIds: collectBlockIds(document.blocks, 'formField', 50),
    };
  }
  const surface = document.surfaceForm ?? 'floating';
  if (surface !== 'drawer' && surface !== 'floating') {
    throw new Error(`Checklist surface ${surface} is not supported`);
  }
  return {
    ...behavior,
    surface,
    itemBlockIds: collectBlockIds(document.blocks, 'list', 100),
  };
}

function collectBlockIds(
  roots: readonly LodariqBlock[],
  type: LodariqBlock['type'],
  maximum: number,
): string[] {
  const ids: string[] = [];
  const visit = (block: LodariqBlock): void => {
    if (block.type === type && ids.length < maximum) ids.push(block.id);
    for (const child of block.children) visit(child);
  };
  for (const root of roots) visit(root);
  return ids;
}

function compileExperiment(
  document: LodariqDocument,
  candidate: Experiment | undefined,
): CompiledExperiment | undefined {
  if (!candidate || candidate.status === 'stopped' || candidate.status === 'promoted')
    return undefined;
  const experiment = sanitizeExperiment(candidate);
  if (!experiment) throw new Error('Experiment must match the closed measurement contract');
  const blockById = new Map<string, LodariqBlock>();
  const stepIds = new Set<string>();
  const visit = (block: LodariqBlock): void => {
    if (blockById.has(block.id))
      throw new Error(`Experiment cannot reference duplicate block ${block.id}`);
    blockById.set(block.id, block);
    if (block.type === 'tourStep') stepIds.add(block.id);
    for (const child of block.children) visit(child);
  };
  for (const block of document.blocks) visit(block);

  const allowedType = experiment.varies === 'conditions' ? 'condition' : experiment.varies;
  const arms = experiment.arms.map((arm) => {
    if (arm.overridesRef)
      throw new Error(`Experiment arm ${arm.id} has an unresolved override reference`);
    const overrides = structuredClone(arm.overrides ?? []);
    const identities = new Set<string>();
    for (const override of overrides) {
      if (override.type !== allowedType) {
        throw new Error(
          `Experiment arm ${arm.id} contains an override outside ${experiment.varies}`,
        );
      }
      assertExperimentOverrideReference(override, blockById, stepIds);
      const identity = experimentOverrideIdentity(override);
      if (identities.has(identity)) {
        throw new Error(`Experiment arm ${arm.id} repeats override ${identity}`);
      }
      identities.add(identity);
    }
    return { id: arm.id, label: arm.label, overrides };
  });
  return {
    id: experiment.id,
    varies: experiment.varies,
    successEventName: experiment.successEventName,
    arms,
  };
}

function assertExperimentOverrideReference(
  override: ExperimentOverride,
  blocks: ReadonlyMap<string, LodariqBlock>,
  stepIds: ReadonlySet<string>,
): void {
  if (override.type === 'placement' || override.type === 'style') {
    if (!stepIds.has(override.stepId)) {
      throw new Error(
        `Experiment ${override.type} override references missing step ${override.stepId}`,
      );
    }
    return;
  }
  const block = blocks.get(override.blockId);
  if (!block)
    throw new Error(
      `Experiment ${override.type} override references missing block ${override.blockId}`,
    );
  if (override.type === 'media' && block.type !== 'media') {
    throw new Error(`Experiment media override must reference a media block`);
  }
}

function experimentOverrideIdentity(override: ExperimentOverride): string {
  return `${override.type}:${'stepId' in override ? override.stepId : override.blockId}`;
}

function applyExperimentOverrides(
  source: readonly CompiledStep[],
  overrides: readonly ExperimentOverride[],
  contentLocale: string,
  mediaAssets?: CompileInput['mediaAssets'],
): CompiledStep[] {
  return source.map((step) => {
    const next = structuredClone(step);
    for (const override of overrides) {
      if (override.type === 'placement' && override.stepId === step.id) {
        next.placement = override.placement;
      } else if (override.type === 'style' && override.stepId === step.id) {
        next.tooltipStyle = structuredClone(override.tooltipStyle);
      } else if (override.type === 'condition' && override.blockId === step.id) {
        next.showWhen = structuredClone(override.showWhen);
      } else if ('blockId' in override) {
        next.body = next.body.map((block) => {
          if (block.id !== override.blockId) return block;
          if (override.type === 'copy') {
            const { contentRuns: _contentRuns, ...rest } = block;
            return { ...rest, text: override.text };
          }
          if (override.type === 'condition') {
            return {
              ...block,
              props: { ...block.props, showWhen: structuredClone(override.showWhen) },
            };
          }
          if (override.type === 'media') {
            return {
              ...block,
              props: {
                ...block.props,
                media: deliveryMediaPresentation(override.media, contentLocale, mediaAssets),
              },
            };
          }
          return block;
        });
      }
    }
    return next;
  });
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
  contentLocale: string,
  mediaAssets?: CompileInput['mediaAssets'],
): CompiledStep[] {
  return document.blocks
    .filter((block) => experienceRootBlockTypes(document.type).has(block.type))
    .map((block) => compileTourStep(asStep(block), targetsById, contentLocale, mediaAssets));
}

/** Locale metadata is authoring-only; each immutable artifact branch carries one approved choice. */
function deliveryMediaPresentation(
  media: MediaPresentation,
  contentLocale: string,
  mediaAssets?: CompileInput['mediaAssets'],
): MediaPresentation {
  const resolved = resolveMediaPresentationForLocale(media, contentLocale);
  const {
    localeVariants: _localeVariants,
    fallbackLocale: _fallbackLocale,
    ...delivery
  } = resolved;
  assertDeliveryMediaAssets(delivery as MediaPresentation, mediaAssets);
  return delivery as MediaPresentation;
}

function assertDeliveryMediaAssets(
  media: MediaPresentation,
  mediaAssets?: CompileInput['mediaAssets'],
): void {
  if (!mediaAssets) return;
  const expected: Array<{ assetId: string; kind: AuthoringMediaAssetKind }> = [
    { assetId: media.assetId, kind: media.kind },
  ];
  if (media.kind === 'video') {
    if (media.captionsAssetId) {
      expected.push({ assetId: media.captionsAssetId, kind: 'captions' });
    }
    if (media.posterAssetId) expected.push({ assetId: media.posterAssetId, kind: 'image' });
  }
  const invalid = expected.find(({ assetId, kind }) => mediaAssets.get(assetId)?.kind !== kind);
  if (invalid) throw new Error(`Media asset ${invalid.assetId} is unavailable as ${invalid.kind}`);
}

/**
 * Root blocks that become a delivered step.
 *
 * The model is type-agnostic: a tour is a sequence of surfaces and an
 * announcement, hotspot, survey or checklist is one surface. Only `tourStep`
 * used to compile, so every non-tour type authored fine and then delivered an
 * empty artifact — the experience existed everywhere except in front of a user.
 */
const SINGLE_SURFACE_ROOT_BLOCK_TYPES: ReadonlySet<string> = new Set(['tooltip']);
const HOTSPOT_ROOT_BLOCK_TYPES: ReadonlySet<string> = new Set(['tooltip', 'spotlight']);
const TOUR_ROOT_BLOCK_TYPES: ReadonlySet<string> = new Set(['tourStep']);
const KNOWN_EXPERIENCE_ROOT_BLOCK_TYPES: ReadonlySet<string> = new Set([
  ...SINGLE_SURFACE_ROOT_BLOCK_TYPES,
  ...HOTSPOT_ROOT_BLOCK_TYPES,
  ...TOUR_ROOT_BLOCK_TYPES,
]);

function experienceRootBlockTypes(type: LodariqDocument['type']): ReadonlySet<string> {
  if (type === 'tour') return TOUR_ROOT_BLOCK_TYPES;
  if (type === 'hotspot') return HOTSPOT_ROOT_BLOCK_TYPES;
  return SINGLE_SURFACE_ROOT_BLOCK_TYPES;
}

function assertExperienceHasRenderableRoot(document: LodariqDocument): void {
  const allowed = experienceRootBlockTypes(document.type);
  const renderableRoots = document.blocks.filter((block) => allowed.has(block.type));
  if (renderableRoots.length === 0) {
    const unsupported = document.blocks[0];
    if (unsupported) {
      throw new Error(`Unsupported ${document.type} root block: ${unsupported.type}`);
    }
    throw new Error(`Missing renderable ${document.type} root block`);
  }
  const looseRoot = document.blocks.find(
    (block) => !allowed.has(block.type) && !KNOWN_EXPERIENCE_ROOT_BLOCK_TYPES.has(block.type),
  );
  if (looseRoot) {
    throw new Error(`Unsupported ${document.type} root block: ${looseRoot.type}`);
  }
}

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

function assertTargetApproaches(document: LodariqDocument): void {
  const targetIds = new Set(document.targets.map((target) => target.id));
  for (const target of document.targets) {
    if (!target.approach) continue;
    const approach = sanitizeTargetApproach(target.approach);
    if (!approach) throw new Error(`Target approach ${target.id} is invalid`);
    for (const leg of approach.legs) {
      if (leg.act.kind === 'navigate') {
        throw new Error(`Target approach ${target.id} uses an unresolved route pattern`);
      }
      if (leg.act.kind === 'activateTarget') {
        if (!targetIds.has(leg.act.targetId)) {
          throw new Error(
            `Target approach ${target.id} references missing target ${leg.act.targetId}`,
          );
        }
        if (leg.act.targetId === target.id) {
          throw new Error(`Target approach ${target.id} cannot activate itself`);
        }
      }
      if (leg.act.kind === 'observe' && !leg.wait) {
        throw new Error(`Target approach ${target.id} contains an empty observation`);
      }
      if (leg.wait?.type === 'targetAvailable' && !targetIds.has(leg.wait.targetId)) {
        throw new Error(
          `Target approach ${target.id} waits for missing target ${leg.wait.targetId}`,
        );
      }
    }
  }
}

function compileTargetApproach(
  value: LodariqDocument['targets'][number]['approach'],
): CompiledTargetApproach | undefined {
  const approach = sanitizeTargetApproach(value);
  if (!approach) return undefined;
  const legs: CompiledTargetApproach['legs'] = [];
  for (const leg of approach.legs) {
    if (leg.act.kind === 'navigate') {
      throw new Error('Target approach uses an unresolved route pattern');
    }
    const act =
      leg.act.kind === 'activateTarget'
        ? { kind: 'activateTarget' as const, targetId: leg.act.targetId }
        : { kind: 'observe' as const };
    legs.push({
      act,
      ...(leg.wait ? { wait: structuredClone(leg.wait) } : {}),
      label: leg.label,
    });
  }
  return { legs };
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
      (parent !== null && parent.type !== 'tourStep') ||
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
export async function compileDocument(input: CompileInput): Promise<CompiledDocumentV5> {
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
