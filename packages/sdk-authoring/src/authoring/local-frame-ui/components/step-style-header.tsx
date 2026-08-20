import { useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { extractTourStepStyle, styleSnapshotHash } from '../../step-style-recipes';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { PropertyChoiceField } from '../properties/property-controls';

const CUSTOM_STYLE_VALUE = 'custom';

/** A whole named set of roles; the individual roles are the rows below it. */
const COLOUR_SCHEMES = [
  {
    value: 'surface',
    label: authoringText('Surface'),
    description: authoringText('Quiet on the page'),
  },
  { value: 'muted', label: authoringText('Muted'), description: authoringText('Tinted surface') },
  { value: 'accent', label: authoringText('Accent'), description: authoringText('The loud one') },
  {
    value: 'inverse',
    label: authoringText('Inverse'),
    description: authoringText('Dark on light pages'),
  },
] as const;

/**
 * WIRE_BE: a scheme is a Brand-level bundle of role tokens, so the list and the
 * step's binding both belong to the theme the control plane serves. The document
 * models the roles individually, not the bundle, so this holds for the session.
 */
function ColourScheme() {
  const [scheme, setScheme] = useState<string>('surface');
  return (
    <PropertyChoiceField
      label={authoringText('Colour scheme')}
      onChange={setScheme}
      options={COLOUR_SCHEMES}
      presentation="menu"
      value={scheme}
    />
  );
}

/**
 * The Style section's first two rows (§4.3): which named style this step wears,
 * and how far it has drifted from it.
 *
 * The binding is derived, not stored — a step matches a saved style when their
 * content hashes agree — so applying one and then nudging a colour reads as
 * `Custom` without anything having to remember the edit.
 */
export function StepStyleHeader({
  controller,
  snapshot,
  step,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  tooltip: LodariqBlock;
}) {
  const recipes = snapshot.stepStyleRecipes;
  const currentHash = styleSnapshotHash(extractTourStepStyle(step));
  const bound = recipes.find((recipe) => recipe.contentHash === currentHash);
  const overrides = Object.keys(tooltip.props.tooltipStyle ?? {}).length;

  const options = [
    ...recipes.map((recipe) => ({ value: recipe.id, label: recipe.name })),
    ...(bound ? [] : [{ value: CUSTOM_STYLE_VALUE, label: authoringText('Custom') }]),
  ];

  return (
    <>
      <PropertyChoiceField
        label={authoringText('Style')}
        onChange={(id) => {
          if (id !== CUSTOM_STYLE_VALUE) controller.applyStepStyleRecipe(id, step.id);
        }}
        options={options}
        presentation="menu"
        value={bound?.id ?? CUSTOM_STYLE_VALUE}
      />
      {overrides === 0 ? null : (
        <p className="step-style-overrides">
          <span className="step-style-override-dot" />
          {overrides === 1
            ? authoringText('1 override')
            : authoringText('{count} overrides', { count: overrides })}
          <button
            data-style-action="reset-instance"
            onClick={() => controller.resetTooltipStyle(tooltip.id)}
            type="button"
          >
            {authoringText('Reset instance')}
          </button>
        </p>
      )}
      <ColourScheme />
    </>
  );
}
