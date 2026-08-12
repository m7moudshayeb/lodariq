import { describe, expect, it } from 'vitest';
import {
  resolveTourActionRecipe,
  resolveTourCompositionRecipe,
  resolveTourPopupStyleRecipe,
  tourPopupStyleVariables,
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

  it('resolves safe popup appearance overrides without CSS property bags', () => {
    const recipe = resolveTourPopupStyleRecipe({
      surfaceColor: '#162033',
      textColor: '#ffffff',
      borderColor: '#006b58',
      borderWeight: 'strong',
      elevation: 'floating',
    });

    expect(recipe).toEqual({
      surfaceColor: '#162033',
      textColor: '#ffffff',
      borderColor: '#006b58',
      borderWeight: 'strong',
      elevation: 'floating',
    });
    expect(tourPopupStyleVariables(recipe)).toEqual({
      '--lq-popup-surface': '#162033',
      '--lq-popup-text': '#ffffff',
      '--lq-popup-muted-text': '#ffffff',
      '--lq-popup-border': '#006b58',
    });
    expect(resolveTourPopupStyleRecipe(undefined)).toMatchObject({
      borderWeight: 'theme',
      elevation: 'theme',
      surfaceColor: null,
      textColor: null,
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
