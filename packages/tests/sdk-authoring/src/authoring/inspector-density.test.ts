// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * §4.3's cap has always been enforced at *registration*: a seventh section throws.
 * That rule was holding and the inspector was still unusable, because nothing
 * counted the rows inside a section — `Actions` legally registered one section and
 * put twenty-two visible controls in it.
 *
 * So this is the other half of the guard. It is deliberately a source check rather
 * than a render: what makes a section dense is a control that expands its options
 * inline, and there is exactly one of those (`SegmentedControl`, via the default
 * `PropertyChoiceField`). A section that reaches for it in the anchored inspector
 * is the regression, and it is visible in the source before it is visible on screen.
 *
 * Reference: docs/plans/authoring-ux-model.md §4.3
 *            docs/product-design/prototypes/authoring-spec.html → `.fld` / `.pk`
 */
const SOURCE_ROOT = '../../packages/sdk-authoring/src/authoring/local-frame-ui';

function read(path: string): string {
  return readFileSync(`${SOURCE_ROOT}/${path}`, 'utf8');
}

describe('the anchored inspector stays at the prototype’s density (§4.3)', () => {
  /**
   * The prototype's inspector is built from one control: a label and a pill that
   * opens its choices. Every property the compact inspector shows must use it, or
   * the section grows by the option count rather than by the property count.
   */
  it('gives every composition property a pill rather than an expanded group', () => {
    const source = read('components/popup-composition-inspector.tsx');
    const fields = source.match(/<Property(?:Choice|Color)Field\b/gu) ?? [];
    const presented = source.match(/presentation=\{presentation\}/gu) ?? [];
    expect(fields.length).toBeGreaterThan(0);
    expect(presented).toHaveLength(fields.length);
  });

  /**
   * The five appearance tabs existed only because each control was full-width. As
   * rows they all fit, so the tab strip is the wide form's affordance and must not
   * come back to the popover.
   */
  it('shows every appearance property at once instead of behind tabs', () => {
    const source = read('components/popup-composition-inspector.tsx');
    expect(source).toContain('compact || appearanceSection === item');
    expect(source).toContain('{compact ? null : (');
  });

  /**
   * §7.2: "non-blocking inline warning on the offending control while editing",
   * with the audit publish-blocking in Operations → Check. A permanent AA/AAA
   * readout in a 320px popover is the audit in the wrong place.
   */
  it('shows contrast as a warning on the failing control, not as a review panel', () => {
    const source = read('properties/property-controls.tsx');
    expect(source).toContain("contrast.state !== 'pass'");
    expect(source).toContain('inspector-warning');
  });

  /** The palette moves behind the pill; none of its choices may be dropped. */
  it('keeps every colour choice reachable from the pill', () => {
    const source = read('properties/property-controls.tsx');
    const menu = source.slice(source.indexOf('function PropertyColorPill'));
    expect(menu).toContain('QUICK_COLORS.map');
    expect(menu).toContain("type=\"color\"");
    expect(menu).toContain('rich-step-theme-color');
  });

  /** The pre-adoption mint outlived the palette swap and shipped as a quick pick. */
  it('offers no colour from the retired palette', () => {
    expect(read('properties/property-controls.tsx')).not.toContain('#006b58');
  });
});
