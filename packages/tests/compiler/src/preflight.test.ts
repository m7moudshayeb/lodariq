import { describe, expect, it } from 'vitest';
import {
  BasicVisualPreflightReport,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  validate,
  type BrandThemeSnapshot,
  type NewCompiledDocument,
  type LodariqDocument,
} from '@lodariq/schema';
import {
  compileDocument,
  computeBrandThemeContentHash,
  runBasicVisualPreflight,
  validateCompiledTourFlow,
  validateTourDocumentFlow,
  type CompileInput,
} from '@lodariq/compiler';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const CHECKED_AT = '2026-08-07T12:00:00.000Z';
const document = tourFixture as LodariqDocument;

describe('runBasicVisualPreflight', () => {
  it('returns the same passing report for the same accessible artifact and checkedAt', async () => {
    const artifact = await compileDocument(themedInput(document));

    const first = await runBasicVisualPreflight(artifact, CHECKED_AT);
    const second = await runBasicVisualPreflight(artifact, CHECKED_AT);

    expect(first).toEqual({
      schemaVersion: '1',
      checkedAt: CHECKED_AT,
      status: 'passed',
      issues: [],
    });
    expect(second).toEqual(first);
    expect(validate(BasicVisualPreflightReport, first).valid).toBe(true);
  });

  it('blocks stale artifact and theme identities without emitting their source values', async () => {
    const artifact = await compileDocument(themedInput(document));
    artifact.theme.definition.tokens.modes.light.colors.accent = '#335fff';

    const report = await runBasicVisualPreflight(artifact, CHECKED_AT);

    expect(report.status).toBe('blocked');
    expect(report.issues.map((issue) => issue.code)).toEqual([
      'artifact_identity_invalid',
      'theme_identity_invalid',
    ]);
    expect(JSON.stringify(report)).not.toContain('#335fff');
  });

  it('blocks renderer versions that the current runtime does not implement', async () => {
    const artifact = await compileDocument({
      ...themedInput(document),
      rendererContractVersion: '2',
    });

    const report = await runBasicVisualPreflight(artifact, CHECKED_AT);

    expect(report.status).toBe('blocked');
    expect(report.issues).toContainEqual({
      code: 'renderer_contract_incompatible',
      severity: 'blocker',
    });
  });

  it('checks the selected recipe in every rendered system color mode', async () => {
    const theme = cloneFallbackTheme();
    const darkColors = theme.definition.tokens.modes.dark?.colors;
    if (!darkColors) throw new Error('fallback theme dark mode missing');
    darkColors.onAccent = darkColors.accent;
    theme.contentHash = await computeBrandThemeContentHash(theme);
    const artifact = await compileDocument(themedInput(document, theme));

    const report = await runBasicVisualPreflight(artifact, CHECKED_AT);

    expect(report.status).toBe('blocked');
    expect(report.issues).toContainEqual({
      code: 'contrast_unusable',
      severity: 'blocker',
      subject: 'primary_control',
      colorMode: 'dark',
      measuredRatio: 1,
      requiredRatio: 3,
    });
    expect(
      report.issues.some(
        (issue) =>
          issue.code === 'contrast_unusable' &&
          issue.subject === 'primary_control' &&
          issue.colorMode === 'light',
      ),
    ).toBe(false);
  });

  it('keeps noncritical text contrast deficits as warnings', async () => {
    const theme = cloneFallbackTheme();
    theme.definition.tokens.modes.light.colors.text = '#777777';
    theme.contentHash = await computeBrandThemeContentHash(theme);
    const lightDocument = structuredClone(document);
    lightDocument.appearance = {
      preset: 'default',
      density: 'comfortable',
      width: 'standard',
      colorMode: 'light',
    };
    const artifact = await compileDocument(themedInput(lightDocument, theme));

    const report = await runBasicVisualPreflight(artifact, CHECKED_AT);

    expect(report.status).toBe('warnings');
    expect(report.issues).toContainEqual({
      code: 'contrast_below_target',
      severity: 'warning',
      subject: 'body_text',
      colorMode: 'light',
      measuredRatio: 4.48,
      requiredRatio: 4.5,
    });
    expect(report.issues.every((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('checks per-popup color overrides against their authored background', async () => {
    const styledDocument = structuredClone(document);
    styledDocument.appearance = {
      preset: 'default',
      density: 'comfortable',
      width: 'standard',
      colorMode: 'light',
    };
    const tooltip = styledDocument.blocks[0]?.children.find((block) => block.type === 'tooltip');
    if (!tooltip) throw new Error('fixture tooltip missing');
    tooltip.props.tooltipStyle = { surfaceColor: '#000000', textColor: '#000000' };
    const artifact = await compileDocument(themedInput(styledDocument));

    const report = await runBasicVisualPreflight(artifact, CHECKED_AT);

    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        {
          code: 'contrast_unusable',
          severity: 'blocker',
          subject: 'body_text',
          colorMode: 'light',
          stepIndex: 0,
          measuredRatio: 1,
          requiredRatio: 3,
        },
        {
          code: 'contrast_unusable',
          severity: 'blocker',
          subject: 'muted_text',
          colorMode: 'light',
          stepIndex: 0,
          measuredRatio: 1,
          requiredRatio: 3,
        },
      ]),
    );
  });

  it('warns about long copy and compact-viewport density without retaining the copy', async () => {
    const longDocument = structuredClone(document);
    const paragraph = longDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.type === 'paragraph',
    );
    if (!paragraph) throw new Error('fixture paragraph missing');
    paragraph.content = 'Private localized sentence. '.repeat(50);
    const artifact = await compileDocument(themedInput(longDocument));

    const report = await runBasicVisualPreflight(artifact, CHECKED_AT);

    expect(report.status).toBe('warnings');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'long_copy_risk',
          severity: 'warning',
          stepIndex: 0,
          nodeIndex: 1,
          recommendedMaximum: 240,
        }),
        expect.objectContaining({
          code: 'compact_viewport_risk',
          severity: 'warning',
          stepIndex: 0,
          comfortableLineLimit: 14,
          viewportWidthPx: 320,
        }),
      ]),
    );
    expect(JSON.stringify(report)).not.toContain('Private localized sentence');
  });

  it('fails closed on undeclared compiled fields without echoing them', async () => {
    const artifact = await compileDocument(themedInput(document));
    Object.assign(artifact, {
      rawCss: 'position: fixed',
      screenshot: 'data:image/png;base64,private',
      url: 'https://customer.example/private',
    });

    const report = await runBasicVisualPreflight(artifact as NewCompiledDocument, CHECKED_AT);

    expect(report).toEqual({
      schemaVersion: '1',
      checkedAt: CHECKED_AT,
      status: 'blocked',
      issues: [{ code: 'artifact_schema_invalid', severity: 'blocker' }],
    });
    expect(JSON.stringify(report)).not.toContain('customer.example');
  });

  it('requires the caller to supply a deterministic RFC 3339 checkedAt', async () => {
    const artifact = await compileDocument(themedInput(document));

    await expect(runBasicVisualPreflight(artifact, 'now')).rejects.toThrow(/checkedAt/);
  });

  it('reports the same non-terminating topology from canonical and compiled tour data', async () => {
    const loopingDocument = structuredClone(document);
    const button = loopingDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.type === 'button',
    );
    if (!button) throw new Error('fixture button missing');
    button.props.action = {
      type: 'next',
      transition: {
        rules: [],
        fallback: { type: 'step', stepId: loopingDocument.blocks[0]!.id },
      },
    };

    const artifact = await compileDocument(themedInput(loopingDocument));
    const canonicalIssues = validateTourDocumentFlow(loopingDocument);
    const compiledIssues = validateCompiledTourFlow(artifact);

    expect(canonicalIssues.map((issue) => issue.code)).toEqual(
      compiledIssues.map((issue) => issue.code),
    );
    expect(canonicalIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'non_terminating_flow',
          severity: 'blocker',
          stepId: loopingDocument.blocks[0]!.id,
        }),
        expect.objectContaining({
          code: 'missing_terminal_completion',
          severity: 'blocker',
          stepId: loopingDocument.blocks[0]!.id,
        }),
      ]),
    );
  });
});

function themedInput(
  inputDocument: LodariqDocument,
  theme: BrandThemeSnapshot = LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
): CompileInput {
  return {
    document: inputDocument,
    theme,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  };
}

function cloneFallbackTheme(): BrandThemeSnapshot {
  return structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
}
