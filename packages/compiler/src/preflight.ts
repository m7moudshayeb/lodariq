import {
  BASIC_VISUAL_PREFLIGHT_MAX_ISSUES,
  BASIC_VISUAL_PREFLIGHT_REPORT_SCHEMA_VERSION,
  BasicVisualPreflightReport,
  CompiledDocumentV4,
  RENDERER_CONTRACT_VERSION,
  STRUCTURED_COMPOSITION_BLOCK_TYPE_VALUES,
  CONTRAST_RATIO_TARGETS,
  evaluateContrast,
  isValid,
  type BasicVisualPreflightContrastSubject,
  type BasicVisualPreflightIssue,
  type BasicVisualPreflightReport as BasicVisualPreflightReportType,
  type BasicVisualPreflightStatus,
  type CompiledDocumentV4 as CompiledDocumentV4Type,
  type ExperienceAppearance,
  type ThemeColorTokens,
  type TourRendererRecipe,
} from '@lodariq/schema';
import { canonicalJson, sha256Hex } from './hash';
import { validateCompiledTourFlow } from './flow-graph';
import type { StepChoreography } from '@lodariq/schema';

// WCAG-aligned targets remain warnings until contrast drops below the lower
// usable floor; only the latter blocks publication in this basic local pass.
const LONG_COPY_CHARACTER_LIMIT = 240;
const COMPACT_VIEWPORT_WIDTH_PX = 320;
const COMPACT_VIEWPORT_GUTTER_PX = 24;
const COMFORTABLE_COMPACT_VIEWPORT_LINE_LIMIT = 14;
const APPROXIMATE_GLYPH_WIDTH_EM = 0.55;
const STRUCTURED_COMPOSITION_BLOCK_TYPES = new Set<string>(
  STRUCTURED_COMPOSITION_BLOCK_TYPE_VALUES,
);

const TOUR_WIDTH_TOKEN_BY_APPEARANCE = {
  narrow: 'tourNarrowPx',
  standard: 'tourStandardPx',
  wide: 'tourWidePx',
} as const satisfies Readonly<
  Record<ExperienceAppearance['width'], 'tourNarrowPx' | 'tourStandardPx' | 'tourWidePx'>
>;

interface ActiveColorMode {
  colorMode: 'light' | 'dark';
  colors: ThemeColorTokens;
}

interface ContrastCheck {
  subject: BasicVisualPreflightContrastSubject;
  foreground: string;
  background: string;
  targetRatio: number;
  unusableRatio: number;
}

/**
 * Runs the deterministic, DOM-free portion of visual preflight.
 *
 * `checkedAt` is required rather than read from the clock, so the same inputs
 * produce the same report. Dynamic positioning, fonts, stacking contexts,
 * zoom, RTL, and actual clipping remain runtime/browser checks in later slices.
 */
export async function runBasicVisualPreflight(
  artifact: CompiledDocumentV4Type,
  checkedAt: string,
): Promise<BasicVisualPreflightReportType> {
  assertValidCheckedAt(checkedAt);
  const issues: BasicVisualPreflightIssue[] = [];

  if (!isValid(CompiledDocumentV4, artifact)) {
    issues.push({ code: 'artifact_schema_invalid', severity: 'blocker' });
    return createReport(checkedAt, issues);
  }

  const [artifactContentHash, themeContentHash] = await Promise.all([
    computeArtifactContentHash(artifact),
    computeThemeContentHash(artifact),
  ]);

  if (artifact.contentHash !== artifactContentHash) {
    issues.push({ code: 'artifact_identity_invalid', severity: 'blocker' });
  }
  if (artifact.theme.contentHash !== themeContentHash) {
    issues.push({ code: 'theme_identity_invalid', severity: 'blocker' });
  }
  if (artifact.type !== 'tour' || artifact.rendererContractVersion !== RENDERER_CONTRACT_VERSION) {
    issues.push({ code: 'renderer_contract_incompatible', severity: 'blocker' });
  }

  collectContrastIssues(artifact, issues);
  collectCopyAndViewportIssues(artifact, issues);
  collectCapabilityIssues(artifact, issues);
  issues.push(...validateCompiledTourFlow(artifact));
  return createReport(checkedAt, issues);
}

function collectCapabilityIssues(
  artifact: CompiledDocumentV4Type,
  issues: BasicVisualPreflightIssue[],
): void {
  const targetIds = new Set(artifact.targets.map((target) => target.id));
  const stepIds = new Set(artifact.steps.map((step) => step.id));
  for (const [stepIndex, step] of artifact.steps.entries()) {
    collectChoreographyIssues(
      step.entrySequence,
      step.targetId,
      stepIndex,
      undefined,
      targetIds,
      stepIds,
      issues,
    );
    for (const [nodeIndex, node] of step.body.entries()) {
      if (node.type === 'media' || STRUCTURED_COMPOSITION_BLOCK_TYPES.has(node.type)) {
        const accessibilityName =
          node.type === 'media'
            ? node.props.media?.accessibilityName
            : node.props.accessibilityName;
        if (!accessibilityName?.trim()) {
          issues.push({
            code: 'missing_accessible_name',
            severity: 'blocker',
            stepIndex,
            nodeIndex,
          });
        }
      }
      const action = node.props.action;
      if (action?.type === 'runSequence') {
        collectChoreographyIssues(
          action.sequence,
          step.targetId,
          stepIndex,
          nodeIndex,
          targetIds,
          stepIds,
          issues,
        );
      }
    }
  }
}

function collectChoreographyIssues(
  sequence: StepChoreography | undefined,
  stepTargetId: string | undefined,
  stepIndex: number,
  nodeIndex: number | undefined,
  targetIds: ReadonlySet<string>,
  stepIds: ReadonlySet<string>,
  issues: BasicVisualPreflightIssue[],
): void {
  if (!sequence) return;
  const referencedTargetIds = new Set<string>();
  if (sequence.trigger.type !== 'manual') {
    const targetId = sequence.trigger.targetId ?? stepTargetId;
    if (targetId) referencedTargetIds.add(targetId);
    else pushCapabilityIssue('choreography_target_missing', stepIndex, nodeIndex, issues);
  }
  for (const wait of sequence.waitFor) {
    if (wait.type === 'targetAvailable') referencedTargetIds.add(wait.targetId);
  }
  if ([...referencedTargetIds].some((targetId) => !targetIds.has(targetId))) {
    pushCapabilityIssue('choreography_target_missing', stepIndex, nodeIndex, issues);
  }
  const destinationIds = [
    ...(sequence.transition.type === 'step' ? [sequence.transition.stepId] : []),
    ...(sequence.onTimeout === 'goToStep' ? [sequence.timeoutStepId] : []),
  ];
  if (destinationIds.some((stepId) => !stepIds.has(stepId))) {
    pushCapabilityIssue('choreography_step_missing', stepIndex, nodeIndex, issues);
  }
}

function pushCapabilityIssue(
  code: 'choreography_target_missing' | 'choreography_step_missing',
  stepIndex: number,
  nodeIndex: number | undefined,
  issues: BasicVisualPreflightIssue[],
): void {
  issues.push({
    code,
    severity: 'blocker',
    stepIndex,
    ...(nodeIndex === undefined ? {} : { nodeIndex }),
  });
}

function assertValidCheckedAt(checkedAt: string): void {
  const emptyReport: BasicVisualPreflightReportType = {
    schemaVersion: BASIC_VISUAL_PREFLIGHT_REPORT_SCHEMA_VERSION,
    checkedAt,
    status: 'passed',
    issues: [],
  };
  if (!isValid(BasicVisualPreflightReport, emptyReport)) {
    throw new Error('Basic visual preflight requires a valid RFC 3339 checkedAt timestamp');
  }
}

function createReport(
  checkedAt: string,
  issues: BasicVisualPreflightIssue[],
): BasicVisualPreflightReportType {
  const boundedIssues = issues.slice(0, BASIC_VISUAL_PREFLIGHT_MAX_ISSUES);
  let status: BasicVisualPreflightStatus = 'passed';
  if (boundedIssues.length > 0) status = 'warnings';
  if (boundedIssues.some((issue) => issue.severity === 'blocker')) status = 'blocked';
  return {
    schemaVersion: BASIC_VISUAL_PREFLIGHT_REPORT_SCHEMA_VERSION,
    checkedAt,
    status,
    issues: boundedIssues,
  };
}

async function computeArtifactContentHash(artifact: CompiledDocumentV4Type): Promise<string> {
  const content = structuredClone(artifact) as Partial<CompiledDocumentV4Type>;
  delete content.contentHash;
  return `sha256-${await sha256Hex(canonicalJson(content))}`;
}

async function computeThemeContentHash(artifact: CompiledDocumentV4Type): Promise<string> {
  const content = structuredClone(artifact.theme) as Partial<CompiledDocumentV4Type['theme']>;
  delete content.contentHash;
  return `sha256-${await sha256Hex(canonicalJson(content))}`;
}

function collectContrastIssues(
  artifact: CompiledDocumentV4Type,
  issues: BasicVisualPreflightIssue[],
): void {
  const recipe = artifact.theme.definition.recipes.tour[artifact.appearance.preset];
  const hasDefaultPopupColors = artifact.steps.some(
    (step) => !step.tooltipStyle?.surfaceColor && !step.tooltipStyle?.textColor,
  );
  for (const mode of activeColorModes(artifact)) {
    const checks: ContrastCheck[] = [
      {
        subject: 'primary_control',
        foreground: mode.colors[recipe.primaryTextRole],
        background: mode.colors[recipe.primarySurfaceRole],
        targetRatio: CONTRAST_RATIO_TARGETS.text,
        unusableRatio: CONTRAST_RATIO_TARGETS.textUnusable,
      },
      {
        subject: 'secondary_control',
        foreground: mode.colors[recipe.secondaryTextRole],
        background: mode.colors[recipe.secondarySurfaceRole],
        targetRatio: CONTRAST_RATIO_TARGETS.text,
        unusableRatio: CONTRAST_RATIO_TARGETS.textUnusable,
      },
    ];

    if (hasDefaultPopupColors || artifact.steps.length === 0) {
      checks.unshift(
        textContrastCheck(
          'body_text',
          mode.colors[recipe.textRole],
          mode.colors[recipe.surfaceRole],
        ),
        textContrastCheck(
          'muted_text',
          mode.colors[recipe.mutedTextRole],
          mode.colors[recipe.surfaceRole],
        ),
      );
      checks.push(
        focusContrastCheck(mode.colors[recipe.focusRole], mode.colors[recipe.surfaceRole]),
      );
    }

    for (const check of checks) collectContrastIssue(mode.colorMode, check, issues);
    for (const [stepIndex, step] of artifact.steps.entries()) {
      const style = step.tooltipStyle;
      const background = style?.surfaceColor ?? mode.colors[recipe.surfaceRole];
      const foreground = style?.textColor ?? mode.colors[recipe.textRole];
      const mutedForeground = style?.textColor ?? mode.colors[recipe.mutedTextRole];
      if (style?.surfaceColor || style?.textColor) {
        collectContrastIssue(
          mode.colorMode,
          textContrastCheck('body_text', foreground, background),
          issues,
          stepIndex,
        );
        collectContrastIssue(
          mode.colorMode,
          textContrastCheck('muted_text', mutedForeground, background),
          issues,
          stepIndex,
        );
        collectContrastIssue(
          mode.colorMode,
          focusContrastCheck(mode.colors[recipe.focusRole], background),
          issues,
          stepIndex,
        );
      }
      if (style?.borderColor) {
        collectContrastIssue(
          mode.colorMode,
          focusContrastCheck(style.borderColor, background, 'control_border'),
          issues,
          stepIndex,
        );
      }
      for (const [nodeIndex, node] of step.body.entries()) {
        collectNodeContrastIssues({
          background,
          colorMode: mode.colorMode,
          colors: mode.colors,
          issues,
          node,
          nodeIndex,
          recipe,
          stepIndex,
        });
      }
    }
  }
}

function textContrastCheck(
  subject: Extract<
    BasicVisualPreflightContrastSubject,
    'body_text' | 'muted_text' | 'highlight_text'
  >,
  foreground: string,
  background: string,
): ContrastCheck {
  return {
    subject,
    foreground,
    background,
    targetRatio: CONTRAST_RATIO_TARGETS.text,
    unusableRatio: CONTRAST_RATIO_TARGETS.textUnusable,
  };
}

function focusContrastCheck(
  foreground: string,
  background: string,
  subject: Extract<
    BasicVisualPreflightContrastSubject,
    'focus_indicator' | 'control_border'
  > = 'focus_indicator',
): ContrastCheck {
  return {
    subject,
    foreground,
    background,
    targetRatio: CONTRAST_RATIO_TARGETS.focus,
    unusableRatio: CONTRAST_RATIO_TARGETS.focusUnusable,
  };
}

function activeColorModes(artifact: CompiledDocumentV4Type): ActiveColorMode[] {
  const modes = artifact.theme.definition.tokens.modes;
  if (artifact.appearance.colorMode === 'light') {
    return [{ colorMode: 'light', colors: modes.light.colors }];
  }
  if (artifact.appearance.colorMode === 'dark' && modes.dark) {
    return [{ colorMode: 'dark', colors: modes.dark.colors }];
  }
  if (artifact.appearance.colorMode === 'dark') {
    return [{ colorMode: 'light', colors: modes.light.colors }];
  }

  const active: ActiveColorMode[] = [{ colorMode: 'light', colors: modes.light.colors }];
  if (modes.dark) active.push({ colorMode: 'dark', colors: modes.dark.colors });
  return active;
}

function collectContrastIssue(
  colorMode: ActiveColorMode['colorMode'],
  check: ContrastCheck,
  issues: BasicVisualPreflightIssue[],
  stepIndex?: number,
  nodeIndex?: number,
): void {
  const evaluation = evaluateContrast(
    check.foreground,
    check.background,
    check.targetRatio,
    check.unusableRatio,
  );
  if (evaluation.state === 'blocker') {
    issues.push({
      code: 'contrast_unusable',
      severity: 'blocker',
      subject: check.subject,
      colorMode,
      ...(stepIndex !== undefined ? { stepIndex } : {}),
      ...(nodeIndex !== undefined ? { nodeIndex } : {}),
      measuredRatio: evaluation.ratio,
      requiredRatio: evaluation.requiredRatio,
    });
    return;
  }
  if (evaluation.state === 'warning') {
    issues.push({
      code: 'contrast_below_target',
      severity: 'warning',
      subject: check.subject,
      colorMode,
      ...(stepIndex !== undefined ? { stepIndex } : {}),
      ...(nodeIndex !== undefined ? { nodeIndex } : {}),
      measuredRatio: evaluation.ratio,
      requiredRatio: evaluation.requiredRatio,
    });
  }
}

function collectNodeContrastIssues({
  background,
  colorMode,
  colors,
  issues,
  node,
  nodeIndex,
  recipe,
  stepIndex,
}: {
  background: string;
  colorMode: ActiveColorMode['colorMode'];
  colors: ThemeColorTokens;
  issues: BasicVisualPreflightIssue[];
  node: CompiledDocumentV4Type['steps'][number]['body'][number];
  nodeIndex: number;
  recipe: TourRendererRecipe;
  stepIndex: number;
}): void {
  const textColor = node.props.textStyle?.color;
  if (textColor) {
    collectContrastIssue(
      colorMode,
      textContrastCheck('body_text', textColor, background),
      issues,
      stepIndex,
      nodeIndex,
    );
  }
  for (const run of node.contentRuns ?? []) {
    const runForeground = run.color ?? textColor;
    if (runForeground) {
      collectContrastIssue(
        colorMode,
        textContrastCheck(
          run.highlightColor ? 'highlight_text' : 'body_text',
          runForeground,
          run.highlightColor ?? background,
        ),
        issues,
        stepIndex,
        nodeIndex,
      );
    }
  }
  if (node.type !== 'button' && node.type !== 'link') return;
  const primary = (node.props.variant ?? 'primary') === 'primary';
  const fallbackFill = primary
    ? colors[recipe.primarySurfaceRole]
    : colors[recipe.secondarySurfaceRole];
  const fallbackText = primary ? colors[recipe.primaryTextRole] : colors[recipe.secondaryTextRole];
  const fill = node.props.buttonStyle?.fillColor ?? fallbackFill;
  const label = node.props.buttonStyle?.textColor ?? fallbackText;
  if (node.props.buttonStyle?.fillColor || node.props.buttonStyle?.textColor) {
    collectContrastIssue(
      colorMode,
      {
        subject: primary ? 'primary_control' : 'secondary_control',
        foreground: label,
        background: fill,
        targetRatio: CONTRAST_RATIO_TARGETS.text,
        unusableRatio: CONTRAST_RATIO_TARGETS.textUnusable,
      },
      issues,
      stepIndex,
      nodeIndex,
    );
  }
  if (node.props.buttonStyle?.borderColor) {
    collectContrastIssue(
      colorMode,
      focusContrastCheck(node.props.buttonStyle.borderColor, fill, 'control_border'),
      issues,
      stepIndex,
      nodeIndex,
    );
  }
}

function collectCopyAndViewportIssues(
  artifact: CompiledDocumentV4Type,
  issues: BasicVisualPreflightIssue[],
): void {
  const charactersPerLine = compactViewportCharactersPerLine(artifact);
  for (const [stepIndex, step] of artifact.steps.entries()) {
    if (issues.length >= BASIC_VISUAL_PREFLIGHT_MAX_ISSUES) return;
    let estimatedLines = 0;
    for (const [nodeIndex, node] of step.body.entries()) {
      const characterCount = normalizedCharacterCount(node.text);
      if (characterCount > LONG_COPY_CHARACTER_LIMIT) {
        issues.push({
          code: 'long_copy_risk',
          severity: 'warning',
          stepIndex,
          nodeIndex,
          characterCount,
          recommendedMaximum: LONG_COPY_CHARACTER_LIMIT,
        });
      }
      if (issues.length >= BASIC_VISUAL_PREFLIGHT_MAX_ISSUES) return;
      estimatedLines += estimatedNodeLines(node.type, characterCount, charactersPerLine);
    }
    if (estimatedLines > COMFORTABLE_COMPACT_VIEWPORT_LINE_LIMIT) {
      issues.push({
        code: 'compact_viewport_risk',
        severity: 'warning',
        stepIndex,
        estimatedLines,
        comfortableLineLimit: COMFORTABLE_COMPACT_VIEWPORT_LINE_LIMIT,
        viewportWidthPx: COMPACT_VIEWPORT_WIDTH_PX,
      });
    }
  }
}

function compactViewportCharactersPerLine(artifact: CompiledDocumentV4Type): number {
  const tokens = artifact.theme.definition.tokens;
  const recipe = artifact.theme.definition.recipes.tour[artifact.appearance.preset];
  const configuredWidth = tokens.sizing[TOUR_WIDTH_TOKEN_BY_APPEARANCE[artifact.appearance.width]];
  const viewportContentWidth = Math.min(
    configuredWidth,
    COMPACT_VIEWPORT_WIDTH_PX - COMPACT_VIEWPORT_GUTTER_PX,
  );
  const horizontalPadding = tokens.spacing[recipe.spacingRole] * 2;
  const readableWidth = Math.max(
    tokens.typography.smallSizePx * 8,
    viewportContentWidth - horizontalPadding,
  );
  return Math.max(
    8,
    Math.floor(readableWidth / (tokens.typography.smallSizePx * APPROXIMATE_GLYPH_WIDTH_EM)),
  );
}

function estimatedNodeLines(
  nodeType: string,
  characterCount: number,
  charactersPerLine: number,
): number {
  if (nodeType === 'divider') return 1;
  if (characterCount === 0) return 0;
  const copyLines = Math.ceil(characterCount / charactersPerLine);
  if (nodeType === 'button' || nodeType === 'link') return Math.max(2, copyLines + 1);
  return copyLines + 1;
}

function normalizedCharacterCount(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return Array.from(normalized).length;
}
