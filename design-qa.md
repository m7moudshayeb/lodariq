# Design QA — Experience language controls

- Source visual truth: `/Users/mahmoudshayeb/.codex/generated_images/019ff3ac-6f90-77f0-8fde-988ef2060aeb/exec-ad0f74a9-8572-47d5-baab-2771468f69c5.png`.
- Browser-rendered implementation: `/Users/mahmoudshayeb/Desktop/lodariq/design-qa-implementation.png`.
- Full-view comparison: `/tmp/lodariq-language-qa/full-comparison.png`.
- Focused comparison: `/tmp/lodariq-language-qa/focused-comparison.png`.
- Source dimensions: 1498 × 1050 pixels.
- Implementation dimensions and viewport: 1181 × 783 CSS pixels; browser DPR 2.6. The in-app browser screenshot API returned CSS-pixel output.
- State: English source language selected; automatic translation unavailable in the local fixture; source-copy protection status visible.
- Density normalization: the full implementation was scaled and padded to the source canvas for composition review. Native component crops were kept for the focused comparison because the user explicitly overrode the generated mock's larger controls with Lodariq's 36px control token.

## Findings

No actionable P0, P1, or P2 differences remain in the requested language area.

- Fonts and typography: the section label, translate label, and status use Lodariq's 10px creator-chrome token; the select keeps the established 12px field text and weights.
- Spacing and layout rhythm: the selector and translate button both measure 36px high. The action is fixed at 36px while the selector flexes to fill the remaining row width; the status strip spans the full content width.
- Colors and visual tokens: border, surface, muted text, primary-soft status, and error states use existing creator-chrome variables.
- Image and icon fidelity: the selected visual's globe was replaced with the requested design-system `Languages` icon. The translate action continues to use the existing design-system wand icon.
- Copy and content: `Experience language`, `Translate`, `Source language`, and `Manual copy protected` are localized across every supported non-English catalog.
- Intentional differences: the local authoring-frame preview excludes the parent product's dark title bar, and the controls are denser than the generated mock because the accepted implementation requirement is the existing 36px field/button pattern.

## Interaction and browser checks

- Opened the design-system language selector, selected German, verified the displayed locale and protection status, then restored English.
- Verified the final SVG class is `lucide-languages` and is hidden from assistive technology.
- Verified selector height 35.998px, translate-button height 35.998px, selector width 227.236px, and full control-row width 271.232px in the rendered panel.
- Checked browser console warnings and errors: none.

## Comparison history

- Initial focused comparison showed that the globe glyph could read as a ball and that the small supporting text was undersized.
- Replaced `Globe2` with the requested `Languages` icon and moved supporting text to the 10px design-system token.
- Rebuilt, recaptured, and compared the same English source-language state. No P0/P1/P2 issues remain.

final result: passed

---

# Previous Design QA — Shape and icon tray

Previous result: passed

- Source: `exec-aa8d7a0a-d395-47ba-b526-ddda09413b7f.png`, 1448 × 1086.
- Implementation: `design-qa-implementation.jpg`, 985 × 554 at device scale 1.
- State: compact authoring panel, selected CTA, anchored quick controls and the
  detailed Shape & icon tray open.
- Visual result: the compact state keeps the selected-item workflow, 30px
  choices, persistent footer and canvas zoom while collapsing secondary footer
  actions. The canvas popup intentionally uses the real customer theme rather
  than the pale placeholder treatment in the concept.
- Interaction result: selected CTA controls open and dismiss; More opens the
  contextual tray; popup drag/resize and CTA resize retain keyboard parity;
  popup radius and pointer visibility update both canvas and runtime; runtime
  controls remain pinned to the popup bottom.
- Accessibility: labeled controls, pressed state, focus-visible styles and
  keyboard resize/move paths verified through component and browser checks.

Iteration history: reduced compact top spacing, verified the selected CTA tray,
and confirmed runtime/canvas recipe parity for rounded corners and arrow
visibility.
