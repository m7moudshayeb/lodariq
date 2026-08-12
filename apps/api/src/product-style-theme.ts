import {
  BrandThemeDefinition,
  validate,
  type BrandThemeDefinition as BrandThemeDefinitionType,
  type ProductStyleProposal,
} from '@lodariq/schema';

/** The single semantic token merge used by preview and explicit Product Match adoption. */
export function mergeProductStyleTokensIntoDraft(
  current: BrandThemeDefinitionType,
  proposal: ProductStyleProposal,
): BrandThemeDefinitionType {
  const next = structuredClone(current);
  const proposed = proposal.tokens;
  mergeDefinedProperties(next.tokens.modes.light.colors, proposed.modes?.light?.colors);

  const darkColors = proposed.modes?.dark?.colors;
  if (darkColors) {
    const currentDarkColors = next.tokens.modes.dark?.colors ?? next.tokens.modes.light.colors;
    next.tokens.modes.dark = {
      colors: {
        ...structuredClone(currentDarkColors),
        ...structuredClone(darkColors),
      },
    };
  }

  mergeDefinedProperties(next.tokens.typography, proposed.modes?.dark?.typography);
  mergeDefinedProperties(next.tokens.typography, proposed.typography);
  mergeDefinedProperties(next.tokens.typography, proposed.modes?.light?.typography);
  mergeDefinedProperties(next.tokens.spacing, proposed.spacing);
  mergeDefinedProperties(next.tokens.radii, proposed.radii);
  mergeDefinedProperties(next.tokens.borders, proposed.borders);
  mergeDefinedProperties(next.tokens.sizing, proposed.sizing);
  mergeDefinedProperties(next.tokens.motion, proposed.motion);
  mergeDefinedProperties(next.tokens.elevations, proposed.elevations);

  const validation = validate(BrandThemeDefinition, next);
  if (!validation.valid) {
    throw new Error(
      `Product match produced an invalid Brand theme draft: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

function mergeDefinedProperties<T extends object>(target: T, source: Partial<T> | undefined): void {
  if (!source) return;
  Object.assign(target, structuredClone(source));
}
