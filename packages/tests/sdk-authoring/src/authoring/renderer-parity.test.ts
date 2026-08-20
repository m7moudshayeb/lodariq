import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
    const cardBlock = shell.slice(shell.indexOf('.overlay-step-card'));
    expect(cardBlock).toContain('--lq-tour-surface');
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
