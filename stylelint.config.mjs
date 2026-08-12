export default {
  overrides: [
    {
      customSyntax: 'postcss-styled-syntax',
      files: ['packages/sdk-authoring/src/**/*.ts'],
      rules: {
        'custom-property-pattern': '^lq-[a-z0-9-]+$',
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
