import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  resolveExperienceAppearance,
  type ExperienceAppearance,
  type LodariqBlock,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { extractTourStepStyle, styleSnapshotHash } from '../../step-style-recipes';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { PropertyChoiceField } from '../properties/property-controls';

const CUSTOM_STYLE_VALUE = 'custom';

/**
 * A scheme is a whole named set of role tokens, and the names come from the
 * theme's own Tour recipes — the same three the Appearance panel offers. It
 * listed four invented ones, `surface` and `muted` among them, which no recipe
 * answers to.
 */
const COLOUR_SCHEMES = [
  {
    value: 'default',
    label: authoringText('Brand'),
    description: authoringText('Quiet on the page'),
  },
  { value: 'accent', label: authoringText('Accent'), description: authoringText('The loud one') },
  {
    value: 'inverse',
    label: authoringText('Inverse'),
    description: authoringText('Dark on light pages'),
  },
] as const satisfies ReadonlyArray<{
  value: ExperienceAppearance['preset'];
  label: string;
  description: string;
}>;

/**
 * The scheme is a property of the experience, not of one step: a theme names its
 * recipes per experience, and the roles inside one are not addressable
 * individually. So this writes the document's appearance preset — which is what
 * `resolveTourThemeStyle` reads to paint every card, including the one on the
 * canvas.
 *
 * It used to hold the choice in local state and write nothing at all, so picking
 * a scheme moved a pill and repainted no card.
 */
function ColourScheme({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const appearance = resolveExperienceAppearance(
    snapshot.documentState.appearance ?? DEFAULT_EXPERIENCE_APPEARANCE,
  );
  return (
    <>
      <PropertyChoiceField
        label={authoringText('Colour scheme')}
        onChange={(preset) =>
          controller.setDocumentAppearance({
            ...appearance,
            preset: preset as ExperienceAppearance['preset'],
          })
        }
        options={COLOUR_SCHEMES}
        presentation="menu"
        value={appearance.preset}
      />
      {/* Said once, next to the only row in this section with that reach. */}
      <p className="storyboard-property-hint">
        {authoringText('Applies to every step in this experience.')}
      </p>
    </>
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
      <ColourScheme controller={controller} snapshot={snapshot} />
    </>
  );
}
