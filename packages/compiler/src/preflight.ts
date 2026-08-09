import {
  BASIC_VISUAL_PREFLIGHT_MAX_ISSUES,
  BASIC_VISUAL_PREFLIGHT_REPORT_SCHEMA_VERSION,
  BasicVisualPreflightReport,
  CompiledDocumentV2,
  RENDERER_CONTRACT_VERSION,
  isValid,
  type BasicVisualPreflightContrastSubject,
  type BasicVisualPreflightIssue,
  type BasicVisualPreflightReport as BasicVisualPreflightReportType,
  type BasicVisualPreflightStatus,
  type CompiledDocumentV2 as CompiledDocumentV2Type,
  type ExperienceAppearance,
  type ThemeColorTokens,
} from '@lodariq/schema';
import { canonicalJson, sha256Hex } from './hash';

// WCAG-aligned targets remain warnings until contrast drops below the lower
// usable floor; only the latter blocks publication in this basic local pass.
const TEXT_TARGET_CONTRAST_RATIO = 4.5;
const TEXT_UNUSABLE_CONTRAST_RATIO = 3;
const FOCUS_TARGET_CONTRAST_RATIO = 3;
const FOCUS_UNUSABLE_CONTRAST_RATIO = 2;
const LONG_COPY_CHARACTER_LIMIT = 240;
const COMPACT_VIEWPORT_WIDTH_PX = 320;
const COMPACT_VIEWPORT_GUTTER_PX = 24;
const COMFORTABLE_COMPACT_VIEWPORT_LINE_LIMIT = 14;
const APPROXIMATE_GLYPH_WIDTH_EM = 0.55;

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
  artifact: CompiledDocumentV2Type,
  checkedAt: string,
): Promise<BasicVisualPreflightReportType> {
  assertValidCheckedAt(checkedAt);
  const issues: BasicVisualPreflightIssue[] = [];

  if (!isValid(CompiledDocumentV2, artifact)) {
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
  return createReport(checkedAt, issues);
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

async function computeArtifactContentHash(artifact: CompiledDocumentV2Type): Promise<string> {
  const content = structuredClone(artifact) as Partial<CompiledDocumentV2Type>;
  delete content.contentHash;
  return `sha256-${await sha256Hex(canonicalJson(content))}`;
}

async function computeThemeContentHash(artifact: CompiledDocumentV2Type): Promise<string> {
  const content = structuredClone(artifact.theme) as Partial<CompiledDocumentV2Type['theme']>;
  delete content.contentHash;
  return `sha256-${await sha256Hex(canonicalJson(content))}`;
}

function collectContrastIssues(
  artifact: CompiledDocumentV2Type,
  issues: BasicVisualPreflightIssue[],
): void {
  const recipe = artifact.theme.definition.recipes.tour[artifact.appearance.preset];
  for (const mode of activeColorModes(artifact)) {
    const checks: ContrastCheck[] = [
      {
        subject: 'body_text',
        foreground: mode.colors[recipe.textRole],
        background: mode.colors[recipe.surfaceRole],
        targetRatio: TEXT_TARGET_CONTRAST_RATIO,
        unusableRatio: TEXT_UNUSABLE_CONTRAST_RATIO,
      },
      {
        subject: 'muted_text',
        foreground: mode.colors[recipe.mutedTextRole],
        background: mode.colors[recipe.surfaceRole],
        targetRatio: TEXT_TARGET_CONTRAST_RATIO,
        unusableRatio: TEXT_UNUSABLE_CONTRAST_RATIO,
      },
      {
        subject: 'primary_control',
        foreground: mode.colors[recipe.primaryTextRole],
        background: mode.colors[recipe.primarySurfaceRole],
        targetRatio: TEXT_TARGET_CONTRAST_RATIO,
        unusableRatio: TEXT_UNUSABLE_CONTRAST_RATIO,
      },
      {
        subject: 'secondary_control',
        foreground: mode.colors[recipe.secondaryTextRole],
        background: mode.colors[recipe.secondarySurfaceRole],
        targetRatio: TEXT_TARGET_CONTRAST_RATIO,
        unusableRatio: TEXT_UNUSABLE_CONTRAST_RATIO,
      },
      {
        subject: 'focus_indicator',
        foreground: mode.colors[recipe.focusRole],
        background: mode.colors[recipe.surfaceRole],
        targetRatio: FOCUS_TARGET_CONTRAST_RATIO,
        unusableRatio: FOCUS_UNUSABLE_CONTRAST_RATIO,
      },
    ];

    for (const check of checks) collectContrastIssue(mode.colorMode, check, issues);
  }
}

function activeColorModes(artifact: CompiledDocumentV2Type): ActiveColorMode[] {
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
): void {
  const measuredRatio = contrastRatio(check.foreground, check.background);
  if (measuredRatio < check.unusableRatio) {
    issues.push({
      code: 'contrast_unusable',
      severity: 'blocker',
      subject: check.subject,
      colorMode,
      measuredRatio: roundRatio(measuredRatio),
      requiredRatio: check.unusableRatio,
    });
    return;
  }
  if (measuredRatio < check.targetRatio) {
    issues.push({
      code: 'contrast_below_target',
      severity: 'warning',
      subject: check.subject,
      colorMode,
      measuredRatio: roundRatio(measuredRatio),
      requiredRatio: check.targetRatio,
    });
  }
}

function collectCopyAndViewportIssues(
  artifact: CompiledDocumentV2Type,
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

function compactViewportCharactersPerLine(artifact: CompiledDocumentV2Type): number {
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

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const red = linearSrgbChannel(Number.parseInt(color.slice(1, 3), 16) / 255);
  const green = linearSrgbChannel(Number.parseInt(color.slice(3, 5), 16) / 255);
  const blue = linearSrgbChannel(Number.parseInt(color.slice(5, 7), 16) / 255);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function linearSrgbChannel(channel: number): number {
  if (channel <= 0.04045) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}
