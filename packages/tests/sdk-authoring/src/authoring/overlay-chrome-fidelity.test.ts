import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AUTHORING_CONTEXT_SURFACE_TOKENS,
  CREATOR_CHROME_CONTROL_TOKENS,
  CREATOR_CHROME_GLASS,
  CREATOR_CHROME_TOKENS,
  OVERLAY_CHROME_GEOMETRY,
} from '../../../../../packages/sdk-authoring/src/creator-chrome-tokens';
import { AUTHORING_OVERLAY_SHELL_CSS } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/styles/overlay-shell';
import {
  TOOLBAR_CONTEXT_KINDS,
  toolbarContextForBlockType,
  toolbarContextLabel,
} from '../../../../../packages/sdk-authoring/src/authoring/overlay/toolbar-context';

/**
 * The prototype is the design source of truth, and it is a file in this repo — so
 * "does the shipped chrome match it" is checkable rather than a matter of taste.
 *
 * These read the prototype's own declarations and compare. The drift they exist to
 * catch is the one that already happened once: the token layer was adopted
 * faithfully while the module that paints the toolbar consumed a different palette
 * entirely, so the values were right everywhere except on screen.
 */
const PROTOTYPE = readFileSync('../../docs/product-design/prototypes/authoring-spec.html', 'utf8');

/** Reads a `--name:value;` declaration out of the prototype's `:root`. */
function prototypeToken(name: string): string {
  const match = new RegExp(`--${name}\\s*:\\s*([^;]+);`, 'u').exec(PROTOTYPE);
  if (!match?.[1]) throw new Error(`Prototype declares no --${name}`);
  return match[1].trim();
}

/** Reads one geometry measurement out of the prototype's `const G = { … }`. */
function prototypeMeasure(name: string): number {
  const match = new RegExp(`\\b${name}\\s*:\\s*(\\d+)`, 'u').exec(PROTOTYPE);
  if (!match?.[1]) throw new Error(`Prototype declares no ${name}`);
  return Number(match[1]);
}

/**
 * Every declaration block whose selector list contains `selector` exactly. Naive
 * `indexOf` matches a descendant rule that merely mentions the same class, which
 * is how a guard ends up asserting against the wrong rule.
 */
function declarationBlocksFor(selector: string): readonly string[] {
  // Comments sit between `}` and the next selector, so they land in the capture.
  const css = AUTHORING_OVERLAY_SHELL_CSS.replace(/\/\*[\s\S]*?\*\//gu, '');
  const blocks: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/gu;
  let match = pattern.exec(css);
  while (match) {
    const selectors = (match[1] ?? '').split(',').map((part) => part.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
    match = pattern.exec(css);
  }
  return blocks;
}

describe('creator chrome matches the prototype it was adopted from', () => {
  it('uses the prototype’s restrained-glass palette, not a look-alike', () => {
    expect(CREATOR_CHROME_TOKENS.action).toBe(prototypeToken('c-action'));
    expect(CREATOR_CHROME_TOKENS.ink).toBe(prototypeToken('c-ink'));
    expect(CREATOR_CHROME_TOKENS.muted).toBe(prototypeToken('c-mut'));
    expect(CREATOR_CHROME_TOKENS.surface).toBe(prototypeToken('c-surface'));
    expect(CREATOR_CHROME_TOKENS.border).toBe(prototypeToken('c-border'));
    // Spacing and the leading zero on `.94` are notation; the colour is not.
    const normalize = (value: string): string =>
      value.replace(/\s+/gu, '').replace(/(^|[(,])\./gu, '$10.');
    expect(normalize(CREATOR_CHROME_GLASS.background)).toBe(normalize(prototypeToken('c-glass')));
  });

  it('uses the prototype’s measurements', () => {
    expect(OVERLAY_CHROME_GEOMETRY.toolbarHeight).toBe(prototypeMeasure('toolbarHeight'));
    expect(OVERLAY_CHROME_GEOMETRY.toolbarGap).toBe(prototypeMeasure('toolbarGap'));
    expect(OVERLAY_CHROME_GEOMETRY.toolbarMinWidth).toBe(prototypeMeasure('toolbarMinWidth'));
    expect(OVERLAY_CHROME_GEOMETRY.inspectorWidth).toBe(prototypeMeasure('inspectorWidth'));
    expect(OVERLAY_CHROME_GEOMETRY.inspectorGap).toBe(prototypeMeasure('inspectorGap'));
    expect(OVERLAY_CHROME_GEOMETRY.stagePadding).toBe(prototypeMeasure('stagePadding'));
    expect(OVERLAY_CHROME_GEOMETRY.pillHeight).toBe(prototypeMeasure('pillHeight'));
    expect(OVERLAY_CHROME_GEOMETRY.resolveHysteresis).toBe(prototypeMeasure('resolveHysteresis'));
  });

  it('paints on-glass controls with the prototype’s control palette', () => {
    // The prototype states these once, as tokens, and every control reads them.
    expect(prototypeToken('c-ctl')).toBe(CREATOR_CHROME_CONTROL_TOKENS.surface);
    expect(prototypeToken('c-ctl-h')).toBe(CREATOR_CHROME_CONTROL_TOKENS.hover);
    expect(prototypeToken('c-ctl-b')).toBe(CREATOR_CHROME_CONTROL_TOKENS.border);
    expect(prototypeToken('c-menu')).toBe(CREATOR_CHROME_CONTROL_TOKENS.menu);
    // A toolbar button must consume the token, not restate the value.
    expect(PROTOTYPE).toContain('.tb:hover{background:var(--c-ctl-h)}');
  });
});

describe('the overlay frame is glass, not a white bar', () => {
  it('gives the floating toolbar and inspector the glass surface', () => {
    for (const surface of ['.overlay-step-toolbar', ".overlay-step-inspector[data-present='true']"]) {
      const glassRules = declarationBlocksFor(surface).filter((block) =>
        block.includes('--lq-glass-bg'),
      );
      expect(glassRules, surface).toHaveLength(1);
      expect(glassRules[0]).toContain('--lq-glass-blur');
    }
  });

  /**
   * The regression this file exists for: `html:has(.shell-overlay)` used to
   * override every `--lq-color-*` with the light workspace palette, so the frame
   * rendered white beside a dark pill on the same page.
   *
   * The check is on the *values*, not on the property names — the overlay does
   * legitimately re-declare tokens for menus, which re-light themselves light and
   * have to be brought back to the chrome palette.
   */
  it('never re-declares the overlay tokens as a light palette', () => {
    const blocks = [
      ...AUTHORING_OVERLAY_SHELL_CSS.matchAll(/html:has\(\.shell-overlay\)[^{]*\{([^}]*)\}/gu),
    ];
    expect(blocks.length).toBeGreaterThan(0);
    for (const [, body] of blocks) {
      expect(body).not.toContain(AUTHORING_CONTEXT_SURFACE_TOKENS.surface);
      expect(body).not.toContain(AUTHORING_CONTEXT_SURFACE_TOKENS.ink);
      expect(body).not.toContain('color-scheme: light');
    }
  });

  it('gives menus opened over the page the chrome palette, not the workspace one', () => {
    expect(AUTHORING_OVERLAY_SHELL_CSS).toContain('html:has(.shell-overlay) .ui-select-content');
    expect(AUTHORING_OVERLAY_SHELL_CSS).toContain(
      `--lq-color-page: ${CREATOR_CHROME_CONTROL_TOKENS.menu}`,
    );
  });

  it('sizes the toolbar from the token rather than a literal', () => {
    expect(AUTHORING_OVERLAY_SHELL_CSS).toContain(
      `height: ${OVERLAY_CHROME_GEOMETRY.toolbarHeight}px`,
    );
    expect(AUTHORING_OVERLAY_SHELL_CSS).not.toContain('height: 44px');
  });

  it('carries the docked anchor the third placement needs', () => {
    expect(AUTHORING_OVERLAY_SHELL_CSS).toContain(".overlay-step-toolbar[data-anchor='docked']");
  });
});

describe('the toolbar is a persistent frame with a contextual middle (§4.2a)', () => {
  it('names every context it can swap to', () => {
    for (const kind of TOOLBAR_CONTEXT_KINDS) {
      expect(toolbarContextLabel(kind).length).toBeGreaterThan(0);
    }
  });

  it('maps a selection to the context whose controls a creator wants', () => {
    expect(toolbarContextForBlockType(null)).toBe('step');
    expect(toolbarContextForBlockType('button')).toBe('button');
    expect(toolbarContextForBlockType('link')).toBe('button');
    expect(toolbarContextForBlockType('media')).toBe('media');
    expect(toolbarContextForBlockType('formField')).toBe('field');
    // Heading and paragraph want the same controls, so they share one context.
    expect(toolbarContextForBlockType('heading')).toBe('text');
    expect(toolbarContextForBlockType('paragraph')).toBe('text');
  });

  it('keeps Insert and the inspector affordance out of the swapping middle', () => {
    const editor = readFileSync(
      '../../packages/sdk-authoring/src/authoring/local-frame-ui/components/overlay-step-editor.tsx',
      'utf8',
    );
    const toolbar = editor.slice(
      editor.indexOf('className="overlay-step-toolbar"'),
      editor.indexOf('overlay-step-card rich-step-content'),
    );
    const insertAt = toolbar.indexOf('overlay-step-toolbar-insert');
    const contextAt = toolbar.indexOf('overlay-step-toolbar-context');
    const settingsAt = toolbar.indexOf('overlay-step-settings');
    expect(insertAt).toBeGreaterThan(-1);
    expect(insertAt).toBeLessThan(contextAt);
    expect(settingsAt).toBeGreaterThan(contextAt);
  });

  it('never keys the portal host, which would tear the toolbar out mid-edit', () => {
    const editor = readFileSync(
      '../../packages/sdk-authoring/src/authoring/local-frame-ui/components/overlay-step-editor.tsx',
      'utf8',
    );
    const context = editor.slice(
      editor.indexOf('className="overlay-step-toolbar-context"'),
      editor.indexOf('data-rich-content-toolbar-slot'),
    );
    expect(context).not.toContain('key={toolbarContext}\n        >');
    expect(editor).toContain('data-rich-content-toolbar-slot');
  });
});
