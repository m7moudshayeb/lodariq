export default {
  overrides: [
    {
      customSyntax: 'postcss-styled-syntax',
      files: ['packages/sdk-authoring/src/**/*.ts'],
      rules: {
        'custom-property-pattern': '^lq-[a-z0-9-]+$',
        /**
         * Anti-drift: creator-chrome surfaces may not carry raw colour literals.
         * Every colour comes from `creator-chrome-tokens.ts` through an `--lq-*`
         * custom property, so a palette change is one edit rather than a sweep.
         */
        'declaration-property-value-disallowed-list': [
          {
            background: [/#[0-9a-fA-F]{3,8}/, /\brgba?\(/, /\bhsla?\(/],
            'background-color': [/#[0-9a-fA-F]{3,8}/, /\brgba?\(/, /\bhsla?\(/],
            border: [/#[0-9a-fA-F]{3,8}/, /\brgba?\(/, /\bhsla?\(/],
            'border-color': [/#[0-9a-fA-F]{3,8}/, /\brgba?\(/, /\bhsla?\(/],
            'box-shadow': [/#[0-9a-fA-F]{3,8}/, /\brgba?\(/, /\bhsla?\(/],
            color: [/#[0-9a-fA-F]{3,8}/, /\brgba?\(/, /\bhsla?\(/],
            fill: [/#[0-9a-fA-F]{3,8}/, /\brgba?\(/, /\bhsla?\(/],
            outline: [/#[0-9a-fA-F]{3,8}/, /\brgba?\(/, /\bhsla?\(/],
            stroke: [/#[0-9a-fA-F]{3,8}/, /\brgba?\(/, /\bhsla?\(/],
          },
          {
            message:
              'Use an --lq-* custom property from creator-chrome-tokens.ts instead of a raw colour.',
            severity: 'warning',
          },
        ],
      },
    },
    {
      /** `foundation.ts` declares the custom properties from the tokens, so it is
       *  the one file allowed to hold interpolated colour values. */
      customSyntax: 'postcss-styled-syntax',
      files: ['packages/sdk-authoring/src/authoring/local-frame-ui/styles/foundation.ts'],
      rules: {
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],
  rules: {
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'declaration-block-no-duplicate-custom-properties': true,
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-values'] },
    ],
    'font-family-no-duplicate-names': true,
    'function-calc-no-unspaced-operator': true,
    'keyframe-declaration-no-important': true,
    'no-duplicate-at-import-rules': true,
    'no-duplicate-selectors': true,
    'property-no-unknown': true,
    'selector-pseudo-class-no-unknown': true,
    'selector-pseudo-element-no-unknown': true,
    'string-no-newline': true,
    'unit-no-unknown': true,
  },
};
