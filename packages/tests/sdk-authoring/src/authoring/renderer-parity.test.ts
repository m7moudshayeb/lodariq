import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BrandThemeSnapshot } from '@lodariq/schema';
import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  resolveExperienceAppearance,
} from '@lodariq/schema/brand-runtime';
import {
  resolveCompiledTourTheme,
  resolveTourThemeStyle,
} from '@lodariq/sdk-runtime/renderers/tour';

/**
 * §8.3 renderer parity, guarded rather than asserted.
 *
 * `rich-content-authoring.md` names three surfaces that must agree: the rich
 * editor, the authored canvas popup, and the framework-free runtime popup. Three
 * implementations of one visual is a permanent drift generator, and it is the
 * mechanism behind the audit's chrome-collision findings.
 *
 * The container is already single-sourced: the authoring canvas resolves its
 * composition, style recipe and theme variables from the **runtime's** resolvers, so
 * geometry and appearance have one authority. These tests stop that quietly
 * regressing into a second implementation — the thing no behavioural test catches,
 * because a copied renderer looks right on the day it is copied.
 */
const AUTHORING = '../../packages/sdk-authoring/src/authoring';

const CANVAS_FILES = [
  `${AUTHORING}/local-frame-ui/components/overlay-step-editor.tsx`,
  `${AUTHORING}/local-frame-ui/components/rich-step-content-editor.tsx`,
];

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('the authored canvas is not a third renderer (§8.3)', () => {
  it('resolves the container from the runtime, not from its own recipe', () => {
    for (const file of CANVAS_FILES) {
      const source = read(file);
      expect(source).toContain("from '@lodariq/sdk-runtime/renderers/tour'");
      for (const resolver of [
        'resolveTourCompositionRecipe',
        'resolveTourPopupStyleRecipe',
        'resolveTourThemeStyle',
        'tourPopupStyleVariables',
      ]) {
        expect(source).toContain(resolver);
      }
    }
  });

  it('declares no competing composition or style recipe of its own', () => {
    for (const file of CANVAS_FILES) {
      const source = read(file);
      // A local recipe function is how a third renderer starts.
      expect(source).not.toMatch(/function\s+resolve(Tour)?(Composition|PopupStyle|ThemeStyle)/u);
      expect(source).not.toMatch(/const\s+(COMPOSITION|POPUP_STYLE)_RECIPES\b/u);
    }
  });

  it('paints the card from the runtime’s theme variables rather than fixed values', () => {
    const shell = read(`${AUTHORING}/local-frame-ui/styles/overlay-shell.ts`);
    const cardBlock = shell.slice(shell.indexOf('.overlay-step-card.rich-step-content'));
    // One variable used to be enough to pass this, and one variable is what the
    // card used: surface and text colour came from the theme while the border,
    // radius, shadow and font came from the editor's own tokens or from nothing
    // at all. Measured against the runtime, seven properties disagreed.
    for (const variable of [
      '--lq-tour-surface',
      '--lq-tour-text-color',
      '--lq-tour-border-width',
      '--lq-tour-border-color',
      '--lq-tour-radius',
      '--lq-tour-elevation',
      '--lq-tour-font-family',
    ]) {
      expect(cardBlock).toContain(variable);
    }
  });

  it('resolves the same theme values as the runtime for a non-default brand theme', () => {
    // The Brand Theme is the setting a creator notices being ignored, so the
    // check uses one that shares no value with the fallback.
    const theme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1) as BrandThemeSnapshot;
    // surfaceRaised and text are the roles the default Tour recipe reads.
    theme.definition.tokens.modes.light.colors.surfaceRaised = '#101820';
    theme.definition.tokens.modes.light.colors.text = '#f7f4ec';
    theme.definition.tokens.radii.md = 21;
    theme.definition.tokens.typography.baseSizePx = 19;
    theme.definition.tokens.typography.fontFamilies = ['Recoleta', 'Georgia', 'serif'];
    const appearance = resolveExperienceAppearance(DEFAULT_EXPERIENCE_APPEARANCE);

    // The runtime resolves from a CompiledDocument; the editor resolves from the
    // draft's theme and appearance. Same function, two callers, one answer.
    const compiled = {
      documentId: 'doc_theme_parity',
      type: 'tour',
      contentHash: 'sha256-theme-parity',
      schemaVersion: '1.0.0',
      compilerVersion: '0.1.0',
      targets: [],
      steps: [],
      theme,
      appearance,
    } as unknown as Parameters<typeof resolveCompiledTourTheme>[0];

    const fromRuntime = resolveCompiledTourTheme(compiled);
    const fromEditor = resolveTourThemeStyle({ theme, appearance });

    expect(fromEditor.variables).toEqual(fromRuntime.variables);
    expect(fromEditor.colorMode).toBe(fromRuntime.colorMode);
    // And the theme actually reached the answer, rather than both falling back
    // to the same defaults and agreeing about nothing.
    expect(fromRuntime.variables['--lq-tour-surface']).toBe('#101820');
    expect(fromRuntime.variables['--lq-tour-font-family']).toBe('Recoleta, Georgia, serif');
    expect(fromRuntime.variables['--lq-tour-base-font-size']).toBe('19px');
    expect(fromRuntime.variables['--lq-tour-radius']).not.toBe(
      resolveTourThemeStyle({ appearance }).variables['--lq-tour-radius'],
    );
  });

  it('keeps predictive QA meaningful by simulating the shipped geometry (§7.3)', () => {
    // The simulation reads the authored card and the runtime's placement rules; if
    // the canvas had its own geometry, the thing simulated would not be the thing
    // that ships.
    const qa = read(`${AUTHORING}/predictive-qa.ts`);
    expect(qa).toMatch(/placement/u);
    expect(qa).not.toContain('@lodariq/sdk-authoring');
  });
});
