import { describe, expect, it } from 'vitest';
import {
  resolveTourActionRecipe,
  resolveTourCompositionRecipe,
} from '../../../../../packages/sdk-runtime/src/renderers/tour-recipes';

describe('tour renderer recipes', () => {
  it('provides the same complete popup defaults to authoring and runtime', () => {
    expect(resolveTourCompositionRecipe(undefined)).toEqual({
      actionAlign: 'start',
      actionLayout: 'inline',
      contentAlign: 'left',
      gap: 'normal',
      heightPx: null,
      padding: 'standard',
      radius: 'theme',
      showArrow: true,
      widthPx: null,
    });
  });

  it('resolves action presentation from one canonical recipe', () => {
    expect(
      resolveTourActionRecipe(
        { buttonStyle: { radius: 'round', size: 'compact', widthPx: 224 } },
        'link',
      ),
    ).toMatchObject({
      radius: 'round',
      size: 'compact',
      variant: 'link',
      width: 'hug',
      widthPx: 224,
    });
  });
});
