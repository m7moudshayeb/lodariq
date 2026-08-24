/**
 * Product Match's token merge.
 *
 * It sits beside `brand.ts` rather than inside it because it validates, and
 * `validate` reaches the registry, which reaches back to `brand` — a cycle
 * dependency-cruiser rejects. It lived in `apps/api` before that, which meant
 * the local authoring editor could not adopt a match at all.
 */
import {
  BrandThemeDefinition,
  type BrandThemeDefinition as BrandThemeDefinitionType,
  type ProductStyleProposal,
} from './brand';
import { validate } from './validate';

/** The single semantic token merge used by preview and explicit adoption. */
export function mergeProductStyleTokensIntoDraft(
  current: BrandThemeDefinitionType,
  proposal: ProductStyleProposal,
): BrandThemeDefinitionType {
  const next = structuredClone(current);
  const proposed = proposal.tokens;
  mergeDefinedTokenProperties(next.tokens.modes.light.colors, proposed.modes?.light?.colors);

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

  mergeDefinedTokenProperties(next.tokens.typography, proposed.modes?.dark?.typography);
  mergeDefinedTokenProperties(next.tokens.typography, proposed.typography);
  mergeDefinedTokenProperties(next.tokens.typography, proposed.modes?.light?.typography);
  mergeDefinedTokenProperties(next.tokens.spacing, proposed.spacing);
  mergeDefinedTokenProperties(next.tokens.radii, proposed.radii);
  mergeDefinedTokenProperties(next.tokens.borders, proposed.borders);
  mergeDefinedTokenProperties(next.tokens.sizing, proposed.sizing);
  mergeDefinedTokenProperties(next.tokens.motion, proposed.motion);
  mergeDefinedTokenProperties(next.tokens.elevations, proposed.elevations);

  const validation = validate(BrandThemeDefinition, next);
  if (!validation.valid) {
    throw new Error(
      `Product match produced an invalid Brand theme draft: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

function mergeDefinedTokenProperties<T extends object>(
  target: T,
  source: Partial<T> | undefined,
): void {
  if (!source) return;
  Object.assign(target, structuredClone(source));
}
