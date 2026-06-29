// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // The production runtime must never reach for authoring-only frameworks.
  // Physical package separation + dependency-cruiser are the load-bearing
  // guards (PRD §9.1, §16.0); this lint rule is an extra fast signal.
  {
    files: ['packages/sdk-runtime/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'sdk-runtime must not depend on React.' },
            { name: 'react-dom', message: 'sdk-runtime must not depend on React.' },
            { name: 'lexical', message: 'Lexical is authoring-only (sdk-authoring/src/editor).' },
          ],
          patterns: [
            { group: ['@lexical/*'], message: 'Lexical is authoring-only.' },
            {
              group: ['@lodariq/sdk-authoring', '@lodariq/sdk-authoring/*'],
              message: 'Production runtime must not import authoring code.',
            },
          ],
        },
      ],
    },
  },
  // Lexical may only be imported from the editor boundary (PRD §7.2, §20).
  {
    files: ['packages/sdk-authoring/src/**/*.ts', 'packages/sdk-authoring/src/**/*.tsx'],
    ignores: ['packages/sdk-authoring/src/editor/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'lexical', message: 'Import Lexical only inside src/editor.' }],
          patterns: [{ group: ['@lexical/*'], message: 'Import Lexical only inside src/editor.' }],
        },
      ],
    },
  },
);
